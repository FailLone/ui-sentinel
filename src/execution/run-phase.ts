import type { RunBudget } from '../shared/types.ts'
export type Phase = 'exploring' | 'verifying' | 'finalizing'
export interface PhaseState {
  readonly phase: Phase
  readonly reason: string | null
  readonly finalizingCallsUsed: number
  readonly finalizingMaxCalls: number
}
const FINALIZING_MAX_CALLS = 2
export function createPhaseTracker(budget: RunBudget) {
  let phase: Phase = 'exploring',
    reason: string | null = null,
    finalizingCallsUsed = 0
  let finalObservations = 0,
    finalMeasurements = 0
  function change(next: Phase, basis: string) {
    const previous = phase
    if (phase !== 'finalizing') {
      phase = next
      reason = basis
    }
    return { changed: previous !== phase, previous, current: phase, reason: reason ?? basis }
  }
  return {
    get phase() {
      return phase
    },
    getState(): PhaseState {
      return { phase, reason, finalizingCallsUsed, finalizingMaxCalls: FINALIZING_MAX_CALLS }
    },
    enterVerifying: (basis: string) => change('verifying', basis),
    enterFinalizing: (basis: string) => change('finalizing', basis),
    countFinalizingCall() {
      if (phase === 'finalizing') finalizingCallsUsed++
      return finalizingCallsUsed
    },
    finalizingBudgetExhausted: () =>
      phase === 'finalizing' && finalizingCallsUsed >= FINALIZING_MAX_CALLS,
    shouldFinalize(context: {
      elapsedMs: number
      modelCallsUsed: number
      noProgressStreak: number
    }) {
      if (phase === 'finalizing') return { should: false, reason: 'already finalizing' }
      if (budget.maxModelCalls - context.modelCallsUsed <= 2)
        return { should: true, reason: 'model-budget-reserve' }
      if (budget.totalTimeoutMs - context.elapsedMs <= Math.min(60000, budget.totalTimeoutMs * 0.2))
        return { should: true, reason: 'time-budget-reserve' }
      if (context.noProgressStreak >= 5) return { should: true, reason: 'no-progress' }
      return { should: false, reason: '' }
    },
    authorizeTool(tool: string, hasOpenHypotheses: boolean): string | null {
      if (phase !== 'finalizing') return null
      if (tool === 'page_observe')
        return finalObservations++ < 1 ? null : 'final observation already used'
      if (tool === 'transition_observe')
        return hasOpenHypotheses && finalMeasurements++ < 1
          ? null
          : 'only one existing investigation can be measured during finalization'
      return [
        'run_finish',
        'findings_submit',
        'element_details',
        'history_read',
        'exploration_update',
        'checks_run',
      ].includes(tool)
        ? null
        : 'new exploration is not allowed during finalization'
    },
  }
}
export type PhaseTracker = ReturnType<typeof createPhaseTracker>
