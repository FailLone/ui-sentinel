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
