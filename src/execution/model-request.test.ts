import { it, expect, vi, afterEach } from 'vitest'
vi.mock('../shared/config.ts', () => ({
  config: { budget: { modelRequestTimeoutMs: 100, modelRequestMaxRetries: 1 } },
}))
import {
  executeModelRequest,
  beginAttemptTool,
  guardModelAttempt,
  type ModelRequestOptions,
} from './model-request.ts'
const opts = (overrides: Partial<ModelRequestOptions> = {}): ModelRequestOptions => ({
  runSignal: new AbortController().signal,
  timeRemainingMs: 5000,
  attemptBudget: 3,
  ...overrides,
})
const agent = (generate: any) => ({ generate }) as Parameters<typeof executeModelRequest>[0]
afterEach(() => vi.useRealTimers())
it('bounds a provider that never resolves and records both failed requests', async () => {
  vi.useFakeTimers()
  const records: any[] = [],
    starts: any[] = []
  const work = executeModelRequest(
    agent(() => new Promise(() => {})),
    '{}',
    opts(),
    {
      onStart: (r) => {
        starts.push(r)
      },
      onFinish: (r) => {
        records.push(r)
      },
    },
  )
  const assertion = expect(work).rejects.toThrow('model-request-timeout')
  await vi.runAllTimersAsync()
  await assertion
  expect(starts).toHaveLength(2)
  expect(records).toHaveLength(2)
  expect(records.every((r) => r.status === 'timeout' && r.usage === undefined)).toBe(true)
  expect(starts[1].retryOf).toBe(starts[0].attemptId)
})
it('never retries an attempt that already started a tool', async () => {
  let writes = 0
  await expect(
    executeModelRequest(
      agent(async () => {
        beginAttemptTool()
        writes++
        throw Error('fetch failed')
      }),
      '{}',
      opts(),
    ),
  ).rejects.toThrow('fetch failed')
  expect(writes).toBe(1)
})
it('rejects a late tool from an expired attempt even while another attempt runs', async () => {
  vi.useFakeTimers()
  let calls = 0,
    writes = 0,
    lateBlocked = false
  const work = executeModelRequest(
    agent(async () => {
      calls++
      if (calls === 1) {
        await new Promise((r) => setTimeout(r, 1200))
        try {
          beginAttemptTool()
          writes++
        } catch {
          lateBlocked = true
        }
        return { text: 'late', toolResults: [] }
      }
      await new Promise((r) => setTimeout(r, 50))
      return { text: 'ok', toolResults: [] }
    }),
    '{}',
    opts(),
  )
  await vi.runAllTimersAsync()
  expect((await work).attempts).toBe(2)
  expect(writes).toBe(0)
  expect(lateBlocked).toBe(true)
})
it('does not use the model response timer to interrupt bounded tool execution', async () => {
  vi.useFakeTimers()
  const records: any[] = []
  const work = executeModelRequest(
    agent(async () => {
      await new Promise((r) => setTimeout(r, 20))
      beginAttemptTool()
      await new Promise((r) => setTimeout(r, 200))
      guardModelAttempt()
      return { text: 'ok', toolResults: [] }
    }),
    '{}',
    opts(),
    {
      onFinish: (r) => {
        records.push(r)
      },
    },
  )
  await vi.runAllTimersAsync()
  await work
  expect(records[0].modelDurationMs).toBe(20)
  expect(records[0].durationMs).toBe(220)
})
it('honors one remaining attempt and does not retry authentication errors', async () => {
  let calls = 0
  await expect(
    executeModelRequest(
      agent(async () => {
        calls++
        throw Error('401 unauthorized')
      }),
      '{}',
      opts(),
    ),
  ).rejects.toThrow('401')
  expect(calls).toBe(1)
  await expect(
    executeModelRequest(
      agent(async () => {
        calls++
        throw Error('fetch failed')
      }),
      '{}',
      opts({ attemptBudget: 1 }),
    ),
  ).rejects.toThrow('fetch failed')
  expect(calls).toBe(2)
})
it('cancels backoff and does not dispatch a retry', async () => {
  vi.useFakeTimers()
  const ac = new AbortController()
  let calls = 0
  const work = executeModelRequest(
    agent(async () => {
      calls++
      throw Error('fetch failed')
    }),
    '{}',
    opts({ runSignal: ac.signal }),
  )
  const assertion = expect(work).rejects.toThrow('cancelled')
  await vi.advanceTimersByTimeAsync(50)
  ac.abort(Error('cancelled'))
  await vi.runAllTimersAsync()
  await assertion
  expect(calls).toBe(1)
})
it('rechecks remaining time and rejects a zero budget before dispatch', async () => {
  vi.useFakeTimers()
  let calls = 0
  const work = executeModelRequest(
    agent(() => {
      calls++
      return new Promise(() => {})
    }),
    '{}',
    opts({ timeRemainingMs: 80 }),
  )
  const assertion = expect(work).rejects.toThrow()
  await vi.runAllTimersAsync()
  await assertion
  expect(calls).toBe(1)
  await expect(
    executeModelRequest(
      agent(() => {
        calls++
        return Promise.resolve({})
      }),
      '{}',
      opts({ attemptBudget: 0 }),
    ),
  ).rejects.toThrow('budget-exhausted')
  expect(calls).toBe(1)
})

