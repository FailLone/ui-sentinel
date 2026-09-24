import { it, expect } from 'vitest'
import type { RunReport } from '../../src/shared/types.ts'
import type { IndependentEvidence } from './evaluator.ts'
import { evaluateHoldout, verifyHoldout } from './holdout.ts'
import { createHoldoutArena, type HoldoutProfile } from '../../scripts/experiments/holdout-arena.ts'

function fixture(profile: HoldoutProfile) {
  const evidence = {
    fixtureValid: true,
    backend: { orders: [{ id: 'reservation-one', status: profile === 'H0' ? 'paid' : 'failed' }] },
    budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
    events: [
      { type: 'finish:accepted', payload: {} },
      {
        type: 'business:response',
        payload: {
          orderId: 'reservation-one',
          status: profile === 'H0' ? 'paid' : 'failed',
          success: profile === 'H0',
          canRetry: profile !== 'H0',
        },
      },
    ],
    hypotheses:
      profile === 'H2'
        ? [{ id: 'hyp', status: 'supported', evidenceRefs: ['snapshot', 'photo', 'measurement'] }]
        : [],
    artifacts: {
      photo: { type: 'screenshot', exists: true },
      snapshot: {
        type: 'snapshot',
        exists: true,
        data: {
          elements: [
            { tag: 'p', text: 'Reference: reservation-one', visible: true },
            ...(profile === 'H0'
              ? []
              : [
                  {
                    selector: 'button#resume',
                    tag: 'button',
                    text: 'Resume reservation',
                    visible: true,
                    enabled: profile === 'H1',
                    hitSamples: [{ relation: 'self' }],
                  },
                ]),
          ],
        },
      },
      ...(profile === 'H2'
        ? {
            measurement: {
              type: 'measurement',
              exists: true,
              data: {
                selector: 'button#resume',
                condition: 'element-actionable',
                startedAtMs: 0,
                observedUntilMs: 5100,
                samples: Array.from({ length: 26 }, (_, i) => ({
                  atMs: i * 200,
                  target: 'resume',
                  value: false,
                })),
              },
            },
          }
        : {}),
    },
  } as unknown as IndependentEvidence
  const report = {
    runId: 'test',
    status: profile === 'H0' ? 'completed' : 'blocked',
    businessResult: profile === 'H0' ? 'success' : 'unknown',
    stopReason: profile === 'H0' ? 'goal-reached' : 'blocked',
    findings:
      profile === 'H2'
        ? [
            {
              id: 'finding',
              source: 'agent',
              hypothesisId: 'hyp',
              validationStatus: 'supported',
              evidenceRefs: ['snapshot', 'photo', 'measurement'],
            },
          ]
        : [],
    usage: { modelCalls: 7, actions: 4, elapsedMs: 12000 },
  } as unknown as RunReport
  return { evidence, report }
}

it.each(['H0', 'H1', 'H2'] as const)(
  'grades bounded reservation outcome %s without retry label assumptions',
  (profile) => {
    const { evidence, report } = fixture(profile)
    expect(evaluateHoldout(report, profile, evidence).overallPass).toBe(true)
  },
)

it.each([
  'visibility',
  'wrong-selector',
  'wrong-order',
  'missing-order',
  'short-window',
  'sparse',
  'null-sample',
  'healthy-sample',
  'changed-target',
  'duplicate-finding',
  'not-retryable',
  'missing-photo',
  'open-hypothesis',
  'duplicate-write',
  'duplicate-order',
  'no-finish',
  'leak',
])('rejects misleading stuck-recovery evidence: %s', (change) => {
  const { evidence, report } = fixture('H2')
  const measurement = evidence.artifacts.measurement.data as any
  if (change === 'visibility') measurement.condition = 'element-visible'
  if (change === 'wrong-selector') measurement.selector = '#return'
  if (change === 'wrong-order')
    (evidence.artifacts.snapshot.data as any).elements[0].text = 'A different reservation'
  if (change === 'missing-order') evidence.backend.orders = []
  if (change === 'short-window') measurement.observedUntilMs = 4500
  if (change === 'sparse')
    measurement.samples = [measurement.samples[0], measurement.samples.at(-1)]
  if (change === 'null-sample') measurement.samples[5].value = null
  if (change === 'healthy-sample') measurement.samples[5].value = true
  if (change === 'changed-target') measurement.samples[5].target = 'other'
  const tested =
    change === 'duplicate-finding'
      ? { ...report, findings: [...report.findings, { ...report.findings[0]!, id: 'duplicate' }] }
      : report
  if (change === 'not-retryable') evidence.events[1]!.payload.canRetry = false
  if (change === 'missing-photo') evidence.artifacts.photo.exists = false
  if (change === 'open-hypothesis') evidence.hypotheses[0]!.status = 'open'
  if (change === 'duplicate-write')
    evidence.events = [...evidence.events, { type: 'write:denied', payload: {} } as any]
  if (change === 'duplicate-order') evidence.backend.orders.push({ id: 'two', status: 'failed' })
  if (change === 'no-finish') evidence.events = evidence.events.slice(1)
  if (change === 'leak')
    evidence.events = [
      ...evidence.events,
      { type: 'tool:finished', payload: { label: 'H2' } } as any,
    ]
  expect(evaluateHoldout(tested, 'H2', evidence).overallPass).toBe(false)
})

it('rejects unsupported claims of healthy recovery and false positives on prerequisites', () => {
  const { evidence, report } = fixture('H1')
  ;(evidence.artifacts.snapshot.data as any).elements[1].enabled = false
  expect(evaluateHoldout(report, 'H1', evidence).overallPass).toBe(false)
  const healthy = fixture('H0')
  const falsePositive = { ...healthy.report, findings: fixture('H2').report.findings }
  expect(evaluateHoldout(falsePositive, 'H0', healthy.evidence).overallPass).toBe(false)
})

it('verifies real prerequisites, outcomes and recovery with identical public source and a private oracle', async () => {
  const arena = await createHoldoutArena({ port: 0, controlPort: 0, token: 'test-control' })
  try {
    expect((await fetch(arena.controlUrl + '/__control/state')).status).toBe(401)
    expect((await fetch(arena.url + '/__control/state')).status).toBe(404)
    const source = await (await fetch(arena.url)).text()
    expect(source).not.toMatch(/\bH[012]\b|__control/)
    for (const profile of ['H0', 'H1', 'H2'] as const) {
      expect(
        (await verifyHoldout(profile, arena.url, arena.controlUrl, 'test-control')).valid,
      ).toBe(true)
      expect(await (await fetch(arena.url)).text()).toBe(source)
    }
  } finally {
    await arena.close()
  }
})
