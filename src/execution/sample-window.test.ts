import { it, expect } from 'vitest'
import { sampleWindow } from './sample-window.ts'
import { evaluateTransition, type TransitionRuleConfig } from '../rules/transition.ts'

const rule: TransitionRuleConfig = {
  type: 'transition',
  name: 'retry',
  description: 'retry available within five seconds',
  trigger: { eventType: 'retryable-failure' },
  expectation: { condition: 'element-actionable', target: 'Retry button', timeoutMs: 5000 },
  severity: 'error',
}
async function measure(latencyMs: number, value: boolean | null = false) {
  let time = 0
  const result = await sampleWindow({
    durationMs: 5000,
    now: () => time,
    guard: () => {},
    wait: async (ms) => {
      time += ms
    },
    sample: async () => {
      time += latencyMs
      return value
    },
  })
  return {
    ...result,
    observedUntilMs: time,
    condition: 'element-actionable' as const,
    eventType: rule.trigger.eventType,
    evidenceRefs: ['measurement'],
    samples: result.samples.map((s) => ({ ...s, target: 'Retry button' })),
  }
}
it('does not let browser read latency accumulate into an uncovered end of the five-second window', async () => {
  const measured = await measure(13)
  expect(measured.observedUntilMs).toBe(5013)
  expect(measured.samples.slice(0, 3).map((s) => s.atMs)).toEqual([13, 213, 413])
  expect(evaluateTransition(rule, measured)).toBe('fail')
  // Reproduce the real old trace: its final sample is after the deadline; the last
  // in-window sample is 262ms before it. The evaluator must continue to reject it.
  expect(
    evaluateTransition(rule, {
      ...measured,
      observedUntilMs: 5043,
      samples: [
        3, 266, 530, 790, 1055, 1325, 1586, 1846, 2109, 2372, 2640, 2895, 3157, 3420, 3683, 3944,
        4208, 4471, 4738, 5002,
      ].map((atMs) => ({ atMs, target: 'Retry button', value: false })),
    }),
  ).toBe('unknown')
})
it('keeps slow/incomplete or missing measurements unknown, and a healthy target passing', async () => {
  expect(evaluateTransition(rule, await measure(600))).toBe('unknown')
  expect(evaluateTransition(rule, await measure(13, null))).toBe('unknown')
  expect(evaluateTransition(rule, await measure(13, true))).toBe('pass')
})
it('stops sampling when cancelled between clock ticks', async () => {
  let time = 0,
    cancelled = false,
    calls = 0
  await expect(
    sampleWindow({
      durationMs: 5000,
      now: () => time,
      guard: () => {
        if (cancelled) throw Error('cancelled')
      },
      wait: async (ms) => {
        time += ms
        cancelled = true
      },
      sample: async () => {
        calls++
        return false
      },
    }),
  ).rejects.toThrow('cancelled')
  expect(calls).toBe(1)
})
