import { createHash } from 'node:crypto'
import type { Rule, RuleContext, RuleResult } from './types.ts'

export function ruleApplicability(rule: Rule, context: RuleContext) {
  const metadata = rule.routing
  if (!metadata || metadata.version !== '1')
    return {
      status: 'unknown' as const,
      reason: 'routing metadata missing; evaluate conservatively',
    }
  if (metadata.execution === 'semantic-binding') {
    if (metadata.trigger && context.observedTriggers?.includes(metadata.trigger))
      return {
        status: 'applicable' as const,
        reason: 'public trigger observed; element binding required',
      }
    // An unsupported adapter does not prove a rule inapplicable.
    return { status: 'unknown' as const, reason: 'trigger eligibility not established' }
  }
  if (
    metadata.eventTypes.length &&
    !context.events.some((e) => metadata.eventTypes.includes(e.type))
  )
    return { status: 'not-applicable' as const, reason: 'no triggering event in observed history' }
  return { status: 'applicable' as const, reason: 'required event or page facts available' }
}

export function ruleCatalog(
  rules: readonly Rule[],
  context: RuleContext,
  query = '',
  offset = 0,
  limit = 5,
) {
  const entries = rules
    .filter((r) => r.enabled)
    .map((r) => ({ rule: r, ...ruleApplicability(r, context) }))
  const filtered = entries
    .filter(({ rule, status }) =>
      query
        ? `${rule.id} ${rule.name} ${rule.description}`.toLowerCase().includes(query.toLowerCase())
        : status !== 'not-applicable',
    )
    .sort(
      (a, b) =>
        Number(b.status === 'applicable') - Number(a.status === 'applicable') ||
        a.rule.id.localeCompare(b.rule.id),
    )
  const page = filtered.slice(offset, offset + limit)
  return {
    total: entries.length,
    matching: filtered.length,
    offset,
    nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
    applicability: {
      applicable: entries.filter((r) => r.status === 'applicable').length,
      unknown: entries.filter((r) => r.status === 'unknown').length,
      notApplicable: entries.filter((r) => r.status === 'not-applicable').length,
    },
    entries: page.map(({ rule, status, reason }) => ({
      id: rule.id,
      revision: rule.revision,
      name: rule.name.slice(0, 120),
      description: rule.description.slice(0, 300),
      execution: rule.routing?.execution ?? (rule.declaration ? 'semantic-binding' : 'automatic'),
      applicability: status,
      reason,
      detailsAvailable: true,
    })),
  }
}

/** Per-run cache; rules without a dependency contract or a validated version never reuse facts. */
export function createRuleEvaluationCache() {
  const cache = new Map<string, RuleResult>()
  return {
    async evaluate(
      rule: Rule,
      context: RuleContext,
    ): Promise<{ result: RuleResult; reused: boolean }> {
      const metadata = rule.routing
      const reusable =
        metadata?.version === '1' && metadata.execution === 'automatic' && !!context.factVersion
      const key = reusable
        ? createHash('sha256')
            .update(
              JSON.stringify([
                rule.id,
                rule.revision,
                metadata,
                context.runId,
                context.factVersion,
                context.events.filter((e) => metadata.eventTypes.includes(e.type)),
              ]),
            )
            .digest('hex')
        : undefined
      const existing = key ? cache.get(key) : undefined
      if (existing) return { result: existing, reused: true }
      const result = await rule.evaluate(context)
      if (key) {
        if (cache.size >= 200) cache.delete(cache.keys().next().value!)
        cache.set(key, result)
      }
      return { result, reused: false }
    },
  }
}
