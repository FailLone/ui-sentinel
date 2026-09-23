export interface ModelRequestRecord {
  readonly seq: number
  readonly purpose: 'agent' | 'vision'
  readonly model: string
  readonly startedAt: number
  readonly durationMs: number
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly status: 'success' | 'error'
  readonly error?: string
}

export interface RequestTrackerSummary {
  readonly totalRequests: number
  readonly agentRequests: number
  readonly visionRequests: number
  readonly successCount: number
  readonly errorCount: number
  readonly totalInputTokens: number | null
  readonly totalOutputTokens: number | null
  readonly totalDurationMs: number
  readonly avgInputTokensPerCall: number | null
  readonly records: readonly ModelRequestRecord[]
}

export function createRequestTracker() {
  const records: ModelRequestRecord[] = []
  const pending = new Map<number, (result: RequestFinishInput) => ModelRequestRecord>()
  let seq = 0
  let hasUnknownUsage = false

  function startRequest(
    purpose: 'agent' | 'vision',
    model: string,
  ): { finish: (result: RequestFinishInput) => ModelRequestRecord } {
    const currentSeq = ++seq
    const startedAt = Date.now()

    let completed: ModelRequestRecord | undefined
    const handle = {
      finish(result: RequestFinishInput): ModelRequestRecord {
        if (completed) return completed
        const record: ModelRequestRecord = {
          seq: currentSeq,
          purpose,
          model,
          startedAt,
          durationMs: result.durationMs ?? Date.now() - startedAt,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          status: result.error ? 'error' : 'success',
          ...(result.error ? { error: result.error } : {}),
        }
        if (record.inputTokens === null || record.outputTokens === null) {
          hasUnknownUsage = true
        }
        completed = record
        pending.delete(currentSeq)
        records.push(record)
        return record
      },
    }
    pending.set(currentSeq, handle.finish)
    return handle
  }

  function finishPending(error: string) {
    for (const finish of pending.values()) finish({ error })
  }

  function summarize(): RequestTrackerSummary {
    const agentRecords = records.filter((r) => r.purpose === 'agent')
    const visionRecords = records.filter((r) => r.purpose === 'vision')
    const successes = records.filter((r) => r.status === 'success')

    const totalInput = hasUnknownUsage
      ? null
      : records.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0)
    const totalOutput = hasUnknownUsage
      ? null
      : records.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0)
    const totalDuration = records.reduce((sum, r) => sum + r.durationMs, 0)

    return {
      totalRequests: records.length,
      agentRequests: agentRecords.length,
      visionRequests: visionRecords.length,
      successCount: successes.length,
      errorCount: records.length - successes.length,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalDurationMs: totalDuration,
      avgInputTokensPerCall:
        totalInput !== null && records.length > 0 ? Math.round(totalInput / records.length) : null,
      records: [...records],
    }
  }

  return {
    startRequest,
    finishPending,
    summarize,
    get records() {
      return [...records] as readonly ModelRequestRecord[]
    },
  }
}

export type RequestTracker = ReturnType<typeof createRequestTracker>

interface RequestFinishInput {
  readonly durationMs?: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly error?: string
}
