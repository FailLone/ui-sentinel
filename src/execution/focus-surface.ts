import type { Page, ElementHandle } from 'playwright'
import type { Rect } from './focus-geometry.ts'

/** Focus and paint-only focus styles are deliberately absent from this structural fingerprint. */
export async function readFocusSurface(page: Page, region?: Rect): Promise<string> {
  return page.evaluate(
    (region) =>
      JSON.stringify({
        url: location.href,
        scroll: [scrollX, scrollY],
        viewport: [innerWidth, innerHeight],
        elements: Array.from(document.querySelectorAll('*'))
          .filter((el) => {
            const b = el.getBoundingClientRect()
            return (
              !region ||
              (b.right > region.x &&
                b.left < region.x + region.width &&
                b.bottom > region.y &&
                b.top < region.y + region.height) ||
              el.matches('input,select,textarea')
            )
          })
          .map((el) => {
            const b = el.getBoundingClientRect(),
              style = getComputedStyle(el)
            return [
              el.tagName,
              el.id,
              el.childElementCount,
              b.x,
              b.y,
              b.width,
              b.height,
              style.display,
              style.visibility,
              style.transform,
              el.getAttribute('role'),
              el.getAttribute('aria-disabled'),
              el.hasAttribute('disabled'),
              el.hasAttribute('readonly'),
              'value' in el ? (el as HTMLInputElement).value : null,
            ]
          }),
      }),
    region,
  )
}

export async function bindFocusSurface(page: Page, selector: string, region: Rect) {
  const handle = await page.$(selector)
  if (!handle) throw Error('focus-target-missing')
  const root = await page.$('html')
  const initial = await readFocusSurface(page, region)
  const valid = await handle.evaluate((el) => {
    if (
      !(el instanceof HTMLInputElement) ||
      !['text', 'search'].includes(el.type) ||
      el.disabled ||
      el.readOnly
    )
      return false
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.transform !== 'none' || s.visibility === 'hidden' || s.display === 'none') return false
    }
    const b = el.getBoundingClientRect()
    return (
      b.width > 0 &&
      b.height > 0 &&
      b.x >= 0 &&
      b.y >= 0 &&
      b.right <= innerWidth &&
      b.bottom <= innerHeight &&
      document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el
    )
  })
  if (!valid) {
    await handle.dispose()
    await root?.dispose()
    throw Error('focus-target-unsupported-or-covered')
  }
  return {
    handle,
    async verify() {
      if (
        !root ||
        !(await root
          .evaluate((el) => el === document.documentElement && el.isConnected)
          .catch(() => false)) ||
        !(await handle
          .evaluate((el, sel) => el.isConnected && document.querySelector(sel) === el, selector)
          .catch(() => false)) ||
        initial !== (await readFocusSurface(page, region))
      )
        throw Error('focus-state-changed')
    },
    async dispose() {
      await handle.dispose()
      await root?.dispose()
    },
  }
}
export type FocusNode = ElementHandle<HTMLElement | SVGElement>
