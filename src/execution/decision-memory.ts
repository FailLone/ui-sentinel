import { extractToolSummary, type HistoryEntry } from './compact-history.ts'

export const MEMORY_BUDGET_BYTES = 8000
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value))
export function rawTools(entry: HistoryEntry): Record<string, unknown>[] {
  try {
    const result = JSON.parse(entry.toolResults)
    return Array.isArray(result) ? result : []
  } catch {
    return []
  }
}
function receipt(item: Record<string, unknown>, resultRef: string, budget: number) {
  const summary = { ...extractToolSummary(item), resultRef }
  if (bytes(summary) <= budget) return summary
  // Never make a missing payload look like an empty successful result.
  const short = {
    tool: summary.tool.slice(0, 80),
    resultRef,
    omitted: true,
    status: summary.status?.slice(0, 80),
    id: summary.id?.slice(0, 100),
    accepted: summary.accepted,
    hint: 'Payload exceeds this page. Use tool_result_read(resultRef) for the original result.',
  }
  return short
}
export function historyPage(history: readonly HistoryEntry[], start: number, count: number) {
  const end = Math.min(history.length, start + count)
  const entries = history.slice(start, end).map((entry, offset) => {
    const index = start + offset
    const items = rawTools(entry)
    return {
      index,
      text: entry.text.slice(0, 160),
      totalTools: items.length,
      nextToolIndex: items.length > 8 ? 8 : null,
      tools: items
        .slice(0, 8)
        .map((item, i) =>
          receipt(item, `${index}.${i}`, Math.floor(4500 / Math.max(1, count * items.length))),
        ),
    }
  })
  return { total: history.length, start, nextStart: end < history.length ? end : null, entries }
}
export function readToolResult(history: readonly HistoryEntry[], ref: string, offset: number) {
  const match = /^(\d+)\.(\d+)$/.exec(ref)
  if (!match) return { error: 'Invalid resultRef' }
  const entry = history[Number(match[1])]
  const item = entry && rawTools(entry)[Number(match[2])]
  if (!item) return { error: 'Unknown resultRef' }
  const raw = JSON.stringify(item)
  if (offset < 0 || offset > raw.length) return { error: 'Offset outside result' }
  let chunk = '',
    size = 0
  for (const char of raw.slice(offset)) {
    const length = Buffer.byteLength(char)
    if (size + length > 1600) break
    chunk += char
    size += length
  }
  const next = offset + chunk.length
  return {
    resultRef: ref,
    offset,
    totalChars: raw.length,
    chunk,
    nextOffset: next < raw.length ? next : null,
    format: 'JSON fragment; follow nextOffset to read the remaining data',
  }
}
/** Fresh receipts have priority; older history can be paged, never substituted for them. */
export function decisionMemory(history: readonly HistoryEntry[]) {
  const last = history.length - 1
  const latest = last >= 0 ? historyPage(history, last, 1).entries[0] : null
  const older = [] as ReturnType<typeof historyPage>['entries']
  for (let i = last - 1; i >= Math.max(0, last - 5); i--) {
    const entry = historyPage(history, i, 1).entries[0]!
    if (bytes({ latestToolResults: latest, history: [entry, ...older] }) > MEMORY_BUDGET_BYTES)
      break
    older.unshift(entry)
  }
  return { latestToolResults: latest, history: older }
}
