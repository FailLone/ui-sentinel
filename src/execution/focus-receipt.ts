import { FOCUS_WINDOW_MS, MAX_PROBE_CLICKS } from './focus-constants.ts'
export { FOCUS_WINDOW_MS, MAX_PROBE_CLICKS } from './focus-constants.ts'
import { evaluateFocusVerdict } from './focus-verdict.ts'
import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../shared/evidence-integrity.ts'

/**
 * The typed receipt for a focus probe.
 *
 * A finding of this class may only be promoted by a structurally complete measurement, never by a
 * screenshot plus an arbitrary snapshot. Plan 4.6. Structural validity alone is deliberately not
 * sufficient: the receipt must also name the candidate and screenshot being promoted, which is what
 * `focusReceiptSupports` enforces, so re-titling an old hypothesis cannot borrow someone else's probe.
 */

export interface FocusHit {
  readonly ref: string | null
  readonly tag: string
  readonly relation: 'self' | 'descendant' | 'ancestor' | 'unrelated' | 'none'
}

export interface FocusSample {
  readonly side: 'left' | 'right' | 'retest'
  readonly retestOf?: 'left' | 'right'
  readonly stable?: boolean
  readonly x: number
  readonly y: number
  readonly hit: FocusHit
  /** Identity of document.activeElement before the click; null when nothing was focused. */
  readonly focusBefore: string | null
  /** Identity of document.activeElement after the click; null when nothing became focused. */
  readonly focusAfter: string | null
  /** Milliseconds until the bound node was focused, or null when it never was within the window. */
  readonly focusedWithinMs: number | null
  /**
   * The wall-clock time actually spent observing focus after this click.
   *
   * Optional so pre-P3 receipts stay valid; when present, an independent scorer may require it to cover
   * the declared window, so a corrupted windowMs cannot stand on an observation that never happened.
   */
  readonly observedWindowMs?: number
  readonly valueChanged: boolean
  readonly documentEpoch: string
  readonly integrity: EvidenceIntegrity
}

export interface PositiveControl extends Omit<FocusSample, 'side'> {
  /** The control is only valid if the native input really focused within the window. */
  readonly ok: boolean
}

export interface NeutralReset {
  readonly x: number
  readonly y: number
  /** True when the reset click introduced a navigation, write, value or layout change. */
  readonly introducedChange: boolean
  readonly integrity: EvidenceIntegrity
}

export interface FocusReceiptInput {
  readonly candidateId: string
  readonly screenshotRef: string
  readonly screenshotSha: string
  readonly documentEpoch: string
  readonly url: string
  readonly scroll: { readonly x: number; readonly y: number }
  readonly viewport: { readonly width: number; readonly height: number }
  readonly binding: {
    readonly elementRef: string
    readonly nodeIdentity: string
    readonly reason: string
    /**
     * Evidence ref of the binding witness captured for this node at bind time (P3).
     *
     * `nodeIdentity` is a bind-time uuid that only this run ever produced, so it cannot be checked
     * against the intended target from outside. The witness records the node's public identity for an
     * independent scorer. Optional so receipts from before P3 stay structurally valid.
     */
    readonly witnessRef?: string
  }
  readonly positiveControl: PositiveControl
  readonly samples: readonly FocusSample[]
  readonly resets: readonly NeutralReset[]
  readonly actionCost: number
  readonly integrity: EvidenceIntegrity
  readonly algorithmVersion: string
}

export interface FocusReceipt extends FocusReceiptInput {
  readonly version: 1
  readonly windowMs: number
  readonly scope: string
}

const SCOPE =
  'This probe measured only the sampled points inside the perceived region at the recorded document epoch. It does not establish that every pixel of the region behaves the same way, nor anything about unmeasured areas, other viewports or other pages.'

