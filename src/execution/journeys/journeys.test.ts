import { it, expect } from 'vitest'
import { deriveJourneys, type Journey } from './library.ts'
import { runJourney } from './runner.ts'
import type { PageSnapshot } from '../../rules/types.ts'
import type { RunEvent } from '../../shared/types.ts'

const snapshot = (heading: string, button: string): PageSnapshot => ({
  url: 'http://localhost/store',
  title: 'Store',
  viewport: { width: 100, height: 100 },
  elements: [
    {
      selector: 'h1',
      tag: 'h1',
      text: heading,
      visible: true,
      bounds: { x: 0, y: 0, width: 50, height: 10 },
      attributes: {},
    },
    {
      selector: 'button',
      tag: 'button',
      text: button,
      visible: true,
      enabled: true,
      bounds: { x: 0, y: 20, width: 50, height: 10 },
      attributes: {},
    },
  ],
})
const snapshots = new Map([
  ['a', snapshot('Products', 'Cart')],
  ['b', snapshot('Cart', 'Checkout')],
  ['c', snapshot('Checkout', 'Pay')],
])
const events: RunEvent[] = [
  {
    type: 'action:executing',
    actionId: 'a1',
    payload: { type: 'click', target: 'button[Cart][0]' },
    evidenceRefs: ['a'],
  },
  {
    type: 'action:completed',
    actionId: 'a1',
    payload: { type: 'click', networkWrites: 0 },
    evidenceRefs: [],
  },
  { type: 'page:observed', actionId: null, payload: {}, evidenceRefs: ['b'] },
  {
    type: 'action:executing',
    actionId: 'a2',
    payload: { type: 'click', target: 'button[Checkout]' },
    evidenceRefs: ['b'],
  },
  {
    type: 'action:completed',
    actionId: 'a2',
    payload: { type: 'click', networkWrites: 0 },
    evidenceRefs: [],
  },
  { type: 'page:observed', actionId: null, payload: {}, evidenceRefs: ['c'] },
].map((e, i) => ({ ...e, id: `e${i}`, runId: 'r', seq: i, timestamp: '', stepId: null }))
const journey = () => deriveJourneys('r', 'arena', events, snapshots)[0]!

it('derives only consecutive uniquely grounded steps with explicit zero-write evidence', () => {
  expect(journey().steps.map((s) => s.action.name)).toEqual(['Cart', 'Checkout'])
  expect(journey().steps[0]!.source.beforeRefs).toEqual(['a'])
  expect(
    deriveJourneys(
      'r',
      'arena',
      events.map((e) => (e.type === 'action:completed' ? { ...e, payload: {} } : e)),
      snapshots,
    ),
  ).toEqual([])
  expect(deriveJourneys('r', 'arena', events, new Map())).toEqual([])
  const ambiguous = new Map(snapshots)
  ambiguous.set('a', {
    ...snapshots.get('a')!,
    elements: [...snapshots.get('a')!.elements, snapshots.get('a')!.elements[1]!],
  })
  expect(deriveJourneys('r', 'arena', events, ambiguous)).toEqual([])
})

async function simulate(
  j: Journey,
  interrupt: 'none' | 'anomaly' | 'cancel' | 'changed' | 'ambiguous',
) {
  let steps = 0
  return runJourney(j, {
    guard: () => {
      if (interrupt === 'cancel' && steps) throw Error('cancelled')
    },
    snapshot: () => snapshots.get(steps ? 'b' : 'a')!,
    observe: async () => {},
    blocked: () => interrupt === 'anomaly' && steps === 1,
    unique: async () => interrupt !== 'ambiguous',
    act: async () => {
      steps++
      return { status: interrupt === 'changed' ? 'failed' : 'completed', evidenceRefs: ['b'] }
    },
  })
}
it('hands control back on new anomalies or ambiguous targets without repeating completed steps', async () => {
  expect(await simulate(journey(), 'anomaly')).toMatchObject({ status: 'handoff', nextStep: 1 })
  expect(await simulate(journey(), 'ambiguous')).toMatchObject({ status: 'handoff', nextStep: 0 })
  expect(await simulate(journey(), 'changed')).toMatchObject({ status: 'handoff', nextStep: 0 })
})
it('honors cancellation between steps', async () => {
  await expect(simulate(journey(), 'cancel')).rejects.toThrow('cancelled')
})
