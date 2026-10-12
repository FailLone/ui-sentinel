import { expect, it } from 'vitest'
import { regressionReport } from './regression-report.ts'
const identity = {
  historicalSteps: ['first', 'dynamic-next'],
  entryMatches: true,
  sourceMatches: true,
}
const events: any[] = [
  { id: 'identity', type: 'path-regression:identity', payload: identity },
  {
    id: 'observed',
    type: 'path-regression:observed',
    payload: { index: 0, recommendation: 'try-remeasure' },
  },
]
const product: any = {
  steps: [
    { state: 'verified', actionId: 'new-action', evidenceRefs: ['new-ref'] },
    { state: 'unverified', evidenceRefs: [] },
  ],
}
it('new evidence is separate from history, and an unreached dynamic step is not invalidated', () => {
  const r = regressionReport(
    [
      ...events,
      {
        type: 'path-reuse:finished',
        payload: { status: 'handoff', reason: 'budget-insufficient', remainingSteps: [1] },
      },
    ],
    product,
  )!
  expect(r.history).toBe('reference-only')
  expect(r.steps[0]).toMatchObject({
    state: 'newly-verified',
    actionId: 'new-action',
    evidenceRefs: ['new-ref'],
  })
  expect(r.steps[1]).toMatchObject({
    state: 'unchecked',
    invalidated: false,
    recommendation: 'not-reached',
  })
})
it('never maps a new-source plan onto historical step numbers', () => {
  const r = regressionReport(
    [{ ...events[0], payload: { ...identity, sourceMatches: false } }],
    product,
  )!
  expect(
    r.steps.every(
      (s) => s.state === 'unchecked' && s.invalidated && !s.actionId && s.evidenceRefs.length === 0,
    ),
  ).toBe(true)
})
it('evidence downgrade in the original product report also downgrades the incremental section', () => {
  const r = regressionReport(events, { steps: [{ state: 'unverified', evidenceRefs: [] }] } as any)!
  expect(r.steps[0]?.state).toBe('unchecked')
})
it('old reports have no invented regression record', () => {
  expect(regressionReport([], product)).toBeUndefined()
})
it('shows a late pre-dispatch invalidation without marking unreached steps invalid', () => {
  const r = regressionReport(
    [
      ...events,
      {
        id: 'late',
        type: 'path-regression:invalidated',
        payload: {
          index: 0,
          reason: 'target-description-changed',
          comparison: {
            index: 0,
            classification: 'dependency-change',
            recommendation: 'new-investigation',
          },
        },
      },
    ],
    { steps: [{ state: 'unverified' }, { state: 'unverified' }] } as any,
  )!
  expect(r.steps[0]).toMatchObject({
    invalidated: true,
    observationEventId: 'late',
    comparisonStage: 'before-dispatch',
    invalidationReason: 'target-description-changed',
  })
  expect(r.steps[1]).toMatchObject({ invalidated: false, recommendation: 'not-reached' })
})
