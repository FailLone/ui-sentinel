import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createBudgetLedger } from './budget.ts'
import { createExplorationSession } from '../../../../scripts/r1-jev/test-support.ts'
import { requestExplorationScores } from '../../../../scripts/r1-jev/test-support.ts'
import { createScoreCache, scoreCacheKey } from './cache.ts'
import { buildScoringRequest } from './prompt.ts'
import { parseExplorationInput, type ExplorationInput } from './contracts.ts'
import { parseScoreResult } from './result.ts'
import { validateSuggestionAgainstCurrentState } from './suggestion.ts'
import { parseStubReply, STUB_IDENTITY, type NormalizedReceipt } from './receipt.ts'
const fixture = (name = 'menu'): ExplorationInput => {
  const input = JSON.parse(readFileSync(`evaluation/r1-jev-dev/public/${name}.json`, 'utf8'))
  input.budget.remainingCostUsd = 1
  return input
}
const reply = (name = 'menu'): NormalizedReceipt => {
  const r = parseStubReply(
    JSON.parse(readFileSync(`evaluation/r1-jev-dev/stub/${name}.json`, 'utf8')),
  )
  if (!r.ok) throw Error(r.detail)
  return r.value
}
const ledger = () =>
  createBudgetLedger({
    remainingDecisions: 30,
    remainingActions: 30,
    remainingMs: 10000,
    maxRequestMs: 1000,
    remainingCostUsd: 1,
  })
