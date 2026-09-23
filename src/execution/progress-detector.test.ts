import { describe, it, expect } from 'vitest'
import { createProgressDetector, type ProgressFacts } from './progress-detector.ts'

const baseFacts: ProgressFacts = {
  pageUrl: 'http://localhost:4173/checkout',
  hypothesisIds: new Set(),
  findingIds: new Set(),
  businessResponseCount: 0,
  activeTransitionDeadline: null,
}

const noToolClass = { category: 'no-progress', toolsCalled: [] as string[] }
const actionClass = { category: 'action', toolsCalled: ['page.act'] }
const observeClass = { category: 'observe-only', toolsCalled: ['page.observe'] }

describe('createProgressDetector', () => {
  it('detects URL change as progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    const result = pd.check(
      { ...baseFacts, pageUrl: 'http://localhost:4173/confirm' },
      noToolClass,
      [],
    )
    expect(result.isProgress).toBe(true)
    expect(result.basis).toContain('URL changed')
  })

  it('detects new hypothesis as progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    const result = pd.check(
      { ...baseFacts, hypothesisIds: new Set(['h-1']) },
      noToolClass,
      [],
    )
    expect(result.isProgress).toBe(true)
    expect(result.basis).toContain('hypothesis')
  })

  it('does not count repeated hypothesis as progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    pd.check({ ...baseFacts, hypothesisIds: new Set(['h-1']) }, noToolClass, [])
    const result = pd.check(
      { ...baseFacts, hypothesisIds: new Set(['h-1']) },
      noToolClass,
      [],
    )
    expect(result.isProgress).toBe(false)
  })

  it('detects new finding as progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    const result = pd.check(
      { ...baseFacts, findingIds: new Set(['f-1']) },
      noToolClass,
      [],
    )
    expect(result.isProgress).toBe(true)
    expect(result.basis).toContain('finding')
  })

  it('detects business response as progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    const result = pd.check(
      { ...baseFacts, businessResponseCount: 1 },
      noToolClass,
      [],
    )
    expect(result.isProgress).toBe(true)
    expect(result.basis).toContain('business response')
  })

  it('counts successful action as progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    const result = pd.check(baseFacts, actionClass, [
      { payload: { toolName: 'page_act', result: { ok: true } } },
    ])
    expect(result.isProgress).toBe(true)
  })

  it('does not count failed action as progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    const result = pd.check(baseFacts, actionClass, [
      { payload: { toolName: 'page_act', error: 'element not found' } },
    ])
    expect(result.isProgress).toBe(false)
    expect(result.basis).toContain('failed')
  })

  it('exempts measurement window from no-progress', () => {
    const pd = createProgressDetector()
    pd.setTransitionDeadline(Date.now() + 10_000)
    const result = pd.check(baseFacts, observeClass, [])
    expect(result.isProgress).toBe(false)
    expect(result.isExempt).toBe(true)
    expect(result.basis).toContain('measurement window')
  })

  it('clears expired measurement window', () => {
    const pd = createProgressDetector()
    pd.setTransitionDeadline(Date.now() - 1)
    const result = pd.check(baseFacts, observeClass, [])
    expect(result.isExempt).toBe(false)
  })

  it('no facts change with observe-only is not progress', () => {
    const pd = createProgressDetector()
    pd.check(baseFacts, noToolClass, [])
    const result = pd.check(baseFacts, observeClass, [])
    expect(result.isProgress).toBe(false)
    expect(result.isExempt).toBe(false)
  })
})
