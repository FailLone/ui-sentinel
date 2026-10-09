import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { parseExplorationInput, type ExplorationInput } from './contracts.ts'
import { createBudgetLedger, type BudgetLedger } from './budget.ts'
import { parseStubReply, type NormalizedReceipt } from './receipt.ts'
import type { SendFn } from './transport.ts'
import { requestExplorationScores } from '../../../../scripts/r1-jev/test-support.ts'
import { createStubTransport } from '../../../../scripts/r1-jev/stub-transport.ts'

function fixture(name: string): ExplorationInput {
  const parsed = parseExplorationInput(
    JSON.parse(readFileSync(`evaluation/r1-jev-dev/public/${name}.json`, 'utf8')),
  )
  if (!parsed.ok) throw new Error(`fixture ${name} should be valid`)
  return parsed.value
}

function stubReply(name: string): NormalizedReceipt {
  const parsed = parseStubReply(
    JSON.parse(readFileSync(`evaluation/r1-jev-dev/stub/${name}.json`, 'utf8')),
  )
  if (!parsed.ok) throw new Error(`stub ${name} should parse`)
  return parsed.value
}

function ledger(overrides: Partial<Parameters<typeof createBudgetLedger>[0]> = {}): BudgetLedger {
  return createBudgetLedger({
    remainingDecisions: 8,
    remainingActions: 8,
    remainingMs: 5000,
    maxRequestMs: 1000,
    remainingCostUsd: null,
    ...overrides,
  })
}

/** A send that resolves only when told to, so races can be staged deterministically. */
function deferredSend() {
  let resolve!: (value: NormalizedReceipt) => void
  const calls: { signal: AbortSignal; deadline: number }[] = []
  const send: SendFn = (_request, options) => {
    calls.push({ signal: options.signal, deadline: options.deadline })
    return new Promise<NormalizedReceipt>((r) => {
      resolve = r
    })
  }
  return { send, calls, resolve: (v: NormalizedReceipt) => resolve(v) }
}

