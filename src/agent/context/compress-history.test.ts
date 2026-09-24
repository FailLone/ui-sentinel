import { describe, it, expect } from 'vitest'
import { compressHistory, type HistoryEntry } from './compact-history.ts'

function makeObserveResult(url = 'http://localhost:4173', title = 'Shop'): string {
  return JSON.stringify([
    {
      type: 'tool-result',
      payload: {
        toolName: 'page_observe',
        result: {
          snapshotId: 's1',
          url,
          title,
          viewport: { width: 1280, height: 768 },
          observedAt: '2026-09-22T00:00:00Z',
          screenshotRef: 'ref-1',
          elementCount: 8,
          elements: Array.from({ length: 8 }, (_, i) => ({
            ref: `e${i}`,
            selector: `div:nth-of-type(${i})`,
            tag: 'div',
            text: `Element ${i} with some content here`,
            visible: true,
            enabled: true,
            bounds: { x: 0, y: i * 50, width: 400, height: 40 },
            attributes: {},
            hit: { sampled: 5, self: 5, descendant: 0, blocked: 0, blockerRefs: [] },
          })),
          pageText: 'Welcome to the shop. Browse our products and add items to your cart.',
          evidenceRefs: ['art-1', 'art-2'],
        },
      },
    },
  ])
}

function makeActResult(url = 'http://localhost:4173/cart'): string {
  return JSON.stringify([
    {
      type: 'tool-result',
      payload: {
        toolName: 'page_act',
        result: {
          observation: {
            snapshotId: 's2',
            url,
            title: 'Cart',
            viewport: { width: 1280, height: 768 },
            observedAt: '2026-09-22T00:00:01Z',
            screenshotRef: 'ref-2',
            elementCount: 5,
            elements: Array.from({ length: 5 }, (_, i) => ({
              ref: `e${i}`,
              selector: `button:nth-of-type(${i})`,
              tag: 'button',
              text: `Button ${i}`,
              visible: true,
              enabled: true,
              bounds: { x: 0, y: i * 40, width: 200, height: 35 },
              attributes: {},
              hit: { sampled: 5, self: 5, descendant: 0, blocked: 0, blockerRefs: [] },
            })),
            pageText: 'Your cart has 2 items. Total: $59.98',
          },
          evidenceRefs: ['art-3', 'art-4'],
        },
      },
    },
  ])
}

function makeFinishResult(): string {
  return JSON.stringify([
    {
      type: 'tool-result',
      payload: {
        toolName: 'run_finish',
        result: { businessResult: 'success', accepted: true },
      },
    },
  ])
}

function makeHypothesisResult(): string {
  return JSON.stringify([
    {
      type: 'tool-result',
      payload: {
        toolName: 'hypotheses_record',
        result: {
          hypothesisId: 'h-1',
          phenomenon: 'Overlay blocks checkout',
          basis: 'visual observation',
        },
      },
    },
  ])
}

