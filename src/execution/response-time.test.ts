import { describe, it, expect } from 'vitest'
import { responseTimeRule } from '../rules/builtin/response-time.ts'
import type { RuleContext } from '../rules/types.ts'
function context(durationMs: number, uncertaintyMs = 1): RuleContext {
  return {
    runId: 'test',
    currentUrl: 'http://test',
    pageTitle: 'test',
    timestamp: new Date().toISOString(),
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
    expect((await responseTimeRule.evaluate(context(500))).verdict).toBe('pass')
    expect((await responseTimeRule.evaluate(context(12000))).verdict).toBe('fail')
  })
  it('does not force a verdict at an uncertainty boundary', async () => {
    expect((await responseTimeRule.evaluate(context(10002, 10))).verdict).toBe('unknown')
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
