import type { VisualCaseId } from '../fixtures/visual.ts'

/**
 * Execution plans and outcome classification for the validation runners (plan P3.2-P3.3).
 *
 * A batch is only comparable when its whole plan is written down before it starts and every planned
 * row keeps a result, including the ones never attempted. That is what lets a scoreboard say "45 of 45"
 * rather than quietly averaging whatever survived, and it is why `not-run` is a first-class outcome
 * rather than an omission.
 *
 * The outcome vocabulary lives here, in the evaluation layer, so the product's own run-status enum is
 * never bent to carry an evaluation meaning.
 */

export type OutcomeClass =
  | 'passed'
  | 'quality-failure'
  | 'provider-error'
  | 'configuration-error'
  | 'evidence-invalid'
  | 'isolation-lost'
  | 'side-effect-unknown'
  | 'cancelled'
  | 'budget-exhausted'
  | 'not-run'

export interface PlanRow {
  readonly group: string
  readonly case: string
  readonly repeat: number
}

/** What one row cost in time and requests, for the batch manifest's totals (plan P3.4). */
export interface RowTiming {
  readonly elapsedMs: number
  /** Per-kind durations: `null` when the run never recorded one, never a zero standing in for it. */
  readonly modelMs: number | null
  readonly toolMs: number | null
  readonly visionRequests: number
  readonly agentRequests: number
  /** Attempts that failed and were recorded; they stay in the denominator. */
  readonly failedAttempts?: number
  /** Requests sent whose usage could not be established. */
  readonly unknownUsage?: number
}

const ZERO_TIMING = {
  elapsedMs: 0,
  // A row that never ran recorded no duration; `null` says so, and the manifest keeps it null.
  modelMs: null,
  toolMs: null,
  visionRequests: 0,
  agentRequests: 0,
  failedAttempts: 0,
  unknownUsage: 0,
}

export interface ResultRow extends PlanRow {
  readonly runId: string | null
  readonly outcome: OutcomeClass
  readonly reasons: readonly string[]
  // Zeroed for a row that never ran, so a partial batch is totalled over the whole plan rather than
  // the rows that happened to finish.
  readonly elapsedMs: number
  readonly modelMs: number | null
  readonly toolMs: number | null
  readonly visionRequests: number
  readonly agentRequests: number
  readonly failedAttempts: number
  readonly unknownUsage: number
}

/** The visual diagnostic is one smoke plus D0/H0/H1, per the frozen configuration. */
export const VISUAL_DIAGNOSTIC_CASES: readonly VisualCaseId[] = ['D0', 'H0', 'H1']
/** The visual formal is the six known cases, three times each. */
export const VISUAL_FORMAL_CASES: readonly VisualCaseId[] = ['D0', 'H0', 'H1', 'D1', 'D2', 'H2']
export const VISUAL_FORMAL_REPEATS = 3
/** The legacy business formal matrix is 45 rows (groups A-D). */
export const BUSINESS_FORMAL_ROWS = 45

export function visualDiagnosticPlan(): PlanRow[] {
  return [
    { group: 'smoke', case: 'smoke', repeat: 1 },
    ...VISUAL_DIAGNOSTIC_CASES.map((c) => ({ group: 'diagnostic', case: c, repeat: 1 })),
  ]
}

export function visualFormalPlan(): PlanRow[] {
  return VISUAL_FORMAL_CASES.flatMap((c) =>
    Array.from({ length: VISUAL_FORMAL_REPEATS }, (_, i) => ({
      group: 'formal',
      case: c,
      repeat: i + 1,
    })),
  )
}

/** Every planned row starts as `not-run`: a row with no attempt is recorded, never dropped. */
export function initialiseRows(plan: readonly PlanRow[]): ResultRow[] {
  return plan.map((row) => ({
    ...row,
    runId: null,
    outcome: 'not-run',
    reasons: [],
    ...ZERO_TIMING,
  }))
}

