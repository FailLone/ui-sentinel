import type { Rule, RuleContext, RuleResult } from './types.ts'

const registry = new Map<string, Rule>()

export function registerRule(rule: Rule): void {
  registry.set(rule.id, rule)
}

export function getRule(id: string): Rule | undefined {
  return registry.get(id)
}

export function getAllRules(): readonly Rule[] {
  return [...registry.values()]
}

export function getEnabledRules(): readonly Rule[] {
  return [...registry.values()].filter((r) => r.enabled)
}

export interface ChecksRunResult {
  readonly evaluatedCount: number
  readonly results: readonly RuleResult[]
  readonly summary: string
}

export async function runChecks(context: RuleContext): Promise<ChecksRunResult> {
  const enabled = getEnabledRules()

  if (enabled.length === 0) {
    return {
      evaluatedCount: 0,
      results: [],
      summary: 'not-checked: no rules enabled',
    }
  }

  const results: RuleResult[] = []

  for (const rule of enabled) {
    try {
      const result = await rule.evaluate(context)
      results.push(result)
    } catch (err) {
      results.push({
        ruleId: rule.id,
        ruleRevision: rule.revision,
        verdict: 'unknown',
        severity: 'warning',
        title: `Rule ${rule.name} evaluation error`,
        expected: 'rule evaluates successfully',
        actual: `error: ${err instanceof Error ? err.message : String(err)}`,
        evidenceRefs: [],
        confidence: 0,
        details: { error: String(err) },
      })
    }
  }

  const failed = results.filter((r) => r.verdict === 'fail')
  const passed = results.filter((r) => r.verdict === 'pass')
  const unknown = results.filter((r) => r.verdict === 'unknown')

  const parts: string[] = []
  if (failed.length > 0) parts.push(`${failed.length} failed`)
  if (passed.length > 0) parts.push(`${passed.length} passed`)
  if (unknown.length > 0) parts.push(`${unknown.length} unknown`)

  return {
    evaluatedCount: results.length,
    results,
    summary: parts.join(', ') || 'all not-applicable',
  }
}

export function clearRules(): void {
  registry.clear()
}
