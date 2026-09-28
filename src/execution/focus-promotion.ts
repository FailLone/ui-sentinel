import { isFocusReceipt } from './focus-receipt.ts'

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
  /**
   * Evidence ids of the screenshots this run actually owns.
   *
   * Plan 4.6 requires a receipt to name the candidate AND the screenshot being promoted. Without this
   * list the screenshot half of that rule is unenforceable: the only screenshot a receipt could be
   * compared against would be its own, which compares equal to itself and admits a measurement taken
   * against a screenshot from some other observation.
   */
  readonly screenshotRefs?: readonly string[]
}

export type FocusPromotionBlock =
  | 'missing-focus-receipt'
  | 'focus-receipt-candidate-mismatch'
  | 'focus-receipt-screenshot-mismatch'
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
  const ownedScreenshots = input.screenshotRefs

  let candidateMismatch = false
  let screenshotMismatch = false
  for (const ref of input.receipts) {
    const receipt = ref.receipt
    // Structural validation first: a receipt-shaped object is not a receipt, and a malformed one must
    // not be mistaken for evidence that merely names someone else.
    if (!isFocusReceipt(receipt)) continue
    if (receipt.candidateId !== candidateId) {
      candidateMismatch = true
      continue
    }
    // A receipt must name a screenshot THIS RUN owns. Compared against the receipt's own value the
    // rule would be a tautology, admitting a measurement taken against another observation's image.
    if (ownedScreenshots && !ownedScreenshots.includes(receipt.screenshotRef)) {
      screenshotMismatch = true
      continue
    }
    return { blocked: false }
  }

  // Distinguish the ways a measurement can fail to be this finding's evidence, so the refusal says
  // which one it was rather than collapsing them all into "missing".
  if (!input.receipts.some((ref) => isFocusReceipt(ref.receipt)))
    return { blocked: true, reason: 'missing-focus-receipt' }
  if (screenshotMismatch && !candidateMismatch)
    return { blocked: true, reason: 'focus-receipt-screenshot-mismatch' }
  return { blocked: true, reason: 'focus-receipt-candidate-mismatch' }
}
