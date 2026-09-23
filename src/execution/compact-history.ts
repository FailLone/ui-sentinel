export interface HistoryEntry {
  readonly text: string
  readonly toolResults: string
}

export interface CompressedEntry {
  readonly text: string
  readonly tools: ReadonlyArray<ToolSummary>
}

export interface ToolSummary {
  readonly tool: string
  readonly resultRef?: string
  readonly receiptRef?: string
  readonly args?: unknown
  readonly id?: string
  readonly evidenceRefs?: readonly string[]
  readonly status?: string
  readonly outcomeText?: string
  readonly results?: unknown
  readonly url?: string
  readonly title?: string
  readonly error?: string
  readonly businessResult?: string
  readonly accepted?: boolean
  readonly blocked?: boolean
  readonly summary?: string
  readonly actionType?: string
  readonly noNewFacts?: boolean
  readonly staleWarning?: string
}

export interface HistoryCompressionConfig {
  readonly totalBudgetBytes: number
}

export const DEFAULT_HISTORY_CONFIG: Readonly<HistoryCompressionConfig> = {
  totalBudgetBytes: 8000,
}

const KEEP_KEYS = new Set([
  'url',
  'title',
  'error',
  'businessResult',
  'accepted',
  'blocked',
  'summary',
  'noNewFacts',
  'staleWarning',
  'staleCount',
  'hint',
  'actionType',
  'type',
  'phenomenon',
  'basis',
  'validationStatus',
  'severity',
  'hypothesisId',
  'findingId',
  'state',
  'unexploredBranches',
  'id',
  'evidenceRefs',
  'status',
  'verificationPlan',
  'elementCount',
  'selector',
  'ref',
  'stale',
  'snapshotId',
  'condition',
  'observedUntilMs',
  'startedAtMs',
  'samples',
  'target',
  'value',
  'outcomeText',
  'action',
  'eventType',
  'fromState',
  'toState',
  'missingFacts',
  'finishAdvice',
  'task',
  'applicability',
  'trigger',
  'sampleSummary',
  'resultRef',
  'receiptRef',
  'omitted',
  'chunk',
  'offset',
  'nextOffset',
  'totalChars',
  'format',
  'total',
  'start',
  'nextStart',
  'bindingId',
  'ruleId',
  'verdict',
  'checkId',
  'operationId',
  'reused',
])

/** One projection, also accepts its own output. Never discard action arguments. */
export function extractToolSummary(item: Record<string, unknown>): ToolSummary {
  const payload = item.payload as Record<string, unknown> | undefined
  const toolName = String(payload?.toolName ?? item.toolName ?? item.tool ?? item.name ?? 'unknown')
  const result = payload?.result ?? item.result ?? item
  const summary: Record<string, unknown> = { tool: toolName }
  const args = payload?.args ?? item.args ?? item.input
  if (args !== undefined) summary.args = args
  function copy(value: unknown) {
    if (!value || typeof value !== 'object') return
    for (const [key, field] of Object.entries(value)) {
      if (KEEP_KEYS.has(key)) summary[key] = field
      if (key === 'pageText') summary.outcomeText = field
    }
  }
  if (Array.isArray(result))
    summary.results = toolName === 'element_details' ? result.map(elementSummary) : result
  else {
    copy((result as Record<string, unknown> | null)?.observation)
    copy(result)
    if (result && typeof result === 'object' && 'results' in result)
      summary.results =
        toolName === 'checks_run' && Array.isArray(result.results)
          ? result.results.map((r: any) => ({
              ruleId: r.ruleId,
              verdict: r.verdict,
              severity: r.severity,
              title: r.title,
              expected: r.expected,
              actual: r.actual,
              evidenceRefs: r.evidenceRefs,
            }))
          : result.results
    if (result && typeof result === 'object' && 'entries' in result)
      summary.entries = result.entries
    if (
      result &&
      typeof result === 'object' &&
      'samples' in result &&
      Array.isArray(result.samples)
    ) {
      const samples = result.samples as { atMs: number; target: string; value: unknown }[]
      delete summary.samples
      summary.sampleSummary = {
        count: samples.length,
        firstAtMs: samples[0]?.atMs,
        lastAtMs: samples.at(-1)?.atMs,
        maxGapMs: Math.max(0, ...samples.slice(1).map((s, i) => s.atMs - samples[i]!.atMs)),
        targets: [...new Set(samples.map((s) => s.target))],
        values: [...new Set(samples.map((s) => s.value))],
      }
    }
  }
  return summary as unknown as ToolSummary
}

function elementSummary(element: any) {
  return {
    ref: element.ref,
    selector: element.selector,
    text: element.text,
    stale: element.stale,
    error: element.error,
    snapshotId: element.snapshotId,
    hit: element.hit ?? {
      sampled: element.hitSamples?.length ?? 0,
      blocked: element.hitSamples?.filter((s: any) => s.relation === 'unrelated').length ?? 0,
      blockers: [
        ...new Set(
          element.hitSamples
            ?.filter((s: any) => s.relation === 'unrelated')
            .map((s: any) => s.hitSelector) ?? [],
        ),
      ],
    },
    enabled: element.enabled ?? (element.attributes?.disabled === undefined ? undefined : false),
  }
}

function compressEntry(entry: HistoryEntry): CompressedEntry {
  let parsed: unknown[]
  try {
    const raw = JSON.parse(entry.toolResults)
    parsed = Array.isArray(raw) ? raw : []
  } catch {
    parsed = []
  }

  const tools = parsed.map((item) => {
    if (typeof item === 'object' && item !== null) {
      return extractToolSummary(item as Record<string, unknown>)
    }
    return { tool: 'unknown' } as ToolSummary
  })

  return {
    text: entry.text.length > 200 ? entry.text.slice(0, 197) + '...' : entry.text,
    tools,
  }
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export function compressHistory(
  entries: ReadonlyArray<HistoryEntry>,
  config: Partial<HistoryCompressionConfig> = {},
): ReadonlyArray<CompressedEntry> {
  const cfg = { ...DEFAULT_HISTORY_CONFIG, ...config }

  if (!Number.isInteger(cfg.totalBudgetBytes) || cfg.totalBudgetBytes < 2)
    throw new Error('History budget must be an integer of at least 2 bytes')
  if (entries.length === 0) return []

  const compressed = entries.map(compressEntry)
  // Keep whole entries, never cut IDs/arguments or silently produce invalid JSON.
  // All omitted entries remain retrievable through history_read.
  const selected: CompressedEntry[] = []
  for (let i = compressed.length - 1; i >= 0; i--) {
    const candidate = [compressed[i], ...selected]
    if (byteLength(JSON.stringify(candidate)) > cfg.totalBudgetBytes) break
    selected.unshift(compressed[i])
  }
  return selected
}
