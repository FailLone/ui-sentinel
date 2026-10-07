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

describe('closeout replay evidence', () => {
  it('records actual stale-state rejection and both state snapshots', async () => {
    const [entry] = await runOfflineCase('stale-reply')
    expect(entry.stubReasonCode).toBe('stale-state')
    const step = entry.steps[0] as any
    expect(step.input.state.observationVersion).toBe('obs-1')
    expect(step.currentAfter.state.observationVersion).toBe('obs-2')
    expect(step.exchanges[0].normalizedReceipt.kind).toBe('scores')
    expect(step.result.kind).toBe('handoff')
  })
  it('gives the low-score candidate a turn in four real session decisions', async () => {
    const [entry] = await runOfflineCase('low-score-fairness')
    expect(entry.steps).toHaveLength(4)
    const steps = entry.steps as any[]
    expect(steps[0].result.orderedCandidateIds[0]).toBe('c2')
    expect(steps[3].result.orderedCandidateIds[0]).toBe('c1')
    expect(steps.every((s) => s.result.scores.length === 2)).toBe(true)
  })
  it('keeps complete inputs, replies, per-attempt timing and independent rankings', async () => {
    const [entry] = await runOfflineCase('menu')
    const step = entry.steps[0] as any
    expect(entry.durationMs).toBeGreaterThan(0)
    expect(step.result.trace.durationMs).toBeGreaterThan(0)
    expect(step.exchanges[0].rawReply.schemaVersion).toBe('r1-stub-reply-1')
    const body = JSON.parse(step.exchanges[0].request.body)
    expect(body).not.toHaveProperty('expectedStatus')
    expect(body).not.toHaveProperty('scenario')
    expect(entry.baselineOrderedCandidateIds).toEqual(step.baseline.orderedCandidateIds)
    expect(entry.fusedOrderedCandidateIds).toEqual(step.result.orderedCandidateIds)
  })
})
