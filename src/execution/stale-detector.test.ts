import { describe, it, expect } from 'vitest'
import { createStaleDetector, DEFAULT_STALE_CONFIG } from './stale-detector.ts'
import type { SlimSnapshot } from './observation-slim.ts'

function makeSlim(overrides: Partial<SlimSnapshot> = {}): SlimSnapshot {
  return {
    snapshotId: 's1',
    url: 'http://localhost:4173',
    title: 'Shop',
    viewport: { width: 1280, height: 768 },
    observedAt: new Date().toISOString(),
    screenshotRef: 'ref-1',
    elementCount: 2,
    elements: [
      {
        ref: 'e1',
        selector: 'button:nth-of-type(1)',
        tag: 'button',
        text: 'Buy',
        visible: true,
        enabled: true,
        bounds: { x: 10, y: 20, width: 100, height: 40 },
        attributes: {},
        hit: { sampled: 5, self: 5, descendant: 0, blocked: 0, blockerRefs: [] },
      },
      {
        ref: 'e2',
        selector: 'h1:nth-of-type(1)',
        tag: 'h1',
        text: 'Welcome',
        visible: true,
        enabled: true,
        bounds: { x: 0, y: 0, width: 400, height: 60 },
        attributes: {},
        hit: { sampled: 5, self: 5, descendant: 0, blocked: 0, blockerRefs: [] },
      },
    ],
    pageText: 'Welcome to the shop. Buy now.',
    ...overrides,
  }
}

describe('createStaleDetector', () => {
  it('identifies same-state repeat observations', () => {
    const det = createStaleDetector()
    const snap = makeSlim()

    const first = det.checkObservation(snap)
    expect(first.fresh).toBe(true)

    const second = det.checkObservation({
      ...snap,
      snapshotId: 's2',
      observedAt: new Date().toISOString(),
    })
    expect(second.fresh).toBe(false)
    if (!second.fresh) expect(second.staleCount).toBe(1)

    const third = det.checkObservation({ ...snap, snapshotId: 's3' })
    expect(third.fresh).toBe(false)
    if (!third.fresh) expect(third.staleCount).toBe(2)
  })

  it('does not circuit-break delayed business feedback after action', () => {
    const det = createStaleDetector({ maxStaleBeforeHint: 2, maxStaleBeforeCompact: 4 })
    const snap = makeSlim({ pageText: 'Processing payment...' })
    det.checkObservation(snap)

    for (let i = 0; i < 5; i++) det.checkObservation(snap)
    const beforeAction = det.checkObservation(snap)
    expect(beforeAction.fresh).toBe(false)
    if (!beforeAction.fresh) expect(beforeAction.compact).toBe(true)

    det.recordAction()

    const afterAction = det.checkObservation(snap)
    expect(afterAction.fresh).toBe(false)
    if (!afterAction.fresh) {
      expect(afterAction.compact).toBe(false)
      expect(afterAction.staleCount).toBe(1)
    }
  })

  it('invalidates reuse when page content changes (scroll, popup, focus)', () => {
    const det = createStaleDetector()
    const page1 = makeSlim()
    det.checkObservation(page1)
    det.checkObservation(page1)
    expect(det.getStats().consecutiveStale).toBe(1)

    const page2 = makeSlim({ pageText: 'Welcome to the shop. Buy now. POPUP: Subscribe!' })
    const result = det.checkObservation(page2)
    expect(result.fresh).toBe(true)
    expect(det.getStats().consecutiveStale).toBe(0)
  })

  it('invalidates reuse when element visibility changes', () => {
    const det = createStaleDetector()
    const snap = makeSlim()
    det.checkObservation(snap)

    const changed = makeSlim({
      elements: [{ ...snap.elements[0], visible: false }, snap.elements[1]],
    })
    const result = det.checkObservation(changed)
    expect(result.fresh).toBe(true)
  })

  it('does not miscount post-action verification as loop', () => {
    const det = createStaleDetector({ maxStaleBeforeHint: 2, maxStaleBeforeCompact: 4 })
    const snap = makeSlim()
    det.checkObservation(snap)
    det.checkObservation(snap)
    expect(det.getStats().consecutiveStale).toBe(1)

    det.recordAction()
    expect(det.getStats().consecutiveStale).toBe(0)

    const postAction = det.checkObservation(snap)
    expect(postAction.fresh).toBe(false)
    if (!postAction.fresh) {
      expect(postAction.staleCount).toBe(1)
      expect(postAction.compact).toBe(false)
      expect(postAction.hint).toBeNull()
    }
  })

  it('provides graduated hints at configured thresholds', () => {
    const det = createStaleDetector({ maxStaleBeforeHint: 2, maxStaleBeforeCompact: 4 })
    const snap = makeSlim()

    det.checkObservation(snap)

    const r1 = det.checkObservation(snap)
    expect(r1.fresh).toBe(false)
    if (!r1.fresh) {
      expect(r1.hint).toBeNull()
      expect(r1.compact).toBe(false)
    }

    const r2 = det.checkObservation(snap)
    expect(r2.fresh).toBe(false)
    if (!r2.fresh) {
      expect(r2.hint).toBeTruthy()
      expect(r2.compact).toBe(false)
    }

    det.checkObservation(snap)

    const r4 = det.checkObservation(snap)
    expect(r4.fresh).toBe(false)
    if (!r4.fresh) {
      expect(r4.compact).toBe(true)
      expect(r4.hint).toContain('run_finish')
    }
  })

  it('still counts stale observations toward budget (infinite wait limited)', () => {
    const det = createStaleDetector({ maxStaleBeforeHint: 1, maxStaleBeforeCompact: 2 })
    const snap = makeSlim()

    det.checkObservation(snap)
    for (let i = 0; i < 10; i++) {
      det.checkObservation(snap)
    }

    const stats = det.getStats()
    expect(stats.totalChecks).toBe(11)
    expect(stats.totalStale).toBe(10)
    expect(stats.reusedCount).toBeGreaterThan(0)
  })

  it('tracks stats correctly across mixed fresh and stale', () => {
    const det = createStaleDetector()
    const snap1 = makeSlim()
    const snap2 = makeSlim({ url: 'http://localhost:4173/cart' })

    det.checkObservation(snap1)
    det.checkObservation(snap1)
    det.checkObservation(snap2)
    det.checkObservation(snap2)
    det.recordAction()
    det.checkObservation(snap2)

    const stats = det.getStats()
    expect(stats.totalChecks).toBe(5)
    expect(stats.totalStale).toBe(3)
    expect(stats.consecutiveStale).toBe(1)
  })

  it('invalidate() forces next observation to be fresh', () => {
    const det = createStaleDetector()
    const snap = makeSlim()
    det.checkObservation(snap)
    det.checkObservation(snap)
    expect(det.getStats().consecutiveStale).toBe(1)

    det.invalidate()
    const result = det.checkObservation(snap)
    expect(result.fresh).toBe(true)
    expect(det.getStats().consecutiveStale).toBe(0)
  })

  it('uses default thresholds from exported config', () => {
    expect(DEFAULT_STALE_CONFIG.maxStaleBeforeHint).toBe(2)
    expect(DEFAULT_STALE_CONFIG.maxStaleBeforeCompact).toBe(4)
  })
})

