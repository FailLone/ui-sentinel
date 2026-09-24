import { describe, it, expect } from 'vitest'
import { responseTimeRule } from '../rules/builtin/response-time.ts'
import type { RuleContext } from '../rules/types.ts'
function context(durationMs: number, uncertaintyMs = 1, feedbackWarningMs?: number): RuleContext {
  return {
    runId: 'test',
    currentUrl: 'http://test',
    pageTitle: 'test',
    timestamp: new Date().toISOString(),
    ...(feedbackWarningMs === undefined ? {} : { feedbackWarningMs }),
    snapshot: {
      url: 'http://test',
      title: 'test',
      viewport: { width: 100, height: 100 },
      elements: [],
    },
    events: [
      {
        type: 'response:observed',
        timestamp: new Date().toISOString(),
        payload: { actionId: 'a', durationMs, uncertaintyMs, evidenceRefs: ['original.png'] },
      },
    ],
  }
}
describe('response budget uses observed browser timings', () => {
  it('passes a 0.5 second response and warns on a 12 second response', async () => {
    expect((await responseTimeRule.evaluate(context(500, 1, 10000))).verdict).toBe('pass')
    expect((await responseTimeRule.evaluate(context(12000, 1, 10000))).verdict).toBe('fail')
  })
  it('does not force a verdict at an uncertainty boundary', async () => {
    expect((await responseTimeRule.evaluate(context(10002, 10, 10000))).verdict).toBe('unknown')
  })
  it('R07: judges against the requirement the run declared, not a fixed ten seconds', async () => {
    // The same measurement, two contracts. If the threshold were a literal, both would agree.
    const measured = 6000
    expect((await responseTimeRule.evaluate(context(measured, 1, 10000))).verdict).toBe('pass')
    expect((await responseTimeRule.evaluate(context(measured, 1, 5000))).verdict).toBe('fail')
    // The uncertainty band moves with the declared requirement too.
    expect((await responseTimeRule.evaluate(context(5200, 300, 5000))).verdict).toBe('unknown')
    const result = await responseTimeRule.evaluate(context(measured, 1, 5000))
    expect(result.details.thresholdMs).toBe(5000)
    expect(result.expected).toContain('5000')
  })
  it('R07: reports unknown rather than a remembered threshold when the run declares none', async () => {
    // A run whose contract states no requirement - or a legacy run with no contract at all - has no
    // number to be judged against. Falling back to ten seconds would invent one.
    expect((await responseTimeRule.evaluate(context(30000))).verdict).toBe('unknown')
    const result = await responseTimeRule.evaluate(context(30000))
    expect(result.verdict).not.toBe('fail')
    expect(result.details.thresholdMs).toBeNull()
  })
  it('never uses action logs that include locator/model waiting as timing evidence', async () => {
    const c = context(1)
    expect(
      (
        await responseTimeRule.evaluate({
          ...c,
          events: [
            {
              type: 'action:executing',
              timestamp: '2026-01-01T00:00:00Z',
              payload: { type: 'click' },
            },
            {
              type: 'action:completed',
              timestamp: '2026-01-01T00:01:00Z',
              payload: { type: 'click' },
            },
          ],
        })
      ).verdict,
    ).toBe('not-applicable')
  })
})
