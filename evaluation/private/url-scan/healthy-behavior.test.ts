import { it, expect } from 'vitest'
import { verifyHealthyBehavior, verifyDefaultHealthyBehavior } from './healthy-behavior.ts'
const entryUrl = 'http://localhost/catalog?q=x'
const time = (n: number) => new Date(n * 1000).toISOString()
const orders = {
  price: '5 · Amber gadget\n12 · Cyan sprocket\n20 · Blue widget',
  name: '5 · Amber gadget\n20 · Blue widget\n12 · Cyan sprocket',
}
const input = (sort: keyof typeof orders) => ({
  entryUrl,
  overlay: false,
  requests: [{ method: 'GET', path: '/items?sort=' + sort, observedAt: time(1) }],
  snapshots: [{ url: entryUrl, observedAt: time(2), text: orders[sort] }],
})
it.each(['price', 'name'] as const)(
  'accepts actual public %s sorting with matching result',
  (sort) => expect(verifyHealthyBehavior(input(sort))).toBe(true),
)
it('refuses wrong order, mismatched request, stale evidence, absent time and wrong page', () => {
  const good = input('name')
  for (const wrong of [
    { ...good, requests: [] },
    { ...good, requests: [{ ...good.requests[0]!, path: '/items?sort=price' }] },
    { ...good, requests: [{ ...good.requests[0]!, observedAt: time(3) }] },
    { ...good, snapshots: [{ ...good.snapshots[0]!, observedAt: undefined }] },
    { ...good, snapshots: [{ ...good.snapshots[0]!, url: entryUrl + 'x' }] },
    {
      ...good,
      snapshots: [
        { ...good.snapshots[0]!, text: '20 · Blue widget\n5 · Amber gadget\n12 · Cyan sprocket' },
      ],
    },
    {
      ...good,
      requests: [
        ...good.requests,
        { method: 'GET', path: '/items?sort=price', observedAt: time(1.5) },
      ],
    },
  ])
    expect(verifyHealthyBehavior(wrong)).toBe(false)
})
it('requires independent actual filter expansion as well for overlay control', () => {
  const good = { ...input('price'), overlay: true }
  expect(verifyHealthyBehavior(good)).toBe(false)
  expect(
    verifyHealthyBehavior({
      ...good,
      snapshots: [
        ...good.snapshots,
        { url: entryUrl, text: 'Available products', observedAt: time(3) },
      ],
    }),
  ).toBe(true)
})

it('future protocol checks public selected effects; legacy private filter obligation is unchanged', () => {
  const good = { ...input('price'), overlay: true }
  const candidates = [
    { itemId: 'sort', category: 'local-interaction', description: 'select "Sort"' },
    { itemId: 'apply', category: 'local-interaction', description: 'button "Apply sort"' },
    { itemId: 'other', category: 'local-interaction', description: 'button "Other"' },
    { itemId: 'filter', category: 'local-interaction', description: 'button "Filters"' },
  ]
  const publicElements = candidates.map((c) => ({
    tag: c.itemId === 'sort' ? 'select' : 'button',
    text:
      c.itemId === 'sort'
        ? 'Sort'
        : c.itemId === 'apply'
          ? 'Apply sort'
          : c.itemId === 'filter'
            ? 'Filters'
            : 'Other',
    visible: true,
    enabled: true,
    attributes: {},
  }))
  good.snapshots = good.snapshots.map((s) => ({ ...s, elements: publicElements }))
  const report = {
    uiScan: {
      contract: { samplingPolicy: { revision: 'bounded-ui-sampling-1' } },
      inspection: {
        items: candidates.map((c) => ({
          ...c,
          selected: c.itemId !== 'filter',
          status: 'verified',
        })),
      },
    },
    events: [{ type: 'scope:sampling-frozen', payload: { url: entryUrl, count: 3, candidates } }],
  }
  expect(verifyHealthyBehavior(good)).toBe(false)
  expect(verifyDefaultHealthyBehavior({ ...good, report })).toBe(true)
  const omitted = {
    ...report,
    events: [
      {
        ...report.events[0]!,
        payload: { ...report.events[0]!.payload, candidates: candidates.slice(0, 3) },
      },
    ],
  }
  expect(verifyDefaultHealthyBehavior({ ...good, report: omitted })).toBe(false)
  expect(
    verifyDefaultHealthyBehavior({
      ...good,
      report: {
        ...report,
        events: [{ ...report.events[0]!, payload: { ...report.events[0]!.payload, count: 2 } }],
      },
    }),
  ).toBe(false)
  const included = {
    ...report,
    uiScan: {
      ...report.uiScan,
      inspection: {
        items: report.uiScan.inspection.items.map((i) => ({
          ...i,
          selected: i.itemId !== 'other',
        })),
      },
    },
  }
  expect(verifyDefaultHealthyBehavior({ ...good, report: included })).toBe(false)
})
