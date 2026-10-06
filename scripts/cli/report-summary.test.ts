import { describe, it, expect } from 'vitest'
import { reportSummaryLines } from './report-summary.ts'

/**
 * The CLI's one-line summary of a run (plan 6.3).
 *
 * The full report is written as JSON either way; this is what a person reads in the terminal, so it
 * must name the mode and - for a UI scan - the coverage verdict and the number of unverified items,
 * rather than printing a business result that does not apply.
 */
describe('the CLI report names the run mode', () => {
  it('describes a ui-scan by its coverage and its gaps, not by a business result', () => {
    const lines = reportSummaryLines({
      runId: 'run-1',
      status: 'blocked',
      businessResult: 'not-applicable',
      stopReason: 'blocked',
      uiScan: {
        inspection: { coverage: 'partial', counts: { unverified: 2, verified: 3 } },
      },
    })
    const text = lines.join('\n')
    expect(text).toContain('ui-scan')
    expect(text).toContain('partial')
    expect(text).toContain('2')
    // The business result is stated as inapplicable rather than omitted or shown as success.
    expect(text).toMatch(/业务不适用|not-applicable/)
  })

  it('describes a covered ui-scan with its verified count', () => {
    const lines = reportSummaryLines({
      runId: 'run-2',
      status: 'completed',
      businessResult: 'not-applicable',
      stopReason: 'goal-reached',
      uiScan: {
        inspection: { coverage: 'covered', counts: { unverified: 0, verified: 4 } },
      },
    })
    expect(lines.join('\n')).toContain('covered')
  })

  it('still describes a business run by its business result', () => {
    const lines = reportSummaryLines({
      runId: 'run-3',
      status: 'completed',
      businessResult: 'success',
      stopReason: 'goal-reached',
    })
    const text = lines.join('\n')
    expect(text).toContain('completed')
    expect(text).toContain('success')
    expect(text).not.toContain('ui-scan')
  })

  it('names an inconsistent report before any verdict, so a broken record is not read as a result', () => {
    const lines = reportSummaryLines({
      runId: 'run-4',
      status: 'execution-error',
      businessResult: 'unknown',
      stopReason: 'reconciliation-required',
      persistence: { status: 'inconsistent', issues: ['inspection-proof-unverified'] },
    })
    expect(lines[0]).toMatch(/inconsistent|不一致/)
    expect(lines.join('\n')).toContain('inspection-proof-unverified')
  })
})
