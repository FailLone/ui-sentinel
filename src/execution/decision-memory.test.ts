import { it, expect } from 'vitest'
import { decisionMemory, historyPage, readToolResult } from './decision-memory.ts'
import type { HistoryEntry } from './compact-history.ts'
const entry = (toolName: string, result: unknown, args = {}): HistoryEntry => ({
  text: '',
  toolResults: JSON.stringify([{ payload: { toolName, args, result } }]),
})
it('delivers queried history in the next actual decision packet, not just the query arguments', () => {
  const history = [
    entry('hypotheses_record', {
      id: 'hyp-owned',
      phenomenon: 'blocked',
      evidenceRefs: ['screenshot', 'snapshot'],
    }),
  ]
  const retrieved = historyPage(history, 0, 1)
  history.push(entry('history_read', retrieved, { start: 0, count: 1 }))
  const sent = JSON.parse(JSON.stringify(decisionMemory(history)))
  expect(sent.latestToolResults.tools[0].entries[0].tools[0]).toMatchObject({
    id: 'hyp-owned',
    evidenceRefs: ['screenshot', 'snapshot'],
  })
})
it('retains usable obstruction facts when raw hit samples and checks exceed 8KB', () => {
  const blocker = 'html > ' + 'div:nth-of-type(1) > '.repeat(30) + 'div'
  const details = [1, 2, 3].map((i) => ({
    ref: `e${i}`,
    selector: `button:nth-of-type(${i})`,
    text: i === 3 ? 'Close' : 'Pay',
    hitSamples: Array.from({ length: 5 }, () => ({
      relation: i === 3 ? 'self' : 'unrelated',
      hitSelector: blocker,
      blockerBounds: { x: 0, y: 0, width: 1280, height: 720 },
    })),
  }))
  const raw = entry('element_details', details)
  expect(Buffer.byteLength(raw.toolResults)).toBeGreaterThan(8000)
  const sent = JSON.parse(JSON.stringify(decisionMemory([raw])))
  expect(sent.latestToolResults.tools[0].results[0]).toMatchObject({
    selector: 'button:nth-of-type(1)',
    hit: { sampled: 5, blocked: 5 },
  })
  expect(sent.latestToolResults.tools[0].results[2].text).toBe('Close')
  expect(Buffer.byteLength(JSON.stringify(sent))).toBeLessThanOrEqual(8000)
})
it('keeps receipts for oversized results and delivers every paginated UTF-8 fragment', () => {
  const history = [entry('unknown-tool', { error: '输入😀'.repeat(2000) })]
  const sent = JSON.parse(JSON.stringify(decisionMemory(history)))
  expect(sent.latestToolResults.tools[0]).toMatchObject({ resultRef: '0.0', omitted: true })
  let offset: number | null = 0,
    reference = '0.0',
    reconstructed = ''
  while (offset !== null) {
    const result = readToolResult(history, reference, offset)
    if ('error' in result) throw new Error(result.error)
    history.push(entry('tool_result_read', result, { resultRef: '0.0', offset }))
    const packet = JSON.parse(JSON.stringify(decisionMemory(history)))
    expect(packet.latestToolResults.tools[0].chunk).toBe(result.chunk)
    expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(8000)
    reconstructed += packet.latestToolResults.tools[0].chunk
    expect(packet.latestToolResults.tools[0].resultRef).toBe('0.0')
    expect(packet.latestToolResults.tools[0].receiptRef).toBe(`${history.length - 1}.0`)
    reference = packet.latestToolResults.tools[0].resultRef
    offset = packet.latestToolResults.tools[0].nextOffset
  }
  expect(JSON.parse(reconstructed)).toEqual(JSON.parse(history[0]!.toolResults)[0])
})
it('bounded receipts do not lose the newest result even when prior history is enormous', () => {
  const history = Array.from({ length: 8 }, () =>
    entry('checks_run', { results: [{ actual: '数据'.repeat(9000) }] }),
  )
  history.push(
    entry('run_finish', {
      accepted: false,
      error: 'inspection-incomplete',
      missingFacts: ['hypothesis:h1:open'],
    }),
  )
  const packet = JSON.parse(JSON.stringify(decisionMemory(history)))
  expect(packet.latestToolResults.tools[0].missingFacts).toEqual(['hypothesis:h1:open'])
  expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(8000)
})
it('delivers three parallel retrieval pages without replacing them with self-references', () => {
  const history = [entry('unknown-tool', { error: '\\\\\"'.repeat(6000) })]
  const results = [0, 1, 2].map(() => {
    const result = readToolResult(history, '0.0')
    if ('error' in result) throw Error(result.error)
    expect(Number.isInteger(result.nextOffset)).toBe(true)
    return { payload: { toolName: 'tool_result_read', args: { resultRef: '0.0' }, result } }
  })
  history.push({ text: '', toolResults: JSON.stringify(results) })
  const packet = JSON.parse(JSON.stringify(decisionMemory(history)))
  for (const result of packet.latestToolResults.tools) {
    expect(result.chunk).toBe(results[0]!.payload.result.chunk)
    expect(result.omitted).not.toBe(true)
    expect(result.nextOffset).toBeGreaterThan(0)
  }
  expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(8000)
})
it('bounds history pages at the source and retains all three freshly retrieved pages', async () => {
  const { boundedHistoryPage } = await import('./decision-memory.ts')
  const history = Array.from({ length: 9 }, (_, i) =>
    entry('hypotheses_record', {
      id: `hyp-${i}`,
      phenomenon: 'observed issue '.repeat(80),
      evidenceRefs: ['owned-shot', 'owned-snapshot'],
    }),
  )
  const results = [0, 3, 6].map((start) => ({
    payload: {
      toolName: 'history_read',
      args: { start, count: 3 },
      result: boundedHistoryPage(history, start, 3),
    },
  }))
  for (const r of results)
    expect(Buffer.byteLength(JSON.stringify(r.payload.result))).toBeLessThanOrEqual(1800)
  history.push({ text: '', toolResults: JSON.stringify(results) })
  const packet = JSON.parse(JSON.stringify(decisionMemory(history)))
  expect(packet.latestToolResults.tools).toHaveLength(3)
  for (const result of packet.latestToolResults.tools) {
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.omitted).not.toBe(true)
  }
  expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(8000)
})

