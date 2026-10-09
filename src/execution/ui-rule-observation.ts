import { readLayoutFacts, measureLayoutPixels } from './layout-facts.ts'
import {
  createControlLayoutRule,
  type LayoutReceipt,
  type LayoutRow,
} from '../rules/builtin/control-layout.ts'
import type { Page } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readBatch2Facts, screenshotInk, type Batch2Dom } from '../experiments/batch2-facts.ts'
import { reviewImageFallbacks } from '../experiments/image-fallback-review.ts'
import {
  createControlTextDisappearanceRule,
  type ControlTextReceipt,
} from '../rules/builtin/control-text-disappearance.ts'
import { createRuleEvaluationCache } from '../rules/routing.ts'
import type { RuleContext, RuleResult } from '../rules/types.ts'
import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { getDbClient } from '../storage/database.ts'
import { observeImageRequests } from './image-request-observer.ts'
import { saveEvidence, type observePage } from './browser.ts'
import { appendEvent } from './run-manager.ts'

export interface UiRuleReportBody {
  version: 'ui-rule-observation-1'
  runId: string
  url: string
  observedAt: string
  screenshotSha256: string
  screenshotRef: string
  evidenceRefs: string[]
  timing: {
    sharedObservationMs: number
    prepareMs: number
    completeMs: number
    evaluateMs: number
    addedMs: number
  }
  layout?: {
    results: { ruleId: string; verdict: string; rows: LayoutRow[] }[]
    totalObserved: number
    omitted: number
    enumerationComplete: boolean
    evidenceDigests: Record<string, string>
  }
  controls: {
    total: number
    enumerated: number
    omitted: number
    unknown: number
    rows: { selector: string; text: string; verdict: string; reason: string }[]
  }
  images: {
    total: number
    enumerated: number
    omitted: number
    unknown: number
    rows: {
      selector: string
      state: string
      disposition: string
      reasons: string[]
      text: string[]
      alternatives: string[]
      layout: string
      association: string
    }[]
  }
}
const identity = (d: Batch2Dom) => JSON.stringify({ ...d, omittedControls: 0, omittedImages: 0 })

