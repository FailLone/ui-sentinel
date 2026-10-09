/** Pure high-level intents, not executable browser commands or authority grants.
 * Unsupported/missing facts produce explicit non-proposable assessments. */
import { z } from 'zod'
import type { ActualEffect, PublicAction } from '../decisions/exploration/contracts.ts'
import type { PlanningFacts } from './facts.ts'
import { ineligibility, type Frontier } from './frontier.ts'
import { currentStateOf } from './trajectory.ts'
export type StrategyId =
  | 'boundary-input'
  | 'return-refresh'
  | 'repeat-operation'
  | 'state-switch'
  | 'recovery'
export type StrategyPlanStep =
  | { readonly targetKey: string; readonly action: Exclude<PublicAction, 'fill'> }
  | {
      readonly targetKey: string
      readonly action: 'fill'
      readonly value: string
      readonly constraintRef: string
    }
  | {
      readonly targetKey: null
      readonly action: 'back' | 'refresh'
      readonly expectedState: string
      readonly evidenceRef: string
    }
export type StrategyAssessment = {
  readonly strategyId: StrategyId
  readonly applicable: boolean
  readonly proposable: boolean
  readonly reason: string
  readonly plan: { readonly steps: readonly StrategyPlanStep[] }
  readonly maxActions: number
  readonly requiredMeasurement: string
  readonly precondition: string
  readonly observationVersion: string
}
export const STRATEGY_MAX_ACTIONS = 2
const text = z
  .string()
  .min(1)
  .max(2048)
  .refine((s) => !!s.trim())
const optionsSchema = z
  .object({
    /** These identify intents supported by the future bridge, NOT permission to execute. */
    fillCandidateIds: z.array(text).max(32).default([]),
    boundaries: z
      .array(
        z
          .object({
            candidateId: text,
            stateKey: text,
            observationVersion: text,
            kind: z.literal('max-length'),
            maximum: z.number().int().min(0).max(256),
            evidenceRef: text,
          })
          .strict(),
      )
      .max(32)
      .default([]),
    navigation: z
      .object({
        action: z.enum(['back', 'refresh']),
        stateKey: text,
        expectedState: text,
        observationVersion: text,
        evidenceRef: text,
      })
      .strict()
      .optional(),
    repeatReasons: z.record(z.string(), text).default({}),
    recovery: z
      .object({ stateKey: text, consumed: z.number().int().nonnegative(), reason: text })
      .strict()
      .optional(),
  })
  .strict()
