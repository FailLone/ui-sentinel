import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HARD_LIMITS,
  normalizeOutcome,
  parseExplorationInput,
  type ExplorationInput,
} from './contracts.ts'

function publicCase(name: string): unknown {
  return JSON.parse(readFileSync(`evaluation/r1-jev-dev/public/${name}.json`, 'utf8'))
}

function valid(name = 'menu'): ExplorationInput {
  const parsed = parseExplorationInput(publicCase(name))
  if (!parsed.ok) throw new Error(`fixture should be valid: ${parsed.detail}`)
  return parsed.value
}

function rejectWith(mutate: (input: any) => void, name = 'menu') {
  const input = publicCase(name) as any
  mutate(input)
  return parseExplorationInput(input)
}

/** production change that would make this fail: any loosening of parseExplorationInput. */
describe('exploration input contract', () => {
  it('accepts a well-formed public fixture and preserves its identity fields', () => {
    const input = valid('same-text-context')
    expect(input.schemaVersion).toBe('r1-exploration-input-1')
    expect(input.requestId).toBe('request-1')
    expect(input.candidates.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(input.state.relatedStateVersion).toBe('state-1')
    expect(input.scope.executableCandidateIds).toEqual(['c1', 'c2'])
  })

  it('treats an unknown extra field as invalid input rather than ignoring it', () => {
    const result = rejectWith((input) => {
      input.surprise = true
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reasonCode).toBe('invalid-input')
  })

  it('rejects duplicate candidate ids', () => {
    const result = parseExplorationInput(publicCase('duplicate-input-id'))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reasonCode).toBe('invalid-input')
    expect(result.ok === false && result.detail).toContain('candidate-id-duplicate')
  })

  it('rejects a candidate observed at a different version than the stated state', () => {
    const result = parseExplorationInput(publicCase('stale-input'))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('candidate-observation-stale')
  })

  it('rejects a scope entry that does not reference a current candidate', () => {
    const result = rejectWith((input) => {
      input.scope.executableCandidateIds = ['c1', 'ghost']
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('scope-unknown-candidate')
  })

  it('rejects duplicate scope entries', () => {
    const result = rejectWith((input) => {
      input.scope.executableCandidateIds = ['c1', 'c1']
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('scope-duplicate-candidate')
  })

  it('rejects a candidate list whose entries disagree on the observed version', () => {
    const result = rejectWith((input) => {
      input.candidates.push({ ...input.candidates[0], id: 'c2', targetKey: 'node-c2' })
      input.scope.executableCandidateIds = ['c1', 'c2']
      input.candidates[1].observationVersion = 'obs-9'
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('candidate-observation-stale')
  })

  it('rejects non-finite score inputs and negative cost', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = rejectWith((input) => {
        input.candidates[0].estimatedCost = bad
      })
      expect(result.ok).toBe(false)
    }
  })

  it('refuses limits that exceed the module hard limits', () => {
    expect(HARD_LIMITS).toEqual({ maxCandidates: 32, maxInputBytes: 32768, maxHistory: 32 })
    for (const [field, value] of [
      ['maxCandidates', 33],
      ['maxInputBytes', 32769],
      ['maxHistory', 33],
    ] as const) {
      const result = rejectWith((input) => {
        input.limits[field] = value
      })
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.detail).toContain('limit-exceeds-hard-limit')
    }
  })

  it('refuses a candidate list longer than the caller limit', () => {
    const result = rejectWith((input) => {
      input.candidates = [
        { ...input.candidates[0], id: 'c1', targetKey: 'node-c1' },
        { ...input.candidates[0], id: 'c2', targetKey: 'node-c2' },
      ]
      input.scope.executableCandidateIds = ['c1']
      input.limits.maxCandidates = 1
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('candidates-exceed-limit')
  })

  it('refuses history longer than the caller limit', () => {
    const result = rejectWith((input) => {
      input.history = new Array(2).fill({
        targetKey: 'node-c1',
        candidateId: 'c1',
        action: 'click',
        beforeStateVersion: 'state-1',
        afterStateVersion: 'state-1',
        actualEffects: [],
        outcome: 'observed',
      })
      input.limits.maxHistory = 1
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('history-exceed-limit')
  })

  it('refuses a request larger than the caller byte limit', () => {
    const result = rejectWith((input) => {
      input.limits.maxInputBytes = 600
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('input-exceeds-byte-limit')
  })

  it('rejects a budget revision that is missing while budget fields are present', () => {
    const result = rejectWith((input) => {
      input.budget.remainingDecisions = -1
    })
    expect(result.ok).toBe(false)
  })

  it('keeps an unknown cost as null rather than zero', () => {
    expect(valid().budget.remainingCostUsd).toBeNull()
  })

  it('accepts every structurally valid committed public fixture and rejects stale-input', () => {
    const manifest = JSON.parse(readFileSync('evaluation/r1-jev-dev/manifest.json', 'utf8')) as {
      cases: { scenario: string; files: { role: string; path: string }[] }[]
    }

    // The evaluator label is the authority for which seeds are malformed on purpose (T01/T02).
    // Reading it here is test-side only; no src module may import the evaluator directory.
    const evaluated = manifest.cases.map((c) => {
      const publicFile = c.files.find((f) => f.role === 'public')!
      const evaluatorFile = c.files.find((f) => f.role === 'evaluator')!
      const evaluator = JSON.parse(readFileSync(evaluatorFile.path, 'utf8')) as {
        expectedStatus: 'ranked' | 'handoff' | 'invalid-input'
      }
      return { path: publicFile.path, expectedStatus: evaluator.expectedStatus }
    })
    expect(evaluated.length).toBe(22)

    for (const { path, expectedStatus } of evaluated) {
      const parsed = parseExplorationInput(JSON.parse(readFileSync(path, 'utf8')))
      expect({ path, ok: parsed.ok }).toEqual({ path, ok: expectedStatus !== 'invalid-input' })
    }
  })
})

describe('outcome normalization', () => {
  it('maps a ranked result to ranked', () => {
    expect(normalizeOutcome({ kind: 'ranked', reasonCode: 'ranked' })).toBe('ranked')
  })

  it('maps every non-ranked handoff to handoff', () => {
    for (const reasonCode of [
      'no-eligible-candidates',
      'insufficient-information',
      'uncertain',
      'invalid-receipt',
      'stale-state',
      'requires-agent-investigation',
    ] as const) {
      expect(normalizeOutcome({ kind: 'handoff', reasonCode })).toBe('handoff')
    }
  })

  it('maps invalid input to invalid-input even though the envelope is a handoff', () => {
    expect(normalizeOutcome({ kind: 'handoff', reasonCode: 'invalid-input' })).toBe('invalid-input')
  })
})
