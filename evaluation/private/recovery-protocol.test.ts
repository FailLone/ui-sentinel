import { it, expect } from 'vitest'
import type { RunReport } from '../../src/shared/types.ts'
import { evaluateRun, type IndependentEvidence } from './evaluator.ts'
import { evaluateRecoveryRun } from './recovery-protocol.ts'

function fixture(variant: 'C2' | 'C5') {
  const evidence = {
    fixtureValid: true,
    backend: { orders: [{ id: 'order-one', status: variant === 'C2' ? 'paid' : 'failed' }] },
    budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
    events: [
      { type: 'finish:accepted', payload: {} },
      {
        type: 'business:response',
        payload: { orderId: 'order-one', status: 'failed', success: false, canRetry: true },
      },
    ],
    hypotheses: [
      { id: 'hyp', status: 'supported', evidenceRefs: ['snapshot', 'photo', 'measurement'] },
    ],
    artifacts: {
      photo: { type: 'screenshot', exists: true },
      snapshot: {
        type: 'snapshot',
        exists: true,
        data: {
          elements: [
            { tag: 'p', text: 'Order order-one', visible: true },
            {
              selector: 'button.retry',
              tag: 'button',
              text: 'Retry',
              visible: true,
              enabled: variant === 'C2',
              hitSamples: Array.from({ length: 5 }, () => ({ relation: 'unrelated' })),
            },
          ],
        },
      },
      measurement: {
        type: 'measurement',
        exists: true,
        data: {
          selector: 'button.retry',
          eventType: 'retryable-failure',
          condition: 'element-actionable',
          startedAtMs: 0,
          observedUntilMs: 5100,
          samples: Array.from({ length: 26 }, (_, i) => ({
            atMs: i * 200,
            target: 'retry',
            value: false,
          })),
        },
      },
    },
  } as unknown as IndependentEvidence
  const report: RunReport = {
    runId: 'test',
    status: variant === 'C2' ? 'completed' : 'blocked',
    businessResult: variant === 'C2' ? 'success' : 'unknown',
    stopReason: variant === 'C2' ? 'goal-reached' : 'blocked',
    findings: [
      {
        id: 'finding',
        runId: 'test',
        source: 'agent',
        ruleId: null,
        ruleRevision: null,
        title: 'Observed issue',
        expected: 'Operable control',
        actual: 'Measured unavailable',
        severity: 'error',
        createdAt: '',
        hypothesisId: 'hyp',
        stepId: 's',
        validationStatus: 'supported',
        evidenceRefs:
          variant === 'C2' ? ['snapshot', 'photo'] : ['snapshot', 'photo', 'measurement'],
      },
    ],
    usage: {
      actions: 5,
      modelCalls: 5,
      elapsedMs: 10000,
      modelInputTokens: null,
      modelOutputTokens: null,
    },
    exploredStates: [],
    unexploredBranches: [],
    evaluatedRuleCount: 1,
    unknownCount: 0,
  }
  return { evidence, report }
}

it('allows verified recovery without erasing the required interception finding or historical score', () => {
  const { evidence, report } = fixture('C2')
  expect(evaluateRun(report, 'C2', 1, evidence).overallPass).toBe(false)
  expect(evaluateRecoveryRun(report, 'C2', 1, evidence).overallPass).toBe(true)
  expect(evaluateRecoveryRun({ ...report, findings: [] }, 'C2', 1, evidence).overallPass).toBe(
    false,
  )
})

it('rejects recovery without unique matching business/UI evidence or explicit finish', () => {
  for (const change of ['duplicate', 'wrong-ui', 'wrong-result', 'no-finish']) {
    const { evidence, report } = fixture('C2')
    if (change === 'duplicate') evidence.backend.orders.push({ id: 'two', status: 'paid' })
    if (change === 'wrong-ui')
      (evidence.artifacts.snapshot.data as any).elements[0].text = 'Other order'
    if (change === 'no-finish') evidence.events = []
    const tested =
      change === 'wrong-result' ? { ...report, businessResult: 'unknown' as const } : report
    expect(evaluateRecoveryRun(tested, 'C2', 1, evidence).overallPass).toBe(false)
  }
})

it('requires actionability, matching public eligibility and matching order UI for retry claims', () => {
  const valid = fixture('C5')
  expect(evaluateRecoveryRun(valid.report, 'C5', 1, valid.evidence).overallPass).toBe(true)
  for (const change of [
    'visibility',
    'missing-condition',
    'not-retryable',
    'wrong-order',
    'short-window',
  ]) {
    const { evidence, report } = fixture('C5')
    const measurement = evidence.artifacts.measurement.data as any
    if (change === 'visibility') measurement.condition = 'element-visible'
    if (change === 'missing-condition') delete measurement.condition
    if (change === 'not-retryable') (evidence.events[1].payload as any).canRetry = false
    if (change === 'wrong-order')
      (evidence.artifacts.snapshot.data as any).elements[0].text = 'Other order'
    if (change === 'short-window') measurement.observedUntilMs = 1000
    expect(evaluateRecoveryRun(report, 'C5', 1, evidence).overallPass).toBe(false)
  }
})
