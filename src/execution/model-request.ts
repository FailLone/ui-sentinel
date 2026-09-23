import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Agent } from '@mastra/core/agent'
import { config } from '../shared/config.ts'
import { createModelTiming, markModelToolExecution, type ModelTiming } from './model-timing.ts'

interface AttemptContext {
  id: string
  signal: AbortSignal
  active: boolean
  toolsStarted: boolean
  responseAt?: number
  responseReceived: () => void
}
const attempts = new AsyncLocalStorage<AttemptContext>()

/** Background evidence work owns a new attempt, never the page tool's expiring attempt. */
export function outsideModelAttempt<T>(operation: () => T): T {
  return attempts.exit(operation)
}

/** Bound to the async invocation, never a mutable global "current attempt". */
export function guardModelAttempt(): void {
  const attempt = attempts.getStore()
  if (!attempt) return
  attempt.signal.throwIfAborted()
  if (!attempt.active) throw new Error('model-attempt-expired')
}

export function beginAttemptTool(): string | undefined {
  guardModelAttempt()
  const attempt = attempts.getStore()
  if (!attempt) throw new Error('tool-attempt-required')
  attempt.toolsStarted = true
  markModelToolExecution()
  attempt.responseReceived()
  return attempt.id
}

export function abortable<T>(signal: AbortSignal, operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export interface ModelRequestOptions {
  readonly runSignal: AbortSignal
  readonly timeRemainingMs: number
  readonly attemptBudget: number
  readonly canRetry?: () => boolean
  readonly transport?: 'generate' | 'stream'
  readonly activeTools?: string[]
  readonly requireTool?: boolean
}
export interface ModelRequestResult {
  readonly text: string
  readonly toolResults: readonly Record<string, unknown>[]
  readonly usage: { inputTokens?: number; outputTokens?: number } | undefined
  readonly attemptId: string
  readonly attempts: number
}
export interface AttemptRecord {
  readonly attemptId: string
  readonly retryOf?: string
  readonly startedAt: number
  readonly deadlineAt: number
  readonly durationMs: number
  readonly modelDurationMs: number
  readonly status: 'success' | 'timeout' | 'error' | 'cancelled'
  readonly error?: string
  readonly hadToolCalls: boolean
  readonly usage?: ModelRequestResult['usage']
  readonly timing: ModelTiming
}
export interface ModelRequestHooks {
  onStart?: (
    record: Pick<AttemptRecord, 'attemptId' | 'retryOf' | 'startedAt' | 'deadlineAt'>,
  ) => Promise<void> | void
  onFinish?: (record: AttemptRecord) => Promise<void> | void
}

function retryable(error: unknown): boolean {
  const e = error as { statusCode?: number; message?: string }
  if ([400, 401, 403, 404, 422].includes(e?.statusCode ?? 0)) return false
  const message = e?.message ?? String(error)
  if (/cancel|auth|unsupported|invalid|401|403/i.test(message)) return false
  return (
    [408, 429, 500, 502, 503, 504].includes(e?.statusCode ?? 0) ||
    /model-request-timeout|ECONNRESET|ECONNREFUSED|fetch failed|network|terminated/i.test(
      message,
    ) ||
    /Agent stream finished with finishReason "other" without producing any output/.test(message) ||
    message === 'model-stream-incomplete:length'
  )
}

async function backoff(signal: AbortSignal, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await abortable(
      signal,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms)
      }),
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function executeModelRequest(
  agent: Agent,
  input: Parameters<Agent['generate']>[0],
  options: ModelRequestOptions,
  hooks: ModelRequestHooks = {},
): Promise<ModelRequestResult> {
  const deadlineAt = Date.now() + options.timeRemainingMs
  const maxAttempts = Math.min(options.attemptBudget, config.budget.modelRequestMaxRetries + 1)
  if (maxAttempts < 1) throw new Error('budget-exhausted')
  let retryOf: string | undefined
  let requestInput = input
  for (let index = 0; index < maxAttempts; index++) {
    options.runSignal.throwIfAborted()
    const startedAt = Date.now(),
      remaining = deadlineAt - startedAt
    if (remaining <= 0) throw new Error('budget-exhausted')
    const attemptId = randomUUID()
    const requestDeadline = startedAt + Math.min(remaining, config.budget.modelRequestTimeoutMs)
    // The caller reserves actual request budget before generation, including retries.
    await hooks.onStart?.({ attemptId, retryOf, startedAt, deadlineAt: requestDeadline })
    const controller = new AbortController()
    const signal = AbortSignal.any([options.runSignal, controller.signal])
    const transport =
      options.transport ?? (config.optimizations?.modelStreaming ? 'stream' : 'generate')
    const timing = createModelTiming(transport, startedAt)
    const markCancelled = () => timing.mark('cancelledMs')
    signal.addEventListener('abort', markCancelled, { once: true })
    const timer = setTimeout(
      () =>
        controller.abort(
          new Error(
            remaining <= config.budget.modelRequestTimeoutMs
              ? 'budget-exhausted'
              : 'model-request-timeout',
          ),
        ),
      Math.max(0, requestDeadline - Date.now()),
    )
    // Whole decision remains bounded even when a provider ignores cancellation.
    const runTimer = setTimeout(
      () => controller.abort(new Error('budget-exhausted')),
      Math.max(0, deadlineAt - Date.now()),
    )
    const context: AttemptContext = {
      id: attemptId,
      signal,
      active: true,
      toolsStarted: false,
      responseReceived() {
        context.responseAt ??= Date.now()
        clearTimeout(timer)
      },
    }
    let result: Awaited<ReturnType<Agent['generate']>> | undefined
    let failure: unknown
    try {
      result = await attempts.run(context, () =>
        timing.run(async () => {
          signal.throwIfAborted()
          if (Date.now() >= requestDeadline) throw new Error('budget-exhausted')
          if (transport === 'generate')
            return abortable(
              signal,
              agent.generate(requestInput, {
                maxSteps: 1,
                abortSignal: signal,
                activeTools: options.activeTools,
                toolChoice: options.requireTool ? 'required' : 'auto',
              }),
            )
          let streamError: Error | undefined
          const output = await abortable(
            signal,
            agent.stream(requestInput, {
              maxSteps: 1,
              activeTools: options.activeTools,
              toolChoice: options.requireTool ? 'required' : 'auto',
              abortSignal: signal,
              onChunk: (chunk) => timing.chunk(chunk),
              onError: ({ error }) => {
                streamError = error instanceof Error ? error : new Error(error)
              },
            }),
          )
          const full = await abortable(signal, output.getFullOutput())
          // Failed/incomplete output still has billable usage; never discard it during validation.
          result = full
          timing.mark('responseCompleteMs')
          if (streamError) throw streamError
          if (full.finishReason === 'error') throw new Error('model-stream-error')
          if (!['stop', 'tool-calls'].includes(full.finishReason ?? ''))
            throw new Error(`model-stream-incomplete:${full.finishReason ?? 'missing-finish'}`)
          return full
        }),
      )
      timing.mark('responseCompleteMs')
      signal.throwIfAborted()
    } catch (error) {
      failure = signal.aborted ? signal.reason : error
    } finally {
      context.active = false
      clearTimeout(timer)
      clearTimeout(runTimer)
      signal.removeEventListener('abort', markCancelled)
    }
    const now = Date.now()
    const error =
      failure === undefined
        ? undefined
        : String(failure instanceof Error ? failure.message : failure)
    await hooks.onFinish?.({
      attemptId,
      retryOf,
      startedAt,
      deadlineAt: requestDeadline,
      durationMs: now - startedAt,
      modelDurationMs: (context.responseAt ?? now) - startedAt,
      status:
        failure === undefined
          ? 'success'
          : options.runSignal.aborted
            ? 'cancelled'
            : error === 'model-request-timeout'
              ? 'timeout'
              : 'error',
      error,
      hadToolCalls: context.toolsStarted,
      usage: result?.usage as ModelRequestResult['usage'],
      timing: timing.finish(),
    })
    if (failure === undefined && result)
      return {
        text: result.text ?? '',
        toolResults: (result.toolResults ?? []) as unknown as readonly Record<string, unknown>[],
        usage: result.usage as ModelRequestResult['usage'],
        attemptId,
        attempts: index + 1,
      }
    if (
      options.runSignal.aborted ||
      context.toolsStarted ||
      !retryable(failure) ||
      options.canRetry?.() === false ||
      index + 1 >= maxAttempts ||
      deadlineAt - Date.now() <= 1000
    )
      throw failure
    if (error === 'model-stream-incomplete:length') {
      const notice =
        'The preceding request reached its output limit before executing any tool. No tool from that request ran. Use the unchanged evidence to choose one justified available tool. Keep arguments concise; do not repeat completed work.'
      if (typeof input === 'string') {
        try {
          const value = JSON.parse(input)
          requestInput =
            value && typeof value === 'object' && !Array.isArray(value)
              ? JSON.stringify({ ...value, requestRecovery: notice })
              : `${input}\n\n${notice}`
        } catch {
          requestInput = `${input}\n\n${notice}`
        }
      } else
        requestInput = [
          ...(Array.isArray(input) ? input : [input]),
          { role: 'user', content: notice },
        ]
    }
    retryOf = attemptId
    await backoff(options.runSignal, 1000)
  }
  throw new Error('budget-exhausted')
}
