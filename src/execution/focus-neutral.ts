import { MIN_EDGE_INSET_PX, type Rect, type Viewport } from './focus-geometry.ts'

/**
 * Choosing a neutral area to click, so the next sample starts from a verified unfocused baseline.
 *
 * Plan 4.4 forbids clearing focus with `.blur()`, `dispatchEvent` or a style change, so the reset is a
 * real click - which means the area has to be genuinely inert. The dangerous case is a wrapper that
 * delegates clicks to its input: clicking it would FOCUS the target rather than clear it, inverting the
 * whole point of the reset. Any element that contains or overlaps the region is therefore refused, and
 * so is anything whose tag can react to a click. A page with no such area yields no reset, and the
 * caller reports unknown rather than measuring from a dirty baseline.
 */

export interface NeutralElement {
  readonly ref: string
  readonly tag: string
  readonly bounds: Rect
  readonly enabled: boolean
  /** True when the hit sample showed something else covering this element. */
  readonly blocked: boolean
  /** Absent is treated as visible; a known-invisible element is never usable for a reset. */
  readonly visible?: boolean
}

/** Tags that can themselves take focus or act on a click. */
const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'option',
  'details',
])

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Distance between region and element centres, used to prefer the least related area. */
function centreDistance(a: Rect, b: Rect): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2)
  const dy = a.y + a.height / 2 - (b.y + b.height / 2)
  return Math.sqrt(dx * dx + dy * dy)
}

export function deriveNeutralPoint(input: {
  readonly viewport: Viewport
  readonly region: Rect
  readonly elements: readonly NeutralElement[]
}): { x: number; y: number; ref: string } | null {
  const { viewport, region } = input

  const eligible = input.elements.filter((element) => {
    if (!element.enabled || element.blocked) return false
    if (element.visible === false) return false
    if (INTERACTIVE_TAGS.has(element.tag)) return false
    // Containment and overlap are both refused: either could hand focus to the target.
    if (overlaps(element.bounds, region)) return false
    const inset = MIN_EDGE_INSET_PX
    if (element.bounds.width < inset * 2 || element.bounds.height < inset * 2) return false
    // Must sit wholly inside the viewport, so the derived point is genuinely on the page.
    if (
      element.bounds.x < 0 ||
      element.bounds.y < 0 ||
      element.bounds.x + element.bounds.width > viewport.width ||
      element.bounds.y + element.bounds.height > viewport.height
    )
      return false
    // The element's own tag says nothing about what the click lands on. A nav wrapper is inert while
    // the link at its centre is not, and clicking that link is how a "reset" changes the page.
    const centre = {
      x: element.bounds.x + element.bounds.width / 2,
      y: element.bounds.y + element.bounds.height / 2,
    }
    const onTop = input.elements.find(
      (other) =>
        other !== element &&
        INTERACTIVE_TAGS.has(other.tag) &&
        other.visible !== false &&
        centre.x >= other.bounds.x &&
        centre.x <= other.bounds.x + other.bounds.width &&
        centre.y >= other.bounds.y &&
        centre.y <= other.bounds.y + other.bounds.height,
    )
    return onTop === undefined
  })
  if (eligible.length === 0) return null

  const chosen = eligible.reduce((best, candidate) => {
    const d = centreDistance(candidate.bounds, region)
    const bestD = centreDistance(best.bounds, region)
    // Ties break on ref so the choice is deterministic across runs.
    if (d !== bestD) return d > bestD ? candidate : best
    return candidate.ref < best.ref ? candidate : best
  })

  return {
    x: Math.round(chosen.bounds.x + chosen.bounds.width / 2),
    y: Math.round(chosen.bounds.y + chosen.bounds.height / 2),
    ref: chosen.ref,
  }
}
