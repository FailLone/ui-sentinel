/** A scheduling allowance, never an observation, action authorization or progress fact. */
export function createRemainingObligationGuidance() {
  let used = false
  return {
    take(
      items: readonly { itemId: string; ref: string; category: string; description: string }[],
      registration?: {
        phase: string
        sourceCoverage: {
          returnedChars: number
          totalChars: number
          complete: boolean
          semanticCompleteness: string
        }
      },
    ) {
      const sourceDecision =
        registration?.phase === 'source-located' || registration?.phase === 'repair-needed'
      if (used || (!items.length && !sourceDecision)) return undefined
      used = true
      return {
        allowance: 'one-model-turn' as const,
        kind: sourceDecision
          ? ('product-registration' as const)
          : ('remaining-obligations' as const),
        ...(sourceDecision ? { sourceCoverage: registration!.sourceCoverage } : {}),
        items: items.slice(0, 8),
        instruction: sourceDecision
          ? 'Registration decision now: use the original text and issued citations to register a grounded plan, retrieve a specific remaining requirement or truncated passage, or finish unverified and name the unsupported scope. Repeated reads of returned text added no source coverage. Coverage does not establish semantic completeness. This is the one bounded reminder within the existing budget; it does not reset progress, create a plan, or extend closure.'
          : 'These existing selected obligations remain pending on the current page. Use the already available public facts to choose a justified permitted interaction with its postcondition, an investigation, or an honest finish. Finish local checks before navigation. Do not repeat completed actions, infer effects from labels, or replay an unknown write. This reminder is not evidence and does not reset the no-progress counter. If this turn adds no real facts, the executor will end with unresolved scope; this allowance is never renewed.',
      }
    },
  }
}
