import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { inspectInput } from '../../execution/investigation/program.ts'
import {
  boundedHistoryPage,
  decisionMemory,
  historyPage,
  readToolResult,
} from './decision-memory.ts'
import type { HistoryEntry } from './compact-history.ts'

const original = JSON.parse(
  readFileSync(new URL('./fixtures/r0-overlay-dom-receipt.json', import.meta.url), 'utf8'),
)
const entry = (tools: unknown[], text = ''): HistoryEntry => ({
  text,
  toolResults: JSON.stringify(tools),
})
const dom = (selector = 'body *', result: object = { total: 21, nextOffset: 12 }) => ({
  payload: {
    toolName: 'page_inspect',
    args: { selector, offset: 0 },
    result: { elements: [{ text: 'x'.repeat(20000) }], ...result },
  },
})
function readAll(history: HistoryEntry[], ref: string) {
  let offset: number | null = 0,
    text = ''
  while (offset !== null) {
    const page = readToolResult(history, ref, offset)
    if ('error' in page) throw Error(page.error)
    text += page.chunk
    offset = page.nextOffset
  }
  return JSON.parse(text)
}

it('preserves the archived 8.0 query and DOM cursor; continuation and original retrieval use distinct offsets', () => {
  const history: HistoryEntry[] = Array.from({ length: 8 }, () => entry([]))
  history.push(entry([original]))
  const summary = JSON.parse(JSON.stringify(historyPage(history, 8, 1))).entries[0].tools[0]
  expect(summary).toMatchObject({
    tool: 'page_inspect',
    resultRef: '8.0',
    omitted: true,
    args: { selector: 'body *', offset: 0 },
    total: 21,
    nextOffset: 12,
  })
  expect(summary.elements).toBeUndefined()
  expect(
    inspectInput.parse({ selector: summary.args.selector, offset: summary.nextOffset }),
  ).toEqual({ selector: 'body *', offset: 12 })
  expect(readAll(history, summary.resultRef)).toEqual(original)
  const fragment = readToolResult(history, summary.resultRef)
  if ('error' in fragment) throw Error(fragment.error)
  expect(fragment.nextOffset).toBeGreaterThan(12)
  history.push(
    entry([
      { payload: { toolName: 'tool_result_read', args: { resultRef: '8.0' }, result: fragment } },
    ]),
  )
  const latest = JSON.parse(JSON.stringify(decisionMemory(history))).latestToolResults.tools[0]
  expect(latest).toMatchObject({
    resultRef: '8.0',
    receiptRef: '9.0',
    nextOffset: fragment.nextOffset,
    chunk: fragment.chunk,
  })
})

it('bounds parallel oversized DOM receipts without truncating queries or displacing the newest verification status', () => {
  const selector = '[data-label="' + '界'.repeat(380) + '"]'
  const critical = {
    payload: {
      toolName: 'page_act',
      result: {
        status: 'completed',
        verification: {
          itemId: 'selected-filter',
          outcome: 'unverified',
          reasonCode: 'target-unavailable',
        },
        inspection: { payload: 'x'.repeat(20000) },
      },
    },
  }
  const history = [entry([...Array.from({ length: 7 }, () => dom(selector)), critical])]
  const packet = JSON.parse(JSON.stringify(decisionMemory(history)))
  expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(8000)
  expect(packet.latestToolResults.tools).toHaveLength(8)
  for (const summary of packet.latestToolResults.tools.slice(0, 7)) {
    expect(summary).toMatchObject({
      omitted: true,
      args: { offset: 0 },
      queryOmitted: true,
      total: 21,
      nextOffset: 12,
    })
    expect(summary.args.selector).toBeUndefined()
  }
  expect(packet.latestToolResults.tools[7]).toMatchObject({
    status: 'completed',
    verification: {
      itemId: 'selected-filter',
      outcome: 'unverified',
      reasonCode: 'target-unavailable',
    },
  })
  expect(readAll(history, '0.0').payload.args.selector).toBe(selector)
})

it('retains pagination through the 1800-byte history fallback and marks queries that cannot fit it', () => {
  for (const selector of ['body *', 'div'.repeat(50)]) {
    const history = [
      entry(
        Array.from({ length: 8 }, () => dom(selector)),
        'x'.repeat(160),
      ),
    ]
    const page = JSON.parse(JSON.stringify(boundedHistoryPage(history, 0)))
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(1800)
    expect(page.entries[0].tools).toHaveLength(8)
    for (const summary of page.entries[0].tools) {
      expect(summary).toMatchObject({
        omitted: true,
        total: 21,
        nextOffset: 12,
        args: { offset: 0 },
      })
      if (selector === 'body *') expect(summary.args.selector).toBe(selector)
      else {
        expect(summary.queryOmitted).toBe(true)
        expect(summary.args.selector).toBeUndefined()
      }
      expect(readAll(history, summary.resultRef).payload.args.selector).toBe(selector)
    }
  }
})

it('does not guess absent pagination or hide errors, and preserves an explicit terminal null with omitted payload', () => {
  const error = {
    payload: {
      toolName: 'page_inspect',
      result: { error: true, message: 'Invalid selector', elements: [{ text: 'x'.repeat(20000) }] },
    },
  }
  const packet = JSON.parse(JSON.stringify(decisionMemory([entry([error])]))).latestToolResults
    .tools[0]
  expect(packet).toMatchObject({ omitted: true, error: 'Invalid selector', queryOmitted: true })
  for (const key of ['args', 'total', 'nextOffset']) expect(key in packet).toBe(false)
  const terminal = JSON.parse(
    JSON.stringify(decisionMemory([entry([dom('body *', { total: 21, nextOffset: null })])])),
  ).latestToolResults.tools[0]
  expect(terminal).toMatchObject({
    omitted: true,
    total: 21,
    nextOffset: null,
    args: { selector: 'body *', offset: 0 },
  })
  expect(terminal.elements).toBeUndefined()
})
