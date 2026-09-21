import { describe, it, expect } from 'vitest'
import { evaluateRun, summarizeEvaluation } from './evaluator.ts'
import type { RunReport } from '../../src/shared/types.ts'

function makeReport(overrides?: Partial<RunReport>): RunReport {
  return {
    runId: 'test-run',
    status: 'completed',
    businessResult: 'unknown',
    stopReason: 'goal-reached',
    findings: [],
    usage: { actions: 5, modelCalls: 3, elapsedMs: 10000, modelInputTokens: 1000, modelOutputTokens: 500 },
    exploredStates: ['Products', 'Cart', 'Checkout'],
    unexploredBranches: [],
    evaluatedRuleCount: 3,
    unknownCount: 0,
    ...overrides,
  }
}

describe('evaluator', () => {
  it('C0 passes with success and no findings', () => {
    const report = makeReport({ businessResult: 'success' })
    const score = evaluateRun(report, 'C0', 1)
    expect(score.businessResultCorrect).toBe(true)
    expect(score.overallPass).toBe(true)
  })

  it('C0 fails with wrong business result', () => {
    const report = makeReport({ businessResult: 'rejected' })
    const score = evaluateRun(report, 'C0', 1)
    expect(score.businessResultCorrect).toBe(false)
    expect(score.overallPass).toBe(false)
  })

  it('C1 requires overlay finding', () => {
    const report = makeReport({
      businessResult: 'success',
      findings: [
        {
          id: 'f1',
          runId: 'test-run',
          source: 'agent',
          ruleId: 'overlay-blocking',
          ruleRevision: '1.0.0',
          hypothesisId: null,
          validationStatus: 'supported',
          severity: 'error',
          title: 'Overlay blocking primary action',
          expected: 'No overlay',
          actual: 'Overlay present',
          stepId: null,
          evidenceRefs: ['ss-1.png'],
          createdAt: new Date().toISOString(),
        },
      ],
    })
    const score = evaluateRun(report, 'C1', 1)
    expect(score.businessResultCorrect).toBe(true)
    expect(score.missingFindings).toHaveLength(0)
    expect(score.overallPass).toBe(true)
  })

  it('C1 fails without overlay finding', () => {
    const report = makeReport({ businessResult: 'success' })
    const score = evaluateRun(report, 'C1', 1)
    expect(score.missingFindings.length).toBeGreaterThan(0)
    expect(score.overallPass).toBe(false)
  })

  it('C4 passes with rejected business result', () => {
    const report = makeReport({ businessResult: 'rejected' })
    const score = evaluateRun(report, 'C4', 1)
    expect(score.businessResultCorrect).toBe(true)
    expect(score.overallPass).toBe(true)
  })

  it('C5 requires hypothesis-based finding', () => {
    const report = makeReport({
      businessResult: 'unknown',
      findings: [
        {
          id: 'f2',
          runId: 'test-run',
          source: 'agent',
          ruleId: null,
          ruleRevision: null,
          hypothesisId: 'hyp-1',
          validationStatus: 'supported',
          severity: 'warning',
          title: 'Retry mechanism not recovering',
          expected: 'Retry should succeed',
          actual: 'Retry always fails',
          stepId: null,
          evidenceRefs: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })
    const score = evaluateRun(report, 'C5', 1)
    expect(score.missingFindings).toHaveLength(0)
  })

  it('detects answer leak', () => {
    const report = makeReport({
      businessResult: 'success',
      exploredStates: ['C0 variant page'],
    })
    const score = evaluateRun(report, 'C0', 1)
    expect(score.noAnswerLeak).toBe(false)
    expect(score.overallPass).toBe(false)
  })

  it('summarizes evaluation results', () => {
    const scores = [
      evaluateRun(makeReport({ businessResult: 'success' }), 'C0', 1),
      evaluateRun(makeReport({ businessResult: 'success' }), 'C0', 2),
      evaluateRun(makeReport({ businessResult: 'rejected' }), 'C4', 1),
    ]
    const summary = summarizeEvaluation(scores)
    expect(summary.totalRuns).toBe(3)
    expect(summary.passedRuns).toBe(3)
    expect(summary.passRate).toBe(1.0)
  })
})