describe('exploration score transport', () => {
  it('returns ranked scores bound to the request digest and current versions', async () => {
    const input = fixture('menu')
    const result = await requestExplorationScores({
      input,
      ledger: ledger(),
      send: createStubTransport('menu'),
    })
    expect(result.kind).toBe('ranked')
    expect(result.reasonCode).toBe('ranked')
    expect(result.requestId).toBe(input.requestId)
    expect(result.binding?.observationVersion).toBe('obs-1')
    expect(result.binding?.relatedStateVersion).toBe('state-1')
    expect(result.binding?.scopeRevision).toBe('scope-1')
    expect(result.binding?.contractVersion).toBe('r1-exploration-contract-1')
    expect(result.binding?.promptVersion).toBe('r1-exploration-prompt-2')
    expect(result.scores?.map((s) => s.candidateId)).toEqual(['c1'])
  })

  it('does not send at all when the input is invalid', async () => {
    const send = vi.fn()
    const result = await requestExplorationScores({
      input: null,
      ledger: ledger(),
      send: send as unknown as SendFn,
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.kind).toBe('handoff')
    expect(result.reasonCode).toBe('invalid-input')
  })

  it('does not send when no candidate is executable', async () => {
    const send = vi.fn()
    const result = await requestExplorationScores({
      input: fixture('empty-candidates'),
      ledger: ledger(),
      send: send as unknown as SendFn,
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.reasonCode).toBe('no-eligible-candidates')
  })

  it('does not send when the remaining decision budget is zero', async () => {
    const send = vi.fn()
    const result = await requestExplorationScores({
      input: fixture('budget-empty'),
      ledger: ledger({ remainingDecisions: 0 }),
      send: send as unknown as SendFn,
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.kind).toBe('handoff')
  })

  it('does not send when a known remaining cost cannot cover the request', async () => {
    const send = vi.fn()
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger({ remainingCostUsd: 0.0001, estimatedRequestCostUsd: 0.01 }),
      send: send as unknown as SendFn,
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.reasonCode).toBe('budget-exhausted')
  })

  it('does not dispatch when the caller byte ceiling is tightened below the input', async () => {
    const send = vi.fn()
    // maxInputBytes is the ceiling on the final request. Tightening it below the input makes the
    // input itself invalid, so the rejection happens before any transport is touched.
    const input = fixture('menu')
    const tightened = { ...input, limits: { ...input.limits, maxInputBytes: 400 } }
    const result = await requestExplorationScores({
      input: tightened,
      ledger: ledger(),
      send: send as unknown as SendFn,
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.kind).toBe('handoff')
    expect(result.reasonCode).toBe('invalid-input')
  })

  it('refuses to dispatch when the remaining cost is unknown and the transport bills', async () => {
    const send = vi.fn()
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger({ remainingCostUsd: null }),
      send: send as unknown as SendFn,
      billableTransport: true,
      identity: {
        modelId: 'stub/jev-exploration-1',
        provider: 'stub',
        adapterRevision: 'fixed-response-2',
      },
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.reasonCode).toBe('budget-exhausted')
  })

  it('rejects a reply that omits a candidate with a distinct reason', async () => {
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send: async () => stubReply('missing-candidate-reply'),
    })
    expect(result.kind).toBe('handoff')
    expect(result.reasonCode).toBe('invalid-receipt')
    expect(result.trace.usage.inputTokens).toBe(9)
  })

  it('preserves known usage from a failed reply even though it is not used', async () => {
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send: async () => stubReply('unknown-candidate-reply'),
    })
    expect(result.reasonCode).toBe('invalid-receipt')
    expect(result.trace.usage.costUsd).toBeNull()
    expect(result.trace.usage.status).toBe('unknown')
  })

  it('surfaces a provider handoff rather than inventing scores', async () => {
    const result = await requestExplorationScores({
      input: fixture('agent-investigation'),
      ledger: ledger(),
      send: async () => stubReply('agent-investigation'),
    })
    expect(result.kind).toBe('handoff')
    expect(result.reasonCode).toBe('requires-agent-investigation')
  })

  it('times out within the smaller of the request cap and the caller time remaining', async () => {
    const input = fixture('menu')
    const result = await requestExplorationScores({
      input,
      ledger: ledger({ remainingMs: 40, maxRequestMs: 1000 }),
      send: () => new Promise(() => {}),
    })
    expect(result.kind).toBe('handoff')
    expect(result.reasonCode).toBe('timeout')
    expect(result.trace.durationMs).toBeLessThan(1000)
  })

  it("bounds a later decision by the caller's CURRENT remaining time, not the session's", async () => {
    const base = fixture('menu')
    // The caller now has 40 ms left, even though the session ledger was created with 5 s.
    const shortened = { ...base, budget: { ...base.budget, remainingMs: 40 } }
    const result = await requestExplorationScores({
      input: shortened,
      ledger: ledger({ remainingMs: 5000, maxRequestMs: 1000 }),
      send: () => new Promise(() => {}),
    })
    expect(result.reasonCode).toBe('timeout')
    // 40 ms, not 1000 ms: a frozen session value must not grant a longer timer than the caller allows.
    expect(result.trace.durationMs).toBeLessThan(500)
  })

  it('honours caller cancellation before the request settles', async () => {
    const controller = new AbortController()
    const { send, resolve } = deferredSend()
    const live = { relatedStateVersion: 'state-1', observationVersion: 'obs-1' }
    const promise = requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send,
      signal: controller.signal,
    })
    controller.abort(new Error('caller-cancelled'))
    const result = await promise
    expect(result.reasonCode).toBe('cancelled')
    // A late resolve must not resurrect a recommendation.
    live.relatedStateVersion = 'state-2'
    live.observationVersion = 'obs-2'
    resolve(stubReply('menu'))
    await new Promise((r) => setTimeout(r, 5))
    expect(result.kind).toBe('handoff')
  })

  it('does not accept a reply that ignores the abort signal', async () => {
    const controller = new AbortController()
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger({ remainingMs: 30, maxRequestMs: 30 }),
      // This transport ignores the signal entirely and rejects only much later.
      send: () => new Promise((_r, reject) => setTimeout(() => reject(new Error('late')), 200)),
      signal: controller.signal,
    })
    expect(result.kind).toBe('handoff')
    expect(['timeout', 'cancelled']).toContain(result.reasonCode)
  })

  it('invalidates a reply that arrives after the related state changed', async () => {
    const controller = new AbortController()
    const { send, resolve } = deferredSend()
    const live = { relatedStateVersion: 'state-1', observationVersion: 'obs-1' }
    const promise = requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send,
      signal: controller.signal,
      // The caller reports the page moved on while we were waiting.
      currentVersions: () => live,
    })
    live.relatedStateVersion = 'state-2'
    live.observationVersion = 'obs-2'
    resolve(stubReply('menu'))
    await new Promise((r) => setTimeout(r, 5))
    controller.abort(new Error('state-changed'))
    const result = await promise
    expect(result.kind).toBe('handoff')
    expect(['cancelled', 'stale-state']).toContain(result.reasonCode)
  })

  it('refuses a late reply whose observation version no longer matches', async () => {
    const { send, resolve } = deferredSend()
    const live = { relatedStateVersion: 'state-1', observationVersion: 'obs-1' }
    const promise = requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send,
      currentVersions: () => live,
    })
    live.relatedStateVersion = 'state-2'
    live.observationVersion = 'obs-2'
    resolve(stubReply('menu'))
    const result = await promise
    expect(result.kind).toBe('handoff')
    expect(result.reasonCode).toBe('stale-state')
  })

  it('accounts a known billable cost against the ledger exactly once', async () => {
    const book = ledger({ remainingDecisions: 8, remainingCostUsd: 1 })
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: book,
      estimatedRequestCostUsd: 0.25,
      send: async () => ({
        kind: 'scores',
        modelId: 'stub/jev-exploration-1',
        provider: 'stub',
        scores: [{ candidateId: 'c1', relevance: 0.7, informationGain: 0.6, uncertainty: 0.1 }],
        usage: {
          status: 'known',
          inputTokens: 10,
          outputTokens: 2,
          costUsd: 0.25,
          source: 'provider',
        },
      }),
    })
    expect(result.kind).toBe('ranked')
    expect(book.snapshot().remainingCostUsd).toBeCloseTo(0.75, 9)
    expect(book.snapshot().remainingDecisions).toBe(7)
  })

  it('does not debit a cost from an unknown-cost transport', async () => {
    const book = ledger()
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: book,
      send: createStubTransport('menu'),
    })
    expect(result.kind).toBe('ranked')
    expect(result.trace.usage.status).toBe('known')
    expect(result.trace.usage.costUsd).toBe(0)
    expect(book.snapshot().remainingCostUsd).toBeNull()
  })

  it('does not overlap request and transport time in the trace', async () => {
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send: createStubTransport('menu'),
    })
    expect(result.trace.transportMs).toBeLessThanOrEqual(result.trace.durationMs + 1)
  })

  it('never performs a real network call from the default stub transport', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send: createStubTransport('menu'),
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('records attempt identity and duration on every outcome', async () => {
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send: createStubTransport('menu'),
    })
    expect(result.trace.attempted).toBe(true)
    expect(result.trace.attemptId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.trace.requestDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(result.trace.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('never stores an authorization header or raw provider error body in the trace', async () => {
    // Assembled at runtime so no credential-shaped literal lives in the repository.
    const scheme = ['Bea', 'rer'].join('')
    const fakeKey = ['sk', 'live', 'REDACTME'].join('-')
    const providerError = `${scheme} ${fakeKey}`
    const result = await requestExplorationScores({
      input: fixture('menu'),
      ledger: ledger(),
      send: async () => {
        throw Object.assign(new Error(`provider said: ${providerError}`), { body: providerError })
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(fakeKey)
    expect(serialized).not.toContain(scheme)
    expect(result.reasonCode).toBe('transport-failed')
  })
})
