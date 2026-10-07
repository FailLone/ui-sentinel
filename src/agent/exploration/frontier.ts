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
import { stateKeyOf, type Trajectory } from './trajectory.ts'

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
}

export type BlockedCandidate = {
  readonly candidateId: string
  readonly targetKey: string | null
  readonly reason: FrontierBlockReason
}

export type UnexploredBranch = {
  readonly targetKey: string
  /** The states this target has been observed in but never acted on. */
  readonly seenInStates: readonly string[]
}

export type FrontierPath = {
  readonly steps: readonly { readonly targetKey: string; readonly action: PublicAction }[]
  readonly precondition: string
  readonly postcondition: string
  /** Effects actually observed for this step. Never a prediction. */
  readonly effects: readonly ActualEffect[]
}

export type Frontier = {
  readonly available: readonly FrontierCandidate[]
  readonly blocked: readonly BlockedCandidate[]
  /** Targets seen elsewhere but never handled in the current state. */
  readonly unexploredBranches: readonly UnexploredBranch[]
  readonly paths: readonly FrontierPath[]
  /** Every observed candidate, whatever its state. Nothing disappears from here. */
  readonly retained: readonly FrontierCandidate[]
  /** The next target on an already-started sequence, when one can still be continued. */
  readonly continuousOpportunity: { readonly targetKey: string; readonly action: PublicAction } | null
}

function ineligibility(
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
  const currentState = stateKeyOf({
    relatedStateVersion: facts.input.state.relatedStateVersion,
    viewKey: facts.view.viewKey,
  })

  const available: FrontierCandidate[] = []
  const blocked: BlockedCandidate[] = []
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
      attemptsInCurrentState:
        candidate.targetKey === null
          ? 0
          : trajectory.attemptsInState(candidate.targetKey, currentState),
    }
    if (reason) blocked.push({ candidateId: candidate.id, targetKey: candidate.targetKey, reason })
    else available.push(entry)
  }

  // A target seen in another state, and not handled here, is a branch we have not taken yet.
  const handledHere = new Set(
    trajectory.attempts.filter((a) => a.beforeState === currentState).map((a) => a.targetKey),
  )
  const unexploredBranches: UnexploredBranch[] = [...trajectory.observedTargets.entries()]
    .filter(([targetKey, states]) => !states.has(currentState) && !handledHere.has(targetKey))
    .map(([targetKey, states]) => ({ targetKey, seenInStates: [...states].sort() }))
    .sort((a, b) => (a.targetKey < b.targetKey ? -1 : 1))

  const paths: FrontierPath[] = trajectory.transitions.map((transition) => ({
    steps: [{ targetKey: transition.targetKey, action: transition.action }],
    precondition: transition.from,
    postcondition: transition.to,
    effects: [...transition.effects],
  }))

  // Continue a sequence only when an available, still-untried entry can extend it.
  const continuation = available.find((entry) => entry.attemptsInCurrentState === 0)
  const continuousOpportunity =
    continuation && continuation.targetKey !== null
      ? { targetKey: continuation.targetKey, action: continuation.allowedActions[0] }
      : null

  return {
    available,
    blocked,
    unexploredBranches,
    paths,
    retained: [...available, ...blocked.map(toRetained(facts))],
    continuousOpportunity,
  }
}

/** Blocked controls are retained as full entries so a report can still name them by role and cost. */
const toRetained =
  (facts: PlanningFacts) =>
  (blocked: BlockedCandidate): FrontierCandidate => {
    const candidate = facts.input.candidates.find((c) => c.id === blocked.candidateId)!
    return {
      candidateId: candidate.id,
      targetKey: candidate.targetKey,
      text: candidate.text,
      role: candidate.role,
      publicState: { ...candidate.publicState },
      context: candidate.context,
      allowedActions: candidate.allowedActions,
      estimatedCost: candidate.estimatedCost,
      attributable: candidate.targetKey !== null,
      attemptsInCurrentState: 0,
    }
  }