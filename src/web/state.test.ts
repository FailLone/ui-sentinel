import { describe, expect, it } from 'vitest'
import { mergeEvents, terminalStatuses, artifactUrl } from './state.ts'
import type { RunEvent } from '../shared/types.ts'
const event = (id: string, seq: number) => ({ id, seq, type: 'unknown:new-event' }) as RunEvent
describe('workbench reconnect', () => {
  it('deduplicates persisted replay and sorts arbitrary event types', () => {
    expect(
      mergeEvents([event('a', 1)], [event('c', 3), event('a', 1), event('b', 2)]).map((e) => e.id),
    ).toEqual(['a', 'b', 'c'])
  })
  it('does not treat queued as finished', () => {
    expect(terminalStatuses.has('queued')).toBe(false)
    expect(terminalStatuses.has('blocked')).toBe(true)
    expect(terminalStatuses.has('interrupted')).toBe(true)
  })
  it('encodes evidence identifiers instead of accepting paths', () => {
    expect(artifactUrl('r', '<script>/x')).toBe('/api/runs/r/artifacts/%3Cscript%3E%2Fx')
  })
})

it('replays waiting and tool stages before a model response completes', async () => {
  const { executionStage } = await import('./state.ts')
  const events: RunEvent[] = [
    {
      ...event('a', 1),
      type: 'model:request-started',
      payload: { attemptId: 'a', startedAt: 1000, deadlineAt: 61000 },
    },
  ]
  expect(executionStage(events, 6000)).toMatchObject({
    label: '等待模型响应',
    elapsedSeconds: 5,
    deadlineAt: 61000,
  })
  events.push({
    ...event('b', 2),
    type: 'tool:started',
    payload: {
      attemptId: 'a',
      toolCallId: 't',
      tool: 'page_act',
      startedAt: 5000,
      deadlineAt: 20000,
    },
  })
  expect(executionStage(events, 6000)).toMatchObject({
    label: '执行工具：page_act',
    elapsedSeconds: 1,
  })
  events.push({ ...event('c', 3), type: 'tool:finished', payload: { toolCallId: 't' } })
  expect(executionStage(events, 7000).label).toBe('处理工具结果')
  events.push(
    { ...event('d', 4), type: 'model:request-finished', payload: { attemptId: 'a' } },
    { ...event('e', 5), type: 'run:phase-changed', payload: { to: 'finalizing' } },
  )
  expect(executionStage(events, 8000).label).toBe('收尾')
})
