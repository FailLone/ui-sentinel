import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseExplorationInput, type ExplorationInput } from './contracts.ts'
import { validateSuggestionAgainstCurrentState } from './suggestion.ts'

function fixture(name: string): ExplorationInput {
  const parsed = parseExplorationInput(
    JSON.parse(readFileSync(`evaluation/r1-jev-dev/public/${name}.json`, 'utf8')),
  )
  if (!parsed.ok) throw new Error(`fixture ${name} should be valid`)
  return parsed.value
}

function clone(input: ExplorationInput): any {
  return JSON.parse(JSON.stringify(input))
}

const suggestion = { candidateId: 'c1', action: 'click' as const }

describe('suggestion re-validation at consumption time', () => {
  it('accepts a suggestion whose every version still matches', () => {
    const input = fixture('menu')
    const result = validateSuggestionAgainstCurrentState({
      issued: input,
      current: input,
      suggestion,
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a suggestion once the related state moved on', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.state.relatedStateVersion = 'state-2'
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('related-state-changed')
  })

  it('refuses a suggestion once the observation version moved on', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.state.observationVersion = 'obs-2'
    current.candidates[0].observationVersion = 'obs-2'
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('observation-changed')
  })

  it('refuses a suggestion once the scope revision changed', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.scope.revision = 'scope-2'
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('scope-changed')
  })

  it('refuses a suggestion to a candidate that is no longer present', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.candidates = []
    current.scope.executableCandidateIds = []
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('candidate-missing')
  })

  it('refuses a suggestion to a candidate that is no longer executable', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.scope.executableCandidateIds = []
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('out-of-scope')
  })

  it('refuses a suggestion whose control became disabled after it was issued', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.candidates[0].publicState.enabled = false
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('not-executable')
  })

  it('refuses a suggestion whose control became invisible after it was issued', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.candidates[0].publicState.visible = false
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('not-executable')
  })

  it('refuses an action the caller never permitted on that candidate', () => {
    const issued = fixture('geometry-not-defect')
    const result = validateSuggestionAgainstCurrentState({
      issued,
      current: issued,
      suggestion: { candidateId: 'c1', action: 'click' },
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('action-not-allowed')
  })

  it('refuses a suggestion when the budget is exhausted', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.budget.remainingDecisions = 0
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('budget-exhausted')
  })

  it('refuses a suggestion when the caller has already cancelled', () => {
    const issued = fixture('menu')
    const result = validateSuggestionAgainstCurrentState({
      issued,
      current: issued,
      suggestion,
      cancelled: true,
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('cancelled')
  })

  it('refuses a suggestion when the task revision changed under it', () => {
    const issued = fixture('menu')
    const current = clone(issued)
    current.task.revision = 'task-2'
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('task-changed')
  })

  it('does not treat a self-reported version as sufficient on its own', () => {
    const issued = fixture('menu')
    // The current snapshot lies about its own version but the candidate set is genuinely
    // different: identity is re-derived from the delivered state, not from a claimed field.
    const current = clone(issued)
    current.candidates[0] = { ...current.candidates[0], targetKey: 'node-other' }
    const result = validateSuggestionAgainstCurrentState({ issued, current, suggestion })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('candidate-identity-changed')
  })
})
