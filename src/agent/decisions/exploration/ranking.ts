/**
 * Deterministic, pure program ranking for exploration candidates.
 *
 * No model, network, browser, database or run configuration is touched. Identical normalized
 * input plus policy version yields byte-identical output, and reordering the input candidate
 * array cannot change the result.
 *
 * Lexicographic priority (plan §5):
 *   1. not yet attempted in the *current* related state first
 *   2. fewer attempts in the current related state
 *   3. model composite score, descending (only when a scored receipt was supplied)
 *   4. lower estimated cost
 *   5. candidate id byte order
 *
 * Fairness is an explicit, bounded rotation: every FOURTH decision promotes the eligible,
 * still-untried candidate that has been waiting longest. Rotation state is passed in, never
 * kept in a hidden global, and it can never promote a candidate already tried in this state.
 */
import type { ExplorationCandidate, ExplorationInput } from './contracts.ts'
import { POLICY_VERSION } from './contracts.ts'

/** Fixed fusion weights, documented in docs/r1-jev-decision.md before this module was committed. */
export const FUSION_WEIGHTS = { relevance: 0.6, informationGain: 0.4 } as const

/** One decision in four is reserved for the longest-waiting eligible untried candidate. */
export const ROTATION_CADENCE = 4

export type CandidateScore = {
  readonly candidateId: string
  readonly relevance: number
  readonly informationGain: number
  readonly uncertainty: number | null
}

export type FairnessState = {
  /** Zero-based index of the decision being taken in this session. */
  readonly decisionIndex: number
  /** Decision index at which each candidate id first became eligible (waiting time). */
  readonly firstEligibleDecision: Readonly<Record<string, number>>
}

export type RankingOptions = {
  readonly scores?: readonly CandidateScore[]
  readonly fairness?: FairnessState
}

export type RejectionReason = 'out-of-scope' | 'not-visible' | 'disabled' | 'no-action'

export type RankedEntry = {
  readonly id: string
  readonly attemptsInCurrentState: number
  readonly composite: number | null
}

export type RankingReceipt = {
  readonly kind: 'ranked' | 'handoff'
  readonly policyVersion: string
  readonly orderedCandidateIds: readonly string[]
  readonly eligible: readonly RankedEntry[]
  /** Every candidate excluded from the queue, with its checkable reason. */
  readonly rejected: readonly { candidateId: string; reason: RejectionReason }[]
  readonly rotation: { applied: boolean; promotedCandidateId: string | null }
}

/**
 * Attempts are attributed by caller-provided stable identity plus action, counted only when the
 * attempt *started* in the state we are in now. A short ref or the visible text is never used.
 * A candidate whose targetKey is unknown cannot be attributed at all, so it stays untried.
 */
function attemptsInCurrentState(input: ExplorationInput, candidate: ExplorationCandidate): number {
  if (!candidate.targetKey) return 0
  return input.history.filter(
    (entry) =>
      entry.targetKey === candidate.targetKey &&
      entry.outcome !== 'unknown' &&
      entry.beforeStateVersion === input.state.relatedStateVersion,
  ).length
}

/**
 * Executability is taken from the caller's declarations only. A control that is not visible, not
 * enabled, or has no permitted action is ineligible; text is never used to infer either.
 */
function ineligibility(
  input: ExplorationInput,
  candidate: ExplorationCandidate,
): RejectionReason | null {
  if (!input.scope.executableCandidateIds.includes(candidate.id)) return 'out-of-scope'
  if (candidate.publicState.visible !== true) return 'not-visible'
  if (candidate.publicState.enabled !== true) return 'disabled'
  if (candidate.allowedActions.length === 0) return 'no-action'
  return null
}

function compositeFor(scores: readonly CandidateScore[] | undefined, id: string): number | null {
  const score = scores?.find((s) => s.candidateId === id)
  if (!score) return null
  return (
    FUSION_WEIGHTS.relevance * score.relevance +
    FUSION_WEIGHTS.informationGain * score.informationGain
  )
}

function compare(
  a: RankedEntry,
  b: RankedEntry,
  attempts: Map<string, number>,
  cost: Map<string, number>,
) {
  const aAttempts = attempts.get(a.id)!
  const bAttempts = attempts.get(b.id)!
  const aTried = aAttempts > 0 ? 1 : 0
  const bTried = bAttempts > 0 ? 1 : 0
  if (aTried !== bTried) return aTried - bTried
  if (aAttempts !== bAttempts) return aAttempts - bAttempts
  if (a.composite !== null && b.composite !== null && a.composite !== b.composite)
    return b.composite - a.composite
  const aCost = cost.get(a.id)!
  const bCost = cost.get(b.id)!
  if (aCost !== bCost) return aCost - bCost
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function rankCandidates(
  input: ExplorationInput,
  options: RankingOptions = {},
): RankingReceipt {
  const rejected: { candidateId: string; reason: RejectionReason }[] = []
  const eligible: RankedEntry[] = []
  const attempts = new Map<string, number>()
  const cost = new Map<string, number>()

  for (const candidate of input.candidates) {
    const reason = ineligibility(input, candidate)
    if (reason) {
      rejected.push({ candidateId: candidate.id, reason })
      continue
    }
    const count = attemptsInCurrentState(input, candidate)
    attempts.set(candidate.id, count)
    cost.set(candidate.id, candidate.estimatedCost)
    eligible.push({
      id: candidate.id,
      attemptsInCurrentState: count,
      composite: compositeFor(options.scores, candidate.id),
    })
  }

  eligible.sort((a, b) => compare(a, b, attempts, cost))

  const rotation = { applied: false, promotedCandidateId: null as string | null }
  const fairness = options.fairness
  // Zero-based `decisionIndex`, so the 4th, 8th, ... decision (indices 3, 7, ...) rotates.
  if (fairness && (fairness.decisionIndex + 1) % ROTATION_CADENCE === 0) {
    const waitingUntried = eligible
      .filter((entry) => entry.attemptsInCurrentState === 0)
      .filter((entry) => entry.id !== eligible[0]?.id)
      .sort((a, b) => {
        const aWait = fairness.firstEligibleDecision[a.id] ?? fairness.decisionIndex
        const bWait = fairness.firstEligibleDecision[b.id] ?? fairness.decisionIndex
        if (aWait !== bWait) return aWait - bWait
        return a.id < b.id ? -1 : 1
      })
    const promoted = waitingUntried[0]
    if (promoted) {
      rotation.applied = true
      rotation.promotedCandidateId = promoted.id
      const index = eligible.findIndex((e) => e.id === promoted.id)
      eligible.unshift(...eligible.splice(index, 1))
    }
  }

  return {
    kind: eligible.length > 0 ? 'ranked' : 'handoff',
    policyVersion: POLICY_VERSION,
    orderedCandidateIds: eligible.map((e) => e.id),
    eligible,
    rejected,
    rotation,
  }
}
