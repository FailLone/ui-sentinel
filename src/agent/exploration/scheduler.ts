/**
 * Bounded, explainable exploration scheduling for R1.
 *
 * The scheduler chooses what to check next, or hands the work back. It PROPOSES ONLY:
 *
 *   - it never operates a browser and never dispatches an action;
 *   - it never grants permission, so a caller must re-authorize every proposal;
 *   - it never writes `verified`, never marks a task finished and never declares a defect;
 *   - it never decides the action from a model. Model scores may arrive later as an optional
 *     ordering hint, but they can only reorder the program's own eligible queue — they can never
 *     add a candidate, override scope, bypass budget, or promote a target whose recovery is spent.
 *
 * Ordering reuses the committed `r1-exploration-policy-2` comparator in `ranking.ts` rather than
 * introducing a second scorer, so planning and scoring cannot drift apart.
 *
 * Risk is one priority input among several. Duplicate control, coverage gap and the remaining
 * budget all constrain the choice, and an untried candidate always outranks a repeat.
 */
import { rankCandidates, type FairnessState } from '../decisions/exploration/ranking.ts'
import type { PublicAction } from '../decisions/exploration/contracts.ts'
import type { PlanningFacts } from './facts.ts'
import { buildFrontier, type Frontier, type FrontierCandidate } from './frontier.ts'
import type { Trajectory } from './trajectory.ts'

/** One active recovery scheme per stalled branch. Reaching the cap stops recovery, it does not extend it. */
export const RECOVERY_CAP = 1

export type RiskHint = {
  readonly targetKey: string
  readonly basis: string
  readonly source: string
}

export type PlanRequest = {
  readonly facts: PlanningFacts
  readonly trajectory: Trajectory
  /** How many recovery schemes this target has already consumed. */
  readonly recovery?: Readonly<Record<string, number>>
  /** Caller-declared risk hints. Only ever raises priority, never adds a candidate or grants scope. */
  readonly risk?: readonly RiskHint[]
  /** Program-owned fairness rotation state. */
  readonly fairness?: FairnessState
}

export type PlanBasis = {
  readonly coverageGap: boolean
  readonly duplicateObservation: boolean
  readonly riskBasis: 'declared' | 'rotation' | 'coverage'
  readonly riskSource: string | null
  readonly continuousStep: boolean
  readonly precondition: string
  readonly policyVersion: string
}

export type ActPlan = {
  readonly kind: 'act'
  readonly targetKey: string
  readonly candidateId: string
  readonly action: PublicAction
  readonly basis: PlanBasis
}

export type HandoffReason =
  | 'insufficient-information'
  | 'budget-exhausted'
  | 'unrecoverable'
  | 'requires-agent-investigation'

export type HandoffPlan = {
  readonly kind: 'handoff'
  readonly handoff: {
    readonly reason: HandoffReason
    readonly detail: string
    readonly executedActions: readonly { readonly targetKey: string; readonly action: PublicAction }[]
    readonly unverifiedItems: readonly string[]
    readonly continuableCandidates: readonly string[]
    /** Targets whose effect was never measured. Blind replay of these is never proposed. */
    readonly forbiddenReplays: readonly string[]
    readonly remainingBudget: {
      readonly decisions: number
      readonly actions: number
      readonly ms: number
    }
    readonly coverage: {
      readonly visitedStates: number
      readonly observedTargets: number
      readonly verifiedItems: number
    }
    readonly evidenceRefs: readonly string[]
  }
}

export type Plan = ActPlan | HandoffPlan

type Budget = PlanningFacts['input']['budget']

function exhausted(budget: Budget): boolean {
  return (
    budget.remainingDecisions <= 0 ||
    budget.remainingActions <= 0 ||
    budget.remainingMs <= 0 ||
    budget.maxRequestMs <= 0
  )
}

function coverageOf(trajectory: Trajectory) {
  return {
    visitedStates: trajectory.visitedStates.length,
    observedTargets: trajectory.observedTargets.size,
    verifiedItems: trajectory.verifiedItems.length,
  }
}

/** Every exit the caller may still take, in a stable order, so a handoff is actionable. */
function continuable(frontier: Frontier, trajectory: Trajectory, currentState: string): string[] {
  return frontier.retained
    .filter(
      (entry) =>
        entry.targetKey !== null &&
        trajectory.attemptsInState(entry.targetKey, currentState) === 0,
    )
    .map((entry) => entry.candidateId)
    .sort()
}