const paid = { identity: STUB_IDENTITY, billableTransport: true, estimatedRequestCostUsd: 0.7 }
const tick = () => new Promise((r) => setTimeout(r, 10))
describe('independent review regressions', () => {
  it.each(['remainingDecisions', 'remainingActions', 'remainingMs', 'maxRequestMs'] as const)(
    'blocks zero current %s before dispatch and on a cache hit',
    async (field) => {
      let calls = 0
      const s = createExplorationSession({
        ledger: ledger(),
        send: async () => {
          calls++
          return reply()
        },
      })
      expect((await s.decide(fixture())).kind).toBe('ranked')
      const input = fixture()
      input.budget[field] = 0
      const r = await s.decide(input)
      expect(r.reasonCode).toBe('budget-exhausted')
      expect(calls).toBe(1)
    },
  )
  it('does not invoke a pre-cancelled direct sender', async () => {
    const controller = new AbortController()
    controller.abort()
    let calls = 0
    const r = await requestExplorationScores({
      input: fixture(),
      ledger: ledger(),
      signal: controller.signal,
      send: async () => {
        calls++
        return reply()
      },
    })
    expect(r.reasonCode).toBe('cancelled')
    expect(calls).toBe(0)
  })
  it('checks elapsed time even when the event loop has not run the timer', async () => {
    const input = fixture()
    input.budget.maxRequestMs = 5
    const r = await requestExplorationScores({
      input,
      ledger: ledger(),
      send: async () => {
        const end = performance.now() + 25
        while (performance.now() < end) {}
        return reply()
      },
    })
    expect(r.reasonCode).toBe('timeout')
  })
  it.each(['unknown', 'failure', 'negative', 'nonfinite'] as const)(
    'keeps %s dispatched cost unknown and stops further billing',
    async (mode) => {
      const book = ledger()
      let calls = 0
      const send = async () => {
        calls++
        if (mode === 'failure') throw Error('fake')
        const r = reply()
        return {
          ...r,
          usage:
            mode === 'unknown'
              ? { ...r.usage, status: 'unknown', costUsd: null }
              : { ...r.usage, costUsd: mode === 'negative' ? -2 : Infinity },
        } as NormalizedReceipt
      }
      const r = await requestExplorationScores({ input: fixture(), ledger: book, send, ...paid })
      expect(r.trace.usage.status).toBe('unknown')
      expect(book.snapshot().remainingCostUsd).toBeNull()
      await requestExplorationScores({ input: fixture(), ledger: book, send, ...paid })
      expect(calls).toBe(1)
    },
  )
  it('retains timeout cost, reconciles late usage once, and never revives the result', async () => {
    const book = ledger()
    const input = fixture()
    input.budget.maxRequestMs = 5
    let resolve!: (r: NormalizedReceipt) => void
    const events: unknown[] = []
    const r = await requestExplorationScores({
      input,
      ledger: book,
      ...paid,
      onLateUsage: (e) => events.push(e),
      send: () =>
        new Promise((r) => {
          resolve = r
        }),
    })
    expect(r.reasonCode).toBe('timeout')
    expect(book.snapshot().unresolvedCosts).toBe(1)
    const next = await requestExplorationScores({
      input: fixture(),
      ledger: book,
      ...paid,
      send: async () => reply(),
    })
    expect(next.trace.attempted).toBe(false)
    const receipt = reply()
    resolve({ ...receipt, usage: { ...receipt.usage, status: 'known', costUsd: 0.7 } })
    await tick()
    expect(book.snapshot().remainingCostUsd).toBeCloseTo(0.3)
    expect(events).toHaveLength(1)
    expect(r.reasonCode).toBe('timeout')
    expect(r.trace.usage.status).toBe('unknown')
  })
  it('requires an explicit billable quote and honors a lower live cost ceiling', async () => {
    let calls = 0
    const send = async () => {
      calls++
      return reply()
    }
    await requestExplorationScores({
      input: fixture(),
      ledger: ledger(),
      ...paid,
      estimatedRequestCostUsd: null,
      send,
    })
    const input = fixture()
    input.budget.remainingCostUsd = 0.1
    await requestExplorationScores({ input, ledger: ledger(), ...paid, send })
    expect(calls).toBe(0)
  })
  it('protects ticket identity, idempotent settlement and monotonic session time', () => {
    let now = 0
    const book = createBudgetLedger({
      ...fixture().budget,
      remainingCostUsd: 1,
      remainingMs: 10,
      now: () => now,
    })
    const t = book.reserve(0.2)!
    book.dispatch(t)
    book.release(t)
    expect(book.snapshot().unresolvedCosts).toBe(1)
    book.settle({ ...t }, 0.2)
    expect(book.snapshot().unresolvedCosts).toBe(1)
    book.settle(t, 0.2)
    book.settle(t, 0.2)
    expect(book.snapshot().remainingCostUsd).toBe(0.8)
    now = 11
    expect(book.reserve(0)).toBeNull()
  })
  it.each(['documentVersion', 'url', 'pageId'] as const)(
    'rejects changed %s in-flight and during consumption',
    async (field) => {
      const issued = fixture()
      const current = structuredClone(issued)
      const r = await requestExplorationScores({
        input: issued,
        currentInput: () => current,
        ledger: ledger(),
        send: async () => {
          current.state[field] += '-next'
          return reply()
        },
      })
      expect(r.reasonCode).toBe('stale-state')
      expect(
        validateSuggestionAgainstCurrentState({
          issued,
          current,
          suggestion: { candidateId: 'c1', action: 'click' },
        }).ok,
      ).toBe(false)
    },
  )
  it('rejects newly introduced candidates and expired consumption budgets', () => {
    const current = fixture()
    const issued = structuredClone(current)
    issued.candidates = []
    issued.scope.executableCandidateIds = []
    expect(
      validateSuggestionAgainstCurrentState({
        issued,
        current,
        suggestion: { candidateId: 'c1', action: 'click' },
      }).ok,
    ).toBe(false)
    const old = structuredClone(current)
    current.budget.remainingMs = 0
    expect(
      validateSuggestionAgainstCurrentState({
        issued: old,
        current,
        suggestion: { candidateId: 'c1', action: 'click' },
      }).ok,
    ).toBe(false)
  })
  it.each(['modelId', 'provider', 'extra'] as const)(
    'rejects mismatched or unknown receipt field %s',
    async (field) => {
      const r = await requestExplorationScores({
        input: fixture(),
        ledger: ledger(),
        send: async () => ({ ...reply(), [field]: 'wrong' }),
      })
      expect(r.reasonCode).toBe('invalid-receipt')
    },
  )
  it('does not throw on malformed cacheable input or cache caller mutations', async () => {
    let calls = 0
    const input = fixture()
    const s = createExplorationSession({
      ledger: ledger(),
      send: async () => {
        calls++
        input.candidates[0].text = 'changed'
        return reply()
      },
    })
    expect((await s.decide({ state: { cacheable: true } })).reasonCode).toBe('invalid-input')
    expect((await s.decide(input)).reasonCode).toBe('stale-state')
    expect(s.stats().cache.size).toBe(0)
    await s.decide(input)
    expect(calls).toBe(2)
  })
  it('keys URL, geometry and model identity; cached data is copied and origin identity preserved', async () => {
    const input = fixture()
    const moved = structuredClone(input)
    moved.state.url += '/next'
    expect(scoreCacheKey(input)).not.toBe(scoreCacheKey(moved))
    expect(scoreCacheKey(input)).not.toBe(
      scoreCacheKey(input, undefined, { ...STUB_IDENTITY, adapterRevision: 'next' }),
    )
    const s = createExplorationSession({ ledger: ledger(), send: async () => reply() })
    await s.decide(input)
    const hit = await s.decide(input)
    expect(hit.binding?.modelId).toBe(STUB_IDENTITY.modelId)
    expect(hit.trace.attempted).toBe(false)
    const cache = createScoreCache({ capacity: 1, ttlMs: 1000 })
    const r = reply()
    if (r.kind !== 'scores') throw Error('fixture')
    cache.set(input, r.scores, r.usage)
    const a = cache.get(input)!
    ;(a.scores as unknown as { relevance: number }[])[0].relevance = 0
    expect(cache.get(input)!.scores[0].relevance).toBe(0.7)
  })
  it('scores exactly the eligible set and enforces the serialized send payload ceiling', async () => {
    const input = fixture('tabs')
    input.scope.executableCandidateIds = ['c1']
    expect(buildScoringRequest(input).data.candidates.map((c) => c.id)).toEqual(['c1'])
    const narrow = fixture()
    narrow.limits.maxInputBytes = 1200
    expect(parseExplorationInput(narrow).ok).toBe(true)
    let calls = 0
    const r = await requestExplorationScores({
      input: narrow,
      ledger: ledger(),
      send: async () => {
        calls++
        return reply()
      },
    })
    expect(r.reasonCode).toBe('unsupported')
    expect(calls).toBe(0)
  })
  it('applies fairness through the session on both miss and hit', async () => {
    let calls = 0
    const s = createExplorationSession({
      ledger: ledger(),
      send: async () => {
        calls++
        return reply('low-score-fairness')
      },
    })
    const input = fixture('low-score-fairness')
    const fairness = { decisionIndex: 3, firstEligibleDecision: { c1: 0, c2: 1 } }
    expect((await s.decide(input, { fairness })).orderedCandidateIds?.[0]).toBe('c1')
    expect((await s.decide(input, { fairness })).orderedCandidateIds?.[0]).toBe('c1')
    expect(calls).toBe(1)
  })
  it('validates output envelopes and forbids terminal/authority fields', async () => {
    const r = await requestExplorationScores({
      input: fixture(),
      ledger: ledger(),
      send: async () => reply(),
    })
    expect(parseScoreResult(r).success).toBe(true)
    expect(parseScoreResult({ ...r, authorized: true }).success).toBe(false)
    expect(parseScoreResult({ ...r, orderedCandidateIds: ['other'] }).success).toBe(false)
    const invalid = await requestExplorationScores({
      input: {},
      ledger: ledger(),
      send: async () => reply(),
    })
    expect(invalid.binding).toBeNull()
    expect(parseScoreResult(invalid).success).toBe(true)
  })
})

