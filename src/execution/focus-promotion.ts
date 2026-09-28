import { focusReceiptSupports, isFocusReceipt } from './focus-receipt.ts'

/**
 * The class-scoped promotion gate.
 *
 * Findings are currently promoted on evidence-integrity cleanliness plus an artifact-type check, which
 * a generic screenshot and any snapshot can satisfy. Plan 4.6 requires a finding of the visual-focus
 * class to be promotable only by a structural focus measurement naming the candidate it is about -
 * and requires that re-titling a hypothesis, rewording it or calling the ordinary findings tool cannot
 * get around that.
 *
 * The gate therefore keys on the HYPOTHESIS's own recorded class and bound candidate, not on any
 * wording the agent supplies. An agent cannot choose to be treated as this class, and cannot leave it
 * by describing itself differently.
 */

/** The recorded class of a hypothesis. Null for every ordinary hypothesis. */
export type HypothesisKind = 'visual-focus' | null

export interface PromotionReceiptRef {
  /** Evidence id of the persisted receipt artifact, for the audit trail. */
  readonly artifactId: string
  /** The parsed receipt. Validated here; a receipt-shaped object is not enough. */
  readonly receipt: unknown
}

export interface FocusPromotionInput {
  readonly hypothesis: {
    readonly kind: HypothesisKind
    readonly visualCandidateId: string | null
  }
  readonly receipts: readonly PromotionReceiptRef[]
}

export type FocusPromotionBlock =
  | 'missing-focus-receipt'
  | 'focus-receipt-candidate-mismatch'
  | 'missing-bound-candidate'

export type FocusPromotionResult =
  | { readonly blocked: false }
  | { readonly blocked: true; readonly reason: FocusPromotionBlock }

/**
 * Whether promotion of this hypothesis to supported/refuted must be refused.
 *
 * Ordinary hypotheses are untouched. A visual-focus hypothesis must carry a structurally valid receipt
 * that names the candidate the hypothesis is bound to; anything else - no receipt, an invalid or
 * receipt-shaped object, a mismatched candidate, or no recorded candidate - is refused.
 */
export function focusPromotionBlocked(input: FocusPromotionInput): FocusPromotionResult {
  if (input.hypothesis.kind !== 'visual-focus') return { blocked: false }
  if (!input.hypothesis.visualCandidateId)
    return { blocked: true, reason: 'missing-bound-candidate' }

  const candidateId = input.hypothesis.visualCandidateId
  for (const ref of input.receipts) {
    // Structural validation plus the candidate identity: a valid receipt for another candidate is not
    // this finding's evidence, and a receipt-shaped object is not a receipt.
    if (
      focusReceiptSupports(ref.receipt, {
        candidateId,
        screenshotRef: screenshotRefOf(ref.receipt),
      })
    )
      return { blocked: false }
  }
  // Distinguish "no usable receipt at all" from "a real measurement exists but names another candidate".
  // The split keys on structural validity, not on a lone candidateId string, or a malformed receipt
  // would be misreported as a candidate mismatch.
  const structurallyValid = input.receipts.some((ref) => isFocusReceipt(ref.receipt))
  return {
    blocked: true,
    reason: structurallyValid ? 'focus-receipt-candidate-mismatch' : 'missing-focus-receipt',
  }
}

/**
 * The screenshot a receipt claims. `focusReceiptSupports` also compares this, so the gate passes the
 * receipt's own value through: a receipt that names the right candidate but a different screenshot is
 * still a different measurement.
 */
function screenshotRefOf(receipt: unknown): string {
  const value = (receipt as { screenshotRef?: unknown } | null)?.screenshotRef
  return typeof value === 'string' ? value : ''
}
