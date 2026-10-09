import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { ElementHandle, Page } from 'playwright'
import { z } from 'zod'
import { observePage, saveEvidence } from '../execution/browser.ts'
import { installImageResourceCollector } from '../execution/image-paint.ts'
import { appendEvent, getEvents, getFindings, submitFinding } from '../execution/run-manager.ts'
import {
  createImageShapeDistortionRule,
  imageShapeDistortionRule,
} from '../rules/builtin/image-shape-distortion.ts'
import type { ImagePaintFact, ImageShapeContract } from '../rules/image-shape.ts'
import { createRuleEvaluationCache } from '../rules/routing.ts'
import type { PageSnapshot, RuleResult } from '../rules/types.ts'
import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { getDbClient } from '../storage/database.ts'

const VERSION = 'image-bindings-1' as const
const MAX_IMAGES = 32
const MAX_AGE_MS = 5 * 60 * 1000
const semanticFields = [
  'intent',
  'basis.reference',
  'basis.statement',
  'basis.confirmedBy',
] as const
const confirmationSchema = z
  .object({
    candidateId: z.string().min(1),
    observationId: z.string().min(1),
    intent: z.enum(['preserve', 'intentional-distortion']),
    basis: z
      .object({
        reference: z.string().trim().min(1).max(4096),
        statement: z.string().trim().min(1).max(4000),
        confirmedBy: z.string().trim().min(1).max(200),
      })
      .strict(),
  })
  .strict()

export interface ImageBindingCandidate {
  readonly candidateId: string
  readonly observationId: string
  readonly runId: string
  readonly observedAt: string
  readonly expiresAt: string
  readonly status: 'facts-ready' | 'facts-incomplete'
  /** Only measured facts. This is deliberately not a complete ImageShapeContract. */
  readonly measured: {
    readonly contractFields: {
      id: string
      pageUrl: string
      viewport: { width: number; height: number }
      selector: string
      resourceUrl: string | null
      resourceSha256: string | null
    }
    readonly locator: { kind: 'existing-id' | 'structural'; matchCount: number }
    readonly paint: ImagePaintFact | null
    readonly evidenceRefs: readonly string[]
  }
  /** Presentation hints only; never read when deciding intent or making a contract. */
  readonly hints: { readonly alt: string }
  readonly pending: {
    readonly intent: null
    readonly basis: { reference: null; statement: null; confirmedBy: null }
  }
  readonly missingFields: readonly string[]
  readonly issues: readonly string[]
}

export interface ImageBindingBatch {
  readonly version: typeof VERSION
  readonly runId: string
  readonly observationId: string
  readonly artifactRef: string
  readonly totalImages: number
  readonly omittedImages: number
  readonly candidates: readonly ImageBindingCandidate[]
}

type CapturedObservation = Awaited<ReturnType<typeof observePage>>
type Entry = {
  candidate: ImageBindingCandidate
  handle: ElementHandle
  artifactRef: string
  evidenceHashes: Map<string, string>
}
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const clone = <T>(value: T): T => structuredClone(value)
function paintIdentity(fact: ImagePaintFact) {
  // Scan effort depends on the observation target set; underlying paint/epoch checks remain exact.
  const { resource, visibilityScan, ...paint } = fact
  return JSON.stringify({
    ...paint,
    resource: resource ? { sha256: resource.sha256, format: resource.format } : null,
  })
}
function onlyFact(observation: CapturedObservation, selector: string) {
  const facts = observation.snapshot.imagePaint?.filter((fact) => fact.selector === selector) ?? []
  return facts.length === 1 ? facts[0] : undefined
}
function factIssues(fact: ImagePaintFact | undefined): string[] {
  if (!fact) return ['measurement-missing']
  return [
    ...(fact.matchCount !== 1 ? ['target-missing-or-ambiguous'] : []),
    ...(!fact.stable || !fact.nodeId || !fact.documentId ? ['unstable-target-evidence'] : []),
    ...(!fact.complete || !fact.decoded ? ['image-not-loaded'] : []),
    ...(!fact.resource ? ['supported-resource-bytes-unavailable'] : []),
    ...(fact.excluded ? [fact.excluded] : []),
    ...(fact.unsupported ?? []),
  ]
}
async function isSameTarget(handle: ElementHandle, selector: string): Promise<boolean> {
  return handle
    .evaluate((el, selector) => {
      const matches = document.querySelectorAll(selector)
      return el.isConnected && matches.length === 1 && matches[0] === el
    }, selector)
    .catch(() => false)
}

