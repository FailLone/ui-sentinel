import { createHash } from 'node:crypto'
import type { ExplorationInput } from './contracts.ts'
/** Complete caller-owned semantic snapshot; request ids and decreasing budget quantities are separate guards. */
export function stateDigest(input: ExplorationInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        task: input.task,
        state: input.state,
        candidates: input.candidates,
        history: input.history,
        scope: input.scope,
        limits: input.limits,
        budgetRevision: input.budget.revision,
      }),
    )
    .digest('hex')
}
export function hasDecisionBudget(input: ExplorationInput): boolean {
  return (
    input.budget.remainingDecisions > 0 &&
    input.budget.remainingActions > 0 &&
    input.budget.remainingMs > 0 &&
    input.budget.maxRequestMs > 0
  )
}
