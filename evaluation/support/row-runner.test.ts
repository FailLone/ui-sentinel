import { describe, expect, it } from 'vitest'
import { runBatch, type RowOutcome } from './row-runner.ts'
import { visualDiagnosticPlan, visualFormalPlan, type PlanRow } from './execution-plan.ts'

const pass = (): RowOutcome => ({ runId: 'run', outcome: 'passed' })

describe('batch runner (R03-R07)', () => {
  it('runs the whole 18-row formal plan when every row passes', async () => {
    let n = 0
    const report = await runBatch({
      plan: visualFormalPlan(),
      execute: async () => {
        n++
        return pass()
      },
    })
    expect(n).toBe(18)
    expect(report.rows).toHaveLength(18)
    expect(report.verdict).toEqual(
      expect.objectContaining({ exitCode: 0, complete: true, passed: true }),
    )
    expect(report.stoppedEarly).toBe(false)
  })

  it('keeps a quality failure in the denominator and continues (R04)', async () => {
    const report = await runBatch({
      plan: visualFormalPlan(),
      execute: async (row) =>
        row.case === 'D1' && row.repeat === 1
          ? { runId: 'r', outcome: 'quality-failure', reasons: ['no-supported-finding'] }
          : pass(),
    })
    expect(report.rows).toHaveLength(18)
    expect(report.verdict.complete).toBe(true)
    expect(report.verdict.passed).toBe(false)
    expect(report.verdict.exitCode).toBe(1)
    expect(report.verdict.counts['quality-failure']).toBe(1)
    expect(report.stoppedEarly).toBe(false)
  })

  it('stops on isolation loss and leaves the rest not-run (R06)', async () => {
    const plan = visualFormalPlan()
    const executed: PlanRow[] = []
    const report = await runBatch({
      plan,
      execute: async (row) => {
        executed.push(row)
        return row.case === 'D0' && row.repeat === 2
          ? { runId: 'r', outcome: 'isolation-lost', reasons: ['page-closed'] }
          : pass()
      },
    })
    expect(report.stoppedEarly).toBe(true)
    expect(report.stopReason).toBe('isolation-lost')
    // Rows after the stop keep their not-run record.
    expect(report.rows.filter((r) => r.outcome === 'not-run').length).toBe(18 - executed.length)
    expect(report.verdict.complete).toBe(false)
  })

  it('stops a diagnostic after two same-mechanism failures (R05)', async () => {
    const report = await runBatch({
      plan: visualDiagnosticPlan(),
      stopOnSameMechanismTwice: true,
      execute: async (row) =>
        row.case === 'smoke' ? pass() : { runId: 'r', outcome: 'provider-error', reasons: ['429'] },
    })
    expect(report.stoppedEarly).toBe(true)
    expect(report.stopReason).toBe('same-mechanism-twice')
    // smoke passed, D0 dep-error, H0 dep-error -> stop; H1 stays not-run.
    expect(report.rows.find((r) => r.case === 'H1')?.outcome).toBe('not-run')
  })

  it('records a thrown harness error as evidence-invalid rather than losing the row', async () => {
    const report = await runBatch({
      plan: visualDiagnosticPlan(),
      execute: async (row) => {
        if (row.case === 'H0') throw new Error('transport blew up')
        return pass()
      },
    })
    const row = report.rows.find((r) => r.case === 'H0')!
    expect(row.outcome).toBe('evidence-invalid')
    expect(row.reasons.join(' ')).toContain('transport blew up')
    expect(report.rows).toHaveLength(4)
  })

  it('flushes each recorded row so a mid-run crash still has the finished rows', async () => {
    const flushed: number[] = []
    await runBatch({
      plan: visualDiagnosticPlan(),
      execute: async () => pass(),
      onRow: (_row, rows) => {
        flushed.push(rows.length)
      },
    })
    expect(flushed).toEqual([4, 4, 4, 4])
  })
})