export function createFocusReceipt(input: FocusReceiptInput): FocusReceipt {
  return {
    version: 1,
    windowMs: FOCUS_WINDOW_MS,
    scope: SCOPE,
    ...input,
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validHit(hit: unknown): hit is FocusHit {
  if (!hit || typeof hit !== 'object') return false
  const h = hit as FocusHit
  return (
    (h.ref === null || typeof h.ref === 'string') &&
    typeof h.tag === 'string' &&
    ['self', 'descendant', 'ancestor', 'unrelated', 'none'].includes(h.relation)
  )
}

/** Fields shared by an edge sample and the positive control (which has no `side`). */
function validMeasurement(m: unknown, epoch: string): boolean {
  if (!m || typeof m !== 'object') return false
  const s = m as Omit<FocusSample, 'side'>
  return (
    finite(s.x) &&
    finite(s.y) &&
    validHit(s.hit) &&
    (s.focusBefore === null || typeof s.focusBefore === 'string') &&
    (s.focusAfter === null || typeof s.focusAfter === 'string') &&
    (s.focusedWithinMs === null || finite(s.focusedWithinMs)) &&
    typeof s.valueChanged === 'boolean' &&
    // A measurement from another document epoch cannot describe the node the receipt claims to have bound.
    s.documentEpoch === epoch &&
    cleanEvidenceIntegrity(s.integrity)
  )
}

function validSamplePoint(sample: unknown, epoch: string): boolean {
  if (!sample || typeof sample !== 'object') return false
  return (
    ['left', 'right', 'retest'].includes((sample as FocusSample).side) &&
    validMeasurement(sample, epoch)
  )
}

export function isFocusReceipt(value: unknown): value is FocusReceipt {
  if (!value || typeof value !== 'object') return false
  const r = value as FocusReceipt
  if (r.version !== 1) return false
  if (typeof r.candidateId !== 'string' || !r.candidateId) return false
  if (typeof r.screenshotRef !== 'string' || !r.screenshotRef) return false
  if (typeof r.screenshotSha !== 'string' || !r.screenshotSha) return false
  if (typeof r.documentEpoch !== 'string' || !r.documentEpoch) return false
  if (typeof r.algorithmVersion !== 'string' || !r.algorithmVersion) return false
  if (!r.binding || typeof r.binding.nodeIdentity !== 'string' || !r.binding.nodeIdentity)
    return false
  // The probe is only as good as its positive control: a control that failed means the setup, not the
  // page, is in question, so the receipt cannot carry a conclusion.
  if (!r.positiveControl || r.positiveControl.ok !== true) return false
  if (!validMeasurement(r.positiveControl, r.documentEpoch)) return false
  if (!Array.isArray(r.samples) || r.samples.length === 0) return false
  if (!r.samples.every((s) => validSamplePoint(s, r.documentEpoch))) return false
  if (!Array.isArray(r.resets)) return false
  if (
    !r.resets.every(
      (reset) =>
        reset &&
        finite(reset.x) &&
        finite(reset.y) &&
        typeof reset.introducedChange === 'boolean' &&
        cleanEvidenceIntegrity(reset.integrity),
    )
  )
    return false
  if (!Number.isSafeInteger(r.actionCost) || r.actionCost < 1 || r.actionCost > MAX_PROBE_CLICKS)
    return false
  if (!finite(r.windowMs) || r.windowMs !== FOCUS_WINDOW_MS) return false
  if (!cleanEvidenceIntegrity(r.integrity)) return false
  return true
}

/**
 * Whether this receipt may be used to promote the given candidate.
 *
 * Structural validity is necessary but not sufficient: the receipt must be the one produced for this
 * candidate against this screenshot, so a valid receipt cannot be re-pointed at a different finding.
 */
export function focusReceiptSupports(
  receipt: unknown,
  target: { readonly candidateId: string; readonly screenshotRef: string },
): boolean {
  if (!isFocusReceipt(receipt)) return false
  return (
    receipt.candidateId === target.candidateId && receipt.screenshotRef === target.screenshotRef
  )
}

/** Recompute the only conclusion this persisted measurement can justify. */
export function focusReceiptVerdict(receipt: unknown) {
  if (!isFocusReceipt(receipt)) return 'inconclusive'
  const r = receipt
  if (!r.positiveControl.stable || r.samples.some((s) => !s.stable)) return 'inconclusive'
  const consistent = (s: Omit<FocusSample, 'side'>) =>
    s.focusedWithinMs === null
      ? s.focusAfter !== r.binding.nodeIdentity
      : s.focusAfter === r.binding.nodeIdentity
  if (!consistent(r.positiveControl) || !r.samples.every(consistent)) return 'inconclusive'
  if (
    r.samples.length > 3 ||
    r.resets.length > 4 ||
    r.actionCost !== 1 + r.samples.length + r.resets.length
  )
    return 'inconclusive'
  const retry = r.samples.find((s) => s.side === 'retest')
  const first = retry && r.samples.find((s) => s.side === retry.retestOf)
  if (retry && (!first || retry.x !== first.x || retry.y !== first.y)) return 'inconclusive'
  return evaluateFocusVerdict({
    control: {
      ...r.positiveControl,
      baselineUnfocused: r.positiveControl.focusBefore !== r.binding.nodeIdentity,
    },
    attempts: r.samples.map((s) => ({
      ...s,
      side: s.side === 'retest' ? s.retestOf! : s.side,
      baselineUnfocused: s.focusBefore !== r.binding.nodeIdentity,
      retest: s.side === 'retest',
    })),
    resets: r.resets,
    usableEdgePoints: 2,
  }).validationStatus
}
