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

const OBSERVATION_STRIP_KEYS = new Set([
  'elements', 'pageText', 'viewport', 'screenshotRef', 'observedAt',
  'snapshotId', 'elementCount', 'evidenceRefs', 'bounds', 'attributes',
  'hit', 'hitSamples', 'tag', 'visible', 'enabled', 'ref', 'selector', 'text',
])

const KEEP_KEYS = new Set([
  'url', 'title', 'error', 'businessResult', 'accepted', 'blocked',
  'summary', 'noNewFacts', 'staleWarning', 'staleCount', 'hint',
  'actionType', 'type', 'phenomenon', 'basis', 'validationStatus',
  'severity', 'hypothesisId', 'findingId', 'state', 'unexploredBranches',
])

function extractToolSummary(item: Record<string, unknown>): ToolSummary {
  const payload = item.payload as Record<string, unknown> | undefined
  const toolName = String(payload?.toolName ?? item.toolName ?? item.tool ?? item.name ?? 'unknown')
  const result = (payload?.result ?? item.result) as Record<string, unknown> | undefined

  const summary: Record<string, unknown> = { tool: toolName }

  if (result && typeof result === 'object') {
    if ('observation' in result && typeof result.observation === 'object' && result.observation !== null) {
      const obs = result.observation as Record<string, unknown>
      for (const key of Object.keys(obs)) {
        if (KEEP_KEYS.has(key)) summary[key] = obs[key]
      }
      if (result.error) summary.error = String(result.error)
    } else {
      for (const key of Object.keys(result)) {
        if (KEEP_KEYS.has(key)) summary[key] = result[key]
      }
    }
  }

  return summary as unknown as ToolSummary
}

function compressEntry(entry: HistoryEntry): CompressedEntry {
  let parsed: unknown[]
  try {
    const raw = JSON.parse(entry.toolResults)
    parsed = Array.isArray(raw) ? raw : []
  } catch {
    parsed = []
  }

  const tools = parsed.map(item => {
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

  if (entries.length === 0) return []

  const compressed = entries.map(compressEntry)
  const serialized = JSON.stringify(compressed)

  if (byteLength(serialized) <= cfg.totalBudgetBytes) return compressed

  const trimmed = compressed.map((entry, i) => {
    if (i === compressed.length - 1) return entry
    return {
      ...entry,
      text: entry.text.length > 80 ? entry.text.slice(0, 77) + '...' : entry.text,
    }
  })

  return trimmed
}
