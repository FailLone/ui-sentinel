import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeModelRequest, type ModelRequestOptions } from './model-request.ts'

function mockAgent(behavior: () => Promise<{ text: string; toolResults?: unknown[]; usage?: unknown }>) {
  return { generate: vi.fn(behavior) } as unknown as Parameters<typeof executeModelRequest>[0]
}

function opts(overrides: Partial<ModelRequestOptions> = {}): ModelRequestOptions {
  return {
    runSignal: new AbortController().signal,
    timeRemainingMs: 120_000,
    attemptBudget: 5,
    ...overrides,
  }
}

describe('executeModelRequest', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it('returns result on success', async () => {
    const agent = mockAgent(async () => ({
      text: 'hello',
      toolResults: [{ toolName: 'page_act' }],
      usage: { inputTokens: 100, outputTokens: 50 },
    }))
    const result = await executeModelRequest(agent, '{}', opts())
    expect(result.text).toBe('hello')
    expect(result.toolResults).toHaveLength(1)
    expect(result.attempts).toBe(1)
  })

  it('retries on timeout when no tools executed', async () => {
    let call = 0
    const agent = mockAgent(async () => {
      call++
      if (call === 1) throw new Error('model-request-timeout')
      return { text: 'recovered', toolResults: [] }
    })
    const records: unknown[] = []
    const result = await executeModelRequest(agent, '{}', opts(), (r) => records.push(r))
    expect(result.text).toBe('recovered')
    expect(result.attempts).toBe(2)
    expect(result.retriedFrom).toBeDefined()
    expect(records).toHaveLength(2)
  })

  it('does not retry auth errors', async () => {
    const agent = mockAgent(async () => {
      throw new Error('401 unauthorized')
    })
    await expect(executeModelRequest(agent, '{}', opts())).rejects.toThrow('401')
  })

  it('does not retry when run signal is aborted', async () => {
    const ac = new AbortController()
    const agent = mockAgent(async () => {
      ac.abort(new Error('cancelled'))
      throw new Error('fetch failed')
    })
    await expect(executeModelRequest(agent, '{}', opts({ runSignal: ac.signal }))).rejects.toThrow()
  })

  it('respects time remaining for request timeout', async () => {
    const agent = mockAgent(async () => ({ text: 'ok', toolResults: [] }))
    const result = await executeModelRequest(agent, '{}', opts({ timeRemainingMs: 8000 }))
    expect(result.text).toBe('ok')
  })

  it('limits retries to attemptBudget - 1', async () => {
    let calls = 0
    const agent = mockAgent(async () => {
      calls++
      throw new Error('fetch failed')
    })
    await expect(
      executeModelRequest(agent, '{}', opts({ attemptBudget: 1 })),
    ).rejects.toThrow('fetch failed')
    expect(calls).toBe(1)
  })
})
