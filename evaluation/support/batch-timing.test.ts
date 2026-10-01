import { describe, expect, it } from 'vitest'
import { buildBatchTiming } from './batch-timing.ts'

/**
 * Batch accounting for the evidence manifest (plan P3.4, acceptance E04).
 *
 * The rule that matters: the wall clock is measured, not summed. Rows overlap - a run's model time
 * sits inside its own elapsed time, and rows can share a server - so adding the parts would produce a
 * number larger than the wall clock it claims to be. The per-kind totals are reported alongside, which
 * is what makes a slow batch diagnosable without inventing a fictional total.
 */

const row = (over: Partial<Parameters<typeof buildBatchTiming>[0]['rows'][number]> = {}) => ({
  case: 'D0',
  repeat: 1,
  outcome: 'passed' as const,
  elapsedMs: 1000,
  modelMs: 600,
  toolMs: 200,
  visionRequests: 1,
  agentRequests: 4,
  failedAttempts: 0,
  unknownUsage: 0,
  ...over,
})

describe('batch timing (E04)', () => {
  it('reports the measured wall clock, never the sum of the rows', () => {
    // Two rows of 1000ms each that ran concurrently: the sum is 2000, the wall clock is 1200.
    const timing = buildBatchTiming({
      startedAtMs: 0,
      endedAtMs: 1200,
      rows: [row({ case: 'D0' }), row({ case: 'H0' })],
    })
    expect(timing.wallClockMs).toBe(1200)
    // The parts are kept, but labelled so they cannot be mistaken for the total.
    expect(timing.rowElapsedMs).toBe(2000)
    expect(timing.wallClockMs).toBeLessThan(timing.rowElapsedMs)
  })

  it('totals the model and tool time separately from the wall clock', () => {
    const timing = buildBatchTiming({
      startedAtMs: 0,
      endedAtMs: 5000,
      rows: [row({ modelMs: 600, toolMs: 200 }), row({ case: 'H0', modelMs: 900, toolMs: 100 })],
    })
    expect(timing.modelMs).toBe(1500)
    expect(timing.toolMs).toBe(300)
  })

  it('reports model and tool time as unknown when no row measured them', () => {
    // The product records token usage, not per-kind durations. Totalling the gaps as 0 would read as
    // "the model took no time", which is a measurement the batch never made.
    const timing = buildBatchTiming({
      startedAtMs: 0,
      endedAtMs: 5000,
      rows: [row({ modelMs: null, toolMs: null })],
    })
    expect(timing.modelMs).toBeNull()
    expect(timing.toolMs).toBeNull()
    expect(timing.wallClockMs).toBe(5000)
  })

  it('totals the rows that did measure, ignoring the ones that did not', () => {
    const timing = buildBatchTiming({
      startedAtMs: 0,
      endedAtMs: 5000,
      rows: [row({ modelMs: 600, toolMs: null }), row({ case: 'H0', modelMs: null, toolMs: null })],
    })
    expect(timing.modelMs).toBe(600)
    expect(timing.toolMs).toBeNull()
  })

  it('counts requests by kind, plus failed attempts and unknown usage', () => {
    const timing = buildBatchTiming({
      startedAtMs: 0,
      endedAtMs: 100,
      rows: [
        row({ visionRequests: 2, agentRequests: 6 }),
        row({
          case: 'H0',
          visionRequests: 1,
          agentRequests: 5,
          failedAttempts: 1,
          unknownUsage: 2,
        }),
      ],
    })
    expect(timing.visionRequests).toBe(3)
    expect(timing.agentRequests).toBe(11)
    // A failed attempt and an unknown usage are counted, not dropped: the denominator must not shrink.
    expect(timing.failedAttempts).toBe(1)
    expect(timing.unknownUsage).toBe(2)
  })

  it('never reports a negative wall clock when the clock is read out of order', () => {
    const timing = buildBatchTiming({ startedAtMs: 500, endedAtMs: 100, rows: [] })
    expect(timing.wallClockMs).toBe(0)
  })

  it('handles a batch with no rows', () => {
    const timing = buildBatchTiming({ startedAtMs: 10, endedAtMs: 40, rows: [] })
    expect(timing).toMatchObject({
      wallClockMs: 30,
      rowElapsedMs: 0,
      // No row measured a per-kind duration, so those stay unknown rather than zero.
      modelMs: null,
      toolMs: null,
      rows: 0,
    })
  })
})
