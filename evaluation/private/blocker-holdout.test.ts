import { describe, it, expect } from 'vitest'
import { createBlockerHoldout } from '../fixtures/blocker.ts'
import { evaluateBlockerHoldout, verifyBlockerHoldout } from './blocker-holdout.ts'

describe('independent studio blocker holdout', () => {
  it('verifies both real browser layouts, recovery and isolated reset', async () => {
    const arena = await createBlockerHoldout({ port: 0, controlPort: 0, token: 'private-fixture' })
    try {
      expect((await fetch(arena.controlUrl + '/__control/state')).status).toBe(401)
      for (const profile of ['J0', 'J1'] as const) {
        expect(
          (await verifyBlockerHoldout(profile, arena.url, arena.controlUrl, 'private-fixture'))
            .valid,
        ).toBe(true)
        const html = await fetch(arena.url).then((r) => r.text())
        expect(html).not.toMatch(/J0|J1|private-fixture|__control/)
      }
    } finally {
      await arena.close()
    }
  })
  const sample = (recoverable = false) => {
    const events: any[] = [{ type: 'finish:accepted', payload: {} }]
    if (recoverable)
      events.push({
        type: 'business:verified',
        payload: { verifiedBusiness: { orderId: 'booking-1' } },
      })
    const report: any = {
      status: recoverable ? 'completed' : 'blocked',
      businessResult: recoverable ? 'success' : 'unknown',
      unexploredBranches: recoverable ? [] : ['Unreached business outcome'],
      findings: [
        {
          ruleId: 'overlay-blocking',
          validationStatus: 'supported',
          evidenceRefs: ['screen', 'snapshot'],
        },
      ],
    }
    const evidence: any = {
      fixtureValid: true,
      backend: { orders: recoverable ? [{ id: 'booking-1', status: 'paid' }] : [] },
      events,
      hypotheses: [],
      artifacts: {
        screen: { exists: true, type: 'screenshot' },
        snapshot: {
          exists: true,
          type: 'snapshot',
          data: {
            elements: [
              {
                text: 'Complete reservation',
                visible: true,
                hitSamples: Array.from({ length: 5 }, () => ({ relation: 'unrelated' })),
              },
            ],
          },
        },
      },
    }
    return { report, evidence }
  }
  it('requires outcome, physical evidence, available artifacts and unreached scope', () => {
    const { report, evidence } = sample()
    expect(evaluateBlockerHoldout(report, 'J0', evidence).overallPass).toBe(true)
    report.unexploredBranches = []
    expect(evaluateBlockerHoldout(report, 'J0', evidence).overallPass).toBe(false)
    report.unexploredBranches = ['Unreached business outcome']
    evidence.artifacts.snapshot.data.elements[0].hitSamples[0].relation = 'self'
    expect(evaluateBlockerHoldout(report, 'J0', evidence).overallPass).toBe(false)
    evidence.artifacts.snapshot.data.elements[0].hitSamples[0].relation = 'unrelated'
    evidence.artifacts.screen.exists = false
    expect(evaluateBlockerHoldout(report, 'J0', evidence).overallPass).toBe(false)
  })
  it('rejects premature finish when recovery exists, unsupported success and duplicate writes', () => {
    const blocked = sample()
    expect(evaluateBlockerHoldout(blocked.report, 'J1', blocked.evidence).overallPass).toBe(false)
    const { report, evidence } = sample(true)
    expect(evaluateBlockerHoldout(report, 'J1', evidence).overallPass).toBe(true)
    evidence.backend.orders.push({ id: 'booking-2', status: 'paid' })
    expect(evaluateBlockerHoldout(report, 'J1', evidence).overallPass).toBe(false)
    evidence.backend.orders.pop()
    evidence.events.pop()
    expect(evaluateBlockerHoldout(report, 'J1', evidence).overallPass).toBe(false)
  })
})
