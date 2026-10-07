/**
 * Geometry for the focus probe: strict rectangle validation and the bounded probe-point derivation.
 *
 * All rectangles are CSS pixels in the captured viewport. Validation is deliberately strict - a
 * candidate that extends past the viewport is rejected whole rather than clipped, because a clipped
 * rectangle would describe a region the model never actually pointed at. Point derivation never
 * relocates a blocked point to an easier position: a region that cannot hold the fixed sample yields
 * no usable point, and the caller reports unknown.
 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Viewport {
  readonly width: number
  readonly height: number
}

/** Distance from the frame edge that a derived probe point must keep. Plan 4.4. */
export const MIN_EDGE_INSET_PX = 4

/** Horizontal fractions of the region used for the left and right probe points. Plan 4.4. */
export const LEFT_FRACTION = 0.12
export const RIGHT_FRACTION = 0.88

export type ProbeSide = 'left' | 'right'
export type SkipReason = 'excluded' | 'dangerous' | 'too-narrow'

export interface ProbePoint {
  readonly side: ProbeSide
  readonly x: number
  readonly y: number
}

export interface SkippedPoint {
  readonly side: ProbeSide
  readonly reason: SkipReason
}

export interface ProbePointInput {
  readonly region: Rect
  readonly excluded: readonly Rect[]
  readonly dangerous: readonly Rect[]
}

function isFiniteRect(r: Rect): boolean {
  return (
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.width) &&
    Number.isFinite(r.height) &&
    r.width > 0 &&
    r.height > 0
  )
}

function inside(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/** A rectangle is usable only if it is finite, positive and wholly inside the viewport. */
export function regionIsUsable(region: Rect, viewport: Viewport): boolean {
  if (!isFiniteRect(region)) return false
  return (
    region.x >= 0 &&
    region.y >= 0 &&
    region.x + region.width <= viewport.width &&
    region.y + region.height <= viewport.height
  )
}

/**
 * Derive the fixed left/right sample points for a candidate region.
 *
 * A point is emitted only when it keeps the minimum inset on every side, is not inside an excluded
 * region, and does not land on a dangerous control. Everything else is reported as skipped with its
 * reason so the caller can record *why* the sample set is short instead of silently testing less.
 */
export function deriveProbePoints(input: ProbePointInput): {
  points: ProbePoint[]
  skipped: SkippedPoint[]
} {
  const { region, excluded, dangerous } = input
  const points: ProbePoint[] = []
  const skipped: SkippedPoint[] = []
  const sides: readonly [ProbeSide, number][] = [
    ['left', LEFT_FRACTION],
    ['right', RIGHT_FRACTION],
  ]

  for (const [side, fraction] of sides) {
    const x = region.x + fraction * region.width
    const y = region.y + region.height / 2
    const insetOk =
      x - region.x >= MIN_EDGE_INSET_PX &&
      region.x + region.width - x >= MIN_EDGE_INSET_PX &&
      y - region.y >= MIN_EDGE_INSET_PX &&
      region.y + region.height - y >= MIN_EDGE_INSET_PX

    if (!insetOk) {
      skipped.push({ side, reason: 'too-narrow' })
      continue
    }
    if (excluded.some((r) => inside(r, { x, y }))) {
      skipped.push({ side, reason: 'excluded' })
      continue
    }
    if (dangerous.some((r) => inside(r, { x, y }))) {
      skipped.push({ side, reason: 'dangerous' })
      continue
    }
    points.push({ side, x, y })
  }

  return { points, skipped }
}