it('preserves the original payload cursor through history_read as well as fresh delivery', () => {
  const history = [entry('unknown-tool', { error: 'x'.repeat(4000) })]
  const first = readToolResult(history, '0.0')
  if ('error' in first) throw Error(first.error)
  history.push(entry('tool_result_read', first, { resultRef: '0.0' }))
  const page = historyPage(history, 1, 1)
  expect(page.entries[0]!.tools[0]).toMatchObject({ resultRef: '0.0', receiptRef: '1.0' })
  history.push(entry('history_read', page, { start: 1 }))
  const packet = JSON.parse(JSON.stringify(decisionMemory(history)))
  const cursor = packet.latestToolResults.tools[0].entries[0].tools[0]
  const next = readToolResult(history, cursor.resultRef, cursor.nextOffset)
  if ('error' in next) throw Error(next.error)
  expect(next.totalChars).toBe(first.totalChars)
  expect(next.offset).toBe(first.nextOffset)
})

it('bounds durable finding summaries and explicitly accounts for omitted findings', async () => {
  const { findingMemory } = await import('./decision-memory.ts')
  const findings = Array.from({ length: 20 }, (_, i) => ({
    id: `finding-${i}`,
    source: 'rule',
    validationStatus: 'supported',
    title: '遮挡'.repeat(100),
    actual: '不可操作😀'.repeat(200),
    evidenceRefs: ['screen.png', 'facts.json'],
  }))
  const memory = findingMemory(findings)
  expect(Buffer.byteLength(JSON.stringify(memory))).toBeLessThanOrEqual(2000)
  expect(memory.items.length).toBeGreaterThan(0)
  expect(memory.items[0]!.id).toBe('finding-19')
  expect(memory.omitted + memory.items.length).toBe(20)
})
