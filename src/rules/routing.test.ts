import { describe, it, expect, beforeEach } from 'vitest'
import { createRuleEvaluationCache, ruleApplicability, ruleCatalog } from './routing.ts'
import { registerRule, clearRules, runChecks } from './engine.ts'
import type { Rule, RuleContext } from './types.ts'

const context: RuleContext = {
  runId: 'run',
  currentUrl: 'http://localhost',
  pageTitle: '',
  timestamp: '',
  factVersion: 'node-version-1',
  events: [],
  snapshot: {
    url: 'http://localhost',
    title: '',
    viewport: { width: 100, height: 100 },
    elements: [],
  },
}
function rule(id: string, events: string[] = []): Rule {
  return {
    id,
    name: id,
    revision: '1',
    description: 'test',
    category: 'test',
    enabled: true,
    routing: { version: '1', execution: 'automatic', eventTypes: events },
    async evaluate() {
      return {
        ruleId: id,
        ruleRevision: this.revision,
        verdict: 'pass',
        severity: 'info',
        title: id,
        expected: 'test',
        actual: 'test',
        evidenceRefs: [],
        confidence: 1,
        details: {},
      }
    },
  }
}
describe('fact-driven rule routing', () => {
  beforeEach(clearRules)
  it('keeps large irrelevant catalogs out of default context and supports explicit retrieval', () => {
    const rules = Array.from({ length: 1000 }, (_, i) => rule(`unrelated-${i}`, ['never-seen']))
    rules.push(rule('current'))
    const page = ruleCatalog(rules, context)
    expect(page.entries.map((r) => r.id)).toEqual(['current'])
    expect(page.applicability.notApplicable).toBe(1000)
    expect(ruleCatalog(rules, context, 'unrelated-999').entries[0]?.id).toBe('unrelated-999')
    expect(JSON.stringify(page).length).toBeLessThan(1000)
  })
  it('exposes missing metadata and unsupported trigger facts as unknown with pagination', async () => {
    const legacy = { ...rule('legacy'), routing: undefined }
    expect(ruleApplicability(legacy, context).status).toBe('unknown')
    const semantic: Rule = {
      ...rule('semantic'),
      routing: {
        version: '1',
        execution: 'semantic-binding',
        eventTypes: ['business:response'],
        trigger: 'retryable-failure',
      },
    }
    expect(ruleApplicability(semantic, context).status).toBe('unknown')
    expect(
      ruleApplicability(semantic, { ...context, observedTriggers: ['retryable-failure'] }).status,
    ).toBe('applicable')
    const many = Array.from({ length: 12 }, (_, i) => ({ ...legacy, id: `legacy-${i}` }))
    const first = ruleCatalog(many, context),
      second = ruleCatalog(many, context, '', first.nextOffset!)
    expect(first.matching).toBe(12)
    expect(first.entries).toHaveLength(5)
    expect(second.entries.some((r) => first.entries.some((p) => p.id === r.id))).toBe(false)
    registerRule(legacy)
    expect(
      (await runChecks(context, { route: true, cache: createRuleEvaluationCache() }))
        .evaluatedCount,
    ).toBe(1)
  })
  it('invalidates cached checks for node facts, relevant events, revision and run identity', async () => {
    let calls = 0
    const r = rule('r', ['business:response'])
    const evaluate = r.evaluate.bind(r)
    r.evaluate = async (c) => {
      calls++
      return evaluate(c)
    }
    const cache = createRuleEvaluationCache()
    expect((await cache.evaluate(r, context)).reused).toBe(false)
    expect((await cache.evaluate(r, { ...context, timestamp: 'new capture' })).reused).toBe(true)
    await cache.evaluate(r, { ...context, factVersion: 'replaced-node' })
    await cache.evaluate(r, {
      ...context,
      events: [{ type: 'business:response', timestamp: '1', payload: { orderId: 'new' } }],
    })
    await cache.evaluate({ ...r, revision: '2' }, context)
    await cache.evaluate(r, { ...context, runId: 'another-run' })
    await cache.evaluate(r, { ...context, factVersion: undefined })
    await cache.evaluate(r, { ...context, factVersion: undefined })
    expect(calls).toBe(7)
  })
  it('records skipped event-driven rules separately from passed checks', async () => {
    registerRule(rule('deferred', ['response:observed']))
    const result = await runChecks(context, { route: true, cache: createRuleEvaluationCache() })
    expect(result.results).toEqual([])
    expect(result.evaluatedCount).toBe(0)
    expect(result.skipped?.[0]?.ruleId).toBe('deferred')
  })
})
