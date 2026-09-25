import type { BusinessContractSnapshot } from '../business/types.ts'

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
    ' at all - must cite the resource itself from retainedResources, not only the screen it' +
    ' produced; the rendered state is a consequence, and the resource is the business source.'
  )
}
