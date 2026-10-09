import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseExplorationInput, type ExplorationInput } from './contracts.ts'
import { rankCandidates } from './ranking.ts'

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

describe('pure ranking baseline', () => {
  it('returns every eligible candidate in the ordered queue', () => {
    const result = rankCandidates(fixture('tabs'))
    expect(result.kind).toBe('ranked')
    expect(result.orderedCandidateIds).toEqual(['c1', 'c2'])
    expect(result.eligible.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
  })

  it('is stable when the input candidate array is reordered', () => {
    const input = fixture('tabs')
    const reordered = clone(input)
    reordered.candidates = [...reordered.candidates].reverse()
    expect(rankCandidates(reordered).orderedCandidateIds).toEqual(
      rankCandidates(input).orderedCandidateIds,
    )
  })

  it('produces byte-identical output across repeated runs and policies', () => {
    const input = fixture('low-score-fairness')
    const a = JSON.stringify(rankCandidates(input))
    const b = JSON.stringify(rankCandidates(input))
    expect(a).toBe(b)
    expect(a).not.toContain('Math.random')
  })

  it('breaks a full tie by candidate id byte order', () => {
    const input = fixture('tabs')
    const ids = rankCandidates(input).orderedCandidateIds
    expect(ids).toEqual([...ids].sort())
  })

  it('prefers a candidate not yet attempted in the current related state', () => {
    // repeat-same-state: c1 was already attempted in state-1, which IS the current state.
    const result = rankCandidates(fixture('repeat-same-state'))
    expect(result.orderedCandidateIds[0]).toBe('c2')
  })

  it('does not permanently exclude a candidate attempted only in an older state', () => {
    // revisit-new-state: the same target was attempted, but in state-1 while the page is now
    // in state-2. It must be treated as untried here, not banned.
    const result = rankCandidates(fixture('revisit-new-state'))
    expect(result.orderedCandidateIds).toEqual(['c1'])
    expect(result.eligible[0].attemptsInCurrentState).toBe(0)
  })

  it('counts attempts by target identity and action, not by visible text', () => {
    const input = fixture('repeat-same-state')
    const renamed = clone(input)
    // Same target/action, different display text and a different short ref in history.
    renamed.candidates[0].text = '完全不同的文案'
    renamed.history[0].candidateId = 'some-other-ref'
    const result = rankCandidates(renamed)
    expect(result.orderedCandidateIds[0]).toBe('c2')
    expect(result.eligible.find((c) => c.id === 'c1')?.attemptsInCurrentState).toBe(1)
  })

  it('does not merge identity across observations when targetKey is unknown', () => {
    const input = fixture('repeat-same-state')
    const anonymous = clone(input)
    anonymous.candidates[0].targetKey = null
    const result = rankCandidates(anonymous)
    // With no stable identity the attempt cannot be attributed, so nothing is removed.
    expect(result.eligible.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('ranks a lower estimated cost first when attempt state is equal', () => {
    const input = fixture('tabs')
    const costly = clone(input)
    costly.candidates[0].estimatedCost = 9
    const ids = rankCandidates(costly).orderedCandidateIds
    expect(ids[0]).toBe('c2')
  })

  it('records a rejection reason for every ineligible candidate in the receipt', () => {
    const input = fixture('menu')
    const mixed = clone(input)
    // Add a disabled sibling that is still inside the caller's executable scope.
    mixed.candidates.push({
      ...mixed.candidates[0],
      id: 'c2',
      targetKey: 'node-c2',
      publicState: { visible: true, enabled: false, expanded: null, selected: null },
    })
    mixed.scope.executableCandidateIds = ['c1', 'c2']
    const result = rankCandidates(mixed)
    expect(result.orderedCandidateIds).toEqual(['c1'])
    expect(result.rejected).toContainEqual({ candidateId: 'c2', reason: 'disabled' })
  })

  it('reports an empty queue rather than inventing a winner', () => {
    const result = rankCandidates(fixture('empty-candidates'))
    expect(result.kind).toBe('handoff')
    expect(result.orderedCandidateIds).toEqual([])
  })

  it('treats out-of-scope candidates as ineligible without guessing permission', () => {
    const result = rankCandidates(fixture('disabled'))
    expect(result.eligible).toEqual([])
    expect(result.kind).toBe('handoff')
  })

  it('keeps a low-scoring candidate in the queue instead of dropping it', () => {
    const input = fixture('low-score-fairness')
    const withScores = rankCandidates(input, {
      scores: [
        { candidateId: 'c1', relevance: 0.01, informationGain: 0.01, uncertainty: 0.2 },
        { candidateId: 'c2', relevance: 0.9, informationGain: 0.9, uncertainty: 0.1 },
      ],
    })
    expect(withScores.orderedCandidateIds).toContain('c1')
    expect(withScores.orderedCandidateIds[0]).toBe('c2')
  })

  it('gives a long-waiting low-scoring candidate a turn on the rotation cadence', () => {
    const input = fixture('low-score-fairness')
    const scores = [
      { candidateId: 'c1', relevance: 0.01, informationGain: 0.01, uncertainty: 0.2 },
      { candidateId: 'c2', relevance: 0.9, informationGain: 0.9, uncertainty: 0.1 },
    ]
    // c1 has been eligible since decision 0 and repeatedly passed over; the 4th decision
    // (index 3) must promote it.
    const result = rankCandidates(input, {
      scores,
      fairness: { decisionIndex: 3, firstEligibleDecision: { c1: 0, c2: 0 } },
    })
    expect(result.orderedCandidateIds[0]).toBe('c1')
    expect(result.rotation.applied).toBe(true)
  })

  it('does not rotate before the cadence is reached', () => {
    const input = fixture('low-score-fairness')
    const result = rankCandidates(input, {
      scores: [
        { candidateId: 'c1', relevance: 0.01, informationGain: 0.01, uncertainty: 0.2 },
        { candidateId: 'c2', relevance: 0.9, informationGain: 0.9, uncertainty: 0.1 },
      ],
      fairness: { decisionIndex: 1, firstEligibleDecision: { c1: 0, c2: 0 } },
    })
    expect(result.orderedCandidateIds[0]).toBe('c2')
    expect(result.rotation.applied).toBe(false)
  })

  it('never promotes an already-attempted candidate through rotation', () => {
    const input = fixture('repeat-same-state')
    const result = rankCandidates(input, {
      fairness: { decisionIndex: 3, firstEligibleDecision: { c1: 0, c2: 0 } },
    })
    // c1 is tried in this state, so rotation must skip it and still lead with c2.
    expect(result.orderedCandidateIds[0]).toBe('c2')
  })

  it('does not turn geometry into a defect filter or permanent exclusion', () => {
    const result = rankCandidates(fixture('geometry-not-defect'))
    expect(result.eligible.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(result.rejected).toEqual([])
  })

  it('exposes no hidden global state between calls', () => {
    const first = rankCandidates(fixture('low-score-fairness'), {
      fairness: { decisionIndex: 3, firstEligibleDecision: { c1: 0, c2: 0 } },
    })
    const second = rankCandidates(fixture('low-score-fairness'))
    const third = rankCandidates(fixture('low-score-fairness'), {
      fairness: { decisionIndex: 3, firstEligibleDecision: { c1: 0, c2: 0 } },
    })
    expect(JSON.stringify(second)).toBe(
      JSON.stringify(rankCandidates(fixture('low-score-fairness'))),
    )
    expect(JSON.stringify(first)).toBe(JSON.stringify(third))
  })

  it('fuses model scores by the fixed, versioned policy when supplied', () => {
    const input = fixture('tabs')
    const result = rankCandidates(input, {
      scores: [
        { candidateId: 'c1', relevance: 0.1, informationGain: 0.1, uncertainty: 0.1 },
        { candidateId: 'c2', relevance: 1, informationGain: 1, uncertainty: 0.1 },
      ],
    })
    expect(result.policyVersion).toBe('r1-exploration-policy-2')
    expect(result.orderedCandidateIds[0]).toBe('c2')
    expect(result.eligible.find((c) => c.id === 'c2')?.composite).toBeCloseTo(1, 6)
    expect(result.eligible.find((c) => c.id === 'c1')?.composite).toBeCloseTo(0.1, 6)
  })

  it('orders on the baseline when no scores are supplied, never on a default score', () => {
    const input = fixture('tabs')
    const result = rankCandidates(input)
    expect(result.eligible.every((c) => c.composite === null)).toBe(true)
    expect(result.orderedCandidateIds).toEqual(['c1', 'c2'])
  })
})
