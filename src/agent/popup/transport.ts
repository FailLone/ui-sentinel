import { createHash } from 'node:crypto'

export type PopupTransportRecord = {
  requestId: string
  runId: string
  channel: 'popup-jev'
  model: 'typesafe/jev-1.13'
  provider: 'TypeSafe'
  wireSha256: string
  startedAt: string
  observedAt: string
  finishedAt?: string
  outcome:
    | 'pending'
    | 'success'
    | 'http-error'
    | 'timeout'
    | 'cancelled'
    | 'transport-error'
    | 'response-bound'
  headersAt?: string
  errorName?: string
  errorCode?: string
  errorMessage?: string
  httpStatus?: number
  responseHeaders?: Record<string, string>
  generationId?: string
  providerRequestId?: string
  upstreamId?: string
  errorBody?: string
  errorBodyTruncated?: boolean
  errorBodyIncomplete?: boolean
  failureSequence?: number
  loggingFailed?: boolean
}
export type PopupTransportObserver = (record: Readonly<PopupTransportRecord>) => void
let failureSequence = 0
const safeHeaders = [
  'x-request-id',
  'request-id',
  'x-generation-id',
  'retry-after',
  'x-provider-request-id',
  'x-openrouter-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]

export function redactTransportText(value: string, key: string) {
  return (key ? value.split(key).join('[REDACTED]') : value)
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, '[REDACTED-AUTH]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[REDACTED-KEY]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g, '[REDACTED-JWT]')
    .replace(
      /((?:authorization|cookie|api[_-]?key|access[_-]?token|password|secret)\s*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\n,;}]+)/gi,
      '$1[REDACTED]',
    )
}
function boundedText(value: string, key: string, limit = 4096) {
  return new TextDecoder().decode(Buffer.from(redactTransportText(value, key)).subarray(0, limit), {
    stream: true,
  })
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {})
    return Promise.reject(signal.reason)
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** The sole popup HTTP boundary. No retries. Observations never contain request headers. */
export async function requestPopupDecision(options: {
  requestId: string
  runId: string
  wire: string
  key: string
  signal: AbortSignal
  http?: typeof fetch
  observe?: PopupTransportObserver
}): Promise<string> {
  const { signal, key } = options,
    network = new AbortController()
  const record: PopupTransportRecord = {
    requestId: options.requestId,
    runId: options.runId,
    channel: 'popup-jev',
    model: 'typesafe/jev-1.13',
    provider: 'TypeSafe',
    wireSha256: createHash('sha256').update(options.wire).digest('hex'),
    startedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    outcome: 'pending',
  }
  const observe = () => {
    try {
      options.observe?.(structuredClone(record))
    } catch {
      record.loggingFailed = true
    }
  }
  const fail = (outcome: PopupTransportRecord['outcome']) => {
    if (record.failureSequence) return
    record.outcome = outcome
    record.observedAt = new Date().toISOString()
    record.failureSequence = ++failureSequence
    observe() // Synchronous first-error arbitration, before awaiting body or artifact persistence.
  }
  const abort = () => network.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    signal.throwIfAborted()
    const response = await abortable(
      (options.http ?? fetch)('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST',
        redirect: 'error',
        signal: network.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: options.wire,
      }),
      signal,
    )
    record.headersAt = new Date().toISOString()
    record.httpStatus = response.status
    record.responseHeaders = Object.fromEntries(
      safeHeaders.flatMap((name) => {
        const value = response.headers.get(name)
        return value === null ? [] : [[name, boundedText(value, key, 256)]]
      }),
    )
    if (!response.ok) {
      // Stop siblings immediately, but retain at most 250 ms / 8 KiB of this error stream.
      // Detaching only after failed HTTP headers avoids our own stop erasing the diagnostic body.
      signal.removeEventListener('abort', abort)
      fail('http-error')
      const captureSignal = AbortSignal.timeout(250),
        chunks: Uint8Array[] = []
      let bytes = 0
      try {
        reader = response.body?.getReader()
        if (reader)
          while (true) {
            const { value, done } = await abortable(reader.read(), captureSignal)
            if (done) break
            const remaining = 8192 - bytes
            chunks.push(value.subarray(0, remaining))
            bytes += Math.min(value.length, remaining)
            if (value.length >= remaining) {
              record.errorBodyTruncated = true
              break
            }
          }
      } catch {
        record.errorBodyIncomplete = true
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed.id === 'string' && /^gen-[A-Za-z0-9-]{1,124}$/.test(parsed.id))
          record.generationId = parsed.id
        const metadata = parsed.error?.metadata
        for (const source of [parsed, metadata]) {
          if (typeof source?.request_id === 'string')
            record.providerRequestId = boundedText(source.request_id, key, 256)
          if (typeof source?.upstream_id === 'string')
            record.upstreamId = boundedText(source.upstream_id, key, 256)
        }
      } catch {
        /* Partial or non-JSON error bodies still have bounded diagnostics. */
      }
      record.errorBody = boundedText(raw, key)
      record.errorBodyTruncated ||= Buffer.byteLength(redactTransportText(raw, key)) > 4096
      throw Error('popup-provider-http:' + response.status)
    }
    if (!response.body) throw Error('popup-provider-empty-response')
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    while (true) {
      const { value, done } = await abortable(reader.read(), signal)
      if (done) break
      bytes += value.length
      if (bytes > 65536) {
        fail('response-bound')
        throw Error('popup-provider-response-bound')
      }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks).toString('utf8')
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed.id === 'string' && /^gen-[A-Za-z0-9-]{1,124}$/.test(parsed.id))
        record.generationId = parsed.id
    } catch {
      /* Protocol validation remains in the original provider. */
    }
    record.outcome = 'success'
    return body
  } catch (error) {
    if (error instanceof Error) {
      record.errorName = boundedText(error.name, key, 128)
      record.errorMessage = boundedText(error.message, key, 512)
      const code = (error.cause as { code?: unknown } | undefined)?.code
      if (typeof code === 'string') record.errorCode = boundedText(code, key, 128)
    }
    fail(
      signal.aborted
        ? signal.reason?.name === 'TimeoutError'
          ? 'timeout'
          : 'cancelled'
        : 'transport-error',
    )
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
    void reader?.cancel().catch(() => {})
    network.abort()
    record.finishedAt = new Date().toISOString()
    observe()
  }
}
