import { describe, expect, it } from 'vitest'
import { deriveNeutralPoint, type NeutralElement } from './focus-neutral.ts'

/**
 * The neutral reset has to be a real click on an area that is genuinely inert, because plan 4.4 forbids
 * clearing focus with script blur. Choosing that area is the whole problem: a wrapper that delegates
 * clicks to the input would GRANT focus rather than clear it, so the region and everything containing it
 * are refused outright, and anything interactive is refused by tag.
 */

const REGION = { x: 430, y: 196, width: 420, height: 52 }
const VIEWPORT = { width: 1280, height: 768 }

function el(
  tag: string,
  bounds: NeutralElement['bounds'],
  over: Partial<NeutralElement> = {},
): NeutralElement {
  return { ref: 'r', tag, bounds, enabled: true, blocked: false, ...over }
}

const footer = el('footer', { x: 0, y: 700, width: 1280, height: 60 })
/** Deliberately clear of the region's vertical band, since an overlapping element is refused. */
const main = el('main', { x: 0, y: 400, width: 1280, height: 200 })

describe('neutral reset point derivation', () => {
  it('picks a point inside an inert element that is clear of the region', () => {
    const point = deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [main] })

    expect(point).not.toBeNull()
    expect(point!.x).toBeGreaterThanOrEqual(main.bounds.x)
    expect(point!.x).toBeLessThanOrEqual(main.bounds.x + main.bounds.width)
    expect(point!.y).toBeGreaterThanOrEqual(main.bounds.y)
    expect(point!.y).toBeLessThanOrEqual(main.bounds.y + main.bounds.height)
  })

  it('prefers the eligible element farthest from the region', () => {
    // Distance is a proxy for "nothing to do with the search area", and it keeps the choice stable.
    const point = deriveNeutralPoint({
      viewport: VIEWPORT,
      region: REGION,
      elements: [main, footer],
    })

    expect(point!.y).toBeGreaterThan(690)
  })

  it('refuses an element that contains the region, so a click cannot hand focus to the input', () => {
    // The container-proxy wrapper: clicking it focuses the input, which is the opposite of a reset.
    const wrapper = el('div', { x: 400, y: 180, width: 500, height: 90 })

    const point = deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [wrapper] })

    expect(point).toBeNull()
  })

  it('refuses an element that overlaps the region', () => {
    const overlapping = el('div', { x: 420, y: 190, width: 200, height: 200 })

    expect(
      deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [overlapping] }),
    ).toBeNull()
  })

  it('refuses interactive elements by tag', () => {
    const interactive = ['button', 'a', 'input', 'select', 'textarea', 'label', 'summary'].map(
      (tag) => el(tag, { x: 0, y: 700, width: 200, height: 40 }),
    )

    expect(
      deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: interactive }),
    ).toBeNull()
  })

  it('refuses a disabled or hit-blocked element', () => {
    const disabled = el('div', { x: 0, y: 700, width: 400, height: 60 }, { enabled: false })
    const blocked = el('div', { x: 0, y: 700, width: 400, height: 60 }, { blocked: true })

    expect(
      deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [disabled, blocked] }),
    ).toBeNull()
  })

  it('refuses an element too small to hold an inset point', () => {
    // Below the 4px inset the derived centre would land on the element's edge, where the click hits
    // whatever is behind it instead.
    const tiny = el('span', { x: 0, y: 700, width: 6, height: 6 })

    expect(deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [tiny] })).toBeNull()
  })

  it('refuses an element that runs past the viewport edge', () => {
    const overflowing = el('div', { x: 1200, y: 700, width: 400, height: 60 })

    expect(
      deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [overflowing] }),
    ).toBeNull()
  })

  it('refuses an element whose centre is covered by an interactive control', () => {
    // A container's own tag says nothing about what the click would land on: a nav wrapper is inert
    // while the link at its centre is not. This is how a reset ends up changing the page.
    const nav = el('nav', { x: 0, y: 0, width: 1280, height: 60 })
    const link = el('a', { x: 600, y: 20, width: 80, height: 24 })

    expect(
      deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [nav, link] }),
    ).toBeNull()
  })

  it('still accepts a container whose centre is clear of every interactive control', () => {
    const nav = el('nav', { x: 0, y: 0, width: 1280, height: 60 })
    const link = el('a', { x: 20, y: 20, width: 80, height: 24 })

    expect(
      deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [nav, link] }),
    ).not.toBeNull()
  })

  it('returns null rather than guessing when nothing qualifies', () => {
    expect(deriveNeutralPoint({ viewport: VIEWPORT, region: REGION, elements: [] })).toBeNull()
  })

  it('is deterministic for the same input', () => {
    const first = deriveNeutralPoint({
      viewport: VIEWPORT,
      region: REGION,
      elements: [main, footer],
    })
    const second = deriveNeutralPoint({
      viewport: VIEWPORT,
      region: REGION,
      elements: [main, footer],
    })

    expect(second).toEqual(first)
  })
})
