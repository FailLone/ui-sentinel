/**
 * Consumption-time re-validation of a suggestion.
 *
 * A suggestion issued against one snapshot is worthless the moment the page moves. Checking the
 * snapshot the request was *issued* from, or believing a version the response reports about
 * itself, cannot catch an async change. The consumer therefore hands in the CURRENT snapshot,
 * its scope and budget, and this function re-derives everything from it.
 *
 * This function still grants nothing. It only rejects; acceptance means "nothing here forbids it",
 * not "authorized".
 */
import { parseExplorationInput, type ExplorationInput, type PublicAction } from './contracts.ts'

export type Suggestion = { readonly candidateId: string; readonly action: PublicAction }

export type SuggestionCheck = {
  readonly issued: ExplorationInput
  readonly current: ExplorationInput
  readonly suggestion: Suggestion
  readonly cancelled?: boolean
}

export type SuggestionVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly detail: string }

export function validateSuggestionAgainstCurrentState(check: SuggestionCheck): SuggestionVerdict {
  const { issued, current, suggestion } = check

  if (!parseExplorationInput(issued).ok || !parseExplorationInput(current).ok)
    return { ok: false, detail: 'invalid-input' }
  if (issued.requestId !== current.requestId) return { ok: false, detail: 'request-changed' }
  if (check.cancelled) return { ok: false, detail: 'cancelled' }
  if (current.budget.remainingDecisions <= 0) return { ok: false, detail: 'budget-exhausted' }
  if (current.budget.remainingActions <= 0) return { ok: false, detail: 'budget-exhausted' }
  if (current.budget.remainingMs <= 0 || current.budget.maxRequestMs <= 0)
    return { ok: false, detail: 'budget-exhausted' }
  if (
    current.state.documentVersion !== issued.state.documentVersion ||
    current.state.url !== issued.state.url
  )
    return { ok: false, detail: 'document-changed' }
  if (JSON.stringify(current.task) !== JSON.stringify(issued.task))
    return { ok: false, detail: 'task-changed' }
  if (current.task.revision !== issued.task.revision) return { ok: false, detail: 'task-changed' }
  if (current.state.relatedStateVersion !== issued.state.relatedStateVersion)
    return { ok: false, detail: 'related-state-changed' }
  if (current.state.observationVersion !== issued.state.observationVersion)
    return { ok: false, detail: 'observation-changed' }
  if (current.state.pageId !== issued.state.pageId) return { ok: false, detail: 'page-changed' }
  if (current.scope.revision !== issued.scope.revision)
    return { ok: false, detail: 'scope-changed' }

  const candidate = current.candidates.find((c) => c.id === suggestion.candidateId)
  if (!candidate) return { ok: false, detail: 'candidate-missing' }

  const original = issued.candidates.find((c) => c.id === suggestion.candidateId)
  if (!original) return { ok: false, detail: 'candidate-not-issued' }
  if (
    !issued.scope.executableCandidateIds.includes(suggestion.candidateId) ||
    !original.allowedActions.includes(suggestion.action)
  )
    return { ok: false, detail: 'action-not-allowed-at-issue' }
  if (original.targetKey !== candidate.targetKey)
    return { ok: false, detail: 'candidate-identity-changed' }

  if (!current.scope.executableCandidateIds.includes(suggestion.candidateId))
    return { ok: false, detail: 'out-of-scope' }
  if (candidate.publicState.visible !== true || candidate.publicState.enabled !== true)
    return { ok: false, detail: 'not-executable' }
  if (!candidate.allowedActions.includes(suggestion.action))
    return { ok: false, detail: 'action-not-allowed' }

  if (
    JSON.stringify(original) !== JSON.stringify(candidate) ||
    JSON.stringify(issued.history) !== JSON.stringify(current.history) ||
    JSON.stringify(issued.scope) !== JSON.stringify(current.scope) ||
    issued.budget.revision !== current.budget.revision
  )
    return { ok: false, detail: 'snapshot-changed' }
  return { ok: true }
}
