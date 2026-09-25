import { it, expect } from 'vitest'
import { createTaskState } from './task-state.ts'
it('distinguishes an untriggered requirement from an unresolved observed anomaly', () => {
  const task = createTaskState('inspect purchase')
  task.recordHypothesis('conditional', 'retry availability', 'retryable-failure')
  expect(task.completionGaps()).toHaveLength(1)
  task.observeFacts({ success: true, status: 'paid' }, false)
  expect(task.completionGaps()).toEqual([])
  expect(task.snapshot().hypotheses[0]?.applicability).toBe('not-triggered')
  task.recordHypothesis('actual', 'obstruction')
  expect(task.completionGaps()).toEqual(['hypothesis:actual:open'])
})
it('does not exempt a condition once it has triggered', () => {
  const task = createTaskState('inspect recovery')
  task.recordHypothesis('recovery', 'disabled', 'retryable-failure')
  task.observeFacts({ success: false, status: 'failed', canRetry: true }, false)
  task.observeFacts({ success: true, status: 'paid' }, false)
  expect(task.completionGaps()).toEqual(['hypothesis:recovery:open'])
  task.resolveHypothesis('recovery', 'supported')
  expect(task.completionGaps()).toEqual([])
})
it('reports untriggered conditional branches separately while retaining applicable gaps', () => {
  const task = createTaskState('inspect purchase')
  task.observeFacts({ success: true, status: 'paid' }, false)
  task.setBranches([
    { description: 'expected rejection', trigger: 'payment-rejected' },
    { description: 'actual access problem', trigger: 'always' },
  ])
  expect(task.completionGaps()).toEqual(['unverified:always:actual access problem'])
  expect(task.snapshot().unexploredBranches[0]?.applicability).toBe('not-triggered')
  task.setBranches([{ description: 'expected rejection', trigger: 'payment-rejected' }])
  expect(task.completionGaps()).toEqual([])
})
it('treats retry offered after a rejected payment as applicable recovery', () => {
  const task = createTaskState('inspect rejection')
  task.observeFacts({ success: false, status: 'rejected', canRetry: true }, false)
  task.setBranches([{ description: 'retry affordance', trigger: 'retryable-failure' }])
  expect(task.completionGaps()).toHaveLength(1)
})

it('retains blocked pre-outcome scope without inventing an outcome or losing an existing branch', () => {
  const task = createTaskState('Inspect purchase')
  task.observeFacts(undefined, true)
  task.setBranches([{ description: 'Inspect observed keyboard issue', trigger: 'always' }])
  expect(task.recordBlockedScope()).toBe(true)
  expect(task.recordBlockedScope()).toBe(false)
  expect(task.snapshot().unexploredBranches).toHaveLength(2)
  expect(
    task.snapshot().conditions.find((c) => c.trigger === 'payment-success')?.applicability,
  ).toBe('pending')
  expect(task.completionGaps()).toContain(
    'unverified:always:No business outcome has been observed. The remaining path and pending conditional outcomes are unverified.',
  )
})
it.each([
  { success: true, status: 'paid' },
  { success: false, status: 'rejected' },
  { success: false, status: 'failed', canRetry: true },
])('does not invent unreached business scope after an actual response: %j', (response) => {
  const task = createTaskState('Inspect outcome')
  task.observeFacts(response, false)
  expect(task.recordBlockedScope()).toBe(false)
  expect(task.completionGaps()).toEqual([])
})

it('preserves downstream scope after a failed operation even when no hypothesis remains open', () => {
  const task = createTaskState('Inspect recovery')
  task.observeNormalizedFacts({ phase: 'failed', retryEligibility: 'allowed' }, false)
  expect(task.recordBlockedScope(true)).toBe(true)
  expect(task.recordBlockedScope(true)).toBe(false)
  expect(task.snapshot().unexploredBranches).toEqual([
    expect.objectContaining({
      trigger: 'always',
      description: expect.stringContaining('downstream'),
    }),
  ])
})
