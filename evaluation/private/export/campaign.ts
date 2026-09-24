import type { ImportedApproval } from './approval-source.ts'

/**
 * The formal campaign's gating, decided before anything is spawned.
 *
 * The acceptance plan's 45-run matrix has preconditions that are not cosmetic: a passed smoke, a
 * passing diagnostic from the *same* frozen build, and - for groups B and D - an approved rule whose
 * source is actually present. Every one of those is a way a batch could be reported as more than it
 * was, so the decision is made here, in one place, and returned as data instead of being spread
 * through the runner as early exits.
 *
 * The plan is explicit about the absent-source case: complete G0-G4 and the safe A/C work, mark B/D
 * blocked, do not fabricate approval. `gate` stays false either way - a plan is never a pass.
 */

export type GroupId = 'A' | 'B' | 'C' | 'D'

/** How a group's rules are set up. A/C must have no equivalent retry rule; B/D load the approved one. */
export type RuleState = 'builtin-only' | 'approved-imported'

export interface MatrixGroup {
  readonly group: GroupId
  /** The cases the group runs, repeated `repeats` times each. */
  readonly cases: readonly string[]
  readonly repeats: number
  readonly runs: number
  readonly rules: RuleState
  /** Which arena and profile the group points at. */
  readonly business: 'export' | 'checkout'
}

export const FORMAL_MATRIX: readonly MatrixGroup[] = Object.freeze([
  {
    group: 'A',
    cases: ['E0', 'E1', 'E2', 'E3', 'E4'],
    repeats: 3,
    runs: 15,
    rules: 'builtin-only',
    business: 'export',
  },
  {
    group: 'B',
    cases: ['E1', 'E2'],
    repeats: 3,
    runs: 6,
    rules: 'approved-imported',
    business: 'export',
  },
  {
    group: 'C',
    cases: ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'],
    repeats: 3,
    runs: 18,
    rules: 'builtin-only',
    business: 'checkout',
  },
  {
    group: 'D',
    cases: ['abnormal', 'healthy'],
    repeats: 3,
    runs: 6,
    rules: 'approved-imported',
    business: 'checkout',
  },
])

export interface CampaignInput {
  /** The diagnostic this formal batch is authorised by, if one was supplied. */
  readonly diagnostic?: {
    readonly directory: string
    readonly passed: boolean
    readonly buildHash: string
  }
  /** The read-only import result, or why it could not be made. */
  readonly approvedSource:
    | { readonly ok: true; readonly imported: ImportedApproval }
    | { readonly ok: false; readonly reason: string }
  /** The build this campaign will run. A diagnostic from any other build authorises nothing. */
  readonly currentBuildHash: string
  /** The campaign's remaining shared budget, in USD. */
  readonly budgetRemainingUsd: number
  readonly requestedGroups: readonly GroupId[]
}

export interface PlannedGroup extends MatrixGroup {
  /** A per-group database, so B cannot inherit anything A discovered. */
  readonly database: string
}

export interface BlockedGroup {
  readonly group: GroupId
  readonly reason: string
}

export interface CampaignPlan {
  readonly run: readonly PlannedGroup[]
  readonly blocked: readonly BlockedGroup[]
  readonly totalRuns: number
  readonly reasonCodes: readonly string[]
  /** Whether the two groups that need no approval all ran. */
  readonly aAndCComplete: boolean
  /** Whether the batch has a valid basis to be scored at all. */
  readonly scorable: boolean
  /** Never true from planning alone: a plan is not a result. */
  readonly gate: false
  readonly exitNonZero: boolean
  readonly diagnosticRefused: boolean
}

/**
 * Decide what the campaign may run.
 *
 * Ordering matters: a formal batch with no valid diagnostic does not run "most of" the matrix, it
 * has no precondition at all, so nothing runs and every group is reported as not-run. A batch that
 * can run but cannot satisfy B/D runs A/C and records B/D blocked, which is the plan's stated
 * absent-source behaviour.
 */
export function planCampaign(input: CampaignInput): CampaignPlan {
  const reasonCodes: string[] = []
  const blocked: BlockedGroup[] = []

  // The diagnostic must exist, have passed, and come from the build about to be run. A diagnostic
  // from another build proves something about that build, not this one.
  const diagnosticRefused =
    !input.diagnostic ||
    !input.diagnostic.passed ||
    input.diagnostic.buildHash !== input.currentBuildHash
  if (!input.diagnostic) reasonCodes.push('diagnostic-missing')
  else if (!input.diagnostic.passed) reasonCodes.push('diagnostic-not-passed')
  else if (input.diagnostic.buildHash !== input.currentBuildHash)
    reasonCodes.push('diagnostic-build-mismatch')
  if (diagnosticRefused)
    return {
      run: [],
      blocked: FORMAL_MATRIX.map((g) => ({ group: g.group, reason: 'no-valid-diagnostic' })),
      totalRuns: 0,
      reasonCodes,
      aAndCComplete: false,
      scorable: false,
      gate: false,
      exitNonZero: true,
      diagnosticRefused: true,
    }

  if (input.budgetRemainingUsd <= 0) {
    reasonCodes.push('campaign-budget-exhausted')
    return {
      run: [],
      blocked: FORMAL_MATRIX.map((g) => ({ group: g.group, reason: 'campaign-budget-exhausted' })),
      totalRuns: 0,
      reasonCodes,
      aAndCComplete: false,
      scorable: false,
      gate: false,
      exitNonZero: true,
      diagnosticRefused: false,
    }
  }

  const requested = new Set(input.requestedGroups)
  const run: PlannedGroup[] = []
  for (const group of FORMAL_MATRIX) {
    if (!requested.has(group.group)) {
      reasonCodes.push(`group-not-requested:${group.group}`)
      continue
    }
    // B and D exist to reuse the approved declaration. Without it there is nothing to migrate, and
    // running them with the built-in rules only would report a rule-migration result that never
    // migrated a rule.
    if (group.rules === 'approved-imported' && !input.approvedSource.ok) {
      blocked.push({ group: group.group, reason: input.approvedSource.reason })
      continue
    }
    run.push({ ...group, database: `group-${group.group.toLowerCase()}` })
  }

  const aAndCComplete = ['A', 'C'].every((g) => run.some((r) => r.group === g))
  if (!aAndCComplete) reasonCodes.push('campaign-incomplete')
  if (blocked.length) reasonCodes.push('approval-source-unavailable')

  return {
    run,
    blocked,
    totalRuns: run.reduce((n, g) => n + g.runs, 0),
    reasonCodes,
    aAndCComplete,
    // A batch whose required groups could not all run is still scorable - its A/C results are real
    // evidence - but it can never gate, which is what keeps "blocked" from reading as "passed".
    scorable: run.length > 0,
    gate: false,
    exitNonZero: blocked.length > 0 || !aAndCComplete,
    diagnosticRefused: false,
  }
}
