import { describe, it, expect } from 'vitest'
import { toSlimSnapshot, type FullElement, type FullHitSample } from './observation-slim.ts'

function makeHitSample(overrides: Partial<FullHitSample> = {}): FullHitSample {
  return { x: 50, y: 30, hitSelector: 'html > body > button:nth-of-type(1)', relation: 'self', ...overrides }
}

function makeElement(overrides: Partial<FullElement> = {}): FullElement {
  return {
    selector: 'html > body > button:nth-of-type(1)',
    tag: 'button',
    text: 'Click me',
    visible: true,
    enabled: true,
    bounds: { x: 10, y: 20, width: 100, height: 40 },
    attributes: { type: 'submit' },
    hitSamples: [
      makeHitSample({ relation: 'self' }),
      makeHitSample({ relation: 'self' }),
      makeHitSample({ relation: 'descendant' }),
      makeHitSample({ relation: 'unrelated', hitSelector: 'html > body > div:nth-of-type(1)' }),
      makeHitSample({ relation: 'self' }),
    ],
    ...overrides,
  }
}

const baseSnapshot = {
  url: 'http://localhost:4173',
  title: 'Shop',
  viewport: { width: 1280, height: 768 },
  text: 'Hello world',
  observedAt: '2026-01-01T00:00:00Z',
}

describe('toSlimSnapshot', () => {
  it('produces slim elements with hit summaries', () => {
    const el = makeElement()
    const refMap = new Map([['e1', el.selector]])
    const slim = toSlimSnapshot({ ...baseSnapshot, elements: [el] }, 's1', 'screenshot-ref', refMap)

    expect(slim.elements).toHaveLength(1)
    const se = slim.elements[0]
    expect(se.ref).toBe('e1')
    expect(se.selector).toBe(el.selector)
    expect(se.tag).toBe('button')
    expect(se.hit.sampled).toBe(5)
    expect(se.hit.self).toBe(3)
    expect(se.hit.descendant).toBe(1)
    expect(se.hit.blocked).toBe(1)
  })

  it('resolves blocker refs when blocker is a known element', () => {
    const blocker: FullElement = { ...makeElement(), selector: 'html > body > div:nth-of-type(1)', tag: 'div', text: 'Overlay' }
    const target = makeElement({
      hitSamples: [
        makeHitSample({ relation: 'unrelated', hitSelector: blocker.selector }),
        makeHitSample({ relation: 'self' }),
      ],
    })
    const refMap = new Map([['e1', target.selector], ['e2', blocker.selector]])
    const slim = toSlimSnapshot({ ...baseSnapshot, elements: [target, blocker] }, 's1', 'ref', refMap)

    expect(slim.elements[0].hit.blockerRefs).toEqual(['e2'])
  })

  it('truncates long element text', () => {
    const longText = 'A'.repeat(300)
    const el = makeElement({ text: longText })
    const refMap = new Map([['e1', el.selector]])
    const slim = toSlimSnapshot({ ...baseSnapshot, elements: [el] }, 's1', 'ref', refMap)

    expect(slim.elements[0].text.length).toBeLessThanOrEqual(121)
    expect(slim.elements[0].text.endsWith('…')).toBe(true)
  })

  it('is significantly smaller than full snapshot in bytes', () => {
    const elements = Array.from({ length: 50 }, (_, i) => {
      const sel = `html > body > div:nth-of-type(${i + 1}) > button:nth-of-type(1)`
      return makeElement({
        selector: sel,
        text: `Product ${i + 1} description with some details about pricing and availability`,
        hitSamples: Array.from({ length: 5 }, () => makeHitSample({
          hitSelector: sel,
          blockerBounds: { x: 0, y: 0, width: 100, height: 40 },
        })),
      })
    })
    const refMap = new Map(elements.map((el, i) => [`e${i + 1}`, el.selector] as const))

    const fullBytes = new TextEncoder().encode(JSON.stringify({ ...baseSnapshot, elements })).byteLength
    const slim = toSlimSnapshot({ ...baseSnapshot, elements }, 's1', 'ref', refMap)
    const slimBytes = new TextEncoder().encode(JSON.stringify(slim)).byteLength

    const savings = ((fullBytes - slimBytes) / fullBytes) * 100
    expect(savings).toBeGreaterThan(30)
  })

  it('preserves metadata fields', () => {
    const slim = toSlimSnapshot({ ...baseSnapshot, elements: [] }, 's42', 'sc-ref', new Map())
    expect(slim.snapshotId).toBe('s42')
    expect(slim.url).toBe(baseSnapshot.url)
    expect(slim.screenshotRef).toBe('sc-ref')
    expect(slim.pageText).toBe('Hello world')
    expect(slim.elementCount).toBe(0)
  })

  it('handles none relation in hit samples', () => {
    const el = makeElement({
      hitSamples: [makeHitSample({ relation: 'none', hitSelector: null })],
    })
    const refMap = new Map([['e1', el.selector]])
    const slim = toSlimSnapshot({ ...baseSnapshot, elements: [el] }, 's1', 'ref', refMap)

    expect(slim.elements[0].hit.blocked).toBe(1)
    expect(slim.elements[0].hit.blockerRefs).toEqual([])
  })
})
