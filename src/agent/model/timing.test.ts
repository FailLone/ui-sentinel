import { afterEach, expect, it, vi } from 'vitest'
import { createModelTiming, withModelTransportTiming } from './timing.ts'

afterEach(() => vi.useRealTimers())

it('ignores empty deltas and lifecycle events, records increments without retaining their contents', async () => {
  vi.useFakeTimers()
  const start = Date.now()
  const timing = createModelTiming('stream', start)
  timing.chunk({ type: 'start' })
  timing.chunk({ type: 'text-delta', payload: { text: '' } })
  await vi.advanceTimersByTimeAsync(10)
  timing.chunk({ type: 'reasoning-delta', payload: { text: 'private reasoning' } })
  await vi.advanceTimersByTimeAsync(25)
  timing.chunk({ type: 'tool-call-delta', payload: { argsTextDelta: '{' } })
  await vi.advanceTimersByTimeAsync(5)
  timing.chunk({ type: 'tool-call', payload: { args: { secret: 'never stored' } } })
  const result = timing.finish()
  expect(result).toMatchObject({
    firstModelDeltaMs: 10,
    lastModelDeltaMs: 35,
    maxDeltaGapMs: 25,
    firstToolCallMs: 40,
  })
  expect(JSON.stringify(result)).not.toMatch(/private|secret/)
  timing.mark('cancelledMs')
  expect(timing.finish().cancelledMs).toBeNull()
})

it('binds transport timing to each concurrent request and preserves the streaming response', async () => {
  const a = createModelTiming('stream', Date.now())
  const b = createModelTiming('stream', Date.now())
  const response = new Response('body')
  const fetcher = withModelTransportTiming(vi.fn(async () => response))
  expect(await a.run(() => fetcher('http://local.test'))).toBe(response)
  expect(a.finish().responseHeadersMs).not.toBeNull()
  expect(b.finish().responseHeadersMs).toBeNull()
  expect(await response.text()).toBe('body')
})
