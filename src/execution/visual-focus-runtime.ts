import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Browser, Page, ElementHandle } from 'playwright'
import type { observePage } from './browser.ts'
import type { EvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { getDbClient } from '../storage/database.ts'
import { saveEvidence } from './browser.ts'
import { appendEvent, recordHypothesis, updateHypothesis, submitFinding } from './run-manager.ts'
import { createActionBudget } from './action-budget.ts'
import { bindInputToRegion } from './focus-binding.ts'
import { createFocusProbe, type FocusProbeInput, type FocusProbeResult } from './focus-probe.ts'
import { createFocusMeasurer } from './focus-measure.ts'
import { bindFocusSurface, readFocusSurface } from './focus-surface.ts'
import { deriveNeutralPoint } from './focus-neutral.ts'
import { annotateFocus } from './focus-annotation.ts'
import {
  parseNormalizedVisualScanOutput,
  bindServerCandidate,
  type VisualCandidate,
} from './visual-candidate.ts'
import { requestVisualCandidates } from './visual-request.ts'
import { config } from '../shared/config.ts'
import { type FocusReceipt, focusReceiptVerdict } from './focus-receipt.ts'
import type { RequestTracker } from '../agent/model/request-tracker.ts'

export const VISUAL_FOCUS_VERSION = 'visual-focus-3'
interface Observation {
  snapshot: Awaited<ReturnType<typeof observePage>>['snapshot']
  evidenceRefs: readonly string[]
  observationId: string
  refs: readonly string[]
}
interface CandidateState {
  candidate: VisualCandidate & { screenshotSha: string; documentEpoch: string }
  artifactId: string
  surface: string
  root: ElementHandle<HTMLElement | SVGElement>
  inputs: { handle: ElementHandle<HTMLElement | SVGElement>; selector: string }[]
  result?: FocusProbeResult
  target?: Awaited<ReturnType<typeof bindFocusSurface>>
  elementRef?: string
}
export function createVisualFocusRuntime(deps: {
  runId: string
  goal: string
  page: Page
  browser: Browser
  signal: AbortSignal
  guard: () => void
  snapshot: () => Observation
  refresh: () => Promise<unknown>
  detail: (ref: string) => { selector: string }
  remainingActions: () => number
  countAction: () => void
  timeRemainingMs: () => number
  countModel: () => void
  tracker: RequestTracker
  usage: (inputTokens?: number, outputTokens?: number) => void
  integrity: () => EvidenceIntegrity
  hypothesis: (id: string, phenomenon: string) => void
  resolved: (id: string, status: string) => void
}) {
  const states = new Map<string, CandidateState>()
  const facts: string[] = []
  const gaps = new Set<string>()
  const budget = createActionBudget({ remaining: deps.remainingActions, count: deps.countAction })
  const measurer = createFocusMeasurer(deps.page, deps.guard)
  const event = (
    type: string,
    payload: Record<string, unknown>,
    evidenceRefs?: readonly string[],
  ) =>
    appendEvent(deps.runId, type, payload, {
      evidenceRefs: evidenceRefs ? [...evidenceRefs] : undefined,
    })
  const save = (type: string, data: unknown, metadata: Record<string, unknown> = {}) => {
    deps.guard()
    return saveEvidence(
      deps.runId,
      type,
      JSON.stringify(data),
      {
        ...metadata,
        evidenceIntegrity: deps.integrity(),
      },
      deps.guard,
    )
  }
  async function scan() {
    gaps.add('visual-scan-unverified')
    for (let attempt = 0; attempt < 2; attempt++) {
      deps.guard()
      const before = await readFocusSurface(deps.page)
      await deps.refresh()
      const observation = deps.snapshot()
      const surface = await readFocusSurface(deps.page)
      if (before !== surface) continue
      const root = await deps.page.$('html')
      if (!root) continue
      const inputs: CandidateState['inputs'] = []
      for (const el of observation.snapshot.elements.filter((e) => e.tag === 'input')) {
        const handle = await deps.page.$(el.selector)
        if (handle) inputs.push({ handle, selector: el.selector })
      }
      const sameInputs = async () => {
        for (const input of inputs)
          if (
            !(await input.handle
              .evaluate(
                (el, sel) => el.isConnected && el === document.querySelector(sel),
                input.selector,
              )
              .catch(() => false))
          )
            return false
        return true
      }
      const screenshotRef = observation.snapshot.screenshotPath!
      const shot = await getDbClient().execute({
        sql: 'SELECT file_path FROM artifacts WHERE run_id=? AND id=? AND type=?',
        args: [deps.runId, screenshotRef, 'screenshot'],
      })
      if (!shot.rows.length) throw Error('visual-screenshot-not-owned')
      const image = await readFile(String(shot.rows[0].file_path))
      const viewport = observation.snapshot.viewport
      if (image.readUInt32BE(16) !== viewport.width || image.readUInt32BE(20) !== viewport.height)
        throw Error('visual-image-coordinate-mismatch')
      const sha = createHash('sha256').update(image).digest('hex')
      deps.countModel()
      const handle = deps.tracker.startRequest('vision', config.visionModel)
      const requestId = randomUUID()
      await event('model:request-started', {
        attemptId: requestId,
        purpose: 'visual-discovery',
        model: config.visionModel,
        startedAt: Date.now(),
        deadlineAt: Date.now() + Math.min(60000, deps.timeRemainingMs()),
      })
      let usageRecorded = false
      try {
        const response = await requestVisualCandidates(
          image,
          deps.goal,
          deps.signal,
          Math.min(config.budget.modelRequestTimeoutMs, deps.timeRemainingMs()),
        )
        deps.guard()
        const inputTokens = response.usage.inputTokens.total,
          outputTokens = response.usage.outputTokens.total
        deps.usage(inputTokens, outputTokens)
        usageRecorded = true
        const record = handle.finish({ inputTokens, outputTokens })
        await event('model:request-finished', {
          ...record,
          attemptId: requestId,
          purpose: 'visual-discovery',
        })
        const raw = response.content
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('')
        const rawRef = await save('visual-response', {
          text: raw,
          screenshotRef,
          screenshotSha: sha,
          coordinateTransform: {
            source: 'normalized-1000',
            destination: 'css-pixels',
            scaleX: viewport.width / 1000,
            scaleY: viewport.height / 1000,
            viewport,
          },
          finishReason: response.finishReason,
        })
        const stable =
          (await sameInputs()) &&
          (await root
            .evaluate((el) => el.isConnected && el === document.documentElement)
            .catch(() => false)) &&
          surface === (await readFocusSurface(deps.page))
        deps.guard()
        if (!stable) {
          await event('visual-scan:stale', { attempt, rawRef })
          await root.dispose()
          continue
        }
        if (response.finishReason.unified !== 'stop') throw Error('visual-response-incomplete')
        const parsed = parseNormalizedVisualScanOutput(JSON.parse(raw), viewport)
        if (!parsed.ok) throw Error(parsed.reason)
        const epoch = randomUUID()
        for (const model of parsed.candidates) {
          const candidate = {
            ...bindServerCandidate(
              model,
              {
                runId: deps.runId,
                observationId: observation.observationId,
                screenshotRef,
                algorithmVersion: VISUAL_FOCUS_VERSION,
                now: new Date().toISOString(),
              },
              () => `candidate-${randomUUID()}`,
            ),
            screenshotSha: sha,
            documentEpoch: epoch,
            viewport,
            scroll: await deps.page.evaluate(() => ({ x: scrollX, y: scrollY })),
            rawRef,
          }
          deps.guard()
          if (
            [...states.values()].some(
              (s) =>
                JSON.stringify(s.candidate.perceivedRegion) ===
                JSON.stringify(candidate.perceivedRegion),
            )
          )
            continue
          const artifactId = await save('visual-candidate', candidate, {
            candidateId: candidate.id,
            observationId: candidate.observationId,
          })
          states.set(candidate.id, { candidate, artifactId, surface, root, inputs })
          gaps.add(`visual-candidate:${candidate.id}:unverified`)
        }
        gaps.delete('visual-scan-unverified')
        await event(
          'visual-scan:completed',
          {
            count: states.size,
            scope:
              'Bounded input-region candidates only; absence is not a healthy-page conclusion.',
          },
          [screenshotRef, rawRef],
        )
        return
      } catch (error) {
        if (deps.signal.aborted) throw error
        if (!usageRecorded) deps.usage()
        const record = handle.finish({ error: String(error) })
        await event('visual-scan:unavailable', { reason: String(error), request: record })
        await root.dispose()
        return
      }
    }
    await event('visual-scan:unavailable', { reason: 'no-stable-image' })
  }
  async function verify(state: CandidateState) {
    deps.guard()
    if (
      state.candidate.observationId !== deps.snapshot().observationId ||
      !(await state.root
        .evaluate((el) => el.isConnected && el === document.documentElement)
        .catch(() => false)) ||
      state.surface !== (await readFocusSurface(deps.page))
    )
      throw Error('stale-candidate')
    for (const input of state.inputs)
      if (
        !(await input.handle
          .evaluate(
            (el, sel) => el.isConnected && el === document.querySelector(sel),
            input.selector,
          )
          .catch(() => false))
      )
        throw Error('focus-node-replaced')
    await state.target?.verify()
    deps.guard()
  }
  async function probe(input: FocusProbeInput): Promise<FocusProbeResult> {
    deps.guard()
    const state = states.get(input.candidateId)
    if (!state) throw Error('unknown-candidate')
    const candidate = state.candidate
    let hypothesisId: string | undefined
    const register = async () => {
      if (hypothesisId) return hypothesisId
      deps.guard()
      const h = await recordHypothesis({
        runId: deps.runId,
        phenomenon: `Clicks inside the perceived input region ${candidate.id} may not focus its input.`,
        basis: `${candidate.visualBasis}; ${input.bindingReason}`,
        verificationPlan:
          'Bounded normal clicks from verified unfocused baselines, including control and independent retest.',
        status: 'open',
        evidenceRefs: [state.artifactId, candidate.screenshotRef],
        kind: 'visual-focus',
        visualCandidateId: candidate.id,
      })
      hypothesisId = h.id
      deps.hypothesis(h.id, h.phenomenon)
      return h.id
    }
    const resolve = async (status: 'supported' | 'refuted' | 'inconclusive', refs: string[]) => {
      deps.guard()
      await updateHypothesis(await register(), status, refs, deps.guard)
      deps.resolved(hypothesisId!, status)
    }
    try {
      await verify(state)
      if (state.elementRef && state.elementRef !== input.elementRef)
        throw Error('candidate-binding-mismatch')
      if (state.result) return { ...state.result, reused: true }
      const observation = deps.snapshot()
      const elements = observation.snapshot.elements.map((el, i) => ({
        ref: observation.refs[i],
        tag: el.tag,
        type: el.attributes.type,
        id: el.attributes.id,
        bounds: el.bounds,
        visible: el.visible,
        enabled: el.enabled !== false,
        readOnly: el.attributes.readonly !== undefined,
      }))
      const dangerous = elements.filter(
        (e) =>
          ['button', 'a', 'select', 'textarea'].includes(e.tag) ||
          ['submit', 'button', 'checkbox', 'radio'].includes(e.type ?? ''),
      )
      const target = bindInputToRegion({
        region: candidate.perceivedRegion,
        excluded: candidate.excludedRegions,
        elements: elements.filter((e) => e.tag === 'input'),
        dangerous,
      })
      if (!target.ok || target.elementRef !== input.elementRef)
        throw Error(`focus-binding-refused:${target.ok ? 'element-ref-mismatch' : target.reason}`)
      if (candidate.confidence === 'low') throw Error('low-confidence-candidate')
      const selector = deps.detail(input.elementRef).selector
      state.target = await bindFocusSurface(deps.page, selector, candidate.perceivedRegion)
      state.elementRef = input.elementRef
      const bound = state.target
      const nodeIdentity = `node-${randomUUID()}`
      const measure = async (point: { x: number; y: number }, beforeClick: () => void) => ({
        ...(await measurer.clickAndMeasure({
          selector,
          ...point,
          handle: bound.handle,
          nodeIdentity,
          verify: () => verify(state),
          beforeClick: () => {
            beforeClick()
            void event('visual-focus:click-dispatched', {
              candidateId: candidate.id,
              kind: 'sample',
              x: point.x,
              y: point.y,
              atMs: Date.now(),
            })
          },
        })),
        integrity: deps.integrity(),
      })
      let receipt: FocusReceipt | undefined,
        receiptRef = '',
        measurementRef = ''
      const tool = createFocusProbe({
        guard: deps.guard,
        budget,
        timeRemainingMs: () => Math.min(15000, deps.timeRemainingMs()),
        bind: async () => ({
          elementRef: input.elementRef,
          nodeIdentity,
          documentEpoch: candidate.documentEpoch,
          url: deps.page.url(),
          scroll: await deps.page.evaluate(() => ({ x: scrollX, y: scrollY })),
          viewport: observation.snapshot.viewport,
          screenshotRef: candidate.screenshotRef,
          screenshotSha: candidate.screenshotSha,
          isFocused: () => bound.handle.evaluate((el) => el === document.activeElement),
        }),
        neutralReset: async (beforeClick) => {
          await verify(state)
          const neutral = await deps.page.evaluate(() =>
            Array.from(
              document.querySelectorAll('h1,h2,p,div,span,button,a,input,label,[role],[tabindex]'),
            ).map((el) => {
              const b = el.getBoundingClientRect(),
                s = getComputedStyle(el)
              const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
              const actionable = el.closest(
                'button,a,label,input,select,textarea,[role="button"],[role="link"],[tabindex],[onclick]',
              )
              return {
                ref: el.tagName.toLowerCase() + '#' + el.id,
                tag: actionable ? 'button' : el.tagName.toLowerCase(),
                bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
                enabled: !actionable,
                blocked: hit !== el,
                visible: s.display !== 'none' && s.visibility !== 'hidden',
              }
            }),
          )
          const point = deriveNeutralPoint({
            viewport: observation.snapshot.viewport,
            region: candidate.perceivedRegion,
            elements: neutral,
          })
          if (!point) throw Error('no-safe-neutral-area')
          const reset = await measurer.neutralReset({
            selector,
            ...point,
            beforeClick: () => {
              beforeClick()
              void event('visual-focus:click-dispatched', {
                candidateId: candidate.id,
                kind: 'neutral-reset',
                x: point.x,
                y: point.y,
                atMs: Date.now(),
              })
            },
          })
          await verify(state)
          if (await bound.handle.evaluate((el) => el === document.activeElement))
            throw Error('baseline-not-established')
          return { ...reset, integrity: deps.integrity() }
        },
        samplePositiveControl: async (beforeClick) => {
          await verify(state)
          const box = await bound.handle.boundingBox()
          if (!box) throw Error('target-not-visible')
          return measure({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, beforeClick)
        },
        samplePoint: measure,
        recordHypothesis: register,
        saveReceipt: async (r) => {
          receipt = r
          receiptRef = await save('focus-receipt', r, { candidateId: candidate.id })
          return receiptRef
        },
        saveMeasurements: async (ref, samples) => {
          measurementRef = await save(
            'measurement',
            { receiptRef: ref, samples },
            { kind: 'focus-samples', candidateId: candidate.id },
          )
          return measurementRef
        },
        complete: async (completion) => {
          await verify(state)
          const status = focusReceiptVerdict(receipt)
          if (status !== completion.validationStatus) throw Error('focus-verdict-receipt-mismatch')
          const box = await bound.handle.boundingBox()
          if (!box || !receipt) throw Error('focus-evidence-missing')
          const annotated = await annotateFocus(
            deps.browser,
            deps.runId,
            candidate.perceivedRegion,
            box,
            receipt,
            deps.guard,
          )
          deps.guard()
          const refs = [
            candidate.screenshotRef,
            state.artifactId,
            receiptRef,
            measurementRef,
            annotated,
          ]
          await event(
            'visual-focus:annotated',
            {
              candidateId: candidate.id,
              annotatedRef: annotated,
              sourceRef: candidate.screenshotRef,
            },
            refs,
          )
          let findingId: string | undefined
          if (status === 'supported') {
            const f = await submitFinding(
              {
                runId: deps.runId,
                source: 'agent',
                ruleId: null,
                ruleRevision: null,
                hypothesisId: await register(),
                validationStatus: status,
                severity: 'warning',
                title: 'Sampled input-region clicks did not focus the input',
                expected:
                  'The perceived input region focuses its bound input within the 500ms measurement window.',
                actual:
                  'At least one sampled interior point failed twice from independent unfocused baselines; the native-input control succeeded. This does not describe every pixel.',
                stepId: 'visual-focus',
                evidenceRefs: refs,
              },
              deps.guard,
            )
            findingId = f.id
          }
          await resolve(status, refs)
          await event(
            'visual-focus:completed',
            { ...completion, validationStatus: status, findingId, evidenceRefs: refs },
            refs,
          )
          return findingId
        },
        evidenceRefs: () => [candidate.screenshotRef, state.artifactId],
        algorithmVersion: VISUAL_FOCUS_VERSION,
      })
      const result = await tool.run({
        ...input,
        region: candidate.perceivedRegion,
        excluded: candidate.excludedRegions,
        dangerous: dangerous.map((e) => e.bounds),
      })
      if (!result.hypothesisId)
        await resolve('inconclusive', [state.artifactId, candidate.screenshotRef])
      state.result = { ...result, hypothesisId: result.hypothesisId ?? hypothesisId }
      if (result.validationStatus !== 'inconclusive')
        gaps.delete(`visual-candidate:${candidate.id}:unverified`)
      facts.push(JSON.stringify([candidate.id, result.validationStatus, result.reasons]))
      return state.result
    } catch (error) {
      deps.guard()
      await resolve('inconclusive', [state.artifactId, candidate.screenshotRef])
      const result: FocusProbeResult = {
        candidateId: candidate.id,
        verdict: 'unknown',
        validationStatus: 'inconclusive',
        reasons: [String(error)],
        hypothesisId,
        reused: false,
        scope: 'This visual region remains unverified.',
        nextStep:
          'Preserve the unverified scope and continue the business path or finish explicitly.',
      }
      await event('visual-focus:unknown', { ...result })
      state.result = result
      facts.push(JSON.stringify([candidate.id, 'inconclusive', result.reasons]))
      return result
    }
  }
  return {
    scan,
    probe,
    facts,
    gaps: () => [...gaps],
    candidates: (observationId: string) =>
      [...states.values()]
        .filter((s) => s.candidate.observationId === observationId)
        .map((s) => ({ ...s.candidate, investigated: !!s.result })),
    async dispose() {
      for (const state of states.values()) {
        await state.target?.dispose()
        for (const input of state.inputs) await input.handle.dispose().catch(() => {})
        await state.root.dispose().catch(() => {})
      }
    },
  }
}
