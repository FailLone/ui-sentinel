/**
 * Reusable exploration strategies: boundary input, return/refresh, repeat operation, state switch,
 * and counterexample investigation.
 *
 * Every strategy states WHEN it applies and what it must measure afterwards. Applicability is
 * decided from caller-declared public facts only — a control's role, its declared toggle state, an
 * observed navigation — never from a guess about the product's business rules.
 *
 * `boundary-input` is the sharp edge: it may only propose a value when the caller supplied a
 * PUBLIC constraint in the control's context. Without one it stays applicable-but-not-proposable,
 * because inventing an SLA or a business rule is exactly the failure this module must prevent.
 *
 * No browser, model, network, database, environment or file access happens here.
 */
import type { ActualEffect, PublicAction } from '../decisions/exploration/contracts.ts'
import type { PlanningFacts } from './facts.ts'
import type { Frontier } from './frontier.ts'

export type StrategyId = 'boundary-input' | 'return-refresh' | 'repeat-operation' | 'state-switch'

export type StrategyPlanStep = {
  readonly targetKey: string
  readonly action: PublicAction
}

export type StrategyAssessment = {
  readonly strategyId: StrategyId
  readonly applicable: boolean
  /** False when an applicable strategy still lacks the public facts needed to act on it. */
  readonly proposable: boolean
  readonly reason: string
  readonly plan: { readonly steps: readonly StrategyPlanStep[] }
  readonly maxActions: number
  /** The post-observation predicate this strategy must satisfy to count as verified. */
  readonly requiredMeasurement: string
}

/** Local policy ceiling, not a provider promise. A caller may tighten it, never raise it. */
export const STRATEGY_MAX_ACTIONS = 2

const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton'])

/** A public constraint is present only when the caller's own context text states one. */
function statesPublicConstraint(context: string): boolean {
  return /\d|maximum|minimum|最多|最少|不超过|至少|限|required|必须/.test(context)
}

export function assessStrategies(facts: PlanningFacts, frontier: Frontier): StrategyAssessment[] {
  const attemptsHere = frontier.available.filter((entry) => entry.attemptsInCurrentState > 0)
  const textEntries = frontier.available.filter((entry) => TEXT_ROLES.has(entry.role))
  const toggles = frontier.available.filter((entry) =>
    (['expanded', 'selected'] as const).some((key) => entry.publicState[key] === true),
  )
  // Navigation is taken from the OBSERVED effect, never inferred from two state keys differing:
  // an in-page state change also moves the key without the page ever navigating.
  const navigated = frontier.paths.some((path) => path.effects.includes('navigated'))

  const base = { steps: [] as StrategyPlanStep[] }
  return [
    {
      strategyId: 'repeat-operation',
      applicable: attemptsHere.length > 0,
      proposable: attemptsHere.length > 0,
      reason:
        attemptsHere.length > 0
          ? 'a target was already tried in the current related state'
          : 'no attempt has started in the current related state',
      plan: attemptsHere.length
        ? {
            steps: attemptsHere.map((entry) => ({
              targetKey: entry.targetKey!,
              action: entry.allowedActions[0],
            })),
          }
        : base,
      maxActions: STRATEGY_MAX_ACTIONS,
      requiredMeasurement: 'before-and-after',
    },
    {
      strategyId: 'state-switch',
      applicable: toggles.length > 0,
      proposable: toggles.length > 0,
      reason:
        toggles.length > 0
          ? 'a control declares an expanded/selected state that can be switched'
          : 'no control declares a toggle state, so there is nothing to switch',
      plan: toggles.length
        ? { steps: toggles.map((entry) => ({ targetKey: entry.targetKey!, action: entry.allowedActions[0] })) }
        : base,
      maxActions: STRATEGY_MAX_ACTIONS,
      requiredMeasurement: 'before-and-after',
    },
    {
      strategyId: 'return-refresh',
      applicable: navigated,
      proposable: navigated,
      reason: navigated
        ? 'an observed action navigated away from a state we still hold'
        : 'no observed navigation, so there is nothing to return to',
      plan: navigated ? { steps: [] } : base,
      maxActions: STRATEGY_MAX_ACTIONS,
      requiredMeasurement: 're-observed-postcondition',
    },
    {
      strategyId: 'boundary-input',
      applicable: textEntries.length > 0,
      proposable: textEntries.some((entry) => statesPublicConstraint(entry.context)),
      reason:
        textEntries.length === 0
          ? 'no text entry control is available'
          : textEntries.some((entry) => statesPublicConstraint(entry.context))
            ? 'a text entry declares a public constraint'
            : 'text entry present but no public-constraint is declared, so no value may be proposed',
      plan: textEntries.some((entry) => statesPublicConstraint(entry.context))
        ? {
            steps: textEntries
              .filter((entry) => statesPublicConstraint(entry.context))
              .map((entry) => ({ targetKey: entry.targetKey!, action: entry.allowedActions[0] })),
          }
        : base,
      maxActions: STRATEGY_MAX_ACTIONS,
      requiredMeasurement: 'declared-constraint-outcome',
    },
  ]
}

export type CounterexampleClaim = {
  readonly targetKey: string
  readonly claimedEffect: ActualEffect
  /** Whether the claimed effect was actually measured. An unmeasured claim is not a defect. */
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
      reason: 'claimed effect has no measured support and cannot be treated as a defect',
      requiredMeasurement: 'measured-observation',
    }
  const alternatives = facts.input.candidates.filter(
    (candidate) =>
      candidate.targetKey !== null &&
      candidate.targetKey !== claim.targetKey &&
      candidate.role === facts.input.candidates.find((c) => c.targetKey === claim.targetKey)?.role,
  )
  if (alternatives.length > 0)
    return {
      kind: 'compare-healthy',
      steps: alternatives.map((candidate) => ({
        targetKey: candidate.targetKey!,
        action: candidate.allowedActions[0],
      })),
      reason: 'same-role neighbour is available to compare against a claimed anomaly',
      requiredMeasurement: 'comparison-and-healthy-outcome',
    }
  return {
    kind: 'alternative-sequence',
    steps: [],
    reason: 'no comparable neighbour, so an alternative sequence is required instead',
    requiredMeasurement: 'alternate-path-outcome',
  }
}