/** Executor-owned adapter: reuses the single ordinary observation and its screenshot. */
export function createUiRuleObservation(
  page: Page,
  runId: string,
  integrity: () => EvidenceIntegrity,
) {
  const ledger = observeImageRequests(page),
    cache = createRuleEvaluationCache()
  let current:
    | {
        receipt: ControlTextReceipt
        layout: LayoutReceipt
        layoutDigests: Record<string, string>
        images: NonNullable<Awaited<ReturnType<typeof observePage>>['snapshot']['imagePaint']>
        screenshotSha256: string
        timing: { prepareMs: number; completeMs: number; sharedObservationMs: number }
      }
    | undefined
  let last:
    | { key: string; result: RuleResult; layoutResults: RuleResult[]; body: UiRuleReportBody }
    | undefined
  const metadata = () => ({ evidenceIntegrity: integrity() })
  async function prepare() {
    const start = performance.now()
    const before = await readBatch2Facts(page)
    const layoutBefore = await readLayoutFacts(page)
    return { before, layoutBefore, prepareMs: performance.now() - start }
  }
  async function complete(
    prepared: Awaited<ReturnType<typeof prepare>>,
    observation: Awaited<ReturnType<typeof observePage>>,
    sharedObservationMs: number,
  ) {
    const start = performance.now(),
      before = prepared.before
    const after = await readBatch2Facts(page, {
      controls: before.controls.map((c) => c.selector),
      images: before.images.map((i) => i.selector),
    })
    const owned = await getDbClient().execute({
      sql: 'SELECT file_path FROM artifacts WHERE run_id=? AND id=? AND type=?',
      args: [runId, observation.snapshot.screenshotPath, 'screenshot'],
    })
    if (owned.rows.length !== 1) throw Error('ui-rule-owned-screenshot-unavailable')
    const png = await readFile(String(owned.rows[0]!.file_path))
    const layoutAfter = await readLayoutFacts(page)
    const layoutProof = await measureLayoutPixels(page, png, layoutAfter)
    const pixels = await screenshotInk(page, png, after.controls)
    const observedAt = observation.snapshot.observedAt
    const receipt: ControlTextReceipt = {
      runId,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 300000).toISOString(),
      dom: {
        ...after,
        omittedControls: before.omittedControls,
        omittedImages: before.omittedImages,
      },
      stable: identity(before) === identity(after),
      issues: [],
      pixels,
      screenshotRef: observation.snapshot.screenshotPath,
      evidenceRefs: [
        ...observation.evidenceRefs,
        ...(observation.snapshot.imagePaint ?? []).flatMap((f) =>
          f.resource ? [f.resource.evidenceRef] : [],
        ),
      ],
      evidenceIntegrity: integrity(),
    }
    const factsRef = await saveEvidence(
      runId,
      'ui-rule-facts',
      JSON.stringify({
        receipt,
        before,
        screenshotSha256: createHash('sha256').update(png).digest('hex'),
        requests: ledger.snapshot(),
      }),
      metadata(),
    )
    receipt.evidenceRefs.push(factsRef)
    const layoutRefs = [receipt.screenshotRef]
    const layoutDigests: Record<string, string> = {
      [receipt.screenshotRef]: createHash('sha256').update(png).digest('hex'),
    }
    if (layoutProof.referencePng) {
      const ref = await saveEvidence(runId, 'screenshot', layoutProof.referencePng, {
        ...metadata(),
        purpose: 'isolated-layout-reference; not target page',
      })
      layoutRefs.push(ref)
      layoutDigests[ref] = createHash('sha256').update(layoutProof.referencePng).digest('hex')
    }
    const layout: LayoutReceipt = {
      runId,
      observedAt,
      expiresAt: receipt.expiresAt,
      screenshotRef: receipt.screenshotRef,
      facts: layoutAfter,
      pixels: layoutProof.pixels,
      stable: JSON.stringify(prepared.layoutBefore) === JSON.stringify(layoutAfter),
      issues: [],
      evidenceRefs: layoutRefs,
      evidenceIntegrity: integrity(),
    }
    const layoutSerialized = JSON.stringify({ receipt: layout, before: prepared.layoutBefore })
    const layoutRef = await saveEvidence(
      runId,
      'control-layout-facts',
      layoutSerialized,
      metadata(),
    )
    layout.evidenceRefs.push(layoutRef)
    layoutDigests[layoutRef] = createHash('sha256').update(layoutSerialized).digest('hex')
    current = {
      receipt,
      layout,
      layoutDigests,
      images: observation.snapshot.imagePaint ?? [],
      screenshotSha256: createHash('sha256').update(png).digest('hex'),
      timing: {
        sharedObservationMs,
        prepareMs: prepared.prepareMs,
        completeMs: performance.now() - start,
      },
    }
    last = undefined
  }
  async function evaluate(context: RuleContext) {
    if (!current) throw Error('ui-rule-observation-missing')
    const start = performance.now(),
      { receipt, images } = current
    // New DOM, style, resource/loading and identity facts must still match. Never import old claims.
    const live = await readBatch2Facts(page, {
      controls: receipt.dom.controls.map((c) => c.selector),
      images: receipt.dom.images.map((i) => i.selector),
    })
    const layoutLive = await readLayoutFacts(page)
    const layoutEvidenceIssues: string[] = []
    for (const [ref, sha] of Object.entries(current.layoutDigests)) {
      try {
        const found = await getDbClient().execute({
          sql: 'SELECT file_path FROM artifacts WHERE run_id=? AND id=?',
          args: [runId, ref],
        })
        if (
          found.rows.length !== 1 ||
          createHash('sha256')
            .update(await readFile(String(found.rows[0]!.file_path)))
            .digest('hex') !== sha
        )
          layoutEvidenceIssues.push('layout-evidence-missing-or-changed')
      } catch {
        layoutEvidenceIssues.push('layout-evidence-missing-or-changed')
      }
    }
    const fresh = identity(live) === identity(receipt.dom)
    const key = JSON.stringify([
      receipt.screenshotRef,
      identity(live),
      layoutLive,
      layoutEvidenceIssues,
      integrity(),
      Date.now() < Date.parse(receipt.expiresAt),
    ])
    if (last?.key === key)
      return {
        result: last.result,
        layoutResults: last.layoutResults,
        reused: true,
        body: last.body,
      }
    const input = { ...receipt, stable: receipt.stable && fresh, evidenceIntegrity: integrity() }
    let result = (
      await cache.evaluate(createControlTextDisappearanceRule(input), {
        ...context,
        timestamp: new Date().toISOString(),
        snapshot: { ...context.snapshot, evidenceIntegrity: integrity() },
      })
    ).result
    // Static capability limits use the existing unchecked representation. No completion gate changes.
    const capabilityLimit =
      cleanEvidenceIntegrity(integrity()) &&
      input.stable &&
      !input.issues.length &&
      Date.now() < Date.parse(input.expiresAt) &&
      context.snapshot.screenshotPath === input.screenshotRef
    if (result.verdict === 'unknown' && capabilityLimit)
      result = { ...result, unchecked: { reasonCode: 'control-text-supported-scope-limit' } }
    const layoutInput = {
      ...current.layout,
      stable:
        current.layout.stable &&
        JSON.stringify(layoutLive) === JSON.stringify(current.layout.facts),
      issues: layoutEvidenceIssues,
      evidenceIntegrity: integrity(),
    }
    const layoutResults = await Promise.all(
      (['clipping', 'overlap'] as const).map((kind) =>
        createControlLayoutRule(kind, layoutInput).evaluate({
          ...context,
          timestamp: new Date().toISOString(),
          snapshot: { ...context.snapshot, evidenceIntegrity: integrity() },
        }),
      ),
    )
    for (const item of layoutResults)
      for (const row of item.details.rows as LayoutRow[]) {
        const target = context.snapshot.elements.find((e) => e.selector === row.selector)
        if (target?.hitSamples?.some((s) => s.relation === 'unrelated'))
          row.relatedRuleIds.push('overlay-blocking')
        const other = layoutResults.find((r) => r.ruleId !== item.ruleId)
        if (
          (other?.details.rows as LayoutRow[])?.some(
            (r) => r.selector === row.selector && r.verdict === 'fail',
          )
        )
          row.relatedRuleIds.push(other!.ruleId)
      }
    const requests = ledger.snapshot()
    const review = reviewImageFallbacks({
      dom: input.dom,
      stable: input.stable,
      issues: Date.now() >= Date.parse(input.expiresAt) ? ['evidence-expired'] : [],
      requests: requests.requests,
      requestsTruncated: requests.truncated,
      imagePaint: images,
      evidenceRefs: input.evidenceRefs,
      evidenceIntegrity: integrity(),
    })
    const reviewRef = await saveEvidence(
      runId,
      'image-fallback-review',
      JSON.stringify(review),
      metadata(),
    )
    const rows = result.details.rows as {
      selector: string
      verdict: string
      reason: string
      fact: { text: string }
    }[]
    const body: UiRuleReportBody = {
      version: 'ui-rule-observation-1',
      runId,
      url: input.dom.url,
      observedAt: input.observedAt,
      screenshotSha256: current.screenshotSha256,
      screenshotRef: input.screenshotRef,
      evidenceRefs: [...input.evidenceRefs, reviewRef, ...current.layout.evidenceRefs],
      layout: {
        results: layoutResults.map((r) => ({
          ruleId: r.ruleId,
          verdict: r.verdict,
          rows: r.details.rows as LayoutRow[],
        })),
        totalObserved: current.layout.facts.totalObserved,
        omitted: current.layout.facts.omitted,
        enumerationComplete: current.layout.facts.enumerationComplete,
        evidenceDigests: current.layoutDigests,
      },
      timing: {
        ...current.timing,
        evaluateMs: performance.now() - start,
        addedMs: current.timing.prepareMs + current.timing.completeMs + performance.now() - start,
      },
      controls: {
        total: input.dom.totalControls,
        enumerated: rows.length,
        omitted: input.dom.omittedControls,
        unknown: rows.filter((r) => r.verdict === 'unknown').length,
        rows: rows.map((r) => ({
          selector: r.selector,
          text: r.fact.text,
          verdict: r.verdict,
          reason: r.reason,
        })),
      },
      images: {
        total: review.total,
        enumerated: review.rows.length,
        omitted: review.omitted,
        unknown: review.rows.filter((r) => r.disposition === 'unknown').length,
        rows: review.rows.map((r) => ({
          selector: r.selector,
          state: r.resourceState,
          disposition: r.disposition,
          reasons: r.reasons,
          text: r.measured.image?.nearby.map((n) => n.text) ?? [],
          alternatives:
            r.measured.image?.alternatives.map((i) => `${i.selector}: ${i.url || '无当前资源'}`) ??
            [],
          layout: r.measured.image
            ? `${Math.round(r.measured.image.bounds.width)} × ${Math.round(r.measured.image.bounds.height)} CSS px`
            : '未取得',
          association: '仅同父区域结构关联；身份等效、文字可读/无遮挡及替代图含义未确认',
        })),
      },
    }
    const serialized = JSON.stringify(body),
      artifactRef = await saveEvidence(runId, 'ui-rule-observation', serialized, metadata())
    await appendEvent(
      runId,
      'ui-rules:observed',
      {
        artifactRef,
        sha256: createHash('sha256').update(serialized).digest('hex'),
        screenshotSha256: current.screenshotSha256,
        screenshotRef: input.screenshotRef,
        url: body.url,
      },
      { evidenceRefs: [artifactRef, ...body.evidenceRefs] },
    )
    last = { key, result, layoutResults, body }
    return { result, layoutResults, reused: false, body }
  }
  return { prepare, complete, evaluate, close: ledger.close }
}
