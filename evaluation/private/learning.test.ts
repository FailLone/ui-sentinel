import { it, expect } from 'vitest'
import { scoreBoundRecheck } from './learning.ts'

it('does not replace bound-rule evidence with a cheap successful finish', () => {
  const report = {
    findings: [],
    events: [{ type: 'finish:accepted', payload: {} }],
    usage: { modelCalls: 1, actions: 0, elapsedMs: 1 },
    status: 'blocked',
  }
  expect(
    scoreBoundRecheck(report, { orders: [{}] }, [{ exists: true }], 'r', 5000, true).passed,
  ).toBe(false)
})
