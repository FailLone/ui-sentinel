import { createHash } from 'node:crypto'
import { AGENT_MODEL } from '../../evaluation/support/model-gateway.ts'

export interface UpstreamTiming {
  row: string
  sequence: number
  requestBodySha256: string
  startedAt: string
  headersMs: number | null
  firstByteMs: number | null
  firstEventMs: number | null
  responseCompleteMs: number | null
  validationEndMs: number | null
  releaseMs: number | null
  abortedMs: number | null
  finishedMs: number
  httpStatus: number | null
  upstreamBytes: number
  dataEvents: number
  outcome: 'validated' | 'http-error' | 'validation-error' | 'aborted' | 'transport-error'
  boundary: 'full-validation-before-release'
}
function abortable<T>(signal: AbortSignal | null | undefined, operation: Promise<T>): Promise<T> {
  if (!signal) return operation
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? Error('cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Observes the real upstream stream, but never releases content before full validation.
 * No raw payload, request headers, keys, or arbitrary response headers enter timing evidence.
 */
export function createValidatedUpstream(
  fetcher: typeof fetch,
  hooks: {
    context(): { row: string; sequence: number }
    auditWire(url: string, body: string): void
    stop(reason: string): void
    record(timing: UpstreamTiming): Promise<void> | void
    now?: () => number
  },
): typeof fetch {
  return async (url, init) => {
    const body = String(init?.body),
      now = hooks.now ?? Date.now,
      started = now()
    hooks.auditWire(String(url), body)
    const timing: UpstreamTiming = {
      ...hooks.context(),
      requestBodySha256: createHash('sha256').update(body).digest('hex'),
      startedAt: new Date(started).toISOString(),
      headersMs: null,
      firstByteMs: null,
      firstEventMs: null,
      responseCompleteMs: null,
      validationEndMs: null,
      releaseMs: null,
      abortedMs: null,
      finishedMs: 0,
      httpStatus: null,
      upstreamBytes: 0,
      dataEvents: 0,
      outcome: 'transport-error',
      boundary: 'full-validation-before-release',
    }
    const elapsed = () => Math.max(0, now() - started)
    const signal = init?.signal
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const onAbort = () => {
      timing.abortedMs ??= elapsed()
      void reader?.cancel(signal?.reason).catch(() => {})
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      signal?.throwIfAborted()
      const response = await abortable(signal, fetcher(url, { ...init, redirect: 'error' }))
      timing.headersMs = elapsed()
      timing.httpStatus = response.status
      signal?.throwIfAborted()
      if (!response.ok) {
        timing.outcome = 'http-error'
        hooks.stop('provider-http-error')
        return response
      }
      if (!response.body) throw Error('missing-upstream-body')
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      const decoder = new TextDecoder()
      let pending = ''
      const lines = (text: string, final = false) => {
        const parts = (pending + text).split('\n')
        pending = final ? '' : parts.pop()!
        for (const line of parts)
          if (
            line.startsWith('data:') &&
            line.slice(5).trim() &&
            line.slice(5).trim() !== '[DONE]'
          ) {
            timing.firstEventMs ??= elapsed()
            timing.dataEvents++
          }
      }
      while (true) {
        const chunk = await abortable(signal, reader.read())
        signal?.throwIfAborted()
        if (chunk.done) break
        timing.firstByteMs ??= elapsed()
        timing.upstreamBytes += chunk.value.byteLength
        chunks.push(chunk.value)
        lines(decoder.decode(chunk.value, { stream: true }))
      }
      lines(decoder.decode(), true)
      timing.responseCompleteMs = elapsed()
      const bytes = Buffer.concat(chunks)
      try {
        const events = bytes
          .toString()
          .split('\n')
          .filter((l) => l.startsWith('data:') && l.slice(5).trim() !== '[DONE]')
          .map((l) => JSON.parse(l.slice(5)))
        if (
          !events.length ||
          events.some(
            (e) =>
              e.error ||
              (e.provider && e.provider !== 'Wafer') ||
              (e.model &&
                ![AGENT_MODEL, 'deepseek/deepseek-v4.1-flash-20260910'].includes(e.model)),
          )
        )
          throw Error('provider-response-error')
      } catch {
        timing.validationEndMs = elapsed()
        timing.outcome = 'validation-error'
        hooks.stop('provider-response-error')
        throw Error('provider-response-error')
      }
      timing.validationEndMs = elapsed()
      signal?.throwIfAborted()
      timing.outcome = 'validated'
      timing.releaseMs = elapsed()
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (error) {
      if (timing.outcome !== 'validation-error') {
        timing.outcome = signal?.aborted ? 'aborted' : 'transport-error'
        if (signal?.aborted) timing.abortedMs ??= elapsed()
        hooks.stop('transport-error')
      }
      throw error
    } finally {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) onAbort()
      reader?.releaseLock()
      timing.finishedMs = elapsed()
      try {
        await hooks.record({ ...timing })
      } catch {
        hooks.stop('persistence')
        throw Error('upstream-timing-persistence-failed')
      }
    }
  }
}
