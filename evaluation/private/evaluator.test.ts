import { describe, it, expect } from 'vitest'
import { evaluateRun, summarizeEvaluation, type IndependentEvidence } from './evaluator.ts'
import type { Finding, RunReport } from '../../src/shared/types.ts'
const report = (extra: Partial<RunReport> = {}): RunReport => ({
  runId: 'r',
  status: 'completed',
  businessResult: 'success',
  stopReason: 'goal-reached',
  findings: [],
  usage: {
    actions: 3,
    modelCalls: 3,
    elapsedMs: 1000,
    modelInputTokens: null,
    modelOutputTokens: null,
  },
  exploredStates: [],
  unexploredBranches: [],
  evaluatedRuleCount: 0,
  unknownCount: 0,
  ...extra,
})
const evidence = (): IndependentEvidence => ({
  fixtureValid: true,
  backend: { orders: [{ id: 'order-1', status: 'paid' }] },
  budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 40 },
  hypotheses: [],
  events: [],
  artifacts: {
    snapshot: {
      type: 'snapshot',
      exists: true,
      data: { elements: [{ tag: 'p', visible: true, text: 'Order order-1' }] },
    },
    photo: { type: 'screenshot', exists: true },
  },
})
const finding = (extra: Partial<Finding> = {}): Finding => ({
  id: 'f',
  runId: 'r',
  source: 'agent',
  ruleId: null,
  ruleRevision: null,
  hypothesisId: null,
  validationStatus: 'supported',
  severity: 'error',
  title: 'Overlay blocking',
  expected: 'x',
  actual: 'y',
  stepId: 'step-1',
  evidenceRefs: ['snapshot', 'photo'],
  createdAt: '',
  ...extra,
})
describe('independent evaluation gates', () => {
  it('requires independently validated fixture and evidence', () =>
    expect(evaluateRun(report(), 'C0', 1).classification).toBe('invalid'))
  it('requires matching unique backend and visible order', () => {
    expect(evaluateRun(report(), 'C0', 1, evidence()).overallPass).toBe(true)
    const e = evidence()
    e.backend.orders.push({ id: 'duplicate', status: 'paid' })
    expect(evaluateRun(report(), 'C0', 1, e).overallPass).toBe(false)
  })
  it('does not award a hit for title keywords or a screenshot alone', () =>
    expect(evaluateRun(report({ findings: [finding()] }), 'C1', 1, evidence()).overallPass).toBe(
      false,
    ))
  it('does not pass false positives or over-budget usage', () => {
    expect(evaluateRun(report({ findings: [finding()] }), 'C0', 1, evidence()).overallPass).toBe(
      false,
    )
    expect(
      evaluateRun(
        report({
          usage: {
            actions: 999,
            modelCalls: 999,
            elapsedMs: 999999,
            modelInputTokens: null,
            modelOutputTokens: null,
          },
        }),
        'C0',
        1,
        evidence(),
      ).budgetRespected,
    ).toBe(false)
  })
  it('accepts actual hit-test evidence regardless of finding wording', () => {
    const e = evidence()
    ;(e.artifacts.snapshot.data as any).elements.push({
      tag: 'button',
      visible: true,
      enabled: true,
      text: 'Submit',
      hitSamples: Array.from({ length: 5 }, () => ({ relation: 'unrelated' })),
    })
    expect(
      evaluateRun(report({ findings: [finding({ title: '主要操作无法触达' })] }), 'C1', 1, e)
        .overallPass,
    ).toBe(true)
    expect(
      evaluateRun(report({ findings: [finding({ validationStatus: 'candidate' })] }), 'C1', 1, e)
        .overallPass,
    ).toBe(false)
  })
  it('does not pass unavailable artifacts', () => {
    const e = evidence()
    e.artifacts.photo.exists = false
    expect(evaluateRun(report({ findings: [finding()] }), 'C1', 1, e).overallPass).toBe(false)
  })
  it('does not accept C5 without a measured five-second window', () => {
    const e = evidence()
    e.backend.orders = [{ id: 'o', status: 'failed' }]
    e.hypotheses = [{ id: 'h', status: 'supported', evidenceRefs: [] }]
    expect(
      evaluateRun(
        report({
          status: 'blocked',
          businessResult: 'unknown',
          findings: [finding({ hypothesisId: 'h' })],
        }),
        'C5',
        1,
        e,
      ).overallPass,
    ).toBe(false)
  })
  it('does not mark a partial or cherry-picked batch accepted', () => {
    const score = evaluateRun(report(), 'C0', 1, evidence())
    expect(summarizeEvaluation([score, score, score]).gatePassed).toBe(false)
  })
})

it('C5 is proven by owned selector samples over the full window, not its title', () => {
  const e = evidence()
  e.backend.orders = [{ id: 'o', status: 'failed' }]
  e.hypotheses = [
    { id: 'h', status: 'supported', evidenceRefs: ['snapshot', 'photo', 'measurement'] },
  ]
  ;(e.artifacts.snapshot.data as any).elements.push({
    selector: 'button.retry',
    tag: 'button',
    text: 'Try Again',
    visible: true,
    enabled: false,
  })
  e.artifacts.measurement = {
    type: 'measurement',
    exists: true,
    data: {
      selector: 'button.retry',
      eventType: 'observed-feedback',
      startedAtMs: 0,
      observedUntilMs: 5250,
      samples: Array.from({ length: 21 }, (_, i) => ({
        atMs: i * 250,
        target: 'recovery',
        value: false,
      })),
      evidenceRefs: ['snapshot', 'photo'],
    },
  }
  const r = report({
    status: 'blocked',
    businessResult: 'unknown',
    findings: [
      finding({
        title: '恢复入口不可用',
        hypothesisId: 'h',
        evidenceRefs: ['snapshot', 'photo', 'measurement'],
      }),
    ],
  })
  expect(evaluateRun(r, 'C5', 1, e).overallPass).toBe(true)
  ;(e.artifacts.measurement.data as any).selector = 'unrelated-disabled-control'
  expect(evaluateRun(r, 'C5', 1, e).overallPass).toBe(false)
})
