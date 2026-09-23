import { AsyncLocalStorage } from 'node:async_hooks'

export interface ModelTiming {
  transport: 'generate' | 'stream'
  responseHeadersMs: number | null
  firstModelDeltaMs: number | null
  firstToolCallMs: number | null
  firstToolExecutionMs: number | null
  lastModelDeltaMs: number | null
  maxDeltaGapMs: number | null
  cancelledMs: number | null
  responseCompleteMs: number | null
}

const current = new AsyncLocalStorage<ReturnType<typeof createModelTiming>>()

/** Timing only: never retain model text, reasoning, tool arguments, or credentials. */
export function createModelTiming(transport: ModelTiming['transport'], startedAt: number) {
  const timing: ModelTiming = {
    transport,
    responseHeadersMs: null,
    firstModelDeltaMs: null,
    firstToolCallMs: null,
    firstToolExecutionMs: null,
    lastModelDeltaMs: null,
    maxDeltaGapMs: null,
    cancelledMs: null,
    responseCompleteMs: null,
  }
  let closed = false
  const elapsed = () => Math.max(0, Date.now() - startedAt)
  return {
    run<T>(fn: () => T): T {
      return current.run(this, fn)
    },
    mark(field: Exclude<keyof ModelTiming, 'transport' | 'maxDeltaGapMs'>) {
      if (!closed) timing[field] ??= elapsed()
    },
    chunk(chunk: { type: string; payload?: unknown }) {
      if (closed) return
      const payload = chunk.payload as { text?: unknown; argsTextDelta?: unknown } | undefined
      const delta = ['text-delta', 'reasoning-delta'].includes(chunk.type)
        ? payload?.text
        : chunk.type === 'tool-call-delta'
          ? payload?.argsTextDelta
          : undefined
      if (typeof delta === 'string' && delta.length > 0) {
        const now = elapsed()
        timing.firstModelDeltaMs ??= now
        if (timing.lastModelDeltaMs !== null)
          timing.maxDeltaGapMs = Math.max(timing.maxDeltaGapMs ?? 0, now - timing.lastModelDeltaMs)
        timing.lastModelDeltaMs = now
      }
      if (chunk.type === 'tool-call') this.mark('firstToolCallMs')
    },
    finish() {
      closed = true
      return { ...timing }
    },
  }
}

export function markModelTransportHeaders() {
  current.getStore()?.mark('responseHeadersMs')
}

export function markModelToolExecution() {
  current.getStore()?.mark('firstToolExecutionMs')
}

export function withModelTransportTiming(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init)
    markModelTransportHeaders()
    return response
  }
}
