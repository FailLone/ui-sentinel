import { expect, it } from 'vitest'
import { r1Report } from './r1-report.ts'
import { freezeExploration } from '../../shared/r1-policy.ts'
const event = (type: string, payload: object, actionId: string | null = null) =>
  ({ id: type, type, payload, actionId }) as any
const run: any = {
  spec: { uiContract: { exploration: freezeExploration({ mode: 'program', jev: false }) } },
  usage: { modelCalls: 0 },
}
const attempt = {
  attemptId: 'a1',
  itemId: 'i1',
  targetKey: 'target',
  action: 'click',
  beforeState: 's1',
  afterState: 's2',
}
const progress = {
  attempts: [attempt],
  paths: [{ steps: [{ attemptId: 'a1' }] }],
  visitedStates: ['s1', 's2'],
}
const checks: any = {
  sourceReview: { state: 'sealed' },
  generic: { state: 'collected', actionId: 'a1', evidenceRefs: ['receipt'] },
  effects: [{ state: 'failed', measurementRefs: ['measurement'] }],
}
const items: any[] = [{ itemId: 'i1', selected: true, status: 'failed', checks }]
const events = [event('action:executing', {}, 'a1'), event('r1:progress', progress)]
it('history joins actual actions, original checks and readable artifacts, preserving measured failures', () => {
  const result = r1Report(run, events, items, new Set(['receipt', 'measurement']))!
  expect(result.attempts[0]).toMatchObject({ visited: true, measurement: 'failed' })
  expect(result.paths[0].measured).toBe(true)
  for (const altered of [
    events.slice(1),
    events.map((e) => (e.type === 'action:executing' ? { ...e, actionId: 'different' } : e)),
  ])
    expect(
      r1Report(run, altered, items, new Set(['receipt', 'measurement']))!.paths[0].measured,
    ).toBe(false)
  expect(r1Report(run, events, items, new Set(['receipt']))!.attempts[0].measurement).toBe(
    'unverified',
  )
  const changed = structuredClone(items)
  changed[0].checks.generic.actionId = 'another-action'
  expect(
    r1Report(run, events, changed, new Set(['receipt', 'measurement']))!.paths[0].measured,
  ).toBe(false)
})
it('final handoff persists states, counterexample and omitted branches, including runs without actions', () => {
  const final = event('r1:handoff', {
    reason: 'ambiguous-public-target',
    packet: {
      visitedStates: ['s1'],
      attempts: [],
      unexplored: [{ targetKey: 'second' }],
      counterexample: { kind: 'alternative-sequence' },
    },
  })
  const result = r1Report(run, [...events, final], items, new Set())!
  expect(result.visitedStates).toEqual(['s1'])
  expect(result.attempts).toEqual([])
  expect(result.unexplored).toEqual([{ targetKey: 'second' }])
  expect(result.counterexample).toEqual({ kind: 'alternative-sequence' })
  expect(r1Report({ ...run, spec: {} }, events, items)).toBeUndefined()
})
it('navigation needs its own original receipt; a path projection alone cannot verify it', () => {
  const nav = [
    {
      itemId: 'i1',
      category: 'navigation',
      selected: true,
      status: 'verified',
      evidenceRefs: ['nav'],
    },
  ]
  expect(r1Report(run, events, nav, new Set(['nav']))!.paths[0].measured).toBe(false)
  const receipt = event('r1:step', {
    toolResults: [
      {
        toolName: 'page_act',
        result: { verification: { itemId: 'i1', actionId: 'a1', outcome: 'verified' } },
      },
    ],
  })
  expect(r1Report(run, [...events, receipt], nav, new Set(['nav']))!.paths[0].measured).toBe(true)
  expect(r1Report(run, [...events, receipt], nav, new Set())!.paths[0].measured).toBe(false)
})
