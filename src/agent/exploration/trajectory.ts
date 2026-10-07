/** Pure, run-local projection of executor observations. Never an inspection-ledger writer. */
import { z } from 'zod'
import {
  actualEffects,
  outcomes,
  publicActions,
  type PublicAction,
} from '../decisions/exploration/contracts.ts'
const id = z
  .string()
  .min(1)
  .max(256)
  .refine((s) => s.trim().length > 0)
export const planningStateSchema = z
  .object({
    pageId: id,
    documentVersion: id,
    relatedStateVersion: id,
    viewKey: id,
  })
  .strict()
export type StateKeyInput = z.infer<typeof planningStateSchema>
export type PlanningStateKey = StateKeyInput
export function stateKeyOf(input: StateKeyInput): string {
  const s = planningStateSchema.parse(input)
  return JSON.stringify([s.pageId, s.documentVersion, s.relatedStateVersion, s.viewKey])
}
export function currentStateOf(facts: {
  input: { state: Omit<StateKeyInput, 'viewKey'> }
  view: { viewKey: string }
}): string {
  return stateKeyOf({
    pageId: facts.input.state.pageId,
    documentVersion: facts.input.state.documentVersion,
    relatedStateVersion: facts.input.state.relatedStateVersion,
    viewKey: facts.view.viewKey,
  })
}
/** Recovery/replay limits belong to one branch in one relevant state. */
export function branchKeyOf(stateKey: string, targetKey: string): string {
  return JSON.stringify([stateKey, targetKey])
}
const common = {
  attemptId: id,
  targetKey: id,
  action: z.enum(publicActions),
  beforeStateKey: planningStateSchema,
  itemId: id.optional(),
}
const eventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('observed'),
      stateKey: planningStateSchema,
      candidates: z.array(z.object({ candidateId: id, targetKey: id }).strict()).max(32),
    })
    .strict(),
  z.object({ kind: z.literal('dispatched'), ...common }).strict(),
  z
    .object({
      kind: z.literal('settled'),
      ...common,
      afterStateKey: planningStateSchema,
      effects: z.array(z.enum(actualEffects)).max(3),
      outcome: z.enum(outcomes),
      evidenceRef: id.optional(),
    })
    .strict(),
])
export type TrajectoryEvent = z.infer<typeof eventSchema>
export type TrajectoryAttempt = {
  readonly attemptId: string
  readonly targetKey: string
  readonly action: PublicAction
  readonly dispatchedIndex: number
  readonly settledIndex: number | null
  readonly beforeState: string
  readonly afterState: string | null
  readonly outcome: 'observed' | 'failed' | 'unknown' | null
  readonly effects: readonly ('expanded' | 'content-changed' | 'navigated')[]
  readonly selected: true
  readonly verified: boolean
  readonly itemId: string | null
  readonly evidenceRef: string | null
}
export type TrajectoryTransition = {
  readonly attemptId: string
  readonly from: string
  readonly to: string
  readonly targetKey: string
  readonly action: PublicAction
  readonly effects: TrajectoryAttempt['effects']
}
export type Trajectory = {
  readonly visitedStates: readonly string[]
  readonly observations: ReadonlyMap<string, readonly string[]>
  readonly observedTargets: ReadonlyMap<string, ReadonlySet<string>>
  readonly attempts: readonly TrajectoryAttempt[]
  readonly transitions: readonly TrajectoryTransition[]
  readonly verifiedItems: readonly string[]
  readonly rejectedEvents: readonly { index: number; reason: string }[]
  attemptsInState(targetKey: string, stateKey: string): number
}
/** Match a unique dispatch and declared check item. Invalid or late receipts are diagnostics.
 * Unknown/failed outcomes stay visible but cannot establish successful paths/verification. */
export function reduceTrajectory(events: readonly unknown[]): Trajectory {
  const visited = new Set<string>(),
    observations = new Map<string, string[]>()
  const observedTargets = new Map<string, Set<string>>()
  const attempts: TrajectoryAttempt[] = [],
    transitions: TrajectoryTransition[] = []
  const rejectedEvents: { index: number; reason: string }[] = []
  for (const [index, raw] of events.entries()) {
    const parsed = eventSchema.safeParse(raw)
    const reject = (reason: string) => rejectedEvents.push({ index, reason })
    if (!parsed.success) {
      reject('invalid-event')
      continue
    }
    const e = parsed.data
    if (e.kind === 'observed') {
      const key = stateKeyOf(e.stateKey)
      visited.add(key)
      observations.set(key, [
        ...new Set([...(observations.get(key) ?? []), ...e.candidates.map((c) => c.candidateId)]),
      ])
      for (const c of e.candidates) {
        const seen = observedTargets.get(c.targetKey) ?? new Set<string>()
        seen.add(key)
        observedTargets.set(c.targetKey, seen)
      }
      continue
    }
    const before = stateKeyOf(e.beforeStateKey)
    const n = attempts.findIndex((a) => a.attemptId === e.attemptId)
    if (e.kind === 'dispatched') {
      if (n !== -1) {
        reject('duplicate-dispatch')
        continue
      }
      attempts.push({
        attemptId: e.attemptId,
        targetKey: e.targetKey,
        action: e.action,
        dispatchedIndex: index,
        settledIndex: null,
        beforeState: before,
        afterState: null,
        outcome: null,
        effects: [],
        selected: true,
        verified: false,
        itemId: e.itemId ?? null,
        evidenceRef: null,
      })
      continue
    }
    const a = attempts[n]
    if (
      !a ||
      a.outcome !== null ||
      a.targetKey !== e.targetKey ||
      a.action !== e.action ||
      a.beforeState !== before ||
      a.itemId !== (e.itemId ?? null)
    ) {
      reject('unmatched-or-closed-settlement')
      continue
    }
    const after = stateKeyOf(e.afterStateKey)
    const verified = e.outcome === 'observed' && a.itemId !== null && !!e.evidenceRef
    attempts[n] = {
      ...a,
      settledIndex: index,
      afterState: after,
      outcome: e.outcome,
      effects: [...e.effects],
      verified,
      evidenceRef: e.evidenceRef ?? null,
    }
    if (e.outcome === 'observed')
      transitions.push({
        attemptId: e.attemptId,
        from: before,
        to: after,
        targetKey: e.targetKey,
        action: e.action,
        effects: [...e.effects],
      })
  }
  return {
    visitedStates: [...visited],
    observations,
    observedTargets,
    attempts,
    transitions,
    rejectedEvents,
    verifiedItems: [...new Set(attempts.filter((a) => a.verified).map((a) => a.itemId!))],
    attemptsInState(targetKey, stateKey) {
      return attempts.filter(
        (a) =>
          a.targetKey === targetKey &&
          a.beforeState === stateKey &&
          a.outcome !== null &&
          a.outcome !== 'unknown',
      ).length
    },
  }
}
