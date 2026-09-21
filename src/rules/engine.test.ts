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
  const target = { selector:'button', tag:'button', text:'Pay Now', visible:true, enabled:true, bounds:{x:100,y:400,width:120,height:40}, attributes:{} }
  const samples = (relation:'self'|'unrelated') => Array.from({length:5},()=>({x:120,y:420,hitSelector:relation==='self'?'button':'aside',relation}))
  it('does not infer interception from an ordinary containing div',async()=>{
    const result=await overlayBlockingRule.evaluate(makeContext({snapshot:makeSnapshot({elements:[{selector:'div',tag:'div',text:'',visible:true,bounds:{x:0,y:0,width:1280,height:768},attributes:{}},{...target,hitSamples:samples('self')}]})}))
    expect(result.verdict).toBe('pass')
  })
  it('requires measured samples and preserves unknown for missing facts',async()=>{
    expect((await overlayBlockingRule.evaluate(makeContext({snapshot:makeSnapshot({elements:[target]})}))).verdict).toBe('unknown')
    expect((await overlayBlockingRule.evaluate(makeContext({snapshot:makeSnapshot({elements:[{...target,hitSamples:samples('unrelated')}]})}))).verdict).toBe('fail')
  })
  it('does not claim complete blocking when part of the target is clickable',async()=>{
    const hitSamples=samples('unrelated');hitSamples[0]={x:120,y:420,hitSelector:'button',relation:'self'}
    const result=await overlayBlockingRule.evaluate(makeContext({snapshot:makeSnapshot({elements:[{...target,hitSamples}]})}))
    expect(result.verdict).toBe('pass');expect((result.details.partialTargets as unknown[]).length).toBe(1)
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
        { type: 'business:response', timestamp: new Date().toISOString(), payload: { orderId:'order-1', status:'success', message:'Payment successful!' } },
      ],
      snapshot: makeSnapshot({
        elements: [
          { selector: 'h3', tag: 'h3', text: 'Order Confirmed!', visible: true, bounds: { x: 100, y: 200, width: 200, height: 30 }, attributes: {} },
          { selector: 'p', tag: 'p', text: 'Payment successful! Your order has been confirmed. order-1', visible: true, bounds: { x: 100, y: 240, width: 300, height: 20 }, attributes: {} },
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
        { type: 'business:response', timestamp: new Date().toISOString(), payload: {orderId:'order-2',status:'rejected',message:'Payment declined: Insufficient funds'} },
      ],
      snapshot: makeSnapshot({
        elements: [
          { selector: 'p', tag: 'p', text: 'Payment declined: Insufficient funds order-2', visible: true, bounds: { x: 100, y: 200, width: 300, height: 20 }, attributes: {} },
          { selector: 'button', tag: 'button', text: 'Try Again', visible: true, bounds: { x: 100, y: 300, width: 100, height: 30 }, attributes: {} },
        ],
      }),
    })
    const result = await businessOutcomeRule.evaluate(ctx)
    expect(result.verdict).toBe('pass')
    expect(result.details.outcome).toBe('rejected')
    expect(result.details.matchingOrder).toBe(true)
  })
})
