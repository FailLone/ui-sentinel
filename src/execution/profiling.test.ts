import { describe, it, expect } from 'vitest'
import {
  ExecutionProfile,
  profileOperation,
  summarizeSpans,
  type ExecutionSpan,
} from './profiling.ts'

describe('execution profiling', () => {
  it('accounts nested work and concurrent peers once in wall time', () => {
    const span = (
      id: number,
      kind: string,
      startMs: number,
      endMs: number,
      parentId?: number,
    ): ExecutionSpan => ({ id, kind, startMs, endMs, parentId, status: 'success', attributes: {} })
    const result = summarizeSpans(
      [
        span(1, 'tool', 10, 90),
        span(2, 'observation', 20, 70, 1),
        span(3, 'dom', 30, 50, 2),
        span(4, 'a11y', 40, 60, 2),
      ],
      100,
    )
    expect(result.exclusiveMs).toEqual({
      unattributed: 20,
      tool: 30,
      observation: 20,
      dom: 10,
      overlap: 10,
      a11y: 10,
    })
    expect(Object.values(result.exclusiveMs).reduce((a, b) => a + b, 0)).toBe(100)
    expect(result.inclusiveMs.tool).toBe(80)
  })
  it('retains nesting and failures without changing the exception', async () => {
    let clock = 0
    const profile = new ExecutionProfile(() => clock)
    const error = new Error('failed capture')
    await expect(
      profile.run(() =>
        profileOperation('observation', async () => {
          clock = 5
          await profileOperation('screenshot', async () => {
            clock = 10
            throw error
          })
        }),
      ),
    ).rejects.toBe(error)
    clock = 20
    const result = profile.finish()
    expect(result.spans[1]?.parentId).toBe(result.spans[0]?.id)
    expect(result.spans.map((s) => s.status)).toEqual(['error', 'error'])
    expect(result.exclusiveMs).toEqual({ observation: 5, screenshot: 5, unattributed: 10 })
  })
  it('closes interrupted spans without allowing late completion to rewrite evidence', async () => {
    let clock = 0
    let release!: () => void
    const profile = new ExecutionProfile(() => clock)
    const operation = profile.run(() =>
      profileOperation(
        'dom',
        () =>
          new Promise<void>((r) => {
            release = r
          }),
      ),
    )
    clock = 10
    const result = profile.finish()
    release()
    await operation
    expect(result.spans[0]).toMatchObject({ endMs: 10, status: 'unfinished' })
    expect(result.unfinished).toBe(1)
    clock = 100
    expect(profile.finish()).toEqual(result)
  })
})
