import type { Rule, RuleContext, RuleResult } from './types.ts'
import { ruleApplicability, type createRuleEvaluationCache } from './routing.ts'
import { cleanEvidenceIntegrity, interventionLimitation } from '../shared/evidence-integrity.ts'

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
  readonly reused?: readonly string[]
  readonly skipped?: readonly { ruleId: string; reason: string }[]
}

export async function runChecks(
  context: RuleContext,
  options?: { route: boolean; cache: ReturnType<typeof createRuleEvaluationCache> },
): Promise<ChecksRunResult> {
  const enabled = getEnabledRules()

  // Do not run a rule or reuse its cache against an executor-altered environment.
  if (
    context.snapshot.evidenceIntegrity !== undefined &&
    !cleanEvidenceIntegrity(context.snapshot.evidenceIntegrity)
  ) {
    return {
      evaluatedCount: 0,
      summary: interventionLimitation,
      results: enabled.map((rule) => ({
        ruleId: rule.id,
        ruleRevision: rule.revision,
        verdict: 'unknown' as const,
        severity: 'info' as const,
        title: 'Inspection environment changed by executor',
        expected: 'Evidence from an unmodified business flow',
        actual: interventionLimitation,
        confidence: 0,
        evidenceRefs: [],
        details: { evidenceIntegrity: context.snapshot.evidenceIntegrity },
      })),
    }
  }

  if (enabled.length === 0) {
    return {
      evaluatedCount: 0,
      results: [],
      summary: 'not-checked: no rules enabled',
    }
  }

  const results: RuleResult[] = []
  const reused: string[] = []
  const skipped: { ruleId: string; reason: string }[] = []

  for (const rule of enabled) {
    const applicability = options?.route ? ruleApplicability(rule, context) : undefined
    if (
      options?.route &&
      rule.routing?.execution === 'semantic-binding' &&
      !context.snapshot.transitionObservations?.some(
        (o) => o.binding?.ruleId === rule.id && o.binding.ruleRevision === rule.revision,
      )
    ) {
      skipped.push({
        ruleId: rule.id,
        reason: 'unknown: awaiting semantic binding and measured facts',
      })
      continue
    }
    if (applicability?.status === 'not-applicable') {
      skipped.push({ ruleId: rule.id, reason: applicability.reason })
      continue
    }
    try {
      const evaluated = options?.route
        ? await options.cache.evaluate(rule, context)
        : { result: await rule.evaluate(context), reused: false }
      results.push(evaluated.result)
      if (evaluated.reused) reused.push(rule.id)
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
    evaluatedCount: results.length - reused.length,
    results,
    reused,
    skipped,
    summary:
      parts.join(', ') ||
      (skipped.some((s) => s.reason.startsWith('unknown:'))
        ? 'unknown: semantic checks await binding'
        : 'all not-applicable'),
  }
}

export function clearRules(): void {
  registry.clear()
}
