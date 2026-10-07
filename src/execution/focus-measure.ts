import type { Page } from 'playwright'
import type { FocusNode } from './focus-surface.ts'
import { readFocusSurface } from './focus-surface.ts'
import { FOCUS_WINDOW_MS } from './focus-receipt.ts'

export type HitRelation = 'self' | 'descendant' | 'ancestor' | 'unrelated' | 'none'
export interface ClickMeasurement {
  readonly x: number
  readonly y: number
  readonly focusedWithinMs: number | null
  readonly hit: {
    readonly ref: string | null
    readonly tag: string
    readonly relation: HitRelation
  }
  readonly valueChanged: boolean
  readonly focusBefore: string | null
  readonly focusAfter: string | null
  readonly targetFocusedBefore: boolean
  readonly stable: boolean
  /**
   * The wall-clock time actually spent observing focus after the click.
   *
   * The declared window is a promise; this is the measurement. A corruption that rewrites the declared
   * window cannot make the observation it never took, so an independent scorer trusts this and refuses
   * a sample whose observation was too short to justify the window it claims.
   */
  readonly observedWindowMs: number
}
export interface ResetMeasurement {
  readonly x: number
  readonly y: number
  readonly introducedChange: boolean
  readonly url: string
}

/** No focus/blur, forced clicks or synthetic events. Guard immediately before every pointer action. */
export function createFocusMeasurer(page: Page, guard: () => void = () => {}) {
  const isFocused = (selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel)
      return !!el && document.activeElement === el
    }, selector)

  async function clickAndMeasure(input: {
    selector: string
    x: number
    y: number
    windowMs?: number
    handle?: FocusNode
    nodeIdentity?: string
    verify?: () => Promise<void>
    beforeClick?: () => void
  }): Promise<ClickMeasurement> {
    guard()
    const handle = input.handle ?? (await page.$(input.selector))
    if (!handle) throw Error('focus-target-missing')
    try {
      const surface = await readFocusSurface(page)
      const identity =
        input.nodeIdentity ??
        (await handle.evaluate((el) => `${el.tagName.toLowerCase()}#${el.id}`))
      const read = () =>
        handle.evaluate(
          (el, args) => {
            const a = document.activeElement
            const active =
              !a || a === document.body || a === document.documentElement
                ? null
                : a === el
                  ? args.identity
                  : `other:${a.tagName.toLowerCase()}#${a.id}`
            return {
              active,
              focused: a === el,
              connected: el.isConnected && document.querySelector(args.selector) === el,
              value: (el as HTMLInputElement).value ?? null,
            }
          },
          { identity, selector: input.selector },
        )
      await input.verify?.()
      const before = await read()
      if (!before.connected) throw Error('focus-state-changed')
      const hit = await handle.evaluate(
        (target, p) => {
          const el = document.elementFromPoint(p.x, p.y)
          return {
            ref: el ? `${el.tagName.toLowerCase()}#${el.id}` : null,
            tag: el?.tagName.toLowerCase() ?? 'none',
            relation: !el
              ? 'none'
              : el === target
                ? 'self'
                : target.contains(el)
                  ? 'descendant'
                  : el.contains(target)
                    ? 'ancestor'
                    : 'unrelated',
          }
        },
        { x: input.x, y: input.y },
      )
      guard()
      const startedAt = Date.now()
      input.beforeClick?.()
      await page.mouse.click(input.x, input.y)
      let focusedWithinMs: number | null = null
      let stable = true
      let observedWindowMs = 0
      const windowMs = input.windowMs ?? FOCUS_WINDOW_MS
      // Observe the full bounded window: later value/layout changes still invalidate a fast focus.
      do {
        guard()
        const current = await read()
        stable &&= current.connected
        const elapsed = Date.now() - startedAt
        if (current.focused && current.connected && elapsed <= windowMs) focusedWithinMs ??= elapsed
        await input.verify?.()
        observedWindowMs = Math.max(observedWindowMs, elapsed)
        if (elapsed >= windowMs) break
        await page.waitForTimeout(Math.min(20, windowMs - elapsed))
      } while (true)
      const after = await read()
      stable &&= after.connected && surface === (await readFocusSurface(page))
      guard()
      return {
        x: input.x,
        y: input.y,
        focusedWithinMs: stable ? focusedWithinMs : null,
        hit: hit as ClickMeasurement['hit'],
        valueChanged: before.value !== after.value,
        focusBefore: before.active,
        focusAfter: after.active,
        targetFocusedBefore: before.focused,
        stable,
        observedWindowMs,
      }
    } finally {
      if (!input.handle) await handle.dispose()
    }
  }

  async function neutralReset(input: {
    selector: string
    x: number
    y: number
    beforeClick?: () => void
  }): Promise<ResetMeasurement> {
    guard()
    const surface = await readFocusSurface(page)
    guard()
    input.beforeClick?.()
    await page.mouse.click(input.x, input.y)
    await page.waitForTimeout(20)
    guard()
    return {
      x: input.x,
      y: input.y,
      url: page.url(),
      introducedChange: surface !== (await readFocusSurface(page)),
    }
  }
  return { isFocused, clickAndMeasure, neutralReset }
}
