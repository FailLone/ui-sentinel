import { describe, expect, it } from 'vitest'
import {
  evaluateTransition,
  type TransitionObservation,
  type TransitionRuleConfig,
} from './transition.ts'

// Contract fixtures, not evidence that an Agent has inspected these business applications.
// The collector resolves each business action to the same semantic target before evaluation.
const rule: TransitionRuleConfig = {
  type: 'transition',
  name: 'Retry action availability',
  description:
    'When retry is permitted, its entry must become actionable within the configured window',
  trigger: { eventType: 'retryable-failure' },
  expectation: { condition: 'element-actionable', target: 'Retry button', timeoutMs: 5000 },
  severity: 'error',
}

function measured(fromState: string, availableAt: number | null): TransitionObservation {
  return {
    eventType: 'retryable-failure',
    fromState,
    startedAtMs: 0,
    observedUntilMs: 5000,
    samples: Array.from({ length: 21 }, (_, i) => ({
      atMs: i * 250,
      target: 'Retry button',
      value: availableAt !== null && i * 250 >= availableAt,
    })),
    evidenceRefs: ['synthetic-contract-fixture'],
  }
}

describe('business-independent retry declaration', () => {
  it.each(['payment-failed', 'upload-failed', 'load-failed', 'sync-failed'])(
    'uses the same rule for eligible recovery from %s',
    (state) => {
      expect(evaluateTransition(rule, measured(state, null))).toBe('fail')
      expect(evaluateTransition(rule, measured(state, 0))).toBe('pass')
      expect(evaluateTransition(rule, measured(state, 3000))).toBe('pass')
      expect(evaluateTransition(rule, { ...measured(state, null), samples: [] })).toBe('unknown')
    },
  )

  it.each(['retry-cooldown', 'retry-exhausted', 'operation-running', 'eligibility-unknown'])(
    'does not interpret %s as an eligible retry failure',
    (eventType) => {
      // Correct eligibility classification remains a collector responsibility.
      expect(evaluateTransition(rule, { ...measured('failed', null), eventType })).toBe('unknown')
    },
  )

  it('uses each declaration budget and does not require immediate actionability', () => {
    const observation = measured('upload-failed', 3000)
    expect(evaluateTransition(rule, observation)).toBe('pass')
    expect(
      evaluateTransition(
        { ...rule, expectation: { ...rule.expectation, timeoutMs: 2000 } },
        observation,
      ),
    ).toBe('fail')
  })

  it('cannot substitute an unrelated action for the retry target', () => {
    const observation = measured('load-failed', 0)
    expect(
      evaluateTransition(rule, {
        ...observation,
        samples: observation.samples.map((s) => ({ ...s, target: 'Cancel button' })),
      }),
    ).toBe('unknown')
  })
})
