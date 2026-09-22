import { describe, it, expect } from 'vitest'
import { compactToolResults } from './executor.ts'

describe('compactToolResults', () => {
  it('preserves small tool results as-is', () => {
    const small = [{ type: 'tool-result', payload: { toolName: 'page_observe', result: { url: 'http://localhost', title: 'Shop' } } }]
    const result = compactToolResults(small)
    expect(JSON.parse(result)).toEqual(small)
  })

  it('produces valid JSON even for oversized results', () => {
    const bigSnapshot = {
      elements: Array.from({ length: 200 }, (_, i) => ({
        selector: `html > body > div:nth-of-type(${i}) > button`,
        hitSamples: Array.from({ length: 5 }, () => ({
          x: Math.random() * 1000,
          y: Math.random() * 800,
          hitSelector: `html > body > div:nth-of-type(${i}) > button`,
          relation: 'self',
        })),
      })),
      url: 'http://localhost:4173/checkout',
      title: 'Checkout',
      elementCount: 200,
    }
    const oversized = [{ type: 'tool-result', payload: { toolName: 'page_observe', result: bigSnapshot } }]
    expect(JSON.stringify(oversized).length).toBeGreaterThan(8000)

    const result = compactToolResults(oversized)
    const parsed = JSON.parse(result)
    expect(parsed).toBeDefined()
    expect(parsed[0].tool).toBe('page_observe')
    expect(parsed[0].url).toBe('http://localhost:4173/checkout')
    expect(parsed[0].title).toBe('Checkout')
    expect(parsed[0].elementCount).toBe(200)
  })

  it('never produces truncated JSON (the original bug)', () => {
    const huge = [{
      type: 'tool-result',
      payload: {
        toolName: 'page_act',
        result: {
          snapshot: { text: 'A'.repeat(20000), elements: [] },
          url: 'http://localhost:4173',
          businessResult: 'success',
        },
      },
    }]
    const result = compactToolResults(huge)
    expect(() => JSON.parse(result)).not.toThrow()
  })

  it('extracts Mastra payload.toolName for summaries', () => {
    const mastra = [
      { type: 'tool-result', payload: { toolName: 'run_finish', result: { businessResult: 'success', blocked: false, accepted: true } } },
    ]
    const bigPayload = [
      ...mastra,
      { type: 'tool-result', payload: { toolName: 'page_observe', result: { elements: Array.from({ length: 500 }, () => ({ data: 'x'.repeat(50) })) } } },
    ]
    const result = compactToolResults(bigPayload)
    const parsed = JSON.parse(result)
    expect(parsed[0].tool).toBe('run_finish')
    expect(parsed[0].businessResult).toBe('success')
    expect(parsed[1].tool).toBe('page_observe')
  })

  it('handles empty tool results', () => {
    expect(JSON.parse(compactToolResults([]))).toEqual([])
    expect(JSON.parse(compactToolResults(null))).toBeNull()
  })
})
