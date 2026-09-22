import { describe, it, expect } from 'vitest'
import { createElementStore } from './element-store.ts'
import type { FullElement } from './observation-slim.ts'

function makeElement(selector: string): FullElement {
  return {
    selector,
    tag: 'button',
    text: 'Click',
    visible: true,
    enabled: true,
    bounds: { x: 10, y: 20, width: 100, height: 40 },
    attributes: {},
    hitSamples: [{ x: 60, y: 40, hitSelector: selector, relation: 'self' }],
  }
}

const baseSnapshot = {
  url: 'http://localhost:4173',
  title: 'Shop',
  viewport: { width: 1280, height: 768 },
  text: 'Page text',
  observedAt: '2026-01-01T00:00:00Z',
}

describe('createElementStore', () => {
  it('assigns unique refs across snapshots', () => {
    const store = createElementStore()
    const s1 = store.registerSnapshot('s1', { ...baseSnapshot, elements: [makeElement('a'), makeElement('b')] }, 'ref1')
    const s2 = store.registerSnapshot('s2', { ...baseSnapshot, elements: [makeElement('c')] }, 'ref2')

    const refs1 = s1.elements.map(e => e.ref)
    const refs2 = s2.elements.map(e => e.ref)
    expect(refs1).toEqual(['e1', 'e2'])
    expect(refs2).toEqual(['e3'])
  })

  it('returns fresh=true for latest snapshot elements', () => {
    const store = createElementStore()
    store.registerSnapshot('s1', { ...baseSnapshot, elements: [makeElement('a')] }, 'ref1')
    store.registerSnapshot('s2', { ...baseSnapshot, elements: [makeElement('b')] }, 'ref2')

    const old = store.getDetail('e1')
    const current = store.getDetail('e2')

    expect(old.found).toBe(true)
    if (old.found) expect(old.fresh).toBe(false)

    expect(current.found).toBe(true)
    if (current.found) expect(current.fresh).toBe(true)
  })

  it('returns not found for unknown refs', () => {
    const store = createElementStore()
    const result = store.getDetail('e999')
    expect(result.found).toBe(false)
    if (!result.found) expect(result.reason).toBe('unknown ref')
  })

  it('returns full element data on detail', () => {
    const store = createElementStore()
    const el = makeElement('html > body > btn')
    store.registerSnapshot('s1', { ...baseSnapshot, elements: [el] }, 'ref1')

    const detail = store.getDetail('e1')
    expect(detail.found).toBe(true)
    if (detail.found) {
      expect(detail.element.selector).toBe('html > body > btn')
      expect(detail.element.hitSamples).toHaveLength(1)
    }
  })

  it('tracks ref count', () => {
    const store = createElementStore()
    expect(store.getRefCount()).toBe(0)
    store.registerSnapshot('s1', { ...baseSnapshot, elements: [makeElement('a'), makeElement('b')] }, 'ref1')
    expect(store.getRefCount()).toBe(2)
    store.registerSnapshot('s2', { ...baseSnapshot, elements: [makeElement('c')] }, 'ref2')
    expect(store.getRefCount()).toBe(3)
  })

  it('tracks latest snapshot id', () => {
    const store = createElementStore()
    expect(store.getLatestSnapshotId()).toBeNull()
    store.registerSnapshot('snap-1', { ...baseSnapshot, elements: [] }, 'ref')
    expect(store.getLatestSnapshotId()).toBe('snap-1')
  })

  it('produces slim snapshot with hit summaries', () => {
    const store = createElementStore()
    const slim = store.registerSnapshot('s1', { ...baseSnapshot, elements: [makeElement('a')] }, 'sc')

    expect(slim.snapshotId).toBe('s1')
    expect(slim.elements[0].hit).toBeDefined()
    expect(slim.elements[0].hit.sampled).toBe(1)
    expect(slim.elements[0].hit.self).toBe(1)
  })
})