describe('checkA11y', () => {
  it('identifies same a11y tree as stale', () => {
    const det = createStaleDetector()
    const url = 'http://localhost:4173'
    const tree = '- button "Buy Now"\n- heading "Welcome" [level=1]'

    const first = det.checkA11y(url, tree)
    expect(first.fresh).toBe(true)

    const second = det.checkA11y(url, tree)
    expect(second.fresh).toBe(false)
    if (!second.fresh) expect(second.staleCount).toBe(1)
  })

  it('detects fresh when a11y tree content changes', () => {
    const det = createStaleDetector()
    const url = 'http://localhost:4173'

    det.checkA11y(url, '- button "Buy Now"')
    det.checkA11y(url, '- button "Buy Now"')
    expect(det.getStats().consecutiveStale).toBe(1)

    const result = det.checkA11y(url, '- button "Buy Now"\n- dialog "Order Confirmed"')
    expect(result.fresh).toBe(true)
    expect(det.getStats().consecutiveStale).toBe(0)
  })

  it('detects fresh when URL changes even if tree is similar', () => {
    const det = createStaleDetector()

    det.checkA11y('http://localhost:4173', '- button "Buy"')
    const result = det.checkA11y('http://localhost:4173/cart', '- button "Buy"')
    expect(result.fresh).toBe(true)
  })

  it('shares consecutive counter with recordAction', () => {
    const det = createStaleDetector({ maxStaleBeforeCompact: 4 })
    const url = 'http://localhost:4173'
    const tree = '- button "Buy"'

    det.checkA11y(url, tree)
    for (let i = 0; i < 5; i++) det.checkA11y(url, tree)

    const before = det.checkA11y(url, tree)
    expect(before.fresh).toBe(false)
    if (!before.fresh) expect(before.compact).toBe(true)

    det.recordAction()
    const after = det.checkA11y(url, tree)
    expect(after.fresh).toBe(false)
    if (!after.fresh) {
      expect(after.compact).toBe(false)
      expect(after.staleCount).toBe(1)
    }
  })

  it('graduated hints work with a11y checks', () => {
    const det = createStaleDetector({ maxStaleBeforeHint: 2, maxStaleBeforeCompact: 4 })
    const url = 'http://localhost:4173'
    const tree = '- button "Add to Cart"'

    det.checkA11y(url, tree)

    const r1 = det.checkA11y(url, tree)
    if (!r1.fresh) expect(r1.hint).toBeNull()

    const r2 = det.checkA11y(url, tree)
    if (!r2.fresh) {
      expect(r2.hint).toBeTruthy()
      expect(r2.compact).toBe(false)
    }

    det.checkA11y(url, tree)
    const r4 = det.checkA11y(url, tree)
    if (!r4.fresh) {
      expect(r4.compact).toBe(true)
      expect(r4.hint).toContain('run_finish')
    }
  })

  it('a11y and slim checks share the same fingerprint state', () => {
    const det = createStaleDetector()

    det.checkA11y('http://localhost:4173', '- button "Buy"')
    expect(det.getStats().consecutiveStale).toBe(0)

    const slimResult = det.checkObservation(makeSlim())
    expect(slimResult.fresh).toBe(true)
    expect(det.getStats().consecutiveStale).toBe(0)

    det.checkA11y('http://localhost:4173', '- button "Buy"')
    expect(det.getStats().consecutiveStale).toBe(0)
  })
})

it('detects hit-test and geometry changes behind an unchanged accessibility tree', () => {
  const detector = createStaleDetector(),
    before = makeSlim()
  detector.checkA11y(before.url, 'button Buy', before)
  const blocked = {
    ...before,
    elements: before.elements.map((e) => ({ ...e, hit: { ...e.hit, self: 0, blocked: 5 } })),
  }
  expect(detector.checkA11y(before.url, 'button Buy', blocked).fresh).toBe(true)
  const moved = {
    ...blocked,
    elements: blocked.elements.map((e) => ({ ...e, bounds: { ...e.bounds, y: 999 } })),
  }
  expect(detector.checkA11y(before.url, 'button Buy', moved).fresh).toBe(true)
  expect(detector.checkA11y(before.url, 'button Buy', { ...moved, snapshotId: 'new' }).fresh).toBe(
    false,
  )
})