/** Session-local experiment. The caller installs the normal network boundary before navigation.
 * Only observe/diagnose/check are exposed: no navigation, clicks, fetching, registry enablement or R0 ledger.
 * Construct before navigation so the existing passive resource collector sees browser responses.
 */
export function createImageBindingExperiment(options: {
  page: Page
  runId: string
  evidenceIntegrity: () => EvidenceIntegrity
  now?: () => number
  /** Drain only the existing host event writes; never starts a request. */
  settleEvidence?: () => Promise<unknown>
}) {
  const { page, runId } = options
  const now = options.now ?? Date.now
  installImageResourceCollector(page)
  const entries = new Map<string, Entry>()
  const cache = createRuleEvaluationCache()
  let closed = false
  let tail: Promise<unknown> = Promise.resolve()
  const metadata = () => ({ evidenceIntegrity: options.evidenceIntegrity() })
  // Serialize observation, checks and closing; a concurrent observation cannot validate old input.
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn)
    tail = result.catch(() => {})
    return result
  }
  async function clear() {
    const old = [...entries.values()]
    entries.clear()
    await Promise.all(old.map((entry) => entry.handle.dispose().catch(() => {})))
  }
  async function readArtifact(ref: string) {
    const row = await getDbClient().execute({
      sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
      args: [ref, runId],
    })
    if (row.rows.length !== 1) throw Error('missing-owned-artifact')
    return readFile(String(row.rows[0]!.file_path))
  }

  async function observe(): Promise<ImageBindingBatch> {
    if (closed) throw Error('image-binding-session-closed')
    await clear()
    const observationId = `image-observation-${randomUUID()}`
    // Native light-DOM images only, exactly matching the existing paint collector's scope.
    const inventory = await page.evaluateHandle((limit) => {
      const images = Array.from(document.querySelectorAll('img'))
      return { total: images.length, images: images.slice(0, limit) }
    }, MAX_IMAGES)
    const totalHandle = await inventory.getProperty('total')
    const totalImages = await totalHandle.jsonValue()
    const imagesHandle = await inventory.getProperty('images')
    const properties = await imagesHandle.getProperties()
    const handles: ElementHandle[] = []
    for (const handle of properties.values()) {
      const element = handle.asElement()
      if (element) handles.push(element)
      else await handle.dispose()
    }
    await Promise.all([inventory.dispose(), totalHandle.dispose(), imagesHandle.dispose()])
    try {
      const descriptors = await Promise.all(
        handles.map((handle) =>
          handle.evaluate((el) => {
            if (!(el instanceof HTMLImageElement)) throw Error('discovered-image-replaced')
            // Duplicate IDs are retained as ambiguity, never resolved with first()/nth(0).
            const kind = el.id ? ('existing-id' as const) : ('structural' as const)
            let selector = el.id ? `#${CSS.escape(el.id)}` : ''
            if (!selector) {
              const parts: string[] = []
              for (
                let n: Element | null = el;
                n && n !== document.documentElement;
                n = n.parentElement
              ) {
                const siblings = Array.from(n.parentElement?.children ?? []).filter(
                  (s) => s.tagName === n!.tagName,
                )
                parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(n) + 1})`)
              }
              selector = 'html > ' + parts.join(' > ')
            }
            return {
              selector,
              kind,
              matchCount: document.querySelectorAll(selector).length,
              alt: (el.getAttribute('alt') ?? '').slice(0, 300),
            }
          }),
        ),
      )
      // Default caret hiding writes editor styles and would invalidate our own DOM epoch.
      const observation = await observePage(
        page,
        runId,
        metadata,
        [...new Set(descriptors.map((d) => d.selector))],
        { caret: 'initial' },
      )
      const observedAt = new Date(now()).toISOString()
      const expiresAt = new Date(now() + MAX_AGE_MS).toISOString()
      const candidates = await Promise.all(
        descriptors.map(async (descriptor, i): Promise<ImageBindingCandidate> => {
          const fact = onlyFact(observation, descriptor.selector)
          const candidateId = `image-${randomUUID()}`
          const issues = factIssues(fact)
          if (
            descriptor.selector.length > 1000 ||
            observation.snapshot.url.length > 4096 ||
            (fact?.currentSrc?.length ?? 0) > 65536
          )
            issues.push('contract-field-limit-exceeded')
          if (!(await isSameTarget(handles[i]!, descriptor.selector)))
            issues.push('discovered-target-lost-or-ambiguous')
          if (
            !cleanEvidenceIntegrity(observation.snapshot.evidenceIntegrity) ||
            !cleanEvidenceIntegrity(options.evidenceIntegrity())
          )
            issues.push('evidence-intervened')
          return {
            candidateId,
            observationId,
            runId,
            observedAt,
            expiresAt,
            status: issues.length ? 'facts-incomplete' : 'facts-ready',
            measured: {
              contractFields: {
                id: candidateId,
                pageUrl: observation.snapshot.url,
                viewport: observation.snapshot.viewport,
                selector: descriptor.selector,
                resourceUrl: fact?.currentSrc || null,
                resourceSha256: fact?.resource?.sha256 ?? null,
              },
              locator: {
                kind: descriptor.kind,
                matchCount: fact?.matchCount ?? descriptor.matchCount,
              },
              paint: fact ?? null,
              evidenceRefs: [
                ...observation.evidenceRefs,
                ...(fact?.resource ? [fact.resource.evidenceRef] : []),
              ],
            },
            hints: { alt: descriptor.alt },
            pending: {
              intent: null,
              basis: { reference: null, statement: null, confirmedBy: null },
            },
            missingFields: [
              ...semanticFields,
              ...(!fact?.currentSrc ? ['resourceUrl'] : []),
              ...(!fact?.resource ? ['resourceSha256'] : []),
              ...(issues.length ? ['fresh-supported-target-evidence'] : []),
            ],
            issues: [...new Set(issues)],
          }
        }),
      )
      const body = {
        version: VERSION,
        runId,
        observationId,
        totalImages: totalImages,
        omittedImages: totalImages - handles.length,
        candidates,
      }
      const artifactRef = await saveEvidence(
        runId,
        'image-binding-candidates',
        JSON.stringify(body),
        metadata(),
      )
      // Evidence digests are private session state; edited exports cannot rewrite program facts.
      const hashes = new Map<string, string>()
      for (const ref of new Set([
        artifactRef,
        ...candidates.flatMap((c) => c.measured.evidenceRefs),
      ]))
        hashes.set(ref, digest(await readArtifact(ref)))
      candidates.forEach((candidate, i) =>
        entries.set(candidate.candidateId, {
          candidate: clone(candidate),
          handle: handles[i]!,
          artifactRef,
          evidenceHashes: new Map(
            [artifactRef, ...candidate.measured.evidenceRefs].map((ref) => [ref, hashes.get(ref)!]),
          ),
        }),
      )
      await appendEvent(
        runId,
        'image-bindings:observed',
        {
          version: VERSION,
          observationId,
          candidateCount: candidates.length,
          totalImages: totalImages,
          omittedImages: body.omittedImages,
        },
        { evidenceRefs: [artifactRef, ...observation.evidenceRefs] },
      )
      return clone({ ...body, artifactRef })
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.dispose().catch(() => {})))
      entries.clear()
      throw error
    }
  }

  // The checker keeps its original early refusal. Diagnostics may collect independent current
  // facts despite a refusal, but use exactly the same machine gates and never update the entry.
  async function validateBinding(
    entry: Entry | undefined,
    reasons: string[],
    inspectBlocked = false,
  ) {
    const evidenceChecks: { ref: string; expectedSha256: string; actualSha256: string | null }[] =
      []
    let live: CapturedObservation | undefined
    let sameTargetBefore: boolean | undefined, sameTargetAfter: boolean | undefined
    if (entry) {
      const candidate = entry.candidate
      if (candidate.status !== 'facts-ready') reasons.push(...candidate.issues)
      if (now() >= Date.parse(candidate.expiresAt)) reasons.push('evidence-expired')
      if (!cleanEvidenceIntegrity(options.evidenceIntegrity())) reasons.push('evidence-intervened')
      for (const [ref, hash] of entry.evidenceHashes) {
        try {
          const actual = digest(await readArtifact(ref))
          evidenceChecks.push({ ref, expectedSha256: hash, actualSha256: actual })
          if (actual !== hash) reasons.push('evidence-changed')
        } catch {
          evidenceChecks.push({ ref, expectedSha256: hash, actualSha256: null })
          reasons.push('evidence-unavailable')
        }
      }
      if (!reasons.length || inspectBlocked) {
        const { selector } = candidate.measured.contractFields
        sameTargetBefore = await isSameTarget(entry.handle, selector)
        if (!sameTargetBefore) reasons.push('target-lost-or-ambiguous')
        if (sameTargetBefore || inspectBlocked) {
          live = await observePage(page, runId, metadata, [selector], { caret: 'initial' })
          const current = onlyFact(live, selector),
            previous = candidate.measured.paint
          reasons.push(...factIssues(current))
          if (
            !cleanEvidenceIntegrity(live.snapshot.evidenceIntegrity) ||
            !cleanEvidenceIntegrity(options.evidenceIntegrity())
          )
            reasons.push('evidence-intervened')
          if (
            live.snapshot.url !== candidate.measured.contractFields.pageUrl ||
            JSON.stringify(live.snapshot.viewport) !==
              JSON.stringify(candidate.measured.contractFields.viewport)
          )
            reasons.push('page-or-viewport-changed')
          if (
            current?.currentSrc !== previous?.currentSrc ||
            current?.resource?.sha256 !== previous?.resource?.sha256
          )
            reasons.push('resource-changed-or-unverified')
          if (current && (!previous || paintIdentity(current) !== paintIdentity(previous)))
            reasons.push('observation-facts-changed')
          sameTargetAfter = await isSameTarget(entry.handle, selector)
          if (!sameTargetAfter) reasons.push('target-lost-or-ambiguous')
          if (now() >= Date.parse(candidate.expiresAt)) reasons.push('evidence-expired')
        }
      }
    }
    return {
      reasons: [...new Set(reasons)],
      live,
      evidenceChecks,
      sameTargetBefore,
      sameTargetAfter,
    }
  }

  async function diagnose(raw: unknown) {
    const parsed = z
      .object({ candidateId: z.string().min(1), observationId: z.string().min(1) })
      .strict()
      .safeParse(raw)
    const input = parsed.success ? parsed.data : undefined
    const found = input ? entries.get(input.candidateId) : undefined
    const entry =
      !closed && found?.candidate.observationId === input?.observationId ? found : undefined
    const reasons = closed
      ? ['session-closed']
      : !input
        ? ['invalid-diagnostic-request']
        : !entry
          ? ['unknown-or-superseded-candidate']
          : []
    let validation: Awaited<ReturnType<typeof validateBinding>> = {
      reasons,
      live: undefined,
      evidenceChecks: [],
      sameTargetBefore: undefined,
      sameTargetAfter: undefined,
    }
    let observationError: string | null = null
    if (entry) {
      try {
        validation = await validateBinding(entry, reasons, true)
      } catch (error) {
        reasons.push('diagnostic-observation-failed')
        observationError = String(error).slice(0, 1000)
      }
    }
    // Diagnostic observation is a new receipt, NOT a new candidate batch. No entries are cleared,
    // repaired or rebound, and no previous confirmation is transferred to a new identity/resource.
    await options.settleEvidence?.()
    const live = validation.live,
      candidate = entry?.candidate
    const current =
      live && candidate ? onlyFact(live, candidate.measured.contractFields.selector) : undefined
    const refs = [
      ...new Set([
        ...(entry ? [entry.artifactRef, ...entry.candidate.measured.evidenceRefs] : []),
        ...(live?.evidenceRefs ?? []),
        ...(current?.resource ? [current.resource.evidenceRef] : []),
      ]),
    ]
    const integrity = options.evidenceIntegrity()
    if (entry && !cleanEvidenceIntegrity(integrity)) validation.reasons.push('evidence-intervened')
    const events = await getEvents(runId)
    const networkEvents = events.filter(
      (e) => e.type === 'network:decision' || e.type === 'image-bindings:intervention',
    )
    const resourceUrl =
      current?.currentSrc || candidate?.measured.contractFields.resourceUrl || null
    const direct = networkEvents.filter(
      (e) =>
        resourceUrl &&
        e.payload.destination === 'image' &&
        (e.payload.url === resourceUrl || e.payload.redirectFrom === resourceUrl),
    )
    const denied = networkEvents.filter(
      (e) =>
        (e.payload.allow === false && !e.payload.finalizationShutdown) ||
        e.type === 'image-bindings:intervention',
    )
    const directDenied = direct.filter((e) => denied.includes(e))
    const receipt = (e: (typeof events)[number]) => ({
      id: e.id,
      seq: e.seq,
      type: e.type,
      timestamp: e.timestamp,
      payload: e.payload,
    })
    const section = <T>(
      status: 'available' | 'unavailable' | 'unknown',
      why: readonly string[],
      facts: T,
    ) => ({ status, reasons: [...new Set(why)], evidenceRefs: refs, facts })
    const identityMatches =
      validation.sameTargetBefore === true &&
      validation.sameTargetAfter === true &&
      current?.matchCount === 1 &&
      !!current.documentId &&
      !!current.nodeId &&
      current.documentId === candidate?.measured.paint?.documentId &&
      current.nodeId === candidate?.measured.paint?.nodeId
    const identityMissing =
      validation.sameTargetBefore === false ||
      validation.sameTargetAfter === false ||
      (current && current.matchCount !== 1)
    const fileChecks = validation.evidenceChecks
    const filesChanged = fileChecks.some((c) => c.actualSha256 !== c.expectedSha256)
    const expired = !!candidate && now() >= Date.parse(candidate.expiresAt)
    if (expired) validation.reasons.push('evidence-expired')
    const paintReasons = factIssues(current).filter(
      (r) => r !== 'supported-resource-bytes-unavailable',
    )
    const machineReasons = [...new Set(validation.reasons)]
    const body = {
      version: 'image-binding-diagnosis-1' as const,
      runId,
      diagnosticId: `image-diagnosis-${randomUUID()}`,
      diagnosticObservationId: live ? `image-diagnostic-observation-${randomUUID()}` : null,
      observedAt: new Date(now()).toISOString(),
      request: input ?? null,
      sourceCandidate: candidate
        ? {
            candidateId: candidate.candidateId,
            observationId: candidate.observationId,
            artifactRef: entry!.artifactRef,
            status: candidate.status,
            expiresAt: candidate.expiresAt,
          }
        : null,
      lifecycle: {
        candidateReplaced: false,
        confirmationTransferred: false,
        newCandidateId: null,
        freshReadPerformed: !!live,
      },
      sections: {
        identity: section(
          identityMatches ? 'available' : identityMissing || !entry ? 'unavailable' : 'unknown',
          identityMatches ? [] : ['original-target-not-confirmed'],
          {
            sameTargetBefore: validation.sameTargetBefore ?? null,
            sameTargetAfter: validation.sameTargetAfter ?? null,
            source: candidate?.measured.paint
              ? {
                  nodeId: candidate.measured.paint.nodeId,
                  documentId: candidate.measured.paint.documentId,
                  selector: candidate.measured.paint.selector,
                }
              : null,
            current: current
              ? {
                  nodeId: current.nodeId,
                  documentId: current.documentId,
                  selector: current.selector,
                  matchCount: current.matchCount,
                }
              : null,
          },
        ),
        resource: section(
          current?.resource ? 'available' : directDenied.length ? 'unavailable' : 'unknown',
          current?.resource ? [] : ['supported-resource-bytes-unavailable'],
          {
            source: candidate?.measured.contractFields ?? null,
            current: current
              ? {
                  url: current.currentSrc,
                  resource: current.resource ?? null,
                  complete: current.complete,
                  decoded: current.decoded,
                }
              : null,
            matchesSource:
              current?.resource && candidate?.measured.paint?.resource
                ? current.currentSrc === candidate.measured.paint.currentSrc &&
                  current.resource.sha256 === candidate.measured.paint.resource.sha256
                : null,
          },
        ),
        paint: section(
          !current
            ? 'unknown'
            : current.excluded
              ? 'unavailable'
              : paintReasons.length
                ? 'unknown'
                : 'available',
          paintReasons,
          {
            current: current ?? null,
            source: candidate?.measured.paint ?? null,
            unmodifiedPageEstablished: cleanEvidenceIntegrity(integrity),
          },
        ),
        evidence: section(
          !fileChecks.length ? 'unknown' : filesChanged || expired ? 'unavailable' : 'available',
          !fileChecks.length
            ? ['artifact-check-not-completed']
            : filesChanged
              ? ['evidence-changed-or-unavailable']
              : expired
                ? ['evidence-expired']
                : [],
          {
            expired,
            originalArtifactChecks: fileChecks,
            liveEvidenceRefs: live?.evidenceRefs ?? [],
            originalExpiresAt: candidate?.expiresAt ?? null,
          },
        ),
        network: section(
          cleanEvidenceIntegrity(integrity) ? 'available' : 'unavailable',
          cleanEvidenceIntegrity(integrity) ? [] : ['evidence-intervened'],
          {
            integrity,
            capturedThroughSeq: events.at(-1)?.seq ?? null,
            comparedResourceUrl: resourceUrl,
            urlBasis: current?.currentSrc ? 'current-measurement' : 'source-candidate-or-missing',
            directResourceRequests: direct.map(receipt),
            directResourceDenials: directDenied.map(receipt),
            otherDenials: denied.filter((e) => !direct.includes(e)).map(receipt),
            targetImpact: cleanEvidenceIntegrity(integrity)
              ? 'no-recorded-intervention'
              : 'unknown',
            limitation:
              'URL/redirect equality proves a request relation only. Other requests, including telemetry, may affect rendering; no independence or permission is inferred. The global intervention remains binding.',
          },
        ),
        semantics: section('unknown', ['no-explicit-basis-provided-to-diagnostic'], {
          missingForThisRequest: [...semanticFields],
          approval: false,
          priorConfirmationsNotReused: true,
        }),
        machineBinding: section(
          !entry
            ? 'unavailable'
            : !live
              ? 'unknown'
              : machineReasons.length
                ? 'unavailable'
                : 'available',
          machineReasons,
          {
            sourceObservationId: candidate?.observationId ?? null,
            currentPage: live?.snapshot.url ?? null,
            currentViewport: live?.snapshot.viewport ?? null,
            error: observationError,
          },
        ),
      },
      consumption: {
        canConsumeNow: false,
        checkInvoked: false,
        ruleEvaluated: false,
        actualInputGateReasons: closed ? ['session-closed'] : ['missing-or-invalid-explicit-basis'],
        machineGateReasons: machineReasons,
        limitation:
          'This is a diagnostic receipt, not a contract, approval, RuleResult or replacement facts-ready state. A later check must supply a real basis and revalidate all gates.',
      },
      evidenceRefs: refs,
    }
    if (closed) return { ...body, artifactRef: null }
    const artifactRef = await saveEvidence(
      runId,
      'image-binding-diagnosis',
      JSON.stringify(body),
      metadata(),
    )
    await appendEvent(
      runId,
      'image-bindings:diagnosed',
      {
        diagnosticId: body.diagnosticId,
        candidateId: input?.candidateId ?? null,
        sourceObservationId: input?.observationId ?? null,
        machineReasons,
        ruleEvaluated: false,
      },
      { evidenceRefs: [artifactRef, ...refs] },
    )
    return clone({ ...body, artifactRef })
  }

  async function check(raw: unknown): Promise<RuleResult> {
    // Closed sessions are immutable evidence owners, not places to append new checks.
    if (closed)
      return {
        ruleId: imageShapeDistortionRule.id,
        ruleRevision: imageShapeDistortionRule.revision,
        verdict: 'unknown',
        severity: 'info',
        title: 'Image binding session closed',
        expected: 'A current observation in an open experiment',
        actual: 'session-closed',
        confidence: 0,
        evidenceRefs: [],
        details: { candidateBinding: { version: VERSION, reasons: ['session-closed'] } },
      }
    const parsed = confirmationSchema.safeParse(raw)
    const input = parsed.success ? parsed.data : undefined
    const entry = input ? entries.get(input.candidateId) : undefined
    const reasons: string[] = []
    let live: CapturedObservation | undefined
    if (!input) reasons.push('missing-or-invalid-explicit-basis')
    else if (!entry || entry.candidate.observationId !== input.observationId)
      reasons.push('unknown-or-superseded-candidate')
    const validation = await validateBinding(entry, reasons)
    live = validation.live
    const refs = [
      ...new Set([
        ...(entry ? [entry.artifactRef, ...entry.candidate.measured.evidenceRefs] : []),
        ...(live?.evidenceRefs ?? []),
        ...(live?.snapshot.imagePaint?.flatMap((f) =>
          f.resource ? [f.resource.evidenceRef] : [],
        ) ?? []),
      ]),
    ]
    const bindingRef = await saveEvidence(
      runId,
      'image-binding-review',
      JSON.stringify({
        version: VERSION,
        input: input ?? null,
        reasons: [...new Set(reasons)],
        candidateArtifact: entry?.artifactRef ?? null,
        evidenceRefs: refs,
      }),
      metadata(),
    )
    let result: RuleResult
    if (!reasons.length && input && entry && live) {
      const fields = entry.candidate.measured.contractFields
      const contract: ImageShapeContract = {
        ...fields,
        resourceUrl: fields.resourceUrl!,
        resourceSha256: fields.resourceSha256!,
        intent: input.intent,
        basis: input.basis,
      }
      // Explicit experiment invocation only; this never enables the builtin or changes the registry.
      const rule = createImageShapeDistortionRule([contract])
      result = (
        await cache.evaluate(rule, {
          runId,
          currentUrl: live.snapshot.url,
          pageTitle: live.snapshot.title,
          timestamp: live.snapshot.observedAt,
          events: [],
          snapshot: live.snapshot as PageSnapshot,
        })
      ).result
    } else
      result = {
        ruleId: imageShapeDistortionRule.id,
        ruleRevision: imageShapeDistortionRule.revision,
        verdict: 'unknown',
        severity: 'info',
        title: 'Image candidate binding incomplete or stale',
        expected: 'Explicit design basis bound to unchanged current image evidence',
        actual: [...new Set(reasons)].join('; '),
        confidence: 0,
        evidenceRefs: [],
        details: {},
      }
    result = {
      ...result,
      evidenceRefs: [...new Set([...refs, bindingRef, ...result.evidenceRefs])],
      details: {
        ...result.details,
        candidateBinding: {
          version: VERSION,
          candidateId: input?.candidateId ?? null,
          observationId: input?.observationId ?? null,
          reviewRef: bindingRef,
          reasons: [...new Set(reasons)],
        },
      },
    }
    await appendEvent(
      runId,
      'rule:evaluated',
      { ...result, experiment: VERSION },
      { evidenceRefs: [...result.evidenceRefs] },
    )
    if (
      result.verdict === 'fail' &&
      !(await getFindings(runId)).some(
        (f) => f.ruleId === result.ruleId && f.actual === result.actual,
      )
    )
      await submitFinding({
        runId,
        source: 'rule',
        ruleId: result.ruleId,
        ruleRevision: result.ruleRevision,
        hypothesisId: null,
        validationStatus: 'supported',
        severity: result.severity,
        title: result.title,
        expected: result.expected,
        actual: result.actual,
        stepId: null,
        evidenceRefs: result.evidenceRefs,
      })
    return result
  }

  return {
    observe: () => serial(observe),
    diagnose: (request: unknown) => serial(() => diagnose(request)),
    check: (confirmation: unknown) => serial(() => check(confirmation)),
    close: () =>
      serial(async () => {
        closed = true
        await clear()
      }),
  }
}
