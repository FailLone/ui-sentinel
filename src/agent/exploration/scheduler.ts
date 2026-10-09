/** Versioned pure proposal. The executor remains the sole authority for actions and budgets. */
import { z } from 'zod'
import { rankCandidates, type FairnessState } from '../decisions/exploration/ranking.ts'
import type { PublicAction } from '../decisions/exploration/contracts.ts'
import type { PlanningFacts } from './facts.ts'
import { buildFrontier, type Frontier } from './frontier.ts'
import {
  branchKeyOf,
  currentStateOf,
  stateKeyOf,
  type PlanningStateKey,
  type Trajectory,
} from './trajectory.ts'
export const PLAN_VERSION = 'r1-exploration-plan-2'
export const RECOVERY_CAP = 1
export const MAX_ATTEMPTS_PER_STATE = 2
export type RiskHint = {
  readonly targetKey: string
  readonly basis: string
  readonly source: string
}
export type PlanRequest = {
  readonly facts: PlanningFacts
  readonly trajectory: Trajectory
  /** Keys MUST use branchKeyOf(currentStateOf(facts), targetKey). */
  readonly recovery?: Readonly<Record<string, number>>
  /** Explicit, caller-declared reason for one additional measured repeat. Never authorization. */
  readonly repeatReasons?: Readonly<Record<string, string>>
  readonly risk?: readonly RiskHint[]
  readonly fairness?: FairnessState
  /** Read-only inspection-host checklist projection; absent means coverage universe unknown. */
  readonly checks?: readonly {
    readonly itemId: string
    readonly targetKey: string
    readonly stateKey: PlanningStateKey
  }[]
}
export type PlanBasis = {
  readonly coverageGap: boolean
  readonly duplicateObservation: boolean
  readonly riskBasis: 'declared' | 'rotation' | 'coverage'
  readonly riskSource: string | null
  readonly continuousStep: boolean
  readonly precondition: string
  readonly policyVersion: string
  readonly repeatReason: string | null
}
export type ActPlan = {
  readonly version: typeof PLAN_VERSION
  readonly kind: 'act'
  readonly binding: {
    requestId: string
    observationVersion: string
    scopeRevision: string
    budgetRevision: string
    taskRevision: string
  }
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
  readonly version: typeof PLAN_VERSION
  readonly kind: 'handoff'
  readonly handoff: {
    readonly reason: HandoffReason
    readonly detail: string
    readonly executedActions: readonly {
      attemptId: string
      targetKey: string
      action: PublicAction
    }[]
    readonly unverifiedItems: readonly string[]
    readonly uncheckedCandidates: readonly string[]
    readonly continuableCandidates: readonly string[]
    readonly forbiddenReplays: readonly string[]
    readonly remainingBudget: { decisions: number; actions: number; ms: number }
    readonly coverage: {
      visitedStates: number
      observedTargets: number
      verifiedItems: number
      checklistKnown: boolean
    }
    readonly evidenceRefs: readonly string[]
  }
}
export type Plan = ActPlan | HandoffPlan
const recoverySchema = z.record(z.string(), z.number().int().nonnegative())
function unresolved(request: PlanRequest, targetKey: string) {
  return request.trajectory.attempts.some(
    (a) => a.targetKey === targetKey && (a.outcome === null || a.outcome === 'unknown'),
  )
}
function selectable(request: PlanRequest, targetKey: string, current: string) {
  const key = branchKeyOf(current, targetKey)
  if (unresolved(request, targetKey) || (request.recovery?.[key] ?? 0) >= RECOVERY_CAP) return false
  const attempts = request.trajectory.attempts.filter(
    (a) => a.targetKey === targetKey && a.beforeState === current,
  )
  if (!attempts.length) return true
  // A failed or unmeasured action cannot become a repeat merely through a priority hint.
  return (
    attempts.length < MAX_ATTEMPTS_PER_STATE &&
    attempts.every((a) => a.verified) &&
    !!request.repeatReasons?.[key]?.trim()
  )
}
function handoff(
  request: PlanRequest,
  frontier: Frontier,
  current: string,
  reason: HandoffReason,
  detail: string,
): HandoffPlan {
  const attempts = request.trajectory.attempts
  const unverified = new Set(attempts.filter((a) => !a.verified && a.itemId).map((a) => a.itemId!))
  for (const c of request.checks ?? []) {
    if (
      !attempts.some(
        (a) =>
          a.verified &&
          a.itemId === c.itemId &&
          a.targetKey === c.targetKey &&
          a.beforeState === stateKeyOf(c.stateKey),
      )
    )
      unverified.add(c.itemId)
  }
  return {
    version: PLAN_VERSION,
    kind: 'handoff',
    handoff: {
      reason,
      detail,
      executedActions: attempts.map((a) => ({
        attemptId: a.attemptId,
        targetKey: a.targetKey,
        action: a.action,
      })),
      unverifiedItems: [...unverified].sort(),
      uncheckedCandidates: frontier.retained
        .filter(
          (c) =>
            !attempts.some(
              (a) => a.verified && a.targetKey === c.targetKey && a.beforeState === current,
            ),
        )
        .map((c) => c.candidateId)
        .sort(),
      continuableCandidates: frontier.available
        .filter((c) => c.targetKey && selectable(request, c.targetKey, current))
        .map((c) => c.candidateId)
        .sort(),
      forbiddenReplays: [
        ...new Set(attempts.filter((a) => !a.verified).map((a) => a.targetKey)),
      ].sort(),
      remainingBudget: {
        decisions: request.facts.input.budget.remainingDecisions,
        actions: request.facts.input.budget.remainingActions,
        ms: request.facts.input.budget.remainingMs,
      },
      coverage: {
        visitedStates: request.trajectory.visitedStates.length,
        observedTargets: request.trajectory.observedTargets.size,
        verifiedItems: request.trajectory.verifiedItems.length,
        checklistKnown: request.checks !== undefined,
      },
      evidenceRefs: [
        ...new Set(attempts.filter((a) => a.evidenceRef).map((a) => a.evidenceRef!)),
      ].sort(),
    },
  }
}
export function planNext(request: PlanRequest): Plan {
  const frontier = buildFrontier(request.facts, request.trajectory),
    current = currentStateOf(request.facts)
  const budget = request.facts.input.budget
  if (
    budget.remainingDecisions <= 0 ||
    budget.remainingActions <= 0 ||
    budget.remainingMs <= 0 ||
    budget.maxRequestMs <= 0
  )
    return handoff(
      request,
      frontier,
      current,
      'budget-exhausted',
      'remaining decision/action/time budget is zero',
    )
  if (
    request.trajectory.rejectedEvents.length ||
    !recoverySchema.safeParse(request.recovery ?? {}).success
  )
    return handoff(
      request,
      frontier,
      current,
      'requires-agent-investigation',
      'invalid trajectory or recovery facts',
    )
  const eligible = frontier.available.filter(
    (c) => c.targetKey && selectable(request, c.targetKey, current),
  )
  if (!eligible.length)
    return handoff(
      request,
      frontier,
      current,
      !frontier.available.length
        ? 'insufficient-information'
        : frontier.available.some(
              (c) =>
                c.targetKey &&
                (request.recovery?.[branchKeyOf(current, c.targetKey)] ?? 0) >= RECOVERY_CAP,
            )
          ? 'unrecoverable'
          : 'requires-agent-investigation',
      'no safe untried target or explicitly bounded repeat remains',
    )
  const ids = new Set(eligible.map((c) => c.candidateId))
  // Project this state once, instead of combining stale input.history with a second memory.
  const history = request.trajectory.attempts
    .filter((a) => a.beforeState === current && a.outcome !== null)
    .map((a) => ({
      targetKey: a.targetKey,
      candidateId: eligible.find((c) => c.targetKey === a.targetKey)?.candidateId ?? a.targetKey,
      action: a.action,
      beforeStateVersion: request.facts.input.state.relatedStateVersion,
      afterStateVersion: a.afterState ?? '',
      actualEffects: [...a.effects],
      outcome: a.outcome!,
    }))
  const ranked = rankCandidates(
    {
      ...request.facts.input,
      history,
      candidates: request.facts.input.candidates.filter((c) => ids.has(c.id)),
    },
    { fairness: request.fairness },
  )
  const order = new Map(ranked.orderedCandidateIds.map((id, index) => [id, index]))
  const risk = new Map(
    (request.risk ?? [])
      .filter((h) => h.basis.trim() && h.source.trim())
      .map((h) => [h.targetKey, h]),
  )
  const ordered = [...eligible].sort((a, b) => {
    const tried = Number(a.attemptsInCurrentState > 0) - Number(b.attemptsInCurrentState > 0)
    if (tried) return tried
    // A real fairness promotion wins over risk, preventing permanent low-priority starvation.
    if (!ranked.rotation.applied) {
      const priority = Number(risk.has(b.targetKey!)) - Number(risk.has(a.targetKey!))
      if (priority) return priority
    }
    return (order.get(a.candidateId) ?? 999) - (order.get(b.candidateId) ?? 999)
  })
  const chosen = ordered[0],
    hint = risk.get(chosen.targetKey!)
  const repeat = chosen.attemptsInCurrentState > 0
  const last = request.trajectory.attempts.at(-1)
  return {
    version: PLAN_VERSION,
    kind: 'act',
    binding: {
      requestId: request.facts.input.requestId,
      observationVersion: request.facts.input.state.observationVersion,
      scopeRevision: request.facts.input.scope.revision,
      budgetRevision: budget.revision,
      taskRevision: request.facts.input.task.revision,
    },
    targetKey: chosen.targetKey!,
    candidateId: chosen.candidateId,
    action: chosen.allowedActions[0],
    basis: {
      coverageGap: !repeat,
      duplicateObservation: repeat,
      riskBasis: ranked.rotation.applied ? 'rotation' : hint ? 'declared' : 'coverage',
      riskSource: hint?.source ?? null,
      continuousStep:
        !repeat &&
        last?.outcome === 'observed' &&
        last.afterState === current &&
        last.beforeState !== current,
      precondition: current,
      policyVersion: 'r1-exploration-policy-2',
      repeatReason: repeat ? request.repeatReasons![branchKeyOf(current, chosen.targetKey!)] : null,
    },
  }
}
