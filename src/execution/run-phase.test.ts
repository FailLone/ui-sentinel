import { describe, it, expect } from 'vitest'
import { createPhaseTracker } from './run-phase.ts'

const budget = { totalTimeoutMs: 300_000, maxActions: 40, maxModelCalls: 40 }

describe('createPhaseTracker', () => {
  it('starts in exploring phase', () => {
    const pt = createPhaseTracker(budget)
    expect(pt.getState().phase).toBe('exploring')
  })

  it('transitions to verifying', () => {
    const pt = createPhaseTracker(budget)
    const result = pt.enterVerifying('hypothesis recorded')
    expect(result.changed).toBe(true)
    expect(result.current).toBe('verifying')
    expect(pt.phase).toBe('verifying')
  })

  it('transitions to finalizing', () => {
    const pt = createPhaseTracker(budget)
    const result = pt.enterFinalizing('time running low')
    expect(result.changed).toBe(true)
    expect(result.current).toBe('finalizing')
    expect(pt.phase).toBe('finalizing')
  })

  it('does not go back from finalizing to verifying', () => {
    const pt = createPhaseTracker(budget)
    pt.enterFinalizing('budget')
    const result = pt.enterVerifying('new hypothesis')
    expect(result.changed).toBe(false)
    expect(pt.phase).toBe('finalizing')
  })

  it('triggers finalization when calls <= 2', () => {
    const pt = createPhaseTracker(budget)
    const check = pt.shouldFinalize({ elapsedMs: 100_000, modelCallsUsed: 38, noProgressStreak: 0 })
    expect(check.should).toBe(true)
    expect(check.reason).toBe('model-budget-reserve')
  })

  it('triggers finalization when time below threshold', () => {
    const pt = createPhaseTracker(budget)
    const check = pt.shouldFinalize({ elapsedMs: 250_000, modelCallsUsed: 10, noProgressStreak: 0 })
    expect(check.should).toBe(true)
    expect(check.reason).toBe('time-budget-reserve')
  })

  it('triggers finalization on no-progress streak >= 5', () => {
    const pt = createPhaseTracker(budget)
    const check = pt.shouldFinalize({ elapsedMs: 60_000, modelCallsUsed: 10, noProgressStreak: 5 })
    expect(check.should).toBe(true)
    expect(check.reason).toContain('no-progress')
  })

  it('does not trigger when resources are sufficient', () => {
    const pt = createPhaseTracker(budget)
    const check = pt.shouldFinalize({ elapsedMs: 100_000, modelCallsUsed: 10, noProgressStreak: 1 })
    expect(check.should).toBe(false)
  })

  it('tracks finalizing call budget', () => {
    const pt = createPhaseTracker(budget)
    pt.enterFinalizing('test')
    expect(pt.finalizingBudgetExhausted()).toBe(false)
    pt.countFinalizingCall()
    pt.countFinalizingCall()
    expect(pt.finalizingBudgetExhausted()).toBe(true)
  })

  it('restricts tools in finalizing', () => {
    const pt = createPhaseTracker(budget)
    pt.enterFinalizing('test')
    expect(pt.authorizeTool('run_finish', true)).toBeNull()
    expect(pt.authorizeTool('findings_submit', true)).toBeNull()
    expect(pt.authorizeTool('hypotheses_link_finding', true)).toContain('not allowed')
    expect(pt.authorizeTool('page_act', true)).toBeTruthy()
    expect(pt.authorizeTool('hypotheses_record', true)).toBeTruthy()
    expect(pt.authorizeTool('page_observe', true)).toBeNull()
    expect(pt.authorizeTool('page_observe', true)).toBeTruthy()
    expect(pt.authorizeTool('transition_observe', true)).toBeNull()
    expect(pt.authorizeTool('transition_observe', true)).toBeTruthy()
  })

  it('time threshold is min(60s, 20% of budget)', () => {
    const shortBudget = { totalTimeoutMs: 100_000, maxActions: 40, maxModelCalls: 40 }
    const pt = createPhaseTracker(shortBudget)
    const check = pt.shouldFinalize({ elapsedMs: 82_000, modelCallsUsed: 10, noProgressStreak: 0 })
    expect(check.should).toBe(true)
  })
})
