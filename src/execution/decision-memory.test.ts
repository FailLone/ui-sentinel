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
    reconstructed = ''
  while (offset !== null) {
    const result = readToolResult(history, '0.0', offset)
    if ('error' in result) throw new Error(result.error)
    history.push(entry('tool_result_read', result, { resultRef: '0.0', offset }))
    const packet = JSON.parse(JSON.stringify(decisionMemory(history)))
    expect(packet.latestToolResults.tools[0].chunk).toBe(result.chunk)
    expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(8000)
    reconstructed += packet.latestToolResults.tools[0].chunk
    offset = result.nextOffset
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
