import { z } from 'zod'
import type { RunEvent } from '../shared/types.ts'
import type { Rule } from '../rules/types.ts'
import {
  normalizeFactEvents,
  retryableTriggerFromFacts,
  type RetryableTrigger,
} from '../business/facts.ts'

export const ruleCheckInput = z
  .object({
    ruleId: z.string().min(1),
    elementRef: z.string().min(1),
    triggerEvidenceRefs: z.array(z.string().min(1)).length(1),
    hypothesisIds: z
      .array(z.string().regex(/^hyp-/))
      .max(1)
      .describe(
        'Use [] for a known rule check without an existing hypothesis. Otherwise use exactly one existing ID from activeHypotheses. Never invent an ID or the string null.',
      ),
    bindingReason: z.string().min(1).max(800),
  })
  .strict()

/**
 * Retry eligibility for declarative rules, read from normalized business facts.
 *
 * The shopping-specific shape is no longer the entry point: a fact produced by any adapter is
 * normalized first, and the checkout compatibility path lives inside the business layer. Rule
 * binding therefore never inspects an `orderId`, so binding one approved declaration works for
 * both businesses without a declaration change.
 */
export function retryTrigger(
  events: readonly RunEvent[],
  pageText: string,
): RetryableTrigger | undefined {
  return retryableTriggerFromFacts(normalizeFactEvents(events), events, pageText)
}

export function resolveRuleContract(
  rule: Rule | undefined,
  events: readonly RunEvent[],
  pageText: string,
  refs: readonly string[],
) {
  if (!rule?.enabled || !rule.declaration) throw new Error('unknown-or-disabled-declarative-rule')
  const d = rule.declaration
  // State filters need independent facts. Never manufacture their satisfaction from the rule.
  if (
    d.trigger.fromState ||
    d.trigger.toState ||
    d.trigger.eventType !== 'retryable-failure' ||
    d.expectation.condition === 'state-reachable' ||
    d.expectation.timeoutMs > 12000 ||
    d.expectation.timeoutMs < 250
  )
    throw new Error('unsupported-bound-rule-contract')
  const trigger = retryTrigger(events, pageText)
  if (!trigger || refs.length !== 1 || refs[0] !== trigger.eventRef)
    throw new Error('retry-eligibility-not-established-for-current-operation')
  return { declaration: d, trigger }
}
