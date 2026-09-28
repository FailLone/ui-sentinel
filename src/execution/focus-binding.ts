import type { Rect } from './focus-geometry.ts'

/**
 * Binding a perceived region to the one native input it refers to.
 *
 * The region is the model's visual guess; the binding is the server's factual claim about which node
 * that region is about. Every uncertain case resolves to a refusal with a reason, never to a
 * nearest-guess: an ambiguous, partly-overlapping, non-editable or mixed region cannot be probed, and
 * the caller records unknown. Plan 4.3.
 */
export interface BindableElement {
  readonly ref: string
  readonly tag: string
  readonly type?: string
  readonly id?: string
  readonly bounds: Rect
  readonly visible: boolean
  readonly enabled: boolean
  readonly readOnly?: boolean
}

export interface DangerousControl {
  readonly ref: string
  readonly tag: string
  readonly bounds: Rect
}

export interface BindInput {
  readonly region: Rect
  readonly excluded: readonly Rect[]
  readonly elements: readonly BindableElement[]
  readonly dangerous: readonly DangerousControl[]
}

export type BindFailure =
  | 'no-target'
  | 'ambiguous-targets'
  | 'target-not-visible'
  | 'target-not-editable'
  | 'unsupported-target-type'
  | 'dangerous-control-in-region'
  | 'mixed-region'

export type BindResult =
  | {
      readonly ok: true
      readonly elementRef: string
      readonly nodeIdentity: string
      readonly reason: string
    }
  | { readonly ok: false; readonly reason: BindFailure }

/** Only native, visible, editable text/search inputs are supported this round. Plan 2. */
const SUPPORTED_TYPES = new Set(['text', 'search'])

/** Fraction of the element's area that must fall inside the region for it to count as the target. */
const MIN_COVERAGE = 0.9

/** More than this many unrelated interactive controls makes the region a container, not an input area. */
const MAX_UNRELATED_CONTROLS = 2

function area(rect: Rect): number {
  return rect.width * rect.height
}

function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

function inside(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function covered(element: BindableElement, region: Rect): number {
  const overlap = intersection(element.bounds, region)
  if (!overlap) return 0
  const elementArea = area(element.bounds)
  return elementArea === 0 ? 0 : area(overlap) / elementArea
}

/**
 * Resolve the region to exactly one native input, or refuse with the reason.
 *
 * `nodeIdentity` is derived from the element data the server observed, never from the model's
 * description, so the identity a finding cites is the one the page actually has.
 */
export function bindInputToRegion(input: BindInput): BindResult {
  const { region, excluded, elements, dangerous } = input

  // A dangerous control anywhere in the region that was not explicitly excluded makes the region
  // unsafe to click in, regardless of which input might be bound.
  const liveDangerous = dangerous.filter(
    (control) =>
      intersection(control.bounds, region) !== null && !excluded.some((r) => inside(r, centre(control.bounds))),
  )
  if (liveDangerous.length > MAX_UNRELATED_CONTROLS) return { ok: false, reason: 'mixed-region' }
  if (liveDangerous.length > 0) return { ok: false, reason: 'dangerous-control-in-region' }

  const candidates = elements.filter((element) => covered(element, region) >= MIN_COVERAGE)
  if (candidates.length === 0) return { ok: false, reason: 'no-target' }
  if (candidates.length > 1) return { ok: false, reason: 'ambiguous-targets' }

  const target = candidates[0]
  if (!target.visible) return { ok: false, reason: 'target-not-visible' }
  if (!target.enabled || target.readOnly) return { ok: false, reason: 'target-not-editable' }
  const type = (target.type ?? 'text').toLowerCase()
  if (target.tag.toLowerCase() !== 'input' || !SUPPORTED_TYPES.has(type))
    return { ok: false, reason: 'unsupported-target-type' }

  const coverage = Math.round(covered(target, region) * 100)
  return {
    ok: true,
    elementRef: target.ref,
    nodeIdentity: `input#${target.id ?? 'anonymous'}@${target.ref}`,
    reason: `the only native ${type} input whose bounds lie ${coverage}% inside the perceived region`,
  }
}

function centre(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}