export type StrategyOptions = z.input<typeof optionsSchema>
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton'])
export function assessStrategies(
  facts: PlanningFacts,
  frontier: Frontier,
  rawOptions: StrategyOptions = {},
): StrategyAssessment[] {
  const current = currentStateOf(facts),
    observation = facts.input.state.observationVersion
  const fresh = frontier.stateKey === current && frontier.observationVersion === observation
  const parsed = optionsSchema.safeParse(rawOptions)
  const options = parsed.success ? parsed.data : optionsSchema.parse({})
  const b = facts.input.budget
  const maxActions =
    b.remainingDecisions > 0 && b.remainingMs > 0 && b.maxRequestMs > 0
      ? Math.min(STRATEGY_MAX_ACTIONS, b.remainingActions)
      : 0
  // Recheck against current facts so a stale frontier cannot resurrect an old candidate.
  const eligible = frontier.available.flatMap((entry) => {
    const candidate = facts.input.candidates.find(
      (c) => c.id === entry.candidateId && c.targetKey === entry.targetKey,
    )
    if (
      entry.targetKey === null ||
      entry.replayBlocked ||
      !candidate ||
      ineligibility(facts, candidate) !== null
    )
      return []
    return [
      {
        ...entry,
        allowedActions: candidate.allowedActions,
        publicState: candidate.publicState,
        role: candidate.role,
      },
    ]
  })
  const attemptEntries = frontier.available.filter((e) => e.attemptsInCurrentState > 0)
  const repeats = eligible.filter(
    (e) =>
      e.allowedActions[0] !== 'fill' &&
      e.attemptsInCurrentState > 0 &&
      e.attemptsInCurrentState < 2 &&
      options.repeatReasons[e.candidateId],
  )
  const toggles = eligible.filter(
    (e) =>
      e.allowedActions.includes('click') &&
      (e.publicState.expanded === true || e.publicState.selected === true) &&
      e.attemptsInCurrentState === 0,
  )
  const textEntries = eligible.filter(
    (e) => TEXT_ROLES.has(e.role) && e.attemptsInCurrentState === 0,
  )
  const nav = options.navigation
  const navigationCurrent =
    nav && nav.stateKey === current && nav.observationVersion === observation
  const navigationKnown =
    navigationCurrent &&
    (nav.action === 'refresh'
      ? nav.expectedState === current
      : frontier.paths.some(
          (p) =>
            p.postcondition === current &&
            p.steps.at(-1)?.effects.includes('navigated') &&
            p.steps.at(-1)?.from === nav.expectedState,
        ))
  const navSteps: StrategyPlanStep[] = navigationKnown
    ? [
        {
          targetKey: null,
          action: nav.action,
          expectedState: nav.expectedState,
          evidenceRef: nav.evidenceRef,
        },
      ]
    : []
  const boundary = options.boundaries.find(
    (c) =>
      c.stateKey === current &&
      c.observationVersion === observation &&
      options.fillCandidateIds.includes(c.candidateId) &&
      textEntries.some((e) => e.candidateId === c.candidateId),
  )
  const entry = boundary && textEntries.find((e) => e.candidateId === boundary.candidateId)
  // A max-length test uses a concrete max+1 value from a structured public constraint.
  const boundarySteps: StrategyPlanStep[] =
    boundary && entry
      ? [
          {
            targetKey: entry.targetKey!,
            action: 'fill',
            value: 'x'.repeat(boundary.maximum + 1),
            constraintRef: boundary.evidenceRef,
          },
        ]
      : []
  const make = (
    strategyId: StrategyId,
    applicable: boolean,
    steps: StrategyPlanStep[],
    requiredMeasurement: string,
    reason: string,
    cost = steps.length,
  ): StrategyAssessment => {
    const proposable =
      fresh && parsed.success && applicable && steps.length > 0 && cost <= maxActions
    return {
      strategyId,
      applicable,
      proposable,
      reason: !fresh
        ? 'stale-frontier'
        : !parsed.success
          ? 'invalid-strategy-context'
          : maxActions === 0
            ? 'budget-exhausted'
            : reason,
      plan: { steps: proposable ? steps : [] },
      maxActions,
      requiredMeasurement,
      precondition: current,
      observationVersion: observation,
    }
  }
  return [
    make(
      'repeat-operation',
      attemptEntries.length > 0,
      repeats
        .slice(0, maxActions)
        .map((e) => ({
          targetKey: e.targetKey!,
          action: e.allowedActions[0] as Exclude<PublicAction, 'fill'>,
        })),
      'before-and-after',
      'requires explicit repeat reason; at most two attempts in this state',
    ),
    make(
      'state-switch',
      toggles.length > 0,
      toggles
        .slice(0, maxActions)
        .map((e) => ({ targetKey: e.targetKey!, action: 'click' as const })),
      'before-and-after',
      'check one bounded subset; remaining candidates stay in the frontier',
    ),
    make(
      'return-refresh',
      frontier.paths.some((p) => p.effects.includes('navigated')) || !!nav,
      navSteps,
      're-observed-postcondition',
      'requires current navigation context and observed return path',
    ),
    make(
      'boundary-input',
      textEntries.length > 0,
      boundarySteps,
      'declared-constraint-outcome',
      'requires structured public-constraint and supported fill intent; reserve one action for post-observation',
      2,
    ),
    make(
      'recovery',
      !!options.recovery,
      options.recovery?.stateKey === current && options.recovery.consumed < 1 ? navSteps : [],
      're-observed-postcondition',
      'one read-only navigation recovery per stalled state; otherwise hand back',
    ),
  ]
}
export type CounterexampleClaim = {
  readonly targetKey: string
  readonly claimedEffect: ActualEffect
  readonly verified?: boolean
}
export type CounterexamplePlan = {
  readonly kind: 'compare-healthy' | 'alternative-sequence' | 'requires-verification'
  readonly steps: readonly StrategyPlanStep[]
  readonly reason: string
  readonly requiredMeasurement: string
}
export function planCounterexampleInvestigation(
  facts: PlanningFacts,
  claim: CounterexampleClaim,
): CounterexamplePlan {
  if (claim.verified !== true)
    return {
      kind: 'requires-verification',
      steps: [],
      reason: 'claim requires measured support',
      requiredMeasurement: 'measured-observation',
    }
  const original = facts.input.candidates.find((c) => c.targetKey === claim.targetKey)
  const b = facts.input.budget
  const available =
    original && b.remainingDecisions > 0 && b.remainingMs > 0 && b.maxRequestMs > 0
      ? facts.input.candidates.filter(
          (c) =>
            c.targetKey !== null &&
            c.targetKey !== claim.targetKey &&
            c.role === original.role &&
            c.allowedActions[0] !== 'fill' &&
            ineligibility(facts, c) === null,
        )
      : []
  const steps = available
    .slice(0, Math.min(STRATEGY_MAX_ACTIONS, b.remainingActions))
    .map((c) => ({
      targetKey: c.targetKey!,
      action: c.allowedActions[0] as Exclude<PublicAction, 'fill'>,
    }))
  if (steps.length)
    return {
      kind: 'compare-healthy',
      steps,
      reason: 'same-role comparison candidate; health still requires measurement',
      requiredMeasurement: 'comparison-and-healthy-outcome',
    }
  return {
    kind: 'alternative-sequence',
    steps: [],
    reason: 'handoff: no eligible affordable comparison; agent must plan an alternate path',
    requiredMeasurement: 'alternate-path-outcome',
  }
}
