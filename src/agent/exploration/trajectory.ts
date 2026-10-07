/**
 * Pure state / path trajectory for the R1 exploration planner.
 *
 * This module is the planner's memory: it turns a caller-supplied event log into the facts a plan
 * is allowed to reason about. Three things are deliberately kept apart and can never be inferred
 * from one another:
 *
 *   visited  - the page/state was observed (we looked at it)
 *   selected - an action was dispatched against a target
 *   verified - an action's post-observation was MEASURED and attached to a checkable item
 *
 * "We opened the page", "we clicked it" and "we proved something about it" are different claims.
 * Only a `settled` event carrying both an `itemId` and an `evidenceRef` reaches `verified`.
 *
 * No browser, model, network, database, environment or file access happens here.
 */
import type { ActualEffect, Outcome, PublicAction } from '../decisions/exploration/contracts.ts'

export type StateKeyInput = {
  readonly relatedStateVersion: string
  readonly viewKey: string
}

/** Stable, order-independent identity of a related state (version + declared view context). */
export function stateKeyOf(input: StateKeyInput): string {
  return `${input.relatedStateVersion}::${input.viewKey}`
}

export type PlanningStateKey = StateKeyInput

export type TrajectoryEvent =
  | {
      readonly kind: 'observed'
      readonly stateKey: PlanningStateKey
      readonly candidates: readonly { readonly candidateId: string; readonly targetKey: string }[]
    }
  | {
      readonly kind: 'dispatched'
      readonly targetKey: string
      readonly action: PublicAction
      readonly beforeStateKey: PlanningStateKey
    }
  | {
      readonly kind: 'settled'
      readonly targetKey: string
      readonly action: PublicAction
      readonly beforeStateKey: PlanningStateKey
      readonly afterStateKey: PlanningStateKey
      readonly effects: readonly ActualEffect[]
      readonly outcome: Outcome
      /** Present only when the post-observation was actually measured. */
      readonly evidenceRef?: string
      /** The checkable item this measured post-observation belongs to. */
      readonly itemId?: string
    }

export type TrajectoryAttempt = {
  readonly targetKey: string
  readonly action: PublicAction
  readonly beforeState: string
  readonly afterState: string | null
  readonly outcome: Outcome | null
  readonly effects: readonly ActualEffect[]
  readonly selected: true
  readonly verified: boolean
}

export type TrajectoryTransition = {
  readonly from: string
  readonly to: string
  readonly targetKey: string
  readonly action: PublicAction
  readonly effects: readonly ActualEffect[]
}

export type Trajectory = {
  readonly visitedStates: readonly string[]
  /** Candidates seen per state, so an unvisited branch can be named rather than forgotten. */
  readonly observations: ReadonlyMap<string, readonly string[]>
  /** targetKey -> the set of state keys it has been observed in. */
  readonly observedTargets: ReadonlyMap<string, ReadonlySet<string>>
  readonly attempts: readonly TrajectoryAttempt[]
  readonly transitions: readonly TrajectoryTransition[]
  readonly verifiedItems: readonly string[]
  attemptsInState(targetKey: string, stateKey: string): number
}

type Mutable = {
  visited: string[]
  observations: Map<string, string[]>
  observedTargets: Map<string, Set<string>>
  attempts: TrajectoryAttempt[]
  transitions: TrajectoryTransition[]
  verified: string[]
}

/**
 * Fold an event log into a trajectory. The input is never mutated; a new value is returned.
 * An attempt's outcome is attributed to the state it *started* in: a candidate can be untried in a
 * state that was reached later, and a changed state therefore re-opens a target for checking.
 */
export function reduceTrajectory(events: readonly TrajectoryEvent[]): Trajectory {
  const acc: Mutable = {
    visited: [],
    observations: new Map(),
    observedTargets: new Map(),
    attempts: [],
    transitions: [],
    verified: [],
  }

  for (const event of events) {
    if (event.kind === 'observed') {
      const stateKey = stateKeyOf(event.stateKey)
      if (!acc.visited.includes(stateKey)) acc.visited.push(stateKey)
      const previous = acc.observations.get(stateKey) ?? []
      acc.observations.set(stateKey, [
        ...previous,
        ...event.candidates
          .map((c) => c.candidateId)
          .filter((id) => !previous.includes(id)),
      ])
      for (const candidate of event.candidates) {
        const seen = acc.observedTargets.get(candidate.targetKey) ?? new Set<string>()
        seen.add(stateKey)
        acc.observedTargets.set(candidate.targetKey, seen)
      }
      continue
    }
    if (event.kind === 'dispatched') {
      acc.attempts.push({
        targetKey: event.targetKey,
        action: event.action,
        beforeState: stateKeyOf(event.beforeStateKey),
        afterState: null,
        outcome: null,
        effects: [],
        selected: true,
        verified: false,
      })
      continue
    }
    // settled: close the most recent matching open attempt.
    const open = [...acc.attempts]
      .reverse()
      .find(
        (a) =>
          a.targetKey === event.targetKey &&
          a.action === event.action &&
          a.beforeState === stateKeyOf(event.beforeStateKey) &&
          a.outcome === null,
      )
    const from = stateKeyOf(event.beforeStateKey)
    const to = stateKeyOf(event.afterStateKey)
    const measured = event.outcome === 'observed' && Boolean(event.evidenceRef) && Boolean(event.itemId)
    acc.attempts = acc.attempts.map((a) =>
      a === open
        ? {
            ...a,
            afterState: to,
            outcome: event.outcome,
            effects: [...event.effects],
            verified: measured,
          }
        : a,
    )
    acc.transitions.push({
      from,
      to,
      targetKey: event.targetKey,
      action: event.action,
      effects: [...event.effects],
    })
    if (measured && event.itemId && !acc.verified.includes(event.itemId))
      acc.verified.push(event.itemId)
  }

  const attempts = acc.attempts
  return {
    visitedStates: [...acc.visited],
    observations: new Map(acc.observations),
    observedTargets: new Map(acc.observedTargets),
    attempts,
    transitions: acc.transitions,
    verifiedItems: acc.verified,
    /**
     * Attempts that STARTED in `stateKey` and actually completed. An `unknown` outcome is not a
     * completed attempt, matching the ranking module's attribution rule.
     */
    attemptsInState(targetKey: string, stateKey: string): number {
      return attempts.filter(
        (a) => a.targetKey === targetKey && a.beforeState === stateKey && a.outcome !== null && a.outcome !== 'unknown',
      ).length
    },
  }
}