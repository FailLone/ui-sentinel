import { describe, expect, it } from 'vitest'
import { retryTrigger, resolveRuleContract, ruleCheckInput } from './rule-binding.ts'
import { compileTransitionRule, type TransitionRuleConfig } from '../rules/transition.ts'
import type { RunEvent } from '../shared/types.ts'
const declaration: TransitionRuleConfig = {
  type: 'transition',
  name: 'retry',
  description: 'eligible retry is operable',
  trigger: { eventType: 'retryable-failure' },
  expectation: { condition: 'element-actionable', target: 'Retry button', timeoutMs: 5000 },
  severity: 'error',
}
const rule = compileTransitionRule('learned', declaration)
const event = (payload = {}, id = 'response-1') =>
  ({
    id,
    runId: 'test',
    seq: 1,
    timestamp: new Date(0).toISOString(),
    stepId: null,
    actionId: null,
    evidenceRefs: [],
    type: 'business:response',
    payload: {
      success: false,
      status: 'failed',
      orderId: 'operation-1',
      canRetry: true,
      ...payload,
    },
  }) as RunEvent
describe('evidence-bound rule contract', () => {
  it('derives stable parameters from a rule and a current public response', () => {
    expect(
      resolveRuleContract(rule, [event()], 'Failed operation-1', ['response-1']),
    ).toMatchObject({
      declaration,
      trigger: { eventRef: 'response-1', operationId: 'operation-1' },
    })
  })
  it.each([
    { canRetry: false },
    { canRetry: undefined },
    { retryAfterMs: 30000 },
    { remainingAttempts: 0 },
    { inProgress: true },
    { prerequisitesMet: false },
    { success: true },
    { status: 'rejected' },
  ])('does not infer eligibility from a retry label: %j', (payload) => {
    expect(retryTrigger([event(payload)], 'Retry operation-1')).toBeUndefined()
    expect(() =>
      resolveRuleContract(rule, [event(payload)], 'Retry operation-1', ['response-1']),
    ).toThrow('eligibility')
  })
  it('rejects missing, foreign, stale and wrong-operation evidence', () => {
    expect(retryTrigger([event()], 'other-operation')).toBeUndefined()
    expect(() => resolveRuleContract(rule, [event()], 'operation-1', ['foreign'])).toThrow(
      'eligibility',
    )
    expect(() =>
      resolveRuleContract(
        rule,
        [event(), event({ canRetry: false }, 'response-2')],
        'operation-1',
        ['response-1'],
      ),
    ).toThrow('eligibility')
    expect(() => resolveRuleContract(rule, [], 'operation-1', [])).toThrow('eligibility')
  })
  it('does not fabricate unsupported state predicates', () => {
    const scoped = compileTransitionRule('scoped', {
      ...declaration,
      trigger: { ...declaration.trigger, fromState: 'eligible' },
    })
    expect(() => resolveRuleContract(scoped, [event()], 'operation-1', ['response-1'])).toThrow(
      'unsupported',
    )
  })
  it('rejects model overrides for target, timeout and selector', () => {
    const input = {
      ruleId: 'learned',
      hypothesisIds: [],
      elementRef: 'e1',
      triggerEvidenceRefs: ['response-1'],
      bindingReason: 'same failed operation',
    }
    expect(ruleCheckInput.safeParse(input).success).toBe(true)
    for (const extra of [
      { target: 'Try Again button' },
      { durationMs: 12000 },
      { selector: '#arbitrary' },
    ])
      expect(ruleCheckInput.safeParse({ ...input, ...extra }).success).toBe(false)
  })
})
