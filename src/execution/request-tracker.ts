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
  let seq = 0
  let hasUnknownUsage = false

  function startRequest(purpose: 'agent' | 'vision', model: string): { finish: (result: RequestFinishInput) => ModelRequestRecord } {
    const currentSeq = ++seq
    const startedAt = Date.now()

    return {
      finish(result: RequestFinishInput): ModelRequestRecord {
        const record: ModelRequestRecord = {
          seq: currentSeq,
          purpose,
          model,
          startedAt,
          durationMs: Date.now() - startedAt,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          status: result.error ? 'error' : 'success',
          ...(result.error ? { error: result.error } : {}),
        }
        if (record.inputTokens === null || record.outputTokens === null) {
          hasUnknownUsage = true
        }
        records.push(record)
        return record
      },
    }
  }

  function summarize(): RequestTrackerSummary {
    const agentRecords = records.filter(r => r.purpose === 'agent')
    const visionRecords = records.filter(r => r.purpose === 'vision')
    const successes = records.filter(r => r.status === 'success')

    const totalInput = hasUnknownUsage ? null : records.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0)
    const totalOutput = hasUnknownUsage ? null : records.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0)
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
      avgInputTokensPerCall: totalInput !== null && records.length > 0
        ? Math.round(totalInput / records.length)
        : null,
      records: [...records],
    }
  }

  return { startRequest, summarize, get records() { return [...records] as readonly ModelRequestRecord[] } }
}

export type RequestTracker = ReturnType<typeof createRequestTracker>

interface RequestFinishInput {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly error?: string
}
