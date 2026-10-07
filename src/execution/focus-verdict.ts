import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { FOCUS_WINDOW_MS } from './focus-constants.ts'

/**
 * The verdict for a focus probe, from the recorded attempts.
 *
 * The decisive rule (plan 4.4): an input that is ALREADY focused stays focused through a click on dead
 * padding, so a sample that fails to focus proves nothing unless the run first re-established a
 * verified unfocused baseline. Every sample taken without that baseline makes the whole probe
 * inconclusive rather than producing the easy false refutation.
 *
 * Verdicts are bounded to the sampled points only (plan 4.6): a pass refutes those points, never every
 * pixel of the region, and a supported finding is capped at warning severity by the caller.
 */

export interface FocusAttempt {
  readonly side: 'left' | 'right'
  /** True only when the target was verified to be unfocused immediately before this click. */
  readonly baselineUnfocused: boolean
  /** Milliseconds until the bound node focused, or null when it never did within the window. */
  readonly focusedWithinMs: number | null
  readonly integrity: EvidenceIntegrity
  /** Set on the one permitted retest of the first failing point. */
  readonly retest?: boolean
  readonly valueChanged?: boolean
  readonly stable?: boolean
}

export interface FocusReset {
  readonly introducedChange: boolean
  readonly integrity: EvidenceIntegrity
}

export interface FocusVerdictInput {
  readonly control: {
    readonly ok: boolean
    readonly focusedWithinMs: number | null
    readonly integrity: EvidenceIntegrity
    readonly baselineUnfocused?: boolean
    readonly valueChanged?: boolean
    readonly stable?: boolean
  }
  readonly attempts: readonly FocusAttempt[]
  readonly resets: readonly FocusReset[]
  /** How many edge points the geometry could derive; fewer than two is an unknown, not a pass. */
  readonly usableEdgePoints?: number
}

export type FocusVerdict = 'fail' | 'pass' | 'unknown'

export interface FocusVerdictResult {
  readonly verdict: FocusVerdict
  readonly validationStatus: 'supported' | 'refuted' | 'inconclusive'
  readonly reasons: readonly string[]
  readonly scope: string
}

const SCOPE = `Measured only the sampled points inside the perceived region at the recorded document epoch, within a ${FOCUS_WINDOW_MS}ms focus window. This does not establish that every pixel of the region behaves the same way, nor anything about unmeasured areas, other viewports or other pages. ${FOCUS_WINDOW_MS}ms is this round's window and is not a claim that every application must honour it permanently.`

/** A measurement that was taken cleanly, on a verified-unfocused baseline. */
function trustworthy(attempt: FocusAttempt): boolean {
  return cleanEvidenceIntegrity(attempt.integrity) && attempt.baselineUnfocused
}

/**
 * Decide the bounded verdict.
 *
 * Everything that makes the setup - rather than the page - the open question resolves to unknown:
 * a failed control, a baseline that was never established, a measurement taken under an intervention,
 * a reset that changed state, too few usable points, or a retest that contradicts the first result.
 */
export function evaluateFocusVerdict(input: FocusVerdictInput): FocusVerdictResult {
  const reasons: string[] = []
  const unknown = (): FocusVerdictResult => ({
    verdict: 'unknown',
    validationStatus: 'inconclusive',
    reasons,
    scope: SCOPE,
  })

  // The control proves the harness can see a focus when one happens. Without it, nothing else counts.
  if (
    !input.control.ok ||
    input.control.focusedWithinMs === null ||
    input.control.focusedWithinMs < 0 ||
    input.control.focusedWithinMs > FOCUS_WINDOW_MS ||
    input.control.baselineUnfocused === false
  ) {
    reasons.push('positive-control-failed')
    return unknown()
  }
  if (!cleanEvidenceIntegrity(input.control.integrity)) {
    reasons.push('evidence-intervened')
    return unknown()
  }
  if (input.resets.some((r) => r.introducedChange || !cleanEvidenceIntegrity(r.integrity))) {
    reasons.push('reset-introduced-change')
    return unknown()
  }
  if (input.usableEdgePoints !== undefined && input.usableEdgePoints < 2) {
    reasons.push('insufficient-edge-points')
    return unknown()
  }

  if (
    input.control.valueChanged ||
    input.control.stable === false ||
    input.attempts.some(
      (a) =>
        a.valueChanged ||
        a.stable === false ||
        (a.focusedWithinMs !== null &&
          (a.focusedWithinMs < 0 || a.focusedWithinMs > FOCUS_WINDOW_MS)),
    )
  ) {
    reasons.push('state-changed-or-invalid-window')
    return unknown()
  }

  // A sample on an unverified baseline is the false-positive trap: cannot confirm, cannot deny.
  const untrustworthy = input.attempts.filter((a) => !trustworthy(a))
  if (untrustworthy.some((a) => !a.baselineUnfocused)) reasons.push('baseline-not-established')
  if (untrustworthy.some((a) => !cleanEvidenceIntegrity(a.integrity)))
    reasons.push('evidence-intervened')
  if (untrustworthy.length > 0) return unknown()

  const firstPass = input.attempts.filter((a) => !a.retest)
  if (firstPass.length !== 2 || new Set(firstPass.map((a) => a.side)).size !== 2) {
    reasons.push('no-usable-samples')
    return unknown()
  }

  const failures = firstPass.filter((a) => a.focusedWithinMs === null)
  if (failures.length === 0) {
    return { verdict: 'pass', validationStatus: 'refuted', reasons, scope: SCOPE }
  }

  // A retest exists only to firm up a first failure; if it focuses, the first result is not reliable.
  const retests = input.attempts.filter((a) => a.retest)
  if (retests.length !== 1 || retests[0].side !== failures[0].side) {
    reasons.push('missing-independent-retest')
    return unknown()
  }
  if (retests.some((a) => a.focusedWithinMs !== null)) {
    reasons.push('retest-focuses')
    return unknown()
  }

  return { verdict: 'fail', validationStatus: 'supported', reasons, scope: SCOPE }
}