describe('adapter and delivery boundary regressions', () => {
  it('rejects swapped attempt envelopes even when candidate ids are identical', async () => {
    const r = await requestExplorationScores({
      input: fixture(),
      ledger: ledger(),
      send: async (_request, options) => ({
        attemptId: 'different-attempt',
        requestDigest: options.requestDigest,
        receipt: reply(),
      }),
    })
    expect(r.reasonCode).toBe('invalid-receipt')
    expect(r.trace.deadLetter).toContain('adapter-receipt-misbound')
  })
  it('records known cost on provider failure without exposing the error body', async () => {
    const book = ledger()
    const r = await requestExplorationScores({
      input: fixture(),
      ledger: book,
      ...paid,
      send: async () => {
        throw Object.assign(new Error('sensitive-provider-body'), {
          usage: {
            status: 'known',
            inputTokens: 1,
            outputTokens: 0,
            costUsd: 0.2,
            source: 'provider',
          },
        })
      },
    })
    expect(r.reasonCode).toBe('transport-failed')
    expect(r.trace.usage.costUsd).toBe(0.2)
    expect(book.snapshot().remainingCostUsd).toBe(0.8)
    expect(JSON.stringify(r)).not.toContain('sensitive-provider-body')
  })
  it('tightens the shared decision budget before concurrent requests reserve', async () => {
    const book = ledger()
    const input = fixture()
    input.budget.remainingDecisions = 1
    let calls = 0
    const send = async () => {
      calls++
      await tick()
      return reply()
    }
    const results = await Promise.all(
      [1, 2].map(() => requestExplorationScores({ input, ledger: book, send })),
    )
    expect(calls).toBe(1)
    expect(results.filter((r) => r.kind === 'ranked')).toHaveLength(1)
  })
  it('rejects a live scope or budget withdrawal while waiting', async () => {
    for (const change of [
      (i: ExplorationInput) => {
        i.scope.executableCandidateIds = []
      },
      (i: ExplorationInput) => {
        i.budget.remainingActions = 0
      },
    ]) {
      const input = fixture()
      const current = structuredClone(input)
      const r = await requestExplorationScores({
        input,
        ledger: ledger(),
        currentInput: () => current,
        send: async () => {
          change(current)
          return reply()
        },
      })
      expect(r.kind).toBe('handoff')
    }
  })
})

describe('withdrawn and upper-bound budgets', () => {
  it('does not restore a withdrawn session budget from a later stale caller input', async () => {
    const s = createExplorationSession({ ledger: ledger(), send: async () => reply() })
    const empty = fixture()
    empty.budget.remainingDecisions = 0
    expect((await s.decide(empty)).reasonCode).toBe('budget-exhausted')
    expect((await s.decide(fixture())).reasonCode).toBe('budget-exhausted')
  })
  it('uses the session request cap even if the caller supplies a larger one', async () => {
    const book = createBudgetLedger({ ...fixture().budget, maxRequestMs: 5 })
    const r = await requestExplorationScores({
      input: fixture(),
      ledger: book,
      send: () => new Promise(() => {}),
    })
    expect(r.reasonCode).toBe('timeout')
    expect(r.trace.durationMs).toBeLessThan(500)
  })
})
