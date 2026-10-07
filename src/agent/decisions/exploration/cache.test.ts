import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseExplorationInput, type ExplorationInput } from './contracts.ts'
import { createScoreCache, scoreCacheKey } from './cache.ts'

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

const scores = [{ candidateId: 'c1', relevance: 0.7, informationGain: 0.6, uncertainty: 0.1 }]

describe('score cache key', () => {
  it('is identical for two requests that differ only by requestId', () => {
    const a = fixture('menu')
    const b = clone(a)
    b.requestId = 'request-2'
    expect(scoreCacheKey(a)).toBe(scoreCacheKey(b))
  })

  it('is bound to the caller task revision', () => {
    const a = fixture('menu')
    const b = clone(a)
    b.task.revision = 'task-2'
    expect(scoreCacheKey(a)).not.toBe(scoreCacheKey(b))
  })

  it('changes when the related state version changes', () => {
    const a = fixture('menu')
    const b = clone(a)
    b.state.relatedStateVersion = 'state-2'
    expect(scoreCacheKey(a)).not.toBe(scoreCacheKey(b))
  })

  it('changes when the document or observation version changes', () => {
    for (const field of ['documentVersion', 'observationVersion'] as const) {
      const a = fixture('menu')
      const b = clone(a)
      b.state[field] = 'v-next'
      if (field === 'observationVersion') b.candidates[0].observationVersion = 'v-next'
      expect(scoreCacheKey(a)).not.toBe(scoreCacheKey(b))
    }
  })

  it('changes when candidate public content changes', () => {
    const a = fixture('menu')
    const b = clone(a)
    b.candidates[0].text = '不同文案'
    expect(scoreCacheKey(a)).not.toBe(scoreCacheKey(b))
  })

  it('changes when the executable scope changes', () => {
    const a = fixture('tabs')
    const b = clone(a)
    b.scope.executableCandidateIds = ['c1']
    expect(scoreCacheKey(a)).not.toBe(scoreCacheKey(b))
  })

  it('changes when history changes', () => {
    const a = fixture('menu')
    const b = clone(a)
    b.history = [
      {
        targetKey: 'node-c1',
        candidateId: 'c1',
        action: 'click',
        beforeStateVersion: 'state-1',
        afterStateVersion: 'state-1',
        actualEffects: [],
        outcome: 'observed',
      },
    ]
    expect(scoreCacheKey(a)).not.toBe(scoreCacheKey(b))
  })

  it('does not collide across pages that share the same visible text', () => {
    const a = fixture('menu')
    const b = clone(a)
    b.state.pageId = 'page-other'
    expect(scoreCacheKey(a)).not.toBe(scoreCacheKey(b))
  })

  it('includes the fairness rotation state', () => {
    const a = fixture('menu')
    const keyA = scoreCacheKey(a, { decisionIndex: 0, firstEligibleDecision: { c1: 0 } })
    const keyB = scoreCacheKey(a, { decisionIndex: 3, firstEligibleDecision: { c1: 0 } })
    expect(keyA).not.toBe(keyB)
  })
})

describe('score cache behaviour', () => {
  it('counts a hit for the same state and reports its original cost separately', () => {
    const cache = createScoreCache({ capacity: 4, ttlMs: 60_000 })
    const input = fixture('menu')
    cache.set(input, scores, {
      status: 'known',
      inputTokens: 10,
      outputTokens: 2,
      costUsd: 0.3,
      source: 'provider',
    })
    const hit = cache.get(input)
    expect(cache.stats()).toEqual({ hits: 1, misses: 0, size: 1 })
    expect(hit?.scores).toEqual(scores)
    // The hit itself costs nothing, but the ORIGINAL score's cost stays attributable.
    expect(hit?.originCostUsd).toBeCloseTo(0.3, 9)
    expect(hit?.requestCount).toBe(0)
  })

  it('misses when the related state changed', () => {
    const cache = createScoreCache({ capacity: 4, ttlMs: 60_000 })
    const input = fixture('menu')
    cache.set(input, scores, null)
    const moved = clone(input)
    moved.state.relatedStateVersion = 'state-2'
    expect(cache.get(moved)).toBeNull()
    expect(cache.stats().misses).toBe(1)
  })

  it('never writes to or reads from the cache for an uncacheable input', () => {
    const cache = createScoreCache({ capacity: 4, ttlMs: 60_000 })
    const input = fixture('uncacheable')
    cache.set(input, scores, null)
    expect(cache.stats().size).toBe(0)
    expect(cache.get(input)).toBeNull()
  })

  it('never caches a failure or an uncertain outcome', () => {
    const cache = createScoreCache({ capacity: 4, ttlMs: 60_000 })
    const input = fixture('menu')
    cache.set(input, null, null)
    cache.set(input, [], null)
    expect(cache.stats().size).toBe(0)
  })

  it('expires an entry once the ttl elapses', () => {
    let now = 0
    const cache = createScoreCache({ capacity: 4, ttlMs: 100, now: () => now })
    const input = fixture('menu')
    cache.set(input, scores, null)
    now = 150
    expect(cache.get(input)).toBeNull()
  })

  it('bounds its capacity with LRU eviction', () => {
    const cache = createScoreCache({ capacity: 2, ttlMs: 60_000 })
    for (const name of ['menu', 'tabs', 'accordion']) {
      const input = fixture(name)
      cache.set(
        input,
        [{ candidateId: 'c1', relevance: 0.5, informationGain: 0.5, uncertainty: null }],
        null,
      )
    }
    expect(cache.stats().size).toBe(2)
    expect(cache.get(fixture('menu'))).toBeNull()
  })

  it('reports a miss after invalidation', () => {
    const cache = createScoreCache({ capacity: 4, ttlMs: 60_000 })
    const input = fixture('menu')
    cache.set(input, scores, null)
    cache.invalidateAll()
    expect(cache.get(input)).toBeNull()
  })

  it('keeps hits and misses in separate counters', () => {
    const cache = createScoreCache({ capacity: 4, ttlMs: 60_000 })
    const input = fixture('menu')
    cache.set(input, scores, null)
    cache.get(input)
    cache.get(fixture('tabs'))
    expect(cache.stats()).toEqual({ hits: 1, misses: 1, size: 1 })
  })
})
