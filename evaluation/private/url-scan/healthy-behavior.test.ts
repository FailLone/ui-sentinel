import { it, expect } from 'vitest'
import { verifyHealthyBehavior } from './healthy-behavior.ts'
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
