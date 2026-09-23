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
