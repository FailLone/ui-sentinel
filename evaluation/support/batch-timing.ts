/**
 * Batch accounting for the evidence manifest (plan P3.4, acceptance E04).
 *
 * "Total wall clock, with vision/agent/tool broken out - overlapping time must not be summed to
 * pretend to be the wall clock". Rows overlap: a run's model time sits inside its own elapsed time,
 * rows share a server, and two runs can be in flight at once. So the wall clock is *measured* from
 * the batch's own start and end, and the parts are reported as labelled sums next to it - never added
 * together and called the total.
 *
 * Model and tool time are `null` when no row measured them, which is the honest state today: the
 * product persists token usage, not per-kind durations. Totalling those gaps as 0 would read as "the
 * model took no time" - a measurement the batch never made.
 */

import type { ResultRow } from './execution-plan.ts'

/**
 * A record row shaped for the totals. `execution-plan.ts` owns the row shape, so this re-uses it
 * rather than declaring a parallel one that could drift out of step with what the runner records.
 */
export type RowTiming = Pick<
  ResultRow,
  | 'case'
  | 'repeat'
  | 'outcome'
  | 'elapsedMs'
  | 'modelMs'
  | 'toolMs'
  | 'visionRequests'
  | 'agentRequests'
  | 'failedAttempts'
  | 'unknownUsage'
>

export interface BatchTiming {
  /** Measured from the batch's own start to its end. Never the sum of the rows. */
  readonly wallClockMs: number
  /** The sum of the rows' elapsed times, kept separately so the difference is visible. */
  readonly rowElapsedMs: number
  readonly modelMs: number | null
  readonly toolMs: number | null
  readonly visionRequests: number
  readonly agentRequests: number
  readonly failedAttempts: number
  readonly unknownUsage: number
  readonly rows: number
}

export function buildBatchTiming(input: {
  startedAtMs: number
  endedAtMs: number
  rows: readonly RowTiming[]
}): BatchTiming {
  const count = (pick: (row: RowTiming) => number) =>
    input.rows.reduce((total, row) => total + (Number.isFinite(pick(row)) ? pick(row) : 0), 0)
  // A duration is summed only over the rows that actually recorded one; with none recorded the field
  // stays null rather than becoming a zero that claims a measurement.
  const totalDuration = (pick: (row: RowTiming) => number | null): number | null => {
    const measured = input.rows.filter((row) => pick(row) != null)
    if (!measured.length) return null
    return measured.reduce((total, row) => total + (pick(row) ?? 0), 0)
  }
  return {
    // A clock read out of order must not produce a negative duration.
    wallClockMs: Math.max(0, input.endedAtMs - input.startedAtMs),
    rowElapsedMs: count((r) => r.elapsedMs),
    modelMs: totalDuration((r) => r.modelMs),
    toolMs: totalDuration((r) => r.toolMs),
    visionRequests: count((r) => r.visionRequests),
    agentRequests: count((r) => r.agentRequests),
    failedAttempts: count((r) => r.failedAttempts),
    unknownUsage: count((r) => r.unknownUsage),
    rows: input.rows.length,
  }
}
