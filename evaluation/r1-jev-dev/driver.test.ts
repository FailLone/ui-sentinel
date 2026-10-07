import { describe, expect, it } from 'vitest'
import { runOfflineCase, type CaseResult } from '../../scripts/r1-jev/offline-runner.ts'

/**
 * Drives the committed seed set through the pure baseline and the stub branch and compares each
 * normalized outcome to the evaluator label. Reading the label is test-side only; no src module
 * may import the evaluator directory.
 */
describe('committed seed expectations', () => {
  it('produces one result per case that matches its evaluator label', async () => {
    const cases = await runOfflineCase()
    expect(cases.length).toBe(22)
    const mismatches = cases
      .filter((c) => c.baselineOutcome !== c.expectedBaseline || c.stubOutcome !== c.expectedStub)
      .map((c) => ({ scenario: c.scenario, baseline: c.baselineOutcome, stub: c.stubOutcome }))
    expect(mismatches).toEqual([])
  })

  it('never transmits for the zero-transmission cases', async () => {
    const cases = await runOfflineCase()
    for (const c of cases.filter((x) => x.checks.includes('zero-transmissions'))) {
      expect({ scenario: c.scenario, sent: c.transmissions }).toEqual({
        scenario: c.scenario,
        sent: 0,
      })
    }
  })

  it('keeps pure baseline and stub-branch outcomes as separate fields', async () => {
    const cases = await runOfflineCase()
    for (const c of cases as CaseResult[]) {
      expect(c).toHaveProperty('baselineOutcome')
      expect(c).toHaveProperty('stubOutcome')
    }
    // agent-investigation hands off only on the stub branch; the baseline is a separate column.
    const investigation = cases.find((c) => c.scenario === 'agent-investigation')!
    expect(investigation.expectedBaseline).toBe('ranked')
    expect(investigation.expectedStub).toBe('handoff')
  })

  it('keeps the evidence-lag sequence in the fairness sample', async () => {
    const cases = await runOfflineCase()
    const fairness = cases.find((c) => c.scenario === 'low-score-fairness')!
    expect(fairness.checks).toContain('fairness-sequence-required')
    expect(fairness.rotation).toBeDefined()
  })

  it('declares the real-model row as not run rather than inferring it', async () => {
    const cases = await runOfflineCase()
    for (const c of cases) expect(c.realModel).toBe('not-run')
  })

  it('does not turn a single given state into an end-to-end coverage claim', async () => {
    const cases = await runOfflineCase()
    const continuous = cases.find((c) => c.scenario === 'continuous-steps')!
    // The evaluator explicitly forbids the claim, and the runner carries no claims field at all.
    expect(continuous.checks).toContain('no-end-to-end-coverage-claim')
    expect(continuous).not.toHaveProperty('claims')
  })
})
