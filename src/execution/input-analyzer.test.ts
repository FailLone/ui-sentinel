import { describe, it, expect } from 'vitest'
import { analyzeInputComposition, formatCompositionReport } from './input-analyzer.ts'

describe('analyzeInputComposition', () => {
  it('measures byte sizes of each input part', () => {
    const input = {
      goal: 'Complete a purchase',
      knownRules: [{ id: 'r1', name: 'overlay-check' }],
      observation: {
        snapshot: {
          url: 'http://localhost:4173',
          elements: [],
          text: 'Hello',
          observedAt: '2026-01-01',
        },
      },
      history: [{ text: 'clicked button', toolResults: '[]' }],
      notes: [{ state: 'cart' }],
      budgetRemaining: { actions: 35, modelCalls: 25 },
    }

    const comp = analyzeInputComposition(input)
    expect(comp.totalBytes).toBeGreaterThan(0)
    expect(comp.parts.goal).toBeGreaterThan(0)
    expect(comp.parts.rules).toBeGreaterThan(0)
    expect(comp.parts.observation).toBeGreaterThan(0)
    expect(comp.parts.history).toBeGreaterThan(0)
    expect(comp.parts.notes).toBeGreaterThan(0)
    expect(comp.parts.budget).toBeGreaterThan(0)
    expect(comp.totalBytes).toBe(
      comp.parts.goal +
        comp.parts.rules +
        comp.parts.observation +
        comp.parts.history +
        comp.parts.notes +
        comp.parts.budget,
    )
  })

  it('breaks down observation with hitSamples', () => {
    const elements = [
      {
        selector: 'html > body > button:nth-of-type(1)',
        tag: 'button',
        text: 'Buy',
        visible: true,
        bounds: { x: 10, y: 20, width: 100, height: 40 },
        hitSamples: [
          { x: 60, y: 40, hitSelector: 'html > body > button:nth-of-type(1)', relation: 'self' },
          { x: 30, y: 28, hitSelector: 'html > body > button:nth-of-type(1)', relation: 'self' },
        ],
      },
    ]

    const comp = analyzeInputComposition({
      goal: 'test',
      knownRules: [],
      observation: {
        snapshot: { elements, text: 'Page text content', url: 'http://x', observedAt: 'now' },
      },
      history: [],
      notes: [],
      budgetRemaining: {},
    })

    expect(comp.observationBreakdown).not.toBeNull()
    expect(comp.observationBreakdown!.hitSamples).toBeGreaterThan(0)
    expect(comp.observationBreakdown!.elements).toBeGreaterThan(
      comp.observationBreakdown!.hitSamples,
    )
    expect(comp.observationBreakdown!.text).toBeGreaterThan(0)
  })

  it('returns null breakdown when observation has no snapshot', () => {
    const comp = analyzeInputComposition({
      goal: 'test',
      knownRules: [],
      observation: null,
      history: [],
      notes: [],
      budgetRemaining: {},
    })
    expect(comp.observationBreakdown).toBeNull()
  })

  it('breaks down slim observation with hit summaries and pageText', () => {
    const slimElements = [
      {
        ref: 'e1',
        selector: 'html > body > button:nth-of-type(1)',
        tag: 'button',
        text: 'Buy',
        visible: true,
        bounds: { x: 10, y: 20, width: 100, height: 40 },
        hit: { sampled: 5, self: 3, descendant: 1, blocked: 1, blockerRefs: ['e2'] },
      },
    ]

    const comp = analyzeInputComposition({
      goal: 'test',
      knownRules: [],
      observation: {
        snapshotId: 's1',
        elements: slimElements,
        pageText: 'Page text content',
        url: 'http://x',
        observedAt: 'now',
        elementCount: 1,
        screenshotRef: 'ref',
        title: 'Shop',
        viewport: { width: 1280, height: 768 },
      },
      history: [],
      notes: [],
      budgetRemaining: {},
    })

    expect(comp.observationBreakdown).not.toBeNull()
    expect(comp.observationBreakdown!.hitSamples).toBeGreaterThan(0)
    expect(comp.observationBreakdown!.text).toBeGreaterThan(0)
  })

  it('handles unicode correctly in byte measurement', () => {
    const comp = analyzeInputComposition({
      goal: '完成购买流程',
      knownRules: [],
      observation: null,
      history: [],
      notes: [],
      budgetRemaining: {},
    })
    expect(comp.parts.goal).toBeGreaterThan('完成购买流程'.length)
  })
})

describe('formatCompositionReport', () => {
  it('produces a readable report with percentages', () => {
    const comp = analyzeInputComposition({
      goal: 'test',
      knownRules: [{ id: 'r1' }],
      observation: {
        snapshot: { elements: [{ hitSamples: [{ x: 1, y: 1 }] }], text: 'hi', url: 'http://x' },
      },
      history: [],
      notes: [],
      budgetRemaining: { a: 1 },
    })

    const report = formatCompositionReport(comp)
    expect(report).toContain('Total:')
    expect(report).toContain('goal:')
    expect(report).toContain('observation:')
    expect(report).toContain('%')
  })
})
