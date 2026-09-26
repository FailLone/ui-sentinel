import type { BusinessContractSnapshot } from '../business/types.ts'
import type { BusinessFact } from '../business/adapters/types.ts'

export function recoveryPolicyDescription(
  fact: Pick<BusinessFact, 'phase' | 'result'> | undefined,
): string {
  const boundary =
    'Business permission and inspection allowance are separate requirements; BOTH must permit the write. Zero inspection retry allowance forbids clicking retry even when the business says permitted. Do not test that prohibition by attempting the write. '
  return (
    boundary +
    (fact?.phase === 'failed' && fact.result === 'unknown'
      ? 'Recovery of this failed operation remains unverified if the inspection retry allowance is zero. In that case, once other applicable inspection is complete, call run_finish with unverified-scope. With positive allowance, use an operable control only when current business facts permit it; never force a disabled control or replay an uncertain write.'
      : 'A zero allowance does not itself create missing scope. A verified success or expected rejection can complete this run after its applicable checks; do not invent a required retry merely to force another outcome. Processing still requires observing its outcome or honestly reporting a real blocker. Never force a disabled control or replay an uncertain write.')
  )
}

/**
 * The agent-facing guidance that depends on which business is being inspected.
 *
 * These strings used to be written for shopping and stated for every run. The page_act description
 * told an export run that "This shopping inspection permits only one order and blocks further
 * network writes after it" - false twice over, since export permits one retry - and offered
 * `name="Add to Cart"` as the example control. The finish note called a processing failure "not an
 * explicit rejected/declined outcome", and journey_run warned against using a segment "to
 * purchase/pay".
 *
 * Like the inspection policy, the business-specific parts are supplied by the run's own contract
 * rather than branched on here: the numbers come from `effects`, and a run with no contract states
 * no limits rather than borrowing another business's. The executor mechanics in each string are
 * deliberately unchanged - this parameterises the business, it does not rewrite the instructions.
 */
type GuidanceContract = Pick<BusinessContractSnapshot, 'effects'> | undefined

export function pageActDescription(
  contract: GuidanceContract,
  features: { shortFinish?: boolean; atomicInvestigation?: boolean },
): string {
  const limits = contract
    ? ` This inspection permits at most ${contract.effects.maxCreates} entity-creating operation` +
      `${contract.effects.maxCreates === 1 ? '' : 's'} and ` +
      `${contract.effects.maxRetriesPerOperation} retr` +
      `${contract.effects.maxRetriesPerOperation === 1 ? 'y' : 'ies'} per operation, and the ` +
      `executor refuses writes beyond that.`
    : ''
  // Recovery controls are reached after whatever this business calls a completed operation, so the
  // string names the generic event rather than one business's result.
  return (
    'Perform exactly one non-forced interaction. type=probe checks click actionability without ' +
    'dispatching a click; use for recovery controls after a completed business operation.' +
    `${limits}` +
    ' Prefer role+name from the a11y tree (e.g. role="button", name from that tree).' +
    ' Use selector as fallback from element_details. Use visualDescription only if neither works.' +
    ' Pre-action evidence is always captured. Never repeat an uncertain write.'
  )
}

export function journeyRunDescription(): string {
  return (
    'Execute a previously evidenced read-only navigation segment from availableJourneys, at most ' +
    'three actions with per-step checks. Writes, anomalies, changed conditions or ambiguity return ' +
    'control. Do not use it for a business write or to replay uncertain actions. No list call is ' +
    'needed for already supplied candidates.'
  )
}

export function finishOutcomeDescription(): string {
  return (
    'success: a confirmed business outcome, corroborated by the business response and the visible ' +
    'state. rejected: an explicit rejection or decline response with a clear UI reason. A retryable ' +
    'processing failure (status failed) is unknown, not rejected; finish it as blocked when ' +
    'recovery cannot proceed.'
  )
}

export function finishNote(): string {
  return (
    'Untriggered conditions do not block inspection. failed is a processing failure (unknown), not ' +
    'an explicit rejected or declined outcome. Resolve applicable missingFacts or report them as ' +
    'blocked; then request finish again.'
  )
}

export function missingOutcomeFacts(): readonly string[] {
  // "for the order" named one business's entity. The fact being asked for is the same for every
  // business - the UI and the business response must agree - so it names neither.
  return ['verified matching UI and business response']
}

/**
 * What a supported finding must cite, given the resources this run actually retained.
 *
 * A business may publish a document that is not a fact about its entity's state - export's
 * recovery eligibility is one - and a claim about that document has to cite it, or the claim rests
 * only on how one screen rendered. Nothing here names a business: the string is emitted when the
 * run holds a retained resource, and stays silent when it holds none, so a business without the
 * concept is told nothing about it.
 */
export function retainedResourceGuidance(kinds: readonly string[]): string {
  if (!kinds.length) return ''
  return (
    ` This run retained public business resources (${[...new Set(kinds)].join(', ')}).` +
    ' A claim about why the business behaves as it does - for example whether recovery is permitted' +
    ' at all - must cite the resource itself from retainedResources in investigation_check.evidenceRefs or rule_check.evidenceRefs, not only the screen it' +
    ' produced; the rendered state is a consequence, and the resource is the business source.'
  )
}

/** A saved check resolves its measurement, not the whole journey. Unknown remains unfinished. */
export function completedCheckNextStep(
  verdict: 'pass' | 'fail' | 'unknown' | 'not-applicable',
  retryBudgetRemaining?: number,
): string {
  if (verdict === 'unknown')
    return 'This check is unresolved. Gather justified new evidence or record the missing scope and call run_finish with reason unverified-scope. Do not claim the check passed or failed.'
  if (verdict === 'not-applicable')
    return 'This check did not apply. Continue the applicable inspection; this is not a passing measurement.'
  if (verdict === 'pass' && retryBudgetRemaining === 0)
    return 'The retry control passed its operability check; this establishes no defect. This inspection has ZERO remaining retry allowance, even if the business itself permits retries. Do not click the retry control or try a second create. Actual recovery remains unverified because of the inspection limit. If other applicable inspection remains, continue it; otherwise call run_finish with reason unverified-scope. The server records that downstream scope. Do not repeat this measurement or compose a report.'
  const decision =
    verdict === 'pass'
      ? 'If the journey still requires a permitted recovery and the control is operable, perform it and verify the result; a passing probe is not a completed recovery.'
      : 'The failed check and its finding are already saved. A failed business operation is not an unresolved investigation. Continue a safe permitted recovery if one is operable; if the observed blocker prevents the remaining path, call run_finish with reason observed-blocker. The server preserves unverified downstream scope.'
  return `${decision} Do not repeat the measurement, recreate the finding, or write a report. If no applicable work remains, call run_finish with reason scope-covered.`
}
