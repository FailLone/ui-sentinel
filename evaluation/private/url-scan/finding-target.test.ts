import { it, expect } from 'vitest'
import { verifiesSortFinding } from './finding-target.ts'
const t = Date.parse('2026-10-07T12:00:00Z')
const context = () => ({
  defective: {
    price: {
      '#first': ['20 · Blue widget'],
      '#name': ['Blue widget'],
      '.price': ['20', '5', '12'],
    },
    name: { '#first': ['20 · Blue widget'], '#name': ['Blue widget'], '.price': ['20', '5', '12'] },
  },
  healthy: {
    price: {
      '#first': ['5 · Amber gadget'],
      '#name': ['Amber gadget'],
      '.price': ['5', '12', '20'],
    },
    name: {
      '#first': ['5 · Amber gadget'],
      '#name': ['Amber gadget'],
      '.price': ['5', '20', '12'],
    },
  },
  requests: [{ method: 'GET', path: '/items?sort=name', observedAt: new Date(t).toISOString() }],
  measuredAt: new Date(t + 100).toISOString(),
})
const inline = () => ({
  outcome: 'failed',
  input: { selector: '#name', condition: 'text-equals', expected: 'Amber gadget' },
  binding: { mode: 'post-action-current', selector: '#name' },
  measured: { supported: true, count: 1, values: ['Blue widget'] },
})
it('recognizes real first-name/whole-row results with both independent controls, not selector text', () => {
  expect(verifiesSortFinding(inline(), context())).toBe(true)
  const row = inline()
  row.input.selector = row.binding.selector = '#first'
  row.input.condition = 'text-contains'
  row.measured.values = ['20 · Blue widget']
  expect(verifiesSortFinding(row, context())).toBe(true)
  expect(verifiesSortFinding(row, { ...context(), healthy: undefined })).toBe(false)
  row.input.selector = row.binding.selector = '#name + unrelated'
  expect(verifiesSortFinding(row, context())).toBe(false)
})
it('rejects unknown, stale, missing-action, invented values and incorrect applicability', () => {
  for (const c of [
    { ...context(), requests: [] },
    { ...context(), measuredAt: new Date(t - 1).toISOString() },
    { ...context(), measuredAt: undefined },
    { ...context(), requests: [{ ...context().requests[0]!, method: 'POST' }] },
    { ...context(), requests: [{ ...context().requests[0]!, observedAt: 'unknown' }] },
  ])
    expect(verifiesSortFinding(inline(), c)).toBe(false)
  for (const r of [
    { ...inline(), outcome: 'unverified' },
    { ...inline(), measured: { supported: false, count: 1, values: ['Blue widget'] } },
    { ...inline(), measured: { supported: true, count: 1, values: ['Invented'] } },
    { ...inline(), input: { ...inline().input, selector: '#other' } },
    { ...inline(), input: { ...inline().input, expected: 'No such product' } },
  ])
    expect(verifiesSortFinding(r, context())).toBe(false)
  const numeric = inline()
  numeric.input.selector = numeric.binding.selector = '.price'
  numeric.input.condition = 'numeric-ascending'
  numeric.measured = { supported: true, count: 3, values: ['20', '5', '12'] }
  expect(verifiesSortFinding(numeric, context())).toBe(false) // Name order does not promise numeric order.
  const price = context()
  price.requests[0]!.path = '/items?sort=price'
  expect(verifiesSortFinding(numeric, price)).toBe(true)
  price.requests.push({
    method: 'GET',
    path: '/items?sort=name',
    observedAt: new Date(t + 50).toISOString(),
  })
  expect(verifiesSortFinding(numeric, price)).toBe(false) // Latest actual choice wins.
})
it('requires program measurement after the actual apply request, not its earlier sample', () => {
  const r = {
    verdict: 'fail',
    startedAt: t - 50,
    finishedAt: t + 100,
    log: [{ op: 'measure', detail: 'after', at: t + 50 }],
    program: { targets: [{ name: 'first', selector: '#name' }] },
    samples: { after: { first: { text: 'Blue widget' } } },
    assertions: [
      {
        verdict: 'fail',
        operator: 'eq',
        left: { sample: 'after', target: 'first', metric: 'text' },
        right: { value: 'Amber gadget' },
        actualLeft: 'Blue widget',
        actualRight: 'Amber gadget',
      },
    ],
  }
  expect(verifiesSortFinding(r, context())).toBe(true)
  r.log[0]!.at = t - 1
  expect(verifiesSortFinding(r, context())).toBe(false)
  r.log[0]!.at = t + 50
  r.assertions[0]!.actualLeft = 'Invented'
  expect(verifiesSortFinding(r, context())).toBe(false)
})
