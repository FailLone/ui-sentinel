import type { RunBudget } from '../shared/types.ts'

export type Phase = 'exploring' | 'verifying' | 'finalizing'

export interface PhaseState {
  readonly phase: Phase
  readonly reason: string | null
  readonly finalizingCallsUsed: number
  readonly finalizingMaxCalls: number
}

export interface PhaseTransitionResult {
  readonly changed: boolean
  readonly previous: Phase
  readonly current: Phase
  readonly reason: string
}

const FINALIZING_MAX_CALLS = 4

export function createPhaseTracker(budget: RunBudget) {
  let phase: Phase = 'exploring'
  let reason: string | null = null
  let finalizingCallsUsed = 0
  let hasHypotheses = false

  function getState(): PhaseState {
    return {
      phase,
      reason,
      finalizingCallsUsed,
      finalizingMaxCalls: FINALIZING_MAX_CALLS,
    }
  }

  function enterVerifying(basis: string): PhaseTransitionResult {
    if (phase === 'finalizing') return { changed: false, previous: phase, current: phase, reason: 'already finalizing' }
    const prev = phase
    phase = 'verifying'
    reason = basis
    return { changed: prev !== 'verifying', previous: prev, current: 'verifying', reason: basis }
  }

  function enterFinalizing(basis: string): PhaseTransitionResult {
    if (phase === 'finalizing') return { changed: false, previous: phase, current: phase, reason: 'already finalizing' }
    const prev = phase
    phase = 'finalizing'
    reason = basis
    finalizingCallsUsed = 0
    return { changed: true, previous: prev, current: 'finalizing', reason: basis }
  }

  function recordHypothesisCreated(): void {
    hasHypotheses = true
  }

  function countFinalizingCall(): number {
    if (phase === 'finalizing') finalizingCallsUsed++
    return finalizingCallsUsed
  }

  function shouldFinalize(context: {
    elapsedMs: number
    modelCallsUsed: number
    noProgressStreak: number
  }): { should: boolean; reason: string } {
    if (phase === 'finalizing') return { should: false, reason: 'already finalizing' }

    const timeLeft = budget.totalTimeoutMs - context.elapsedMs
    const callsLeft = budget.maxModelCalls - context.modelCallsUsed
    const timeThreshold = Math.min(60_000, budget.totalTimeoutMs * 0.2)

    if (callsLeft <= 2)
      return { should: true, reason: `model calls remaining: ${callsLeft} <= 2` }

    if (timeLeft <= timeThreshold)
      return {
        should: true,
        reason: `time remaining: ${Math.round(timeLeft / 1000)}s <= ${Math.round(timeThreshold / 1000)}s threshold`,
      }

    if (context.noProgressStreak >= 5)
      return { should: true, reason: `no-progress streak: ${context.noProgressStreak} >= 5` }

    return { should: false, reason: '' }
  }

  function finalizingBudgetExhausted(): boolean {
    return phase === 'finalizing' && finalizingCallsUsed >= FINALIZING_MAX_CALLS
  }

  function isToolAllowedInFinalizing(toolName: string): boolean {
    const allowed = new Set([
      'run_finish', 'run.finish',
      'findings_submit', 'findings.submit',
      'hypotheses_record', 'hypotheses.record',
      'page_observe', 'page.observe',
      'element_details', 'element.details',
      'history_read', 'history.read',
      'exploration_update', 'exploration.update',
    ])
    return allowed.has(toolName)
  }

  return {
    getState,
    enterVerifying,
    enterFinalizing,
    recordHypothesisCreated,
    countFinalizingCall,
    shouldFinalize,
    finalizingBudgetExhausted,
    isToolAllowedInFinalizing,
    get phase() { return phase },
  }
}

export type PhaseTracker = ReturnType<typeof createPhaseTracker>
