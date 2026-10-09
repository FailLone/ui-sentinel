import { describe, expect, it } from 'vitest'
import {
  batchVerdict,
  initialiseRows,
  mayContinue,
  planIsComplete,
  recordRow,
  sameMechanismTwice,
  executableCase,
  visualDiagnosticPlan,
  visualFormalPlan,
  BUSINESS_FORMAL_ROWS,
  type ResultRow,
} from './execution-plan.ts'

describe('execution plans (R03)', () => {
  it('plans a smoke plus three diagnostic cases', () => {
    const plan = visualDiagnosticPlan()
    expect(plan).toHaveLength(4)
    expect(plan.map((r) => r.case)).toEqual(['smoke', 'D0', 'H0', 'H1'])
  })

  it('plans eighteen formal rows and forty-five business rows', () => {
    const plan = visualFormalPlan()
    expect(plan).toHaveLength(18)
    // Six cases, three repeats, one row per (case, repeat).
    expect(new Set(plan.map((r) => `${r.case}/${r.repeat}`)).size).toBe(18)
    expect(BUSINESS_FORMAL_ROWS).toBe(45)
  })

  it('marks every row not-run before the batch starts', () => {
    const rows = initialiseRows(visualDiagnosticPlan())
    expect(rows.every((r) => r.outcome === 'not-run' && r.runId === null)).toBe(true)
  })

  it('records a row in place without adding or removing rows', () => {
    const rows = initialiseRows(visualDiagnosticPlan())
    const next = recordRow(
      rows,
      { group: 'diagnostic', case: 'D0', repeat: 1 },
      {
        runId: 'run-1',
        outcome: 'passed',
      },
    )
    expect(next).toHaveLength(rows.length)
    expect(next.find((r) => r.case === 'D0')?.runId).toBe('run-1')
    // A row that was not touched keeps its not-run record.
    expect(next.find((r) => r.case === 'H0')?.outcome).toBe('not-run')
  })

  it('keeps a row that never ran measurable: zeroed timing, no invented counters', () => {
    // The manifest totals rows, so a not-run row must carry zeros rather than be absent - an absent
    // row would shrink the denominator and make a partial batch look like a full one.
    const rows = initialiseRows(visualDiagnosticPlan())
    expect(rows[0]).toMatchObject({
      outcome: 'not-run',
      elapsedMs: 0,
      visionRequests: 0,
      agentRequests: 0,
      failedAttempts: 0,
      unknownUsage: 0,
    })
  })

  it('records the row timing and request counters alongside the outcome', () => {
    const rows = initialiseRows(visualDiagnosticPlan())
    const next = recordRow(
      rows,
      { group: 'diagnostic', case: 'D0', repeat: 1 },
      {
        runId: 'run-1',
        outcome: 'passed',
        timing: {
          elapsedMs: 4200,
          modelMs: 2600,
          toolMs: 500,
          visionRequests: 1,
          agentRequests: 6,
        },
      },
    )
    const row = next.find((r) => r.case === 'D0')!
    expect(row.elapsedMs).toBe(4200)
    expect(row.agentRequests).toBe(6)
    expect(row.failedAttempts).toBe(0)
  })

  it('detects a plan that emitted the wrong rows', () => {
    const planned = visualFormalPlan()
    const missing = planned.slice(0, 17)
    expect(planIsComplete(missing, planned).ok).toBe(false)
    expect(planIsComplete(missing, planned).missing).toEqual(['formal/H2/3'])
    expect(planIsComplete(planned, planned).ok).toBe(true)
  })
})

describe('outcome classification and continuation (R04-R06)', () => {
  it('continues past a quality failure or a provider error, keeping it in the denominator', () => {
    expect(mayContinue('quality-failure')).toBe(true)
    expect(mayContinue('passed')).toBe(true)
    // A provider error is recoverable: the run moves on, and a diagnostic's two-same-mechanism rule
    // is what stops the batch, so a single 429 does not abandon the remaining samples.
    expect(mayContinue('provider-error')).toBe(true)
  })

  it('stops on isolation loss, unknown side effects, cancellation, budget and audit failure', () => {
    for (const outcome of [
      'isolation-lost',
      'side-effect-unknown',
      'cancelled',
      'budget-exhausted',
      'configuration-error',
      'evidence-invalid',
    ] as const)
      expect(mayContinue(outcome)).toBe(false)
  })

  it('reports a batch with a quality failure as non-zero and complete', () => {
    let rows = initialiseRows(visualFormalPlan())
    rows = recordRow(rows, rows[0]!, { runId: 'r0', outcome: 'passed' })
    rows = recordRow(rows, rows[1]!, { runId: 'r1', outcome: 'quality-failure', reasons: ['x'] })
    for (const row of rows.slice(2)) rows = recordRow(rows, row, { runId: 'r', outcome: 'passed' })
    const verdict = batchVerdict(rows)
    expect(verdict.complete).toBe(true)
    expect(verdict.passed).toBe(false)
    expect(verdict.exitCode).toBe(1)
    expect(verdict.counts['quality-failure']).toBe(1)
  })

  it('treats a partly-run batch as incomplete, never a joint pass', () => {
    const rows = initialiseRows(visualFormalPlan())
    const verdict = batchVerdict(rows)
    expect(verdict.complete).toBe(false)
    expect(verdict.passed).toBe(false)
    expect(verdict.exitCode).toBe(1)
  })

  it('stops a diagnostic after two same-mechanism failures', () => {
    let rows = initialiseRows(visualDiagnosticPlan())
    rows = recordRow(rows, rows[1]!, {
      runId: 'r1',
      outcome: 'provider-error',
      reasons: ['429'],
    })
    rows = recordRow(rows, rows[2]!, {
      runId: 'r2',
      outcome: 'provider-error',
      reasons: ['429'],
    })
    expect(sameMechanismTwice(rows)).toBe(true)
    rows = recordRow(rows, rows[2]!, {
      runId: 'r2',
      outcome: 'quality-failure',
      reasons: ['no-supported-finding'],
    })
    expect(sameMechanismTwice(rows)).toBe(false)
  })

  it('needs two failures, not one, to trip the stop', () => {
    const rows: ResultRow[] = initialiseRows(visualDiagnosticPlan())
    const one = recordRow(rows, rows[1]!, {
      runId: 'r',
      outcome: 'provider-error',
      reasons: ['429'],
    })
    expect(sameMechanismTwice(one)).toBe(false)
  })
})

describe('the diagnostic smoke row must be executable (R03)', () => {
  it('gives the smoke row a real case to run, so it cannot stay not-run forever', () => {
    // The plan includes a `smoke` row. If no executor can satisfy it, `not-run` is permanent and
    // `batchVerdict` can never say complete - a paid diagnostic would fail on every run no matter
    // how well the product did.
    const plan = visualDiagnosticPlan()
    const smoke = plan.find((r) => r.case === 'smoke')!
    expect(smoke.group).toBe('smoke')
    expect(executableCase(smoke)).toBe('D0')

    let rows = initialiseRows(plan)
    for (const row of rows) rows = recordRow(rows, row, { runId: 'r', outcome: 'passed' })
    expect(batchVerdict(rows).complete).toBe(true)
    expect(batchVerdict(rows).passed).toBe(true)
  })

  it('maps every planned row to a runnable case', () => {
    for (const row of [...visualDiagnosticPlan(), ...visualFormalPlan()])
      expect(executableCase(row), `${row.group}/${row.case}`).not.toBeNull()
  })

  it('refuses to map a row that is not a known case', () => {
    expect(executableCase({ group: 'diagnostic', case: 'ZZ', repeat: 1 })).toBeNull()
  })
})
