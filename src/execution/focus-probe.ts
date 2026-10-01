import { z } from 'zod'
import type { ActionBudget, ActionReservation } from './action-budget.ts'
import type { EvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { deriveProbePoints, type Rect } from './focus-geometry.ts'
import {
  createFocusReceipt,
  type FocusReceipt,
  type FocusSample,
  type NeutralReset,
  MAX_PROBE_CLICKS,
} from './focus-receipt.ts'
import { evaluateFocusVerdict } from './focus-verdict.ts'

/**
 * The focus probe: one atomic call that binds a perceived region to a real input, measures whether
 * clicking inside that region focuses it, and records a typed receipt.
 *
 * Shape follows the bounded atomic investigator: register -> verify -> act -> save -> resolve, in one
 * `serial` call, with no model call inside (a vision scan is a separate bounded phase). Every browser
 * interaction goes through the injected deps, so the orchestration is testable without a browser and
 * the counting rule is enforced in one place.
 *
 * Two plan rules drive the control flow:
 *  - Each real click costs one action (plan 4.4), counted through the reservation, and the probe
 *    refuses to start at all when the budget cannot cover the whole bounded procedure - a
 *    half-finished sample is not a measurement.
 *  - A finding of the visual-focus class may only be promoted by a structural receipt (plan 4.6), so
 *    the receipt is persisted before any finding is saved, and its reference is returned.
 */

/** The only inputs the tool accepts. No arbitrary coordinates, selectors, URLs or expected results. */
export const focusProbeInput = z
  .object({
    candidateId: z.string().min(1),
    elementRef: z.string().min(1),
    bindingReason: z.string().min(1).max(800),
  })
  .strict()
export type FocusProbeInput = z.infer<typeof focusProbeInput>

export interface BoundTarget {
  readonly elementRef: string
  readonly nodeIdentity: string
  /** Evidence ref of the binding witness for this node, captured by the caller at bind time. */
  readonly witnessRef?: string
  readonly documentEpoch: string
  readonly url: string
  readonly scroll: { readonly x: number; readonly y: number }
  readonly viewport: { readonly width: number; readonly height: number }
  readonly screenshotRef: string
  readonly screenshotSha: string
  readonly isFocused: () => boolean | Promise<boolean>
}

export interface PointSample {
  readonly x: number
  readonly y: number
  readonly focusAfter: string | null
  readonly stable: boolean
  readonly hit: {
    readonly ref: string | null
    readonly tag: string
    readonly relation: FocusSample['hit']['relation']
  }
  readonly valueChanged: boolean
  readonly integrity: EvidenceIntegrity
  readonly focusedWithinMs: number | null
  /**
   * The element that was focused when this click landed, read from the page.
   *
   * This is the only honest source for the sample's baseline: plan 4.4 turns on the fact that an
   * already-focused input stays focused through a click on dead padding, so a sample that reports no
   * focus is worthless unless the page itself showed nothing focused beforehand.
   */
  readonly focusBefore: string | null
}

export interface FocusProbeDeps {
  readonly guard: () => void
  readonly budget: ActionBudget
  readonly bind: (elementRef: string) => Promise<BoundTarget>
  /** A click on a known-safe neutral area, used to clear focus; counted as an action. */
  readonly neutralReset: (beforeClick: () => void) => Promise<{
    x: number
    y: number
    introducedChange: boolean
    integrity: EvidenceIntegrity
  }>
  /** A click inside the native input, expecting it to focus within the window. */
  readonly samplePositiveControl: (beforeClick: () => void) => Promise<PointSample>
  /** A click at a derived point inside the perceived region. */
  readonly samplePoint: (
    point: {
      side: 'left' | 'right'
      x: number
      y: number
    },
    beforeClick: () => void,
  ) => Promise<PointSample>
  readonly recordHypothesis: (input: {
    candidateId: string
    elementRef: string
    bindingReason: string
    nodeIdentity: string
  }) => Promise<string>
  readonly saveReceipt: (receipt: FocusReceipt) => Promise<string>
  readonly saveMeasurements: (
    receiptRef: string,
    samples: readonly FocusSample[],
  ) => Promise<string>
  readonly complete: (input: {
    hypothesisId: string
    candidateId: string
    receiptRef: string
    validationStatus: 'supported' | 'refuted' | 'inconclusive'
    reasons: readonly string[]
    scope: string
  }) => Promise<string | undefined>
  readonly evidenceRefs: () => readonly string[]
  readonly algorithmVersion?: string
  readonly timeRemainingMs?: () => number
}

export interface FocusProbeResult {
  readonly candidateId: string
  readonly verdict: 'fail' | 'pass' | 'unknown'
  readonly validationStatus: 'supported' | 'refuted' | 'inconclusive'
  readonly reasons: readonly string[]
  readonly hypothesisId?: string
  readonly receiptRef?: string
  readonly findingId?: string
  readonly scope: string
  readonly reused: boolean
  readonly nextStep: string
}

/** Plan 4.4: 1 control + up to 2 edge points + up to 1 retest of the first failure. */
const MAX_SAMPLES = 4
const DEFAULT_ALGORITHM_VERSION = 'visual-focus-1'

function budgetFor(samples: number): number {
  // Each sample click is preceded by a neutral reset, so the worst case is samples + resets, capped.
  return Math.min(samples * 2, MAX_PROBE_CLICKS)
}

export function createFocusProbe(deps: FocusProbeDeps) {
  const cache = new Map<
    string,
    { receiptRef: string; result: FocusProbeResult; epoch: string; node: string }
  >()

  return {
    async run(
      raw: FocusProbeInput & {
        region: Rect
        excluded: readonly Rect[]
        dangerous: readonly Rect[]
      },
    ) {
      deps.guard()
      const input = focusProbeInput.parse({
        candidateId: raw.candidateId,
        elementRef: raw.elementRef,
        bindingReason: raw.bindingReason,
      })

      // Bind first so a refusal costs nothing, then decide about the budget before any click.
      let bound: BoundTarget
      try {
        bound = await deps.bind(input.elementRef)
      } catch {
        return inconclusive(input.candidateId, ['binding-failed'], deps)
      }
      deps.guard()

      const cached = cache.get(input.candidateId)
      if (cached && cached.epoch === bound.documentEpoch && cached.node === bound.nodeIdentity)
        return {
          ...cached.result,
          reused: true,
          nextStep: nextStepFor(cached.result.validationStatus),
        }

      const { points, skipped } = deriveProbePoints({
        region: raw.region,
        excluded: raw.excluded,
        dangerous: raw.dangerous,
      })
      // Fewer than two usable edge points cannot support or refute anything: do not click at all.
      if (points.length < 2)
        return inconclusive(input.candidateId, ['insufficient-edge-points'], deps, {
          detail: skipped.map((s) => `skipped:${s.side}:${s.reason}`),
        })

      const plannedSamples = MAX_SAMPLES
      const need = budgetFor(plannedSamples)
      if (deps.timeRemainingMs && deps.timeRemainingMs() < 5000)
        return inconclusive(input.candidateId, ['insufficient-time-budget'], deps)
      const reservation = deps.budget.reserve(need)
      if (!reservation)
        return inconclusive(input.candidateId, ['insufficient-action-budget'], deps, { need })

      try {
        const hypothesisId = await deps.recordHypothesis({
          candidateId: input.candidateId,
          elementRef: input.elementRef,
          bindingReason: input.bindingReason,
          nodeIdentity: bound.nodeIdentity,
        })
        deps.guard()

        const resets: NeutralReset[] = []
        const samples: FocusSample[] = []

        // Positive control: clear focus if needed, then click inside the real input and require it to
        // focus within the window. Both the reset and the control click cost an action.
        await resetIfFocused(bound, reservation, resets, deps)
        deps.guard()
        const beforeClick = () => {
          deps.guard()
          reservation.consume()
        }
        const controlRaw = await deps.samplePositiveControl(beforeClick)
        const control = {
          x: controlRaw.x,
          y: controlRaw.y,
          hit: controlRaw.hit,
          focusBefore: controlRaw.focusBefore,
          focusAfter: controlRaw.focusAfter,
          stable: controlRaw.stable,
          focusedWithinMs: controlRaw.focusedWithinMs,
          valueChanged: controlRaw.valueChanged,
          documentEpoch: bound.documentEpoch,
          integrity: controlRaw.integrity,
          ok: controlRaw.focusedWithinMs !== null,
        }

        // Edge samples inside the perceived region but away from the input.
        let firstFailure: { side: 'left' | 'right'; x: number; y: number } | undefined
        let retestRecorded = false
        for (const point of points) {
          deps.guard()
          await resetIfFocused(bound, reservation, resets, deps)
          deps.guard()
          const raw2 = await deps.samplePoint(point, beforeClick)
          samples.push({
            side: point.side,
            x: point.x,
            y: point.y,
            hit: raw2.hit,
            focusBefore: raw2.focusBefore,
            focusAfter: raw2.focusAfter,
            stable: raw2.stable,
            focusedWithinMs: raw2.focusedWithinMs,
            valueChanged: raw2.valueChanged,
            documentEpoch: bound.documentEpoch,
            integrity: raw2.integrity,
          })
          if (raw2.focusedWithinMs === null && !firstFailure) firstFailure = point
        }

        // One permitted retest of the first failing point, only if the budget still allows it.
        if (firstFailure && reservation.remaining() >= 2) {
          deps.guard()
          await resetIfFocused(bound, reservation, resets, deps, true)
          deps.guard()
          const raw3 = await deps.samplePoint(firstFailure, beforeClick)
          retestRecorded = true
          samples.push({
            side: 'retest',
            retestOf: firstFailure.side,
            x: firstFailure.x,
            y: firstFailure.y,
            hit: raw3.hit,
            focusBefore: raw3.focusBefore,
            focusAfter: raw3.focusAfter,
            stable: raw3.stable,
            focusedWithinMs: raw3.focusedWithinMs,
            valueChanged: raw3.valueChanged,
            documentEpoch: bound.documentEpoch,
            integrity: raw3.integrity,
          })
        }

        // Retest identity is persisted explicitly; never infer reproducibility from one failure.
        const verdict = evaluateFocusVerdict({
          control: { ...control, baselineUnfocused: control.focusBefore !== bound.nodeIdentity },
          attempts: samples.map((s, index) => ({
            side: s.side === 'retest' ? s.retestOf! : s.side,
            // The baseline is what the page reported before the click, not an assumption.
            baselineUnfocused: s.focusBefore !== bound.nodeIdentity,
            valueChanged: s.valueChanged,
            stable: s.stable,
            focusedWithinMs: s.focusedWithinMs,
            integrity: s.integrity,
            retest: retestRecorded && index === samples.length - 1,
          })),
          resets,
          usableEdgePoints: points.length,
        })

        // The receipt is persisted before any finding, because it is the only thing that may promote
        // a finding of this class (plan 4.6).
        const receipt = createFocusReceipt({
          candidateId: input.candidateId,
          screenshotRef: bound.screenshotRef,
          screenshotSha: bound.screenshotSha,
          documentEpoch: bound.documentEpoch,
          url: bound.url,
          scroll: bound.scroll,
          viewport: bound.viewport,
          binding: {
            elementRef: bound.elementRef,
            nodeIdentity: bound.nodeIdentity,
            reason: input.bindingReason,
            ...(bound.witnessRef ? { witnessRef: bound.witnessRef } : {}),
          },
          positiveControl: control,
          samples,
          resets,
          actionCost: need - reservation.remaining(),
          integrity: samples.at(-1)?.integrity ?? control.integrity,
          algorithmVersion: deps.algorithmVersion ?? DEFAULT_ALGORITHM_VERSION,
        })
        deps.guard()
        const receiptRef = await deps.saveReceipt(receipt)
        deps.guard()
        await deps.saveMeasurements(receiptRef, samples)
        deps.guard()

        const findingId = await deps.complete({
          hypothesisId,
          candidateId: input.candidateId,
          receiptRef,
          validationStatus: verdict.validationStatus,
          reasons: verdict.reasons,
          scope: verdict.scope,
        })

        const result: FocusProbeResult = {
          candidateId: input.candidateId,
          verdict: verdict.verdict,
          validationStatus: verdict.validationStatus,
          reasons: verdict.reasons,
          hypothesisId,
          receiptRef,
          findingId,
          scope: verdict.scope,
          reused: false,
          nextStep: nextStepFor(verdict.validationStatus),
        }
        // Reuse is only safe while the document is unchanged; a new epoch must re-measure.
        cache.set(input.candidateId, {
          receiptRef,
          result,
          epoch: bound.documentEpoch,
          node: bound.nodeIdentity,
        })
        return result
      } finally {
        reservation.release()
      }
    },
  }
}

async function resetIfFocused(
  bound: BoundTarget,
  reservation: ActionReservation,
  resets: NeutralReset[],
  deps: FocusProbeDeps,
  force = false,
): Promise<void> {
  // Every sample starts from a verified unfocused baseline. If the target is already focused, focus is
  // cleared only by a real click on a known-safe neutral area - never by script focus/blur. The reset
  // is itself a real click, so it costs an action; the caller charges the sample click separately.
  deps.guard()
  const focused = await bound.isFocused()
  deps.guard()
  if (focused || force) {
    resets.push(
      await deps.neutralReset(() => {
        deps.guard()
        reservation.consume()
      }),
    )
    deps.guard()
  }
}

function inconclusive(
  candidateId: string,
  reasons: readonly string[],
  _deps: FocusProbeDeps,
  extra: { detail?: readonly string[]; need?: number } = {},
): FocusProbeResult {
  return {
    candidateId,
    verdict: 'unknown',
    validationStatus: 'inconclusive',
    reasons: [...reasons, ...(extra.detail ?? [])],
    scope:
      'No bounded measurement was made. Nothing about this region, the bound input or the page is established by this result.',
    reused: false,
    nextStep:
      'This candidate could not be measured. Record the unverified scope and continue with other work or finish explicitly; do not restate this as a healthy or defective region.',
  }
}

function nextStepFor(status: 'supported' | 'refuted' | 'inconclusive'): string {
  if (status === 'supported')
    return 'A supported bounded finding is saved. Continue other scope or finish explicitly; do not re-probe this candidate.'
  if (status === 'refuted')
    return 'The sampled points in this region behaved correctly. This refutes only the measured points; continue other scope or finish explicitly.'
  return 'The measurement was inconclusive. Preserve the unverified scope; do not claim the region is healthy.'
}
