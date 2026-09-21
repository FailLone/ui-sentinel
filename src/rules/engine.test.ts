import { describe, it, expect, beforeEach } from 'vitest'
import { registerRule, getAllRules, getEnabledRules, runChecks, clearRules } from './engine.ts'
import { registerBuiltinRules, overlayBlockingRule, businessOutcomeRule, responseTimeRule } from './builtin/index.ts'
import type { RuleContext, PageSnapshot } from './types.ts'

function makeSnapshot(overrides?: Partial<PageSnapshot>): PageSnapshot {
  return {
    url: 'http://localhost:4173/checkout',
    title: 'Checkout',
    viewport: { width: 1280, height: 768 },
    elements: [],
    ...overrides,
  }
}

function makeContext(overrides?: Partial<RuleContext>): RuleContext {
  return {
    runId: 'test-run',
    currentUrl: 'http://localhost:4173',
    pageTitle: 'TechMart',
    timestamp: new Date().toISOString(),
    events: [],
    snapshot: makeSnapshot(),
    ...overrides,
  }
}

describe('rule engine', () => {
  beforeEach(() => clearRules())

  it('starts with empty registry', () => {
    expect(getAllRules()).toHaveLength(0)
  })

  it('registers builtin rules', () => {
    registerBuiltinRules()
    expect(getAllRules()).toHaveLength(3)
    expect(getEnabledRules()).toHaveLength(3)
  })

  it('returns not-checked when no rules', async () => {
    const result = await runChecks(makeContext())
    expect(result.evaluatedCount).toBe(0)
    expect(result.summary).toContain('not-checked')
  })

  it('runs all enabled rules', async () => {
    registerBuiltinRules()
    const result = await runChecks(makeContext())
    expect(result.evaluatedCount).toBe(3)
  })
})

describe('overlay-blocking rule', () => {
  it('passes when no overlays', async () => {
    const ctx = makeContext({
      snapshot: makeSnapshot({
        elements: [
          { selector: 'button', tag: 'button', text: 'Pay Now', visible: true, bounds: { x: 100, y: 400, width: 120, height: 40 }, attributes: {} },
        ],
      }),
    })
    const result = await overlayBlockingRule.evaluate(ctx)
    expect(result.verdict).toBe('pass')
  })

  it('fails when overlay covers pay button', async () => {
    const ctx = makeContext({
      snapshot: makeSnapshot({
        elements: [
          { selector: 'button.pay', tag: 'button', text: 'Pay Now', visible: true, bounds: { x: 100, y: 400, width: 120, height: 40 }, attributes: { 'data-testid': 'pay-button' } },
          { selector: 'div.overlay', tag: 'div', text: '', visible: true, bounds: { x: 0, y: 0, width: 1280, height: 768 }, attributes: { class: 'overlay', 'data-testid': 'checkout-overlay' } },
        ],
      }),
    })
    const result = await overlayBlockingRule.evaluate(ctx)
    expect(result.verdict).toBe('fail')
    expect(result.severity).toBe('error')
    expect(result.details.hasCloseButton).toBe(false)
  })

  it('detects close button availability', async () => {
    const ctx = makeContext({
      snapshot: makeSnapshot({
        elements: [
          { selector: 'button.pay', tag: 'button', text: 'Pay Now', visible: true, bounds: { x: 100, y: 400, width: 120, height: 40 }, attributes: { 'data-testid': 'pay-button' } },
          { selector: 'div.overlay', tag: 'div', text: '', visible: true, bounds: { x: 0, y: 0, width: 1280, height: 768 }, attributes: { class: 'overlay' } },
          { selector: 'button.close', tag: 'button', text: 'Close', visible: true, bounds: { x: 600, y: 500, width: 80, height: 30 }, attributes: { 'data-testid': 'close-overlay' } },
        ],
      }),
    })
    const result = await overlayBlockingRule.evaluate(ctx)
    expect(result.verdict).toBe('fail')
    expect(result.details.hasCloseButton).toBe(true)
  })
})

describe('business-outcome rule', () => {
  it('not applicable when no payment action', async () => {
    const result = await businessOutcomeRule.evaluate(makeContext())
    expect(result.verdict).toBe('not-applicable')
  })

  it('detects success outcome', async () => {
    const ctx = makeContext({
      events: [
        { type: 'action:completed', timestamp: new Date().toISOString(), payload: { target: 'pay-button' } },
      ],
      snapshot: makeSnapshot({
        elements: [
          { selector: 'h3', tag: 'h3', text: 'Order Confirmed!', visible: true, bounds: { x: 100, y: 200, width: 200, height: 30 }, attributes: {} },
          { selector: 'p', tag: 'p', text: 'Payment successful! Your order has been confirmed.', visible: true, bounds: { x: 100, y: 240, width: 300, height: 20 }, attributes: {} },
        ],
      }),
    })
    const result = await businessOutcomeRule.evaluate(ctx)
    expect(result.verdict).toBe('pass')
    expect(result.details.outcome).toBe('success')
  })

  it('detects rejection with retry', async () => {
    const ctx = makeContext({
      events: [
        { type: 'action:completed', timestamp: new Date().toISOString(), payload: { target: 'checkout' } },
      ],
      snapshot: makeSnapshot({
        elements: [
          { selector: 'p', tag: 'p', text: 'Payment declined: Insufficient funds', visible: true, bounds: { x: 100, y: 200, width: 300, height: 20 }, attributes: {} },
          { selector: 'button', tag: 'button', text: 'Try Again', visible: true, bounds: { x: 100, y: 300, width: 100, height: 30 }, attributes: {} },
        ],
      }),
    })
    const result = await businessOutcomeRule.evaluate(ctx)
    expect(result.verdict).toBe('pass')
    expect(result.details.outcome).toBe('rejected')
    expect(result.details.hasRetryOption).toBe(true)
  })
})

describe('response-time rule', () => {
  it('not applicable with no timing data', async () => {
    const result = await responseTimeRule.evaluate(makeContext())
    expect(result.verdict).toBe('not-applicable')
  })

  it('passes for fast actions', async () => {
    const now = Date.now()
    const ctx = makeContext({
      events: [
        { type: 'action:executing', timestamp: new Date(now).toISOString(), payload: { type: 'click' } },
        { type: 'action:completed', timestamp: new Date(now + 500).toISOString(), payload: { type: 'click' } },
      ],
    })
    const result = await responseTimeRule.evaluate(ctx)
    expect(result.verdict).toBe('pass')
  })

  it('fails for slow actions over 10s', async () => {
    const now = Date.now()
    const ctx = makeContext({
      events: [
        { type: 'action:executing', timestamp: new Date(now).toISOString(), payload: { type: 'click' } },
        { type: 'action:completed', timestamp: new Date(now + 12000).toISOString(), payload: { type: 'click' } },
      ],
    })
    const result = await responseTimeRule.evaluate(ctx)
    expect(result.verdict).toBe('fail')
    expect(result.severity).toBe('warning')
  })
})
