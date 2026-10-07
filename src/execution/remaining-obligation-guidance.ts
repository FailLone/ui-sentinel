/** A scheduling allowance, never an observation, action authorization or progress fact. */
export function createRemainingObligationGuidance() {
  let used = false
  return {
    take(items: readonly { itemId: string; ref: string; category: string; description: string }[]) {
      if (used || !items.length) return undefined
      used = true
      return {
        allowance: 'one-model-turn' as const,
        items: items.slice(0, 8),
        instruction:
          'These existing selected obligations remain pending on the current page. Use the already available public facts to choose a justified permitted interaction with its postcondition, an investigation, or an honest finish. Finish local checks before navigation. Do not repeat completed actions, infer effects from labels, or replay an unknown write. This reminder is not evidence and does not reset the no-progress counter. If this turn adds no real facts, the executor will end with unresolved scope; this allowance is never renewed.',
      }
    },
  }
}
