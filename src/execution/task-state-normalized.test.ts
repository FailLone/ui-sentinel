import { it, expect, describe } from 'vitest'
import { createTaskState, hypothesisTriggers } from './task-state.ts'

describe('normalized business facts in task scope (B08)', () => {
  it('adds business-success and business-rejected as first-class triggers', () => {
    expect(hypothesisTriggers).toContain('business-success')
    expect(hypothesisTriggers).toContain('business-rejected')
    // The approved rule vocabulary is preserved.
    expect(hypothesisTriggers).toContain('retryable-failure')
  })

  it('does NOT clear pending conditional scope while the operation is still processing', () => {
    const task = createTaskState('inspect export')
    task.setBranches([
      { description: 'success branch', trigger: 'business-success' },
      { description: 'recovery branch', trigger: 'retryable-failure' },
    ])
    // A 202 with processing is an accepted operation, not a business outcome.
    task.observeNormalizedFacts({ phase: 'processing', retryEligibility: 'unknown' }, false)
    const snapshot = task.snapshot()
    // Still pending, not silently "not-triggered".
    expect(snapshot.conditions.find((c) => c.trigger === 'business-success')?.applicability).toBe(
      'pending',
    )
    expect(snapshot.conditions.find((c) => c.trigger === 'business-rejected')?.applicability).toBe(
      'pending',
    )
    expect(task.completionGaps().length).toBeGreaterThan(0)
  })

  it('treats a succeeded fact as a closed success branch and a rejected one as closed rejection', () => {
    const success = createTaskState('inspect export')
    success.setBranches([{ description: 'recovery branch', trigger: 'retryable-failure' }])
    success.observeNormalizedFacts({ phase: 'succeeded', retryEligibility: 'denied' }, false)
    expect(success.completionGaps()).toEqual([])

    const rejected = createTaskState('inspect export')
    rejected.recordHypothesis('r', 'rejection reason', 'business-rejected')
    rejected.observeNormalizedFacts({ phase: 'rejected', retryEligibility: 'denied' }, false)
    // The branch is now reachable, so the open hypothesis is a genuine gap until it is resolved.
    expect(rejected.snapshot().hypotheses[0]?.applicability).toBe('triggered')
    expect(rejected.completionGaps()).toEqual(['hypothesis:r:open'])
    rejected.resolveHypothesis('r', 'refuted')
    expect(rejected.completionGaps()).toEqual([])
  })

  it('triggers the recovery branch only for an explicitly eligible failure', () => {
    const eligible = createTaskState('inspect export')
    eligible.recordHypothesis('recovery', 'recovery control', 'retryable-failure')
    eligible.observeNormalizedFacts({ phase: 'failed', retryEligibility: 'allowed' }, false)
    expect(eligible.snapshot().hypotheses[0]?.applicability).toBe('triggered')

    const notEligible = createTaskState('inspect export')
    notEligible.recordHypothesis('recovery', 'recovery control', 'retryable-failure')
    notEligible.observeNormalizedFacts({ phase: 'failed', retryEligibility: 'denied' }, false)
    // The branch applies to this run, but the condition has not been met - so it stays unresolved
    // rather than being declared unreachable.
    expect(notEligible.snapshot().hypotheses[0]?.applicability).toBe('not-triggered')
  })

  it('keeps a processing fact from being reported as a completed business outcome', () => {
    const task = createTaskState('inspect export')
    task.observeNormalizedFacts({ phase: 'processing', retryEligibility: 'unknown' }, false)
    expect(task.recordBlockedScope()).toBe(true)
  })

  it('maps the checkout compatibility outcome onto the approved payment triggers', () => {
    const purchase = createTaskState('inspect purchase')
    purchase.recordHypothesis('pay', 'payment success', 'payment-success')
    purchase.observeNormalizedFacts(
      { phase: 'succeeded', retryEligibility: 'denied', paymentOutcome: 'paid' },
      false,
    )
    expect(purchase.snapshot().hypotheses[0]?.applicability).toBe('triggered')

    const rejection = createTaskState('inspect purchase')
    rejection.recordHypothesis('pay', 'payment rejection', 'payment-rejected')
    rejection.observeNormalizedFacts(
      { phase: 'rejected', retryEligibility: 'denied', paymentOutcome: 'rejected' },
      false,
    )
    expect(rejection.snapshot().hypotheses[0]?.applicability).toBe('triggered')
  })

  it('does not let a business-neutral fact fabricate a payment event', () => {
    // No paymentOutcome means nothing maps onto the shopping-only payment triggers - an export
    // rejection must not be recorded as a payment rejection.
    const generic = createTaskState('inspect export')
    generic.recordHypothesis('pay', 'payment rejection', 'payment-rejected')
    generic.observeNormalizedFacts({ phase: 'rejected', retryEligibility: 'denied' }, false)
    expect(generic.snapshot().hypotheses[0]?.applicability).toBe('not-triggered')
  })
})
