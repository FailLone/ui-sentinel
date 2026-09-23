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
function projection(item: Record<string, unknown>, receiptRef: string) {
  const summary = extractToolSummary(item)
  // A read cursor belongs to the original payload, not the newer receipt containing it.
  return {
    ...summary,
    resultRef: summary.tool === 'tool_result_read' ? (summary.resultRef ?? receiptRef) : receiptRef,
    receiptRef,
  }
}
function receipt(item: Record<string, unknown>, resultRef: string, budget: number) {
  const summary = projection(item, resultRef)
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
export function readToolResult(history: readonly HistoryEntry[], ref: string, offset = 0) {
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
    const length = Buffer.byteLength(JSON.stringify(char)) - 2
    if (size + length > 1000) break
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
/** A tool page is bounded before delivery, with an explicit continuation cursor. */
export function boundedHistoryPage(history: readonly HistoryEntry[], start: number, count = 1) {
  const page = historyPage(history, start, count)
  while (bytes(page) > 1800 && page.entries.length > 1) {
    page.entries.pop()
    page.nextStart = start + page.entries.length
  }
  if (bytes(page) > 1800 && page.entries.length) {
    const entry = page.entries[0]!
    entry.text = ''
    entry.tools = entry.tools.map((t) => ({
      tool: t.tool.slice(0, 30),
      resultRef: t.resultRef,
      receiptRef: 'receiptRef' in t ? t.receiptRef : t.resultRef,
      omitted: true,
      id: t.id && Buffer.byteLength(t.id) <= 100 ? t.id : undefined,
    }))
  }
  if (bytes(page) > 1800) throw new Error('history-page-budget-contract')
  return page
}

/** Fresh replies are allocated together. Retrieval payloads must never become references to themselves. */
export function decisionMemory(history: readonly HistoryEntry[]) {
  const last = history.length - 1
  const items = last >= 0 ? rawTools(history[last]!).slice(0, 8) : []
  let latest =
    last >= 0
      ? {
          index: last,
          text: history[last]!.text.slice(0, 160),
          totalTools: rawTools(history[last]!).length,
          nextToolIndex: rawTools(history[last]!).length > 8 ? 8 : null,
          tools: items.map((item, i) => receipt(item, `${last}.${i}`, 0)),
        }
      : null
  const isRead = (item: Record<string, unknown>) =>
    ['history_read', 'tool_result_read'].includes(extractToolSummary(item).tool)
  const order = items
    .map((_, i) => i)
    .sort((a, b) => Number(isRead(items[b]!)) - Number(isRead(items[a]!)))
  for (const i of order) {
    const complete = projection(items[i]!, `${last}.${i}`)
    const candidate = { ...latest!, tools: latest!.tools.map((t, n) => (n === i ? complete : t)) }
    if (bytes({ latestToolResults: candidate, history: [] }) <= MEMORY_BUDGET_BYTES)
      latest = candidate
    else if (isRead(items[i]!)) throw new Error('retrieval-delivery-budget-contract')
  }
  const older = [] as ReturnType<typeof historyPage>['entries']
  for (let i = last - 1; i >= Math.max(0, last - 5); i--) {
    const entry = historyPage(history, i, 1).entries[0]!
    if (bytes({ latestToolResults: latest, history: [entry, ...older] }) > MEMORY_BUDGET_BYTES)
      break
    older.unshift(entry)
  }
  return { latestToolResults: latest, history: older }
}

/** Durable finding facts survive navigation and recovery without replaying their whole history. */
export function findingMemory(
  findings: readonly {
    id: string
    title: string
    actual: string
    source: string
    validationStatus: string
    evidenceRefs: readonly string[]
  }[],
) {
  const items: {
    id: string
    title: string
    actual: string
    source: string
    validationStatus: string
    evidenceRefs: string[]
  }[] = []
  for (const f of [...findings].reverse()) {
    const item = {
      id: f.id,
      source: f.source,
      validationStatus: f.validationStatus,
      title: f.title.slice(0, 100),
      actual: f.actual.slice(0, 200),
      evidenceRefs: f.evidenceRefs.slice(0, 2),
    }
    const candidate = {
      total: findings.length,
      omitted: findings.length - items.length - 1,
      items: [...items, item],
    }
    if (bytes(candidate) > 2000) break
    items.push(item)
  }
  return { total: findings.length, omitted: findings.length - items.length, items }
}
