import { describe, expect, it } from 'vitest'
import { deriveProbePoints, regionIsUsable, MIN_EDGE_INSET_PX } from './focus-geometry.ts'

const viewport = { width: 1280, height: 768 }
const wide = { x: 100, y: 200, width: 400, height: 40 }

describe('region usability (strict rejection, not trimming)', () => {
  it('accepts a finite positive rectangle inside the viewport', () => {
    expect(regionIsUsable(wide, viewport)).toBe(true)
  })

  it('rejects a rectangle extending past the right edge instead of clipping it', () => {
    expect(regionIsUsable({ ...wide, x: 1100, width: 400 }, viewport)).toBe(false)
  })

  it('rejects negative and non-positive dimensions', () => {
    expect(regionIsUsable({ ...wide, width: 0 }, viewport)).toBe(false)
    expect(regionIsUsable({ ...wide, height: -5 }, viewport)).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    expect(regionIsUsable({ ...wide, x: Number.NaN }, viewport)).toBe(false)
    expect(regionIsUsable({ ...wide, y: Number.POSITIVE_INFINITY }, viewport)).toBe(false)
  })

  it('rejects a rectangle that starts outside the viewport', () => {
    expect(regionIsUsable({ ...wide, x: -1 }, viewport)).toBe(false)
  })
})

describe('probe point derivation', () => {
  it('derives a left and a right point inside the region, not at its centre', () => {
    const { points } = deriveProbePoints({ region: wide, excluded: [], dangerous: [] })

    expect(points).toHaveLength(2)
    const [left, right] = points
    expect(left.x).toBeCloseTo(wide.x + 0.12 * wide.width)
    expect(right.x).toBeCloseTo(wide.x + 0.88 * wide.width)
    // Neither point is the DOM input centre, which is what makes the sample meaningful.
    expect(left.x).not.toBeCloseTo(wide.x + wide.width / 2)
  })

  it('keeps every point at least the minimum inset from the frame edge', () => {
    const narrow = { x: 50, y: 50, width: 20, height: 20 }
    const { points } = deriveProbePoints({ region: narrow, excluded: [], dangerous: [] })

    for (const point of points) {
      expect(point.x - narrow.x).toBeGreaterThanOrEqual(MIN_EDGE_INSET_PX)
      expect(narrow.x + narrow.width - point.x).toBeGreaterThanOrEqual(MIN_EDGE_INSET_PX)
      expect(point.y - narrow.y).toBeGreaterThanOrEqual(MIN_EDGE_INSET_PX)
      expect(narrow.y + narrow.height - point.y).toBeGreaterThanOrEqual(MIN_EDGE_INSET_PX)
    }
  })

  it('skips a point that falls inside an excluded region and says so', () => {
    const coveringRight = { x: wide.x + 0.88 * wide.width - 5, y: wide.y, width: 40, height: wide.height }
    const { points, skipped } = deriveProbePoints({
      region: wide,
      excluded: [coveringRight],
      dangerous: [],
    })

    expect(points).toHaveLength(1)
    expect(points[0].x).toBeCloseTo(wide.x + 0.12 * wide.width)
    expect(skipped).toContainEqual({ side: 'right', reason: 'excluded' })
  })

  it('skips a point that falls on a dangerous control', () => {
    const button = { x: wide.x, y: wide.y, width: 60, height: wide.height }
    const { points, skipped } = deriveProbePoints({
      region: wide,
      excluded: [],
      dangerous: [button],
    })

    expect(points).toHaveLength(1)
    expect(points[0].x).toBeCloseTo(wide.x + 0.88 * wide.width)
    expect(skipped).toContainEqual({ side: 'left', reason: 'dangerous' })
  })

  it('returns no point for a region too narrow to hold an inset sample', () => {
    const tiny = { x: 10, y: 10, width: 6, height: 6 }
    const { points, skipped } = deriveProbePoints({ region: tiny, excluded: [], dangerous: [] })

    expect(points).toHaveLength(0)
    expect(skipped).toHaveLength(2)
  })

  it('does not relocate a blocked point to an easier position', () => {
    // Both horizontal slots are covered: the answer is "no usable point", not a centre fallback.
    const covering = { x: wide.x, y: wide.y, width: wide.width, height: wide.height }
    const { points } = deriveProbePoints({ region: wide, excluded: [covering], dangerous: [] })

    expect(points).toHaveLength(0)
  })
})