it('does not dispatch if cancelled while persisting the start event', async () => {
  const ac = new AbortController()
  const generate = vi.fn()
  const finishes: any[] = []
  await expect(
    executeModelRequest(agent(generate), '{}', opts({ runSignal: ac.signal }), {
      onStart: () => {
        ac.abort(Error('cancelled'))
      },
      onFinish: (record) => {
        finishes.push(record)
      },
    }),
  ).rejects.toThrow('cancelled')
  expect(generate).not.toHaveBeenCalled()
  expect(finishes).toMatchObject([{ status: 'cancelled', hadToolCalls: false }])
})

it('does not turn streaming heartbeats or partial arguments into a completed request or a tool', async () => {
  vi.useFakeTimers()
  const records: any[] = []
  const work = executeModelRequest(
    {
      stream: async (_input: string, options: any) => {
        options.onChunk({ type: 'start' })
        options.onChunk({ type: 'tool-call-delta', payload: { argsTextDelta: '{' } })
        return { getFullOutput: () => new Promise(() => {}) }
      },
    } as any,
    '{}',
    opts({ transport: 'stream', attemptBudget: 1 }),
    {
      onFinish: (record) => {
        records.push(record)
      },
    },
  )
  const assertion = expect(work).rejects.toThrow('model-request-timeout')
  await vi.runAllTimersAsync()
  await assertion
  expect(records[0]).toMatchObject({
    status: 'timeout',
    hadToolCalls: false,
    timing: {
      transport: 'stream',
      firstToolCallMs: null,
      firstToolExecutionMs: null,
      cancelledMs: 100,
    },
  })
  expect(records[0].usage).toBeUndefined()
})

it('retains streamed errors and never retries after any tool has started', async () => {
  let calls = 0
  await expect(
    executeModelRequest(
      {
        stream: async (_input: string, options: any) => {
          calls++
          beginAttemptTool()
          return {
            getFullOutput: async () => {
              options.onError({ error: 'fetch failed' })
              return { text: '', toolResults: [], finishReason: 'error' }
            },
          }
        },
      } as any,
      '{}',
      opts({ transport: 'stream' }),
    ),
  ).rejects.toThrow('fetch failed')
  expect(calls).toBe(1)
})

it('keeps known usage on a length-limited streamed response without treating it as success or retrying', async () => {
  const records: any[] = []
  let requests = 0
  await expect(
    executeModelRequest(
      {
        stream: async () => {
          requests++
          return {
            getFullOutput: async () => ({
              finishReason: 'length',
              text: '',
              toolResults: [],
              usage: { inputTokens: 9000, outputTokens: 4096 },
            }),
          }
        },
      } as any,
      '{}',
      opts({ transport: 'stream' }),
      {
        onFinish: (r) => {
          records.push(r)
        },
      },
    ),
  ).rejects.toThrow('model-stream-incomplete:length')
  expect(requests).toBe(1)
  expect(records[0]).toMatchObject({
    status: 'error',
    hadToolCalls: false,
    usage: { inputTokens: 9000, outputTokens: 4096 },
  })
  expect(records[0].timing.responseCompleteMs).not.toBeNull()
})