describe('compressHistory', () => {
  it('returns empty for empty input', () => {
    expect(compressHistory([])).toEqual([])
  })

  it('strips observation data (elements, pageText, viewport) from entries', () => {
    const entries: HistoryEntry[] = [
      { text: 'Observing the page', toolResults: makeObserveResult() },
    ]
    const result = compressHistory(entries)
    expect(result).toHaveLength(1)

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('elements')
    expect(serialized).not.toContain('pageText')
    expect(serialized).not.toContain('viewport')
    expect(serialized).not.toContain('screenshotRef')
  })

  it('preserves key decision fields (url, title, error, businessResult)', () => {
    const entries: HistoryEntry[] = [{ text: 'Checking out', toolResults: makeFinishResult() }]
    const result = compressHistory(entries)
    const tools = result[0].tools
    expect(tools[0].tool).toBe('run_finish')
    expect(tools[0].businessResult).toBe('success')
    expect(tools[0].accepted).toBe(true)
  })

  it('preserves url from page_observe results', () => {
    const entries: HistoryEntry[] = [
      {
        text: 'Looking at cart',
        toolResults: makeObserveResult('http://localhost:4173/cart', 'Cart'),
      },
    ]
    const result = compressHistory(entries)
    expect(result[0].tools[0].url).toBe('http://localhost:4173/cart')
    expect(result[0].tools[0].title).toBe('Cart')
  })

  it('extracts url from nested observation in page_act results', () => {
    const entries: HistoryEntry[] = [
      { text: '', toolResults: makeActResult('http://localhost:4173/checkout') },
    ]
    const result = compressHistory(entries)
    expect(result[0].tools[0].url).toBe('http://localhost:4173/checkout')
  })

  it('preserves agent reasoning text', () => {
    const entries: HistoryEntry[] = [
      { text: 'I need to click the checkout button', toolResults: makeObserveResult() },
    ]
    const result = compressHistory(entries)
    expect(result[0].text).toBe('I need to click the checkout button')
  })

  it('keeps hypothesis and finding fields', () => {
    const entries: HistoryEntry[] = [
      { text: 'Recording hypothesis', toolResults: makeHypothesisResult() },
    ]
    const result = compressHistory(entries)
    expect(result[0].tools[0].tool).toBe('hypotheses_record')
  })

  it('produces output well under budget for typical history', () => {
    const entries: HistoryEntry[] = [
      { text: 'Observing home page', toolResults: makeObserveResult() },
      { text: 'Clicking add to cart', toolResults: makeActResult() },
      {
        text: 'Observing cart page',
        toolResults: makeObserveResult('http://localhost:4173/cart', 'Cart'),
      },
      {
        text: 'Proceeding to checkout',
        toolResults: makeActResult('http://localhost:4173/checkout'),
      },
    ]

    const rawSize = entries.reduce((s, e) => s + e.text.length + e.toolResults.length, 0)
    expect(rawSize).toBeGreaterThan(8000)

    const compressed = compressHistory(entries)
    const compressedSize = new TextEncoder().encode(JSON.stringify(compressed)).length
    expect(compressedSize).toBeLessThan(8000)
  })

  it('handles 6 entries (expanded window) within budget', () => {
    const entries: HistoryEntry[] = Array.from({ length: 6 }, (_, i) => ({
      text: `Step ${i}: navigating to page ${i}`,
      toolResults: makeObserveResult(`http://localhost:4173/page${i}`, `Page ${i}`),
    }))

    const compressed = compressHistory(entries)
    expect(compressed).toHaveLength(6)
    const compressedSize = new TextEncoder().encode(JSON.stringify(compressed)).length
    expect(compressedSize).toBeLessThan(8000)
  })

  it('does not lose tool names from any entry', () => {
    const entries: HistoryEntry[] = [
      { text: 'Observe', toolResults: makeObserveResult() },
      { text: 'Act', toolResults: makeActResult() },
      { text: 'Hypothesis', toolResults: makeHypothesisResult() },
      { text: 'Finish', toolResults: makeFinishResult() },
    ]
    const result = compressHistory(entries)
    const toolNames = result.flatMap((r) => r.tools.map((t) => t.tool))
    expect(toolNames).toEqual(['page_observe', 'page_act', 'hypotheses_record', 'run_finish'])
  })

  it('handles malformed toolResults gracefully', () => {
    const entries: HistoryEntry[] = [
      { text: 'Broken', toolResults: 'not json at all' },
      { text: 'OK', toolResults: makeObserveResult() },
    ]
    const result = compressHistory(entries)
    expect(result).toHaveLength(2)
    expect(result[0].tools).toEqual([])
    expect(result[1].tools[0].tool).toBe('page_observe')
  })

  it('truncates long agent text to preserve budget', () => {
    const longText = 'A'.repeat(300)
    const entries: HistoryEntry[] = [{ text: longText, toolResults: makeObserveResult() }]
    const result = compressHistory(entries)
    expect(result[0].text.length).toBeLessThanOrEqual(200)
    expect(result[0].text).toContain('...')
  })

  it('preserves error information from failed actions', () => {
    const errorResult = JSON.stringify([
      {
        type: 'tool-result',
        payload: {
          toolName: 'page_act',
          result: {
            error: 'target required',
            observation: {
              snapshotId: 's1',
              url: 'http://localhost:4173',
              title: 'Shop',
              elements: [],
              pageText: 'text',
              viewport: { width: 1280, height: 768 },
            },
            evidenceRefs: ['art-1'],
          },
        },
      },
    ])
    const entries: HistoryEntry[] = [{ text: 'Failed click', toolResults: errorResult }]
    const result = compressHistory(entries)
    expect(result[0].tools[0].error).toBe('target required')
    expect(result[0].tools[0].url).toBe('http://localhost:4173')
  })
})

it('preserves arguments, hypothesis IDs and evidence through both projection passes', async () => {
  const { compactToolResults } = await import('../../execution/executor.ts')
  const data = [
    {
      payload: {
        toolName: 'hypotheses_record',
        args: { phenomenon: 'blocked' },
        result: {
          id: 'hyp-1',
          evidenceRefs: ['shot-1', 'snapshot-1'],
          elements: 'x'.repeat(20000),
        },
      },
    },
  ]
  const result = compressHistory([{ text: '', toolResults: compactToolResults(data) }])
  expect(result[0].tools[0]).toMatchObject({
    args: { phenomenon: 'blocked' },
    id: 'hyp-1',
    evidenceRefs: ['shot-1', 'snapshot-1'],
  })
})
it('enforces byte budget even with multibyte oversized results', () => {
  const entries = Array.from({ length: 10 }, () => ({
    text: '',
    toolResults: JSON.stringify([
      {
        tool: 'page_act',
        args: { value: '输入'.repeat(5000) },
        result: { error: '失败'.repeat(5000) },
      },
    ]),
  }))
  expect(
    Buffer.byteLength(JSON.stringify(compressHistory(entries, { totalBudgetBytes: 1000 }))),
  ).toBeLessThanOrEqual(1000)
})