/** Replace one planned row's outcome, matched on (group, case, repeat). Never adds or removes rows. */
export function recordRow(
  rows: readonly ResultRow[],
  row: PlanRow,
  result: {
    runId: string | null
    outcome: OutcomeClass
    reasons?: readonly string[]
    timing?: RowTiming
  },
): ResultRow[] {
  return rows.map((r) =>
    r.group === row.group && r.case === row.case && r.repeat === row.repeat
      ? {
          ...r,
          runId: result.runId,
          outcome: result.outcome,
          reasons: result.reasons ?? [],
          ...(result.timing
            ? {
                elapsedMs: result.timing.elapsedMs,
                modelMs: result.timing.modelMs,
                toolMs: result.timing.toolMs,
                visionRequests: result.timing.visionRequests,
                agentRequests: result.timing.agentRequests,
                failedAttempts: result.timing.failedAttempts ?? 0,
                unknownUsage: result.timing.unknownUsage ?? 0,
              }
            : {}),
        }
      : r,
  )
}

/**
 * Should the runner keep going after this outcome?
 *
 * A quality failure is kept and the batch continues - the failure stays in the denominator. But an
 * isolation loss, an unknown side effect, a cancellation, a budget stop or an audit inconsistency is
 * not a fact about the product; continuing would spend more money on a batch that can no longer be
 * read as one experiment, so the run stops and the remaining rows stay `not-run`.
 */
export function mayContinue(outcome: OutcomeClass): boolean {
  // A quality failure and a provider error both stay in the denominator and let the batch move to the
  // next sample; a diagnostic's two-same-mechanism rule, not a single provider error, is what stops it.
  return (
    outcome === 'passed' ||
    outcome === 'quality-failure' ||
    outcome === 'provider-error' ||
    outcome === 'not-run'
  )
}

export interface BatchVerdict {
  readonly exitCode: 0 | 1 | 2
  readonly complete: boolean
  readonly passed: boolean
  readonly counts: Readonly<Record<OutcomeClass, number>>
}

/**
 * The exit code and completeness of a finished batch.
 *
 * 0 only when every planned row both ran and passed. A row that never ran makes the batch incomplete -
 * which is a failure, not a pass - and a partly-complete run is never a joint success.
 */
export function batchVerdict(rows: readonly ResultRow[]): BatchVerdict {
  const counts = {} as Record<OutcomeClass, number>
  for (const row of rows) counts[row.outcome] = (counts[row.outcome] ?? 0) + 1
  const notRun = counts['not-run'] ?? 0
  const complete = rows.length > 0 && notRun === 0
  const passed = complete && rows.every((r) => r.outcome === 'passed')
  return { exitCode: passed ? 0 : 1, complete, passed, counts }
}

/** Two consecutive failures with the same mechanism stop a paid diagnostic rather than repeat it. */
export function sameMechanismTwice(rows: readonly ResultRow[]): boolean {
  const failed = rows.filter((r) => r.outcome !== 'passed' && r.outcome !== 'not-run')
  if (failed.length < 2) return false
  const last = failed.at(-1)!
  const before = failed.at(-2)!
  const key = (r: ResultRow) => `${r.outcome}:${[...r.reasons].sort().join('|')}`
  return key(last) === key(before)
}

/**
 * Validate a plan against the frozen expectation, so a runner that quietly emitted the wrong number of
 * rows is caught before anything is spent.
 */
export function planIsComplete(
  rows: readonly PlanRow[],
  expected: readonly PlanRow[],
): { ok: boolean; missing: readonly string[]; extra: readonly string[] } {
  const key = (r: PlanRow) => `${r.group}/${r.case}/${r.repeat}`
  const have = new Set(rows.map(key))
  const want = new Set(expected.map(key))
  return {
    ok: rows.length === expected.length && [...want].every((k) => have.has(k)),
    missing: [...want].filter((k) => !have.has(k)),
    extra: [...have].filter((k) => !want.has(k)),
  }
}
