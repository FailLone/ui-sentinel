import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { parseExplorationInput, type ExplorationInput } from './contracts.ts'
import { createBudgetLedger } from './budget.ts'
import { createScoreCache } from './cache.ts'
import { createStubTransport } from './stub-transport.ts'
import { createExplorationSession } from './session.ts'

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

function session(overrides: Partial<Parameters<typeof createBudgetLedger>[0]> = {}) {
  return createExplorationSession({
    ledger: createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: null,
      ...overrides,
    }),
    send: createStubTransport('menu'),
  })
}

describe('exploration session with cache', () => {
  it('serves a second identical request from cache with zero extra transmissions', async () => {
    const send = vi.fn(createStubTransport('menu'))
    const s = createExplorationSession({
      ledger: createBudgetLedger({
        remainingDecisions: 8,
        remainingActions: 8,
        remainingMs: 5000,
        maxRequestMs: 1000,
        remainingCostUsd: null,
      }),
      send,
    })
    const first = await s.decide(fixture('menu'))
    const second = await s.decide(fixture('menu'))
    expect(first.kind).toBe('ranked')
    expect(second.kind).toBe('ranked')
    expect(send).toHaveBeenCalledTimes(1)
    expect(second.trace.usage.costUsd).toBe(0)
    expect(second.trace.cache).toBe('hit')
    expect(s.stats().cache).toEqual({ hits: 1, misses: 1, size: 1 })
  })

  it('rebinds the cached scores to the new requestId', async () => {
    const s = session()
    await s.decide(fixture('menu'))
    const fresh = clone(fixture('menu'))
    fresh.requestId = 'request-2'
    const second = await s.decide(fresh)
    expect(second.requestId).toBe('request-2')
    expect(second.kind).toBe('ranked')
  })

  it('does not let a cache hit dispatch while the budget is exhausted', async () => {
    const send = vi.fn(createStubTransport('menu'))
    const input = fixture('menu')
    const s = createExplorationSession({
      ledger: createBudgetLedger({
        remainingDecisions: 1,
        remainingActions: 8,
        remainingMs: 5000,
        maxRequestMs: 1000,
        remainingCostUsd: null,
      }),
      send,
    })
    const first = await s.decide(input)
    expect(first.kind).toBe('ranked')
    // Budget is now spent; even a warm cache must not produce a usable recommendation.
    const second = await s.decide(clone(input))
    expect(second.kind).toBe('handoff')
    expect(second.reasonCode).toBe('budget-exhausted')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not let a cache hit bypass caller cancellation', async () => {
    const s = session()
    await s.decide(fixture('menu'))
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const second = await s.decide(clone(fixture('menu')), { signal: controller.signal })
    expect(second.kind).toBe('handoff')
    expect(second.reasonCode).toBe('cancelled')
  })

  it('does not serve a cached score after the related state moved on', async () => {
    const send = vi.fn(createStubTransport('menu'))
    const s = createExplorationSession({
      ledger: createBudgetLedger({
        remainingDecisions: 8,
        remainingActions: 8,
        remainingMs: 5000,
        maxRequestMs: 1000,
        remainingCostUsd: null,
      }),
      send,
    })
    await s.decide(fixture('menu'))
    const moved = clone(fixture('menu'))
    moved.state.relatedStateVersion = 'state-2'
    moved.requestId = 'request-2'
    await s.decide(moved)
    expect(send).toHaveBeenCalledTimes(2)
    expect(s.stats().cache.hits).toBe(0)
  })

  it('marks an explicit zero-cost stub usage as stub-sourced, not as a real quote', async () => {
    const s = session()
    const result = await s.decide(fixture('menu'))
    expect(result.trace.usage.costUsd).toBe(0)
    expect(result.trace.usage.source).toBe('stub')
  })
})

describe('concurrent decisions against one budget', () => {
  it('never exceeds the remaining decision budget under parallel dispatch', async () => {
    const gate = { release: () => {} }
    const pending = new Promise<void>((resolve) => {
      gate.release = resolve
    })
    let inFlight = 0
    let maxInFlight = 0
    const s = createExplorationSession({
      ledger: createBudgetLedger({
        remainingDecisions: 2,
        remainingActions: 8,
        remainingMs: 5000,
        maxRequestMs: 1000,
        remainingCostUsd: null,
      }),
      send: async (_request, options) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await pending
        inFlight -= 1
        options.signal.throwIfAborted()
        return createStubTransport('menu')(_request, options)
      },
    })
    const inputs = ['menu', 'tabs', 'accordion', 'same-text-context'].map((name) => fixture(name))
    const results = await Promise.all(inputs.map((input) => s.decide(input)))
    gate.release()
    const ranked = results.filter((r) => r.kind === 'ranked')
    const handedOff = results.filter((r) => r.kind === 'handoff')
    expect(ranked.length + handedOff.length).toBe(4)
    // At most two decisions were reserved; the rest were refused, not over-dispatched.
    expect(ranked.length).toBe(0)
    expect(
      handedOff.every((r) => r.reasonCode === 'timeout' || r.reasonCode === 'budget-exhausted'),
    ).toBe(true)
    expect(s.stats().ledger.remainingDecisions).toBe(0)
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it('keeps the ledger consistent when a request fails mid-flight', async () => {
    const s = createExplorationSession({
      ledger: createBudgetLedger({
        remainingDecisions: 3,
        remainingActions: 8,
        remainingMs: 5000,
        maxRequestMs: 1000,
        remainingCostUsd: null,
      }),
      send: async () => {
        throw new Error('boom')
      },
    })
    const result = await s.decide(fixture('menu'))
    expect(result.kind).toBe('handoff')
    expect(result.reasonCode).toBe('transport-failed')
    expect(result.trace.attempted).toBe(true)
    // A dispatched-but-failed decision is still consumed.
    expect(s.stats().ledger.remainingDecisions).toBe(2)
  })
})
