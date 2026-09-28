import type { Page } from 'playwright'
import { FOCUS_WINDOW_MS } from './focus-receipt.ts'

/**
 * The real-browser measurement primitives for the focus probe.
 *
 * Everything here is a genuine Playwright mouse click at a CSS coordinate, with `document.activeElement`
 * read from the page before and after. There is deliberately no `element.focus()`, no `.blur()`, no
 * `dispatchEvent` and no style mutation anywhere: plan 4.4 forbids constructing a passing result, and
 * a scripted focus would do exactly that. Clearing focus is likewise a real click on a neutral area.
 *
 * The hit element is recorded even when it is not the target, because a label or container delegate
 * that hands focus to the input is healthy behaviour and must pass.
 */

export interface ClickMeasurement {
  readonly focusedWithinMs: number | null
  readonly hit: {
    readonly ref: string | null
    readonly tag: string
    readonly relation: HitRelation
  }
  readonly valueChanged: boolean
}

export type HitRelation = 'self' | 'descendant' | 'ancestor' | 'unrelated' | 'none'

export interface ResetMeasurement {
  readonly x: number
  readonly y: number
  readonly introducedChange: boolean
  readonly url: string
}

export function createFocusMeasurer(page: Page) {
  /** Read focus from the page itself. Never cache it: a stale answer is the whole failure mode. */
  async function isFocused(selector: string): Promise<boolean> {
    return page.evaluate((sel) => {
      const el = document.querySelector(sel)
      return !!el && document.activeElement === el
    }, selector)
  }

  /**
   * Click at a CSS coordinate and report how long the target took to become the active element.
   *
   * The click is a real `page.mouse.click`. The target is watched across the window so a click that
   * focuses the input through a container delegate passes just as one that hits the input directly.
   */
  async function clickAndMeasure(input: {
    selector: string
    x: number
    y: number
    windowMs?: number
  }): Promise<ClickMeasurement> {
    const windowMs = input.windowMs ?? FOCUS_WINDOW_MS
    const before = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null
      return { value: el?.value ?? null, focused: document.activeElement === el }
    }, input.selector)

    // Record what the pointer actually landed on, before the click changes anything.
    const hit = await page.evaluate(
      ({ x, y, sel }) => {
        const el = document.elementFromPoint(x, y)
        const target = document.querySelector(sel)
        if (!el) return { tag: 'none', relation: 'none' as HitRelation }
        const relation: HitRelation =
          el === target
            ? 'self'
            : target?.contains(el)
              ? 'descendant'
              : el.contains(target as Node)
                ? 'ancestor'
                : 'unrelated'
        return { tag: el.tagName.toLowerCase(), relation }
      },
      { x: input.x, y: input.y, sel: input.selector },
    )

    const startedAt = Date.now()
    await page.mouse.click(input.x, input.y)

    let focusedWithinMs: number | null = null
    // Poll rather than wait a fixed 500ms, so a fast focus is reported as fast.
    while (Date.now() - startedAt <= windowMs) {
      const focused = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        return !!el && document.activeElement === el
      }, input.selector)
      if (focused) {
        focusedWithinMs = Date.now() - startedAt
        break
      }
      await page.waitForTimeout(10)
    }

    const after = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null
      return { value: el?.value ?? null }
    }, input.selector)

    return {
      focusedWithinMs,
      hit: { ref: null, tag: hit.tag, relation: hit.relation },
      valueChanged: before.value !== after.value,
    }
  }

  /**
   * Clear focus by clicking a known-neutral area, and report whether that click changed anything.
   *
   * A reset must not navigate, write, change a form value or change the URL; if it does, the caller
   * treats the probe as inconclusive rather than measuring from a dirty baseline.
   */
  async function neutralReset(input: {
    selector: string
    x: number
    y: number
  }): Promise<ResetMeasurement> {
    const before = await page.evaluate(
      ({ sel }) => ({
        url: location.href,
        value: (document.querySelector(sel) as HTMLInputElement | null)?.value ?? null,
      }),
      input,
    )
    await page.mouse.click(input.x, input.y)
    await page.waitForTimeout(20)
    const after = await page.evaluate(
      ({ sel }) => ({
        url: location.href,
        value: (document.querySelector(sel) as HTMLInputElement | null)?.value ?? null,
      }),
      input,
    )
    return {
      x: input.x,
      y: input.y,
      url: after.url,
      introducedChange: before.url !== after.url || before.value !== after.value,
    }
  }

  return { isFocused, clickAndMeasure, neutralReset }
}
