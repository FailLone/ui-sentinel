import { bindReceipt } from '../exploration/adapter.ts'
import type { SendFn } from '../exploration/transport.ts'
import type { Usage } from '../exploration/receipt.ts'
import { compileRequest, type Compiled } from './compile.ts'
import { normalizeResponse, ProviderError, readUsage, unknownUsage } from './response.ts'
import { parseStrictJson } from './strict-json.ts'
import { profileSchema, sha256, type Profile } from './profile.ts'

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>
export type ProviderEvent = {
  attemptId: string
  requestDigest: string
  wireDigest: string | null
  stage: 'prepared' | 'dispatch' | 'response' | 'failure'
  wire?: string
  mapping?: Compiled['mapping']
  byteLength?: number
  status?: number
  responseText?: string
  responseDigest?: string
  receipt?: unknown
  usage?: Usage
  code?: string
  durationMs?: number
}
export type HttpOptions = {
  profile: Profile
  /** Explicit compiler for a versioned experiment; default projection remains unchanged. */
  compile?: typeof compileRequest
  apiKey: string
  maxInputBytes?: number
  fetch?: HttpFetch
  /** Synchronous audit failures fail closed, including before the HTTP call. */
  onEvent?: (event: ProviderEvent) => void
}
const notDispatched: Usage = {
  status: 'known',
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  source: 'provider',
}
export function createJevTransport(options: HttpOptions): SendFn {
  const profile = profileSchema.parse(options.profile)
  // The runtime environment is read only by the explicit CLI composition root.
  const secret = options.apiKey
  if (!secret || /[\r\n]/.test(secret)) throw new Error('invalid-api-key')
  const http = options.fetch ?? ((url, init) => fetch(url, init))
  return async (request, context) => {
    const started = performance.now()
    const remaining = Math.max(0, context.deadline - Date.now())
    const deadline = started + remaining
    const controller = new AbortController()
    const abort = () => controller.abort()
    context.signal.addEventListener('abort', abort, { once: true })
    if (context.signal.aborted) abort()
    const timer = setTimeout(abort, remaining)
    let compiled: Compiled | undefined
    let dispatched = false
    let usage: Usage = { ...notDispatched }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const base = () => ({
      attemptId: context.attemptId,
      requestDigest: context.requestDigest,
      wireDigest: compiled?.wireDigest ?? null,
    })
    const emit = (event: Omit<ProviderEvent, 'attemptId' | 'requestDigest' | 'wireDigest'>) =>
      options.onEvent?.({ ...base(), ...event })
    const guard = () => {
      if (controller.signal.aborted || performance.now() >= deadline)
        throw new ProviderError('aborted', usage)
    }
    // A malicious/buggy injected fetch or reader may ignore abort. Race it while retaining
    // handlers, so its late resolution cannot be rebound to another attempt or become advice.
    let abortListener: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () => reject(new ProviderError('aborted', usage))
      controller.signal.addEventListener('abort', abortListener, { once: true })
      if (controller.signal.aborted) abortListener()
    })
    // Attach a handler even when an early compile/guard rejects before the first race.
    void aborted.catch(() => {})
    try {
      guard()
      compiled = (options.compile ?? compileRequest)(
        request,
        profile,
        options.maxInputBytes ?? 32768,
      )
      if (compiled.requestDigest !== context.requestDigest)
        throw new ProviderError('request-digest-mismatch', usage)
      // Never serialize a credential if supplied page text or a response happens to contain it.
      if (compiled.wire.includes(secret)) throw new ProviderError('sensitive-input', usage)
      emit({
        stage: 'prepared',
        wire: compiled.wire,
        mapping: compiled.mapping,
        byteLength: compiled.byteLength,
      })
      guard()
      // The audit hook reserves and fsyncs the campaign ticket before the fetch is invoked.
      emit({ stage: 'dispatch' })
      guard()
      dispatched = true
      usage = { ...unknownUsage }
      const operation = http(profile.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: compiled.wire,
        signal: controller.signal,
      })
      void operation.then(
        (response) => {
          if (controller.signal.aborted) void response.body?.cancel().catch(() => {})
        },
        () => {},
      )
      const response = await Promise.race([operation, aborted])
      guard()
      // Do not read/persist arbitrary provider error pages, URLs, request headers or errors.
      if (!response.ok) throw new ProviderError(`http-${response.status}`, usage)
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''))
        throw new ProviderError('response-content-type', usage)
      const declared = response.headers.get('content-length')
      if (declared && Number(declared) > profile.maxResponseBytes)
        throw new ProviderError('response-size', usage)
      if (!response.body) throw new ProviderError('response-empty', usage)
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      while (true) {
        const part = await Promise.race([reader.read(), aborted])
        guard()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > profile.maxResponseBytes) throw new ProviderError('response-size', usage)
        chunks.push(part.value)
      }
      const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
      if (body.includes(secret)) throw new ProviderError('sensitive-response', usage)
      let raw: unknown
      try {
        raw = parseStrictJson(body)
      } catch {
        emit({
          stage: 'response',
          status: response.status,
          responseText: body,
          responseDigest: sha256(body),
          usage,
        })
        throw new ProviderError('response-json', usage)
      }
      usage = readUsage(raw)
      let receipt: ReturnType<typeof normalizeResponse>
      try {
        receipt = normalizeResponse(raw, compiled, profile)
      } catch (error) {
        emit({
          stage: 'response',
          status: response.status,
          responseText: body,
          responseDigest: sha256(body),
          usage,
        })
        throw error
      }
      emit({
        stage: 'response',
        status: response.status,
        responseText: body,
        responseDigest: sha256(body),
        receipt,
        usage,
      })
      guard()
      return bindReceipt(receipt, context)
    } catch (error) {
      // Only locally generated codes are observable. Never echo fetch exceptions or body text.
      const safeCode =
        error instanceof ProviderError
          ? error.code
          : !dispatched
            ? 'local-preflight'
            : 'transport-failed'
      try {
        emit({ stage: 'failure', code: safeCode, usage, durationMs: performance.now() - started })
      } catch {
        /* leave durable ticket pending */
      }
      throw new ProviderError(safeCode, usage)
    } finally {
      clearTimeout(timer)
      context.signal.removeEventListener('abort', abort)
      if (abortListener) controller.signal.removeEventListener('abort', abortListener)
      controller.abort()
      // Cancellation is best effort and must not extend the request deadline.
      if (reader) void reader.cancel().catch(() => {})
    }
  }
}
