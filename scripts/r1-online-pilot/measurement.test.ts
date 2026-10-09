import { it, expect } from 'vitest'
import { evaluate } from './evaluate.ts'
import { firstMeasurementEvent, EVALUATION_VERSION } from './measurement.ts'
const start = { type: 'run:started', timestamp: '2026-10-09T00:00:00.000Z', seq: 1 }
const event = (type = 'interaction:generic-collected-v2', ms = 20) => ({
  type,
  timestamp: new Date(Date.parse(start.timestamp) + ms).toISOString(),
  seq: 2,
  payload: { receiptRef: 'measurement.json', measurementRef: 'measurement.json' },
  evidenceRefs: ['measurement.json'],
})
const ids = new Set(['measurement.json'])
it('no event or missing/invalid evidence/time yields null rather than zero or success', () => {
  for (const events of [
    [],
    [start],
    [start, { type: 'tool:started' }],
    [start, { ...event(), evidenceRefs: [] }],
    [start, { ...event(), timestamp: 'invalid' }],
    [start, event(undefined, -1)],
    [event()],
    [start, { ...event(), payload: {} }],
  ]) {
    expect(firstMeasurementEvent({ events }, ids).firstMeasurementEventMs).toBeNull()
  }
  expect(
    firstMeasurementEvent({ events: [start, event()] }, new Set()).firstMeasurementEventMs,
  ).toBeNull()
})
it('names generic/effect events accurately; earliest linked timestamp is not a settled check', () => {
  const report: any = {
    events: [start, event('interaction:effect-measured-v2', 40), event()],
    findings: [],
    status: 'blocked',
    persistence: { status: 'verified' },
    uiScan: { inspection: { items: [], counts: { pending: 1 } }, checkCounts: {} },
  }
  const result = evaluate(report, 'ambiguity', ids)
  expect(result).toMatchObject({
    version: EVALUATION_VERSION,
    firstMeasurementEventMs: 20,
    settledEffects: 0,
    evidenceBackedExpectedFindings: 0,
    expectedDefectsNotFound: 1,
    partial: true,
    falseSuccess: false,
  })
  expect(result).not.toHaveProperty('firstSettledMeasurementMs')
  expect(result.firstFindingMs).toBeNull()
})
it('retains an observed zero-latency event, but does not substitute zero for missing data', () => {
  expect(
    firstMeasurementEvent({ events: [start, event(undefined, 0)] }, ids).firstMeasurementEventMs,
  ).toBe(0)
})
