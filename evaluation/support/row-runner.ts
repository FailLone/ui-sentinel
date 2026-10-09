import {
  batchVerdict,
  initialiseRows,
  mayContinue,
  recordRow,
  sameMechanismTwice,
  type BatchVerdict,
  type OutcomeClass,
  type PlanRow,
  type ResultRow,
  type RowTiming,
} from './execution-plan.ts'

/**
 * The generic batch loop (plan P3.2-P3.3, acceptance R03-R07).
 *
 * It is deliberately separated from the browser and the gateway so it can be tested by injecting a
 * transport, a clock and faults, without 63 real browser tasks. It writes the whole plan before it
 * starts, records every row as it finishes, and stops - leaving the rest `not-run` - the moment an
 * outcome says the batch can no longer be read as one experiment.
 */

export interface RowOutcome {
  readonly runId: string | null
  readonly outcome: OutcomeClass
  readonly reasons?: readonly string[]
  /** What the row cost in time and requests, so the manifest can total it (plan P3.4). */
  readonly timing?: RowTiming
}

export interface RowRunnerReport {
  readonly rows: readonly ResultRow[]
  readonly verdict: BatchVerdict
  readonly stoppedEarly: boolean
  readonly stoppedAt: PlanRow | null
  readonly stopReason: string | null
}

export interface RunBatchOptions {
  readonly signal?: AbortSignal
  readonly plan: readonly PlanRow[]
  /** Execute one planned row. Must not throw for an ordinary failure - return an outcome instead. */
  execute: (row: PlanRow, index: number) => Promise<RowOutcome>
  /** Called after each row is recorded, so the caller can flush `runs.jsonl`. */
  onRow?(row: ResultRow, rows: readonly ResultRow[]): Promise<void> | void
  /** True for a diagnostic, where two same-mechanism failures stop the paid run. */
  stopOnSameMechanismTwice?: boolean
}

export async function runBatch(options: RunBatchOptions): Promise<RowRunnerReport> {
  let rows = initialiseRows(options.plan)
  let stoppedEarly = false
  let stoppedAt: PlanRow | null = null
  let stopReason: string | null = null

  for (let i = 0; i < options.plan.length; i++) {
    if (options.signal?.aborted) {
      stoppedEarly = true
      stopReason = 'cancelled'
      break
    }
    const planned = options.plan[i]!
    let outcome: RowOutcome
    try {
      outcome = await options.execute(planned, i)
    } catch (error) {
      // A thrown error is an unclassified failure of the harness, not of the product. It is recorded
      // as evidence-invalid; the row still exists.
      outcome = { runId: null, outcome: 'evidence-invalid', reasons: [String(error)] }
    }
    if (options.signal?.aborted)
      outcome = {
        ...outcome,
        outcome: 'cancelled',
        reasons: [...(outcome.reasons ?? []), 'cancelled'],
      }
    rows = recordRow(rows, planned, outcome)
    await options.onRow?.(rows.find((r) => same(r, planned))!, rows)

    if (!mayContinue(outcome.outcome)) {
      stoppedEarly = true
      stoppedAt = planned
      stopReason = outcome.outcome
      break
    }
    if (options.stopOnSameMechanismTwice && sameMechanismTwice([...rows].slice(0, i + 1))) {
      stoppedEarly = true
      stoppedAt = planned
      stopReason = 'same-mechanism-twice'
      break
    }
  }

  return { rows, verdict: batchVerdict(rows), stoppedEarly, stoppedAt, stopReason }
}

function same(a: ResultRow, b: PlanRow): boolean {
  return a.group === b.group && a.case === b.case && a.repeat === b.repeat
}
