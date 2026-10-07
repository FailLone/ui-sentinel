/**
 * Candidate frontier, paths, pre/postconditions and unexplored branches.
 *
 * The frontier is a *planning* view of the caller's public facts. It exists so that a branch we did
 * not take is still nameable in a report instead of silently vanishing once scoring stops
 * ranking it. Blocked and unattributable controls are retained with a checkable reason.
 *
 * A path is only recorded from events that actually completed. Reaching a URL by any other route
 * never fabricates a path, and a control's visible text or geometry never decides its identity —
 * only the caller's stable `targetKey` does.
 *
 * No browser, model, network, database, environment or file access happens here.
 */
import type { ActualEffect, PublicAction } from '../decisions/exploration/contracts.ts'
import type { PlanningFacts } from './facts.ts'
import { currentStateOf, type Trajectory } from './trajectory.ts'

export type FrontierBlockReason = 'out-of-scope' | 'not-visible' | 'disabled' | 'no-action'

export type FrontierCandidate = {
  readonly candidateId: string
  readonly targetKey: string | null
  readonly text: string
  readonly role: string
  readonly publicState: {
    readonly visible: boolean | null
    readonly enabled: boolean | null
    readonly expanded: boolean | null
    readonly selected: boolean | null
  }
  readonly context: string
  readonly allowedActions: readonly PublicAction[]
  readonly estimatedCost: number
  /** False when the caller declared no stable target key, so attempts cannot be attributed to it. */
  readonly attributable: boolean
  /** Attempts that started and completed in the state we are planning from. */
  readonly attemptsInCurrentState: number
  readonly replayBlocked: boolean
}

export type BlockedCandidate = {
  readonly candidateId: string
  readonly targetKey: string | null
  readonly reason: FrontierBlockReason
}

export type UnexploredBranch = {
  readonly targetKey: string
  /** States in which this observed target still has no measured verification. */
  readonly seenInStates: readonly string[]
}

export type FrontierPath = {
  readonly steps: readonly {
    readonly attemptId: string
    readonly targetKey: string
    readonly action: PublicAction
    readonly from: string
    readonly to: string
    readonly effects: readonly ActualEffect[]
  }[]
  readonly precondition: string
  readonly postcondition: string
  /** Effects actually observed for this step. Never a prediction. */
  readonly effects: readonly ActualEffect[]
}

export type Frontier = {
  readonly stateKey: string
  readonly observationVersion: string
  readonly available: readonly FrontierCandidate[]
  readonly blocked: readonly BlockedCandidate[]
  /** Targets seen elsewhere but never handled in the current state. */
  readonly unexploredBranches: readonly UnexploredBranch[]
  readonly paths: readonly FrontierPath[]
  /** Every observed candidate, whatever its state. Nothing disappears from here. */
  readonly retained: readonly FrontierCandidate[]
  /** The next target on an already-started sequence, when one can still be continued. */
  readonly continuousOpportunity: {
    readonly targetKey: string
    readonly action: PublicAction
  } | null
}

export function ineligibility(
  facts: PlanningFacts,
  candidate: PlanningFacts['input']['candidates'][number],
): FrontierBlockReason | null {
  if (!facts.input.scope.executableCandidateIds.includes(candidate.id)) return 'out-of-scope'
  if (candidate.publicState.visible !== true) return 'not-visible'
  if (candidate.publicState.enabled !== true) return 'disabled'
  if (candidate.allowedActions.length === 0) return 'no-action'
  return null
}

export function buildFrontier(facts: PlanningFacts, trajectory: Trajectory): Frontier {
  const currentState = currentStateOf(facts)

  const available: FrontierCandidate[] = []
  const blocked: BlockedCandidate[] = []
  const retained: FrontierCandidate[] = []
  for (const candidate of facts.input.candidates) {
    const reason = ineligibility(facts, candidate)
    const entry: FrontierCandidate = {
      candidateId: candidate.id,
      targetKey: candidate.targetKey,
      text: candidate.text,
      role: candidate.role,
      publicState: { ...candidate.publicState },
      context: candidate.context,
      allowedActions: candidate.allowedActions,
      estimatedCost: candidate.estimatedCost,
      attributable: candidate.targetKey !== null,
      replayBlocked:
        candidate.targetKey === null ||
        trajectory.attempts.some(
          (a) =>
            a.targetKey === candidate.targetKey &&
            (a.outcome === null ||
              a.outcome === 'unknown' ||
              (a.beforeState === currentState && !a.verified)),
        ),
      attemptsInCurrentState:
        candidate.targetKey === null
          ? 0
          : trajectory.attemptsInState(candidate.targetKey, currentState),
    }
    retained.push(entry)
    if (reason) blocked.push({ candidateId: candidate.id, targetKey: candidate.targetKey, reason })
    else available.push(entry)
  }

  // Keep every unverified state/target pair, including the current state.
  const unexploredBranches: UnexploredBranch[] = [...trajectory.observedTargets.entries()]
    .map(([targetKey, states]) => ({
      targetKey,
      seenInStates: [...states]
        .filter(
          (state) =>
            !trajectory.attempts.some(
              (a) => a.targetKey === targetKey && a.beforeState === state && a.verified,
            ),
        )
        .sort(),
    }))
    .filter((branch) => branch.seenInStates.length > 0)
    .sort((a, b) => (a.targetKey < b.targetKey ? -1 : 1))
  // Compose only adjacent successful dispatches in actual dispatch order. Failures break chains.
  const paths: FrontierPath[] = []
  for (const [index, attempt] of trajectory.attempts.entries()) {
    const transition = trajectory.transitions.find((t) => t.attemptId === attempt.attemptId)
    if (!transition) continue
    const previousAttempt = trajectory.attempts[index - 1],
      previous = paths.at(-1)
    const step = {
      attemptId: transition.attemptId,
      targetKey: transition.targetKey,
      action: transition.action,
      from: transition.from,
      to: transition.to,
      effects: [...transition.effects],
    }
    if (
      previous &&
      previous.steps.at(-1)?.attemptId === previousAttempt?.attemptId &&
      previousAttempt?.settledIndex !== null &&
      previousAttempt.settledIndex < attempt.dispatchedIndex &&
      previous.postcondition === transition.from
    ) {
      paths[paths.length - 1] = {
        steps: [...previous.steps, step],
        precondition: previous.precondition,
        postcondition: transition.to,
        effects: [...new Set([...previous.effects, ...transition.effects])],
      }
    } else
      paths.push({
        steps: [step],
        precondition: transition.from,
        postcondition: transition.to,
        effects: [...transition.effects],
      })
  }
  const continuation = available.find(
    (entry) =>
      entry.targetKey !== null && !entry.replayBlocked && entry.attemptsInCurrentState === 0,
  )
  const lastAttempt = trajectory.attempts.at(-1)
  const continuousOpportunity =
    continuation?.targetKey &&
    lastAttempt?.outcome === 'observed' &&
    lastAttempt.afterState === currentState &&
    lastAttempt.beforeState !== currentState
      ? { targetKey: continuation.targetKey, action: continuation.allowedActions[0] }
      : null

  return {
    stateKey: currentState,
    observationVersion: facts.input.state.observationVersion,
    available,
    blocked,
    unexploredBranches,
    paths,
    retained,
    continuousOpportunity,
  }
}
