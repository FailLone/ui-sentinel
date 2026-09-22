import { describe, it, expect } from 'vitest'
import { classifyResponse, summarizeProgress } from './progress-classifier.ts'

describe('classifyResponse', () => {
  it('classifies page_act as action', () => {
    const c = classifyResponse({ text: 'clicking', toolResults: [{ toolName: 'page_act' }] })
    expect(c.category).toBe('action')
    expect(c.basis).toContain('page_act')
  })

  it('classifies run_finish as finish', () => {
    const c = classifyResponse({ toolResults: [{ toolName: 'run_finish' }] })
    expect(c.category).toBe('finish')
  })

  it('classifies findings_submit as finding', () => {
    const c = classifyResponse({ toolResults: [{ toolName: 'findings_submit' }] })
    expect(c.category).toBe('finding')
  })

  it('classifies hypotheses_record as hypothesis', () => {
    const c = classifyResponse({ toolResults: [{ toolName: 'hypotheses_record' }] })
    expect(c.category).toBe('hypothesis')
  })

  it('classifies transition_observe as action', () => {
    const c = classifyResponse({ toolResults: [{ toolName: 'transition_observe' }] })
    expect(c.category).toBe('action')
    expect(c.basis).toContain('measurement')
  })

  it('classifies page_observe alone as observe-only', () => {
    const c = classifyResponse({ toolResults: [{ toolName: 'page_observe' }] })
    expect(c.category).toBe('observe-only')
  })

  it('classifies text-only as judgment', () => {
    const c = classifyResponse({ text: 'I think the button is obscured', toolResults: [] })
    expect(c.category).toBe('judgment')
    expect(c.basis).toContain('text response')
  })

  it('classifies empty response as no-progress', () => {
    const c = classifyResponse({ toolResults: [] })
    expect(c.category).toBe('no-progress')
    expect(c.basis).toContain('empty')
  })

  it('classifies empty text and no tools as no-progress', () => {
    const c = classifyResponse({ text: '', toolResults: [] })
    expect(c.category).toBe('no-progress')
  })

  it('prioritizes run_finish over page_act when both called', () => {
    const c = classifyResponse({
      toolResults: [{ toolName: 'page_act' }, { toolName: 'run_finish' }],
    })
    expect(c.category).toBe('finish')
  })

  it('prioritizes page_act over page_observe', () => {
    const c = classifyResponse({
      toolResults: [{ toolName: 'page_observe' }, { toolName: 'page_act' }],
    })
    expect(c.category).toBe('action')
  })

  it('handles dot-notation tool names', () => {
    const c = classifyResponse({ toolResults: [{ toolName: 'page.act' }] })
    expect(c.category).toBe('action')
  })

  it('extracts tool name from various field names', () => {
    expect(classifyResponse({ toolResults: [{ name: 'page_act' }] }).category).toBe('action')
    expect(classifyResponse({ toolResults: [{ tool: 'run_finish' }] }).category).toBe('finish')
  })

  it('extracts tool name from Mastra ToolResultChunk payload', () => {
    const c = classifyResponse({
      text: 'Adding to cart',
      toolResults: [
        {
          type: 'tool-result',
          payload: { toolName: 'page_act', args: { type: 'click' }, result: {} },
        },
      ],
    })
    expect(c.category).toBe('action')
  })

  it('handles mixed Mastra tool results', () => {
    const c = classifyResponse({
      toolResults: [
        { type: 'tool-result', payload: { toolName: 'page_observe' } },
        { type: 'tool-result', payload: { toolName: 'page_act' } },
      ],
    })
    expect(c.category).toBe('action')
  })
})

describe('summarizeProgress', () => {
  it('computes rates correctly', () => {
    const classifications = [
      classifyResponse({ toolResults: [{ toolName: 'page_observe' }] }),
      classifyResponse({ toolResults: [{ toolName: 'page_act' }] }),
      classifyResponse({ toolResults: [{ toolName: 'page_act' }] }),
      classifyResponse({ text: 'thinking', toolResults: [] }),
      classifyResponse({ toolResults: [{ toolName: 'run_finish' }] }),
    ]

    const summary = summarizeProgress(classifications)
    expect(summary.totalResponses).toBe(5)
    expect(summary.categories.action).toBe(2)
    expect(summary.categories['observe-only']).toBe(1)
    expect(summary.categories.judgment).toBe(1)
    expect(summary.categories.finish).toBe(1)
    expect(summary.effectiveActionRate).toBeCloseTo(3 / 5)
    expect(summary.noProgressRate).toBe(0)
  })

  it('handles empty classifications', () => {
    const summary = summarizeProgress([])
    expect(summary.totalResponses).toBe(0)
    expect(summary.effectiveActionRate).toBeNull()
    expect(summary.noProgressRate).toBeNull()
  })
})