function handoff(
  request: PlanRequest,
  frontier: Frontier,
  currentState: string,
  reason: HandoffReason,
  detail: string,
): HandoffPlan {
  const measured = request.trajectory.attempts.filter((a) => a.verified && a.targetKey)
  const unmeasured = request.trajectory.attempts.filter((a) => !a.verified && a.targetKey)
  return {
    kind: 'handoff',
    handoff: {
      reason,
      detail,
      executedActions: request.trajectory.attempts.map((a) => ({
        targetKey: a.targetKey,
        action: a.action,
      })),
      unverifiedItems: unmeasured.map((a) => a.targetKey),
      continuableCandidates: continuable(frontier, request.trajectory, currentState),
      // An action whose effect was never measured must not be blindly replayed by whoever continues.
      forbiddenReplays: [...new Set(unmeasured.map((a) => a.targetKey))].sort(),
      remainingBudget: {
        decisions: request.facts.input.budget.remainingDecisions,
        actions: request.facts.input.budget.remainingActions,
        ms: request.facts.input.budget.remainingMs,
      },
      coverage: coverageOf(request.trajectory),
      evidenceRefs: measured.map((a) => `${a.beforeState}/${a.targetKey}`).sort(),
    },
  }
}

/**
 * Reuse the shared comparator to order the eligible frontier, then apply the constraints that are
 * this module's own: duplicate control, recovery cap, continuous-step opportunity and risk hints.
 */
function orderedEligible(
  request: PlanRequest,
  frontier: Frontier,
  currentState: string,
): FrontierCandidate[] {
  const eligible = frontier.available.filter((entry) => entry.targetKey !== null)
  const ids = new Set(eligible.map((e) => e.candidateId))
  // The comparator receives the same eligible set the frontier exposes; anything else is fused away
  // by the ranking module's own all-or-nothing rule, leaving the pure program order.
  const ranked = rankCandidates(
    { ...request.facts.input, candidates: request.facts.input.candidates.filter((c) => ids.has(c.id)) },
    { fairness: request.fairness },
  )
  const order = new Map(ranked.orderedCandidateIds.map((id, index) => [id, index]))
  return [...eligible].sort((a, b) => {
    // An untried entry always outranks a repeat in the current state, whatever the model said.
    const aTried = request.trajectory.attemptsInState(a.targetKey!, currentState) > 0 ? 1 : 0
    const bTried = request.trajectory.attemptsInState(b.targetKey!, currentState) > 0 ? 1 : 0
    if (aTried !== bTried) return aTried - bTried
    const aOrder = order.get(a.candidateId) ?? Number.MAX_SAFE_INTEGER
    const bOrder = order.get(b.candidateId) ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.candidateId < b.candidateId ? -1 : 1
  })
}

export function planNext(request: PlanRequest): Plan {
  const frontier = buildFrontier(request.facts, request.trajectory)
  const currentState = `${request.facts.input.state.relatedStateVersion}::${request.facts.view.viewKey}`
  const recovery = request.recovery ?? {}
  const riskByTarget = new Map((request.risk ?? []).map((hint) => [hint.targetKey, hint]))

  if (exhausted(request.facts.input.budget))
    return handoff(request, frontier, currentState, 'budget-exhausted', 'remaining budget is zero')

  const ordered = orderedEligible(request, frontier, currentState)
  const recovered = (targetKey: string) => (recovery[targetKey] ?? 0) >= RECOVERY_CAP

  const untried = ordered.find((entry) => !recovered(entry.targetKey!))
  const repeatable = ordered.find((entry) => recovered(entry.targetKey!) === false)
  const chosen = untried ?? repeatable

  if (!chosen || chosen.targetKey === null) {
    const spent = ordered.length > 0
    return handoff(
      request,
      frontier,
      currentState,
      spent ? 'unrecoverable' : 'insufficient-information',
      spent
        ? 'every remaining target has exhausted its recovery cap'
        : 'no eligible candidate remains within the declared scope',
    )
  }

  const attemptsHere = request.trajectory.attemptsInState(chosen.targetKey, currentState)
  const rotationApplied = request.fairness
    ? (request.fairness.decisionIndex + 1) % 4 === 0
    : false
  const hint = riskByTarget.get(chosen.targetKey)
  const preconditionWorked = request.trajectory.transitions.some(
    (transition) => transition.to === currentState && transition.from !== currentState,
  )

  const basis: PlanBasis = {
    coverageGap: attemptsHere === 0,
    duplicateObservation: attemptsHere > 0,
    riskBasis: hint ? 'declared' : rotationApplied ? 'rotation' : 'coverage',
    riskSource: hint ? hint.source : null,
    continuousStep: preconditionWorked && attemptsHere === 0,
    precondition: currentState,
    policyVersion: 'r1-exploration-policy-2',
  }

  return {
    kind: 'act',
    targetKey: chosen.targetKey,
    candidateId: chosen.candidateId,
    action: chosen.allowedActions[0],
    basis,
  }
}