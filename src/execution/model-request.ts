import type { Agent } from '@mastra/core/agent'
import { config } from '../shared/config.ts'

export interface ModelRequestOptions {
  readonly runSignal: AbortSignal
  readonly timeRemainingMs: number
  readonly attemptBudget: number
}

export interface ModelRequestResult {
  readonly text: string
  readonly toolResults: readonly Record<string, unknown>[]
  readonly usage: { inputTokens?: number; outputTokens?: number } | undefined
  readonly attemptId: string
  readonly attempts: number
  readonly retriedFrom?: string
}

interface AttemptRecord {
  readonly attemptId: string
  readonly startedAt: number
  readonly durationMs: number
  readonly status: 'success' | 'timeout' | 'error'
  readonly error?: string
  readonly hadToolCalls: boolean
}

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes('cancelled') || msg.includes('aborted')) return false
  if (msg.includes('auth') || msg.includes('401') || msg.includes('403')) return false
  if (msg.includes('invalid') || msg.includes('unsupported')) return false
  return (
    msg.includes('timeout') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('529')
  )
}

function hasToolCalls(result: { toolResults?: unknown }): boolean {
  const tr = result.toolResults
  return Array.isArray(tr) && tr.length > 0
}

let attemptSeq = 0

export async function executeModelRequest(
  agent: Agent,
  input: string,
  options: ModelRequestOptions,
  onAttempt?: (record: AttemptRecord) => void,
): Promise<ModelRequestResult> {
  const { runSignal, timeRemainingMs, attemptBudget } = options
  const maxRetries = Math.min(config.budget.modelRequestMaxRetries, attemptBudget - 1)
  const attempts: AttemptRecord[] = []
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptId = `attempt-${++attemptSeq}`
    const startedAt = Date.now()

    const requestTimeout = Math.min(
      config.budget.modelRequestTimeoutMs,
      Math.max(timeRemainingMs - 2000, 5000),
    )

    const requestAc = new AbortController()
    const combinedSignal = AbortSignal.any([runSignal, requestAc.signal])
    const timer = setTimeout(() => requestAc.abort(new Error('model-request-timeout')), requestTimeout)

    try {
      const result = await agent.generate(input, {
        maxSteps: 1,
        abortSignal: combinedSignal,
      })

      clearTimeout(timer)
      const record: AttemptRecord = {
        attemptId,
        startedAt,
        durationMs: Date.now() - startedAt,
        status: 'success',
        hadToolCalls: hasToolCalls(result),
      }
      attempts.push(record)
      onAttempt?.(record)

      return {
        text: result.text ?? '',
        toolResults: (result.toolResults ?? []) as unknown as readonly Record<string, unknown>[],
        usage: result.usage as ModelRequestResult['usage'],
        attemptId,
        attempts: attempts.length,
        ...(attempt > 0 ? { retriedFrom: attempts[attempt - 1]!.attemptId } : {}),
      }
    } catch (error) {
      clearTimeout(timer)
      const isTimeout =
        error instanceof Error &&
        (error.message.includes('model-request-timeout') || error.message.includes('timeout'))

      const record: AttemptRecord = {
        attemptId,
        startedAt,
        durationMs: Date.now() - startedAt,
        status: isTimeout ? 'timeout' : 'error',
        error: error instanceof Error ? error.message : String(error),
        hadToolCalls: false,
      }
      attempts.push(record)
      onAttempt?.(record)
      lastError = error

      if (runSignal.aborted) throw error

      const canRetry =
        attempt < maxRetries &&
        isRetryableError(error) &&
        !record.hadToolCalls &&
        timeRemainingMs - (Date.now() - startedAt) > 10_000

      if (!canRetry) throw error

      const backoff = Math.min(1000 * (attempt + 1), timeRemainingMs - 5000)
      if (backoff > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, backoff)
          const onAbort = () => {
            clearTimeout(t)
            reject(runSignal.reason ?? new Error('cancelled'))
          }
          runSignal.addEventListener('abort', onAbort, { once: true })
          if (runSignal.aborted) onAbort()
        })
      }
    }
  }

  throw lastError ?? new Error('model-request-failed')
}
