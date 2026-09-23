import { z } from 'zod'
import type { RunEvent } from '../shared/types.ts'
import type { Rule } from '../rules/types.ts'

export const ruleCheckInput = z
  .object({
    ruleId: z.string().min(1),
    elementRef: z.string().min(1),
    triggerEvidenceRefs: z.array(z.string().min(1)).length(1),
    hypothesisId: z.string().min(1).optional(),
    bindingReason: z.string().min(1).max(800),
  })
  .strict()

/** Current public checkout-response adapter; not a universal business-eligibility oracle. */
export function retryTrigger(events: readonly RunEvent[], pageText: string) {
  const event = events.filter((e) => e.type === 'business:response').at(-1)
  if (!event) return undefined
  const p = event.payload
  if (
    p.success !== false ||
    p.status !== 'failed' ||
    p.canRetry !== true ||
    typeof p.orderId !== 'string' ||
    !p.orderId ||
    !pageText.includes(p.orderId) ||
    p.inProgress === true ||
    p.prerequisitesMet === false ||
    (typeof p.retryAfterMs === 'number' && p.retryAfterMs > 0) ||
    (typeof p.remainingAttempts === 'number' && p.remainingAttempts <= 0)
  )
    return undefined
  return { eventRef: event.id, eventType: 'retryable-failure', operationId: p.orderId }
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
