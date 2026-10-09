import { describe, it, expect } from 'vitest'
import { createRequestTracker } from './request-tracker.ts'

describe('createRequestTracker', () => {
  it('tracks a successful agent request with usage', () => {
    const tracker = createRequestTracker()
    const handle = tracker.startRequest('agent', 'openai/gpt-4')
    const record = handle.finish({ inputTokens: 1500, outputTokens: 200 })

    expect(record.seq).toBe(1)
    expect(record.purpose).toBe('agent')
    expect(record.model).toBe('openai/gpt-4')
    expect(record.inputTokens).toBe(1500)
    expect(record.outputTokens).toBe(200)
    expect(record.status).toBe('success')
    expect(record.durationMs).toBeGreaterThanOrEqual(0)
    expect(record.error).toBeUndefined()
  })

  it('tracks an error request', () => {
    const tracker = createRequestTracker()
    const handle = tracker.startRequest('vision', 'qwen/qwen2.5-vl')
    const record = handle.finish({ error: 'timeout' })

    expect(record.seq).toBe(1)
    expect(record.purpose).toBe('vision')
    expect(record.status).toBe('error')
    expect(record.error).toBe('timeout')
    expect(record.inputTokens).toBeNull()
    expect(record.outputTokens).toBeNull()
  })

  it('increments sequence numbers across requests', () => {
    const tracker = createRequestTracker()
    tracker.startRequest('agent', 'model-a').finish({ inputTokens: 100, outputTokens: 50 })
    tracker.startRequest('vision', 'model-b').finish({ inputTokens: 200, outputTokens: 80 })
    tracker.startRequest('agent', 'model-a').finish({ inputTokens: 150, outputTokens: 60 })

    const records = tracker.records
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3])
    expect(records.map((r) => r.purpose)).toEqual(['agent', 'vision', 'agent'])
  })

  it('summarizes with full usage', () => {
    const tracker = createRequestTracker()
    tracker.startRequest('agent', 'm').finish({ inputTokens: 1000, outputTokens: 100 })
    tracker.startRequest('agent', 'm').finish({ inputTokens: 2000, outputTokens: 200 })
    tracker.startRequest('vision', 'v').finish({ inputTokens: 500, outputTokens: 50 })

    const summary = tracker.summarize()
    expect(summary.totalRequests).toBe(3)
    expect(summary.agentRequests).toBe(2)
    expect(summary.visionRequests).toBe(1)
    expect(summary.successCount).toBe(3)
    expect(summary.errorCount).toBe(0)
    expect(summary.totalInputTokens).toBe(3500)
    expect(summary.totalOutputTokens).toBe(350)
    expect(summary.avgInputTokensPerCall).toBe(1167)
  })

  it('marks totals as null when any request has unknown usage', () => {
    const tracker = createRequestTracker()
    tracker.startRequest('agent', 'm').finish({ inputTokens: 1000, outputTokens: 100 })
    tracker.startRequest('agent', 'm').finish({})

    const summary = tracker.summarize()
    expect(summary.totalInputTokens).toBeNull()
    expect(summary.totalOutputTokens).toBeNull()
    expect(summary.avgInputTokensPerCall).toBeNull()
  })

  it('summarizes empty tracker', () => {
    const tracker = createRequestTracker()
    const summary = tracker.summarize()
    expect(summary.totalRequests).toBe(0)
    expect(summary.avgInputTokensPerCall).toBeNull()
    expect(summary.totalInputTokens).toBe(0)
  })

  it('returns immutable records from summarize', () => {
    const tracker = createRequestTracker()
    tracker.startRequest('agent', 'm').finish({ inputTokens: 100, outputTokens: 10 })
    const s1 = tracker.summarize()
    tracker.startRequest('agent', 'm').finish({ inputTokens: 200, outputTokens: 20 })
    const s2 = tracker.summarize()

    expect(s1.records).toHaveLength(1)
    expect(s2.records).toHaveLength(2)
  })
})

it('settles interrupted requests once and cannot double-count late callbacks', () => {
  const tracker = createRequestTracker(),
    handle = tracker.startRequest('vision', 'qwen')
  tracker.finishPending('cancelled')
  handle.finish({ inputTokens: 2, outputTokens: 1 })
  expect(tracker.summarize()).toMatchObject({
    totalRequests: 1,
    errorCount: 1,
    totalInputTokens: null,
  })
})
