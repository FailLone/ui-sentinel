import type { ElementHandle, Page } from 'playwright'
import { hash } from '../../agent/popup/contract.ts'
export type Rect = { x: number; y: number; width: number; height: number }
export type PopupFacts = {
  id: string
  description: string
  kind: 'native' | 'dialog-role' | 'custom'
  rect: Rect
  viewport: Rect
  clips: Rect[]
  unsupported: string[]
  visible: boolean
  url: string
  topLayer: boolean
}
export type PopupMeasurement = {
  revision: 'popup-geometry-1'
  targetId: string
  verdict: 'pass' | 'fail' | 'unknown'
  reason: string
  samples: PopupFacts[]
  tolerancePx: 1
}
export function judgePopup(samples: PopupFacts[]): PopupMeasurement {
  const base = {
    revision: 'popup-geometry-1' as const,
    targetId: samples[0]?.id ?? '',
    samples,
    tolerancePx: 1 as const,
  }
  const unknown = (reason: string): PopupMeasurement => ({ ...base, verdict: 'unknown', reason })
  if (samples.length !== 2) return unknown('two-stable-samples-required')
  const [a, b] = samples
  if (!a!.visible || !b!.visible || a!.id !== b!.id || a!.url !== b!.url)
    return unknown('target-stale-or-hidden')
  if (samples.some((s) => s.unsupported.length))
    return unknown('unsupported:' + samples.flatMap((s) => s.unsupported).join(','))
  const finite = (r: Rect) => Object.values(r).every(Number.isFinite) && r.width > 0 && r.height > 0
  if (samples.some((s) => ![s.rect, s.viewport, ...s.clips].every(finite)))
    return unknown('invalid-geometry')
  if (hash(a) !== hash(b)) return unknown('unstable-layout')
  const inside = (r: Rect, clip: Rect) =>
    r.x >= clip.x - 1 &&
    r.y >= clip.y - 1 &&
    r.x + r.width <= clip.x + clip.width + 1 &&
    r.y + r.height <= clip.y + clip.height + 1
  const fits = [b!.viewport, ...b!.clips].every((c) => inside(b!.rect, c))
  return {
    ...base,
    verdict: fits ? 'pass' : 'fail',
    reason: fits ? 'panel-fits-visible-viewport' : 'fixed-panel-border-clipped',
  }
}

/** Node identity stays in the executor's handles, never a selector or model prediction. */
export function popupCollector(page: Page) {
  const handles = new Map<string, ElementHandle<Element>>()
  let sequence = 0
  let documentHandle: ElementHandle<Element> | null = null
  async function identify(handle: ElementHandle<Element>) {
    for (const [id, existing] of handles)
      if (
        await existing
          .evaluate((node, other) => node.isConnected && node === other, handle)
          .catch(() => false)
      ) {
        await handle.dispose()
        return id
      }
    const id = `panel-${++sequence}`
    handles.set(id, handle)
    return id
  }
  async function fact(id: string): Promise<PopupFacts | undefined> {
    const handle = handles.get(id)
    if (!handle) return undefined
    return handle
      .evaluate((node, id) => {
        const rect = (r: DOMRect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height })
        const s = getComputedStyle(node),
          r = node.getBoundingClientRect()
        const native = node instanceof HTMLDialogElement || node.hasAttribute('popover')
        const topLayer = node.matches(':modal, :popover-open')
        const unsupported: string[] = [],
          clips: Rect[] = []
        // Border box only: ordinary scrollable content within the panel is not overflow evidence.
        if (s.position !== 'fixed') unsupported.push('non-fixed-panel-may-be-scroll-reachable')
        if (
          window.visualViewport &&
          (visualViewport!.scale !== 1 ||
            visualViewport!.offsetLeft !== 0 ||
            visualViewport!.offsetTop !== 0)
        )
          unsupported.push('visual-viewport-transform')
        if (node.querySelector('canvas,iframe,svg,video') || node.shadowRoot)
          unsupported.push('complex-rendering')
        for (let p: Element | null = node; p; p = p.parentElement) {
          const cs = getComputedStyle(p)
          if (
            cs.transform !== 'none' ||
            cs.perspective !== 'none' ||
            ((cs as any).zoom && !['1', 'normal'].includes((cs as any).zoom))
          )
            unsupported.push('transformed')
          if (cs.clipPath !== 'none' || cs.maskImage !== 'none' || cs.clip !== 'auto')
            unsupported.push('non-rectangular-clip')
          if (
            p
              .getAnimations({ subtree: p === node })
              .some((a) => a.playState === 'running' || a.pending)
          )
            unsupported.push('animation')
          if (cs.filter !== 'none' || cs.backdropFilter !== 'none')
            unsupported.push('filtered-containing-block')
          // Fixed-position boxes escape ordinary ancestor overflow. Paint containment actually clips.
          if (p !== node && !topLayer && /paint|strict|content/.test(cs.contain)) {
            if (cs.borderRadius !== '0px') unsupported.push('rounded-ancestor-clip')
            const pr = p.getBoundingClientRect(),
              el = p as HTMLElement
            const x = true,
              y = true
            clips.push({
              x: x ? pr.x + el.clientLeft : 0,
              y: y ? pr.y + el.clientTop : 0,
              width: x ? el.clientWidth : innerWidth,
              height: y ? el.clientHeight : innerHeight,
            })
          }
        }
        return {
          id,
          description: `${node.tagName.toLowerCase()} ${node.getAttribute('aria-label') ?? ''} ${(node.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200)}`,
          kind: native
            ? 'native'
            : node.getAttribute('role') === 'dialog'
              ? 'dialog-role'
              : 'custom',
          rect: rect(r),
          viewport: {
            x: 0,
            y: 0,
            width: document.documentElement.clientWidth,
            height: innerHeight,
          },
          clips,
          unsupported: [...new Set(unsupported)],
          visible:
            node.isConnected &&
            r.width > 0 &&
            r.height > 0 &&
            s.display !== 'none' &&
            s.visibility === 'visible' &&
            Number(s.opacity) > 0,
          url: location.href,
          topLayer,
        }
      }, id)
      .catch(() => undefined) as Promise<PopupFacts | undefined>
  }
  async function capture() {
    documentHandle ??= await page.locator('html').elementHandle()
    const sameDocument = await documentHandle
      ?.evaluate((n) => n.isConnected && n === document.documentElement)
      .catch(() => false)
    const nodes = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('dialog, [role="dialog"], [popover], body *'))
        .filter((node) => {
          const s = getComputedStyle(node),
            r = node.getBoundingClientRect()
          if (
            !r.width ||
            !r.height ||
            s.display === 'none' ||
            s.visibility !== 'visible' ||
            Number(s.opacity) === 0
          )
            return false
          if (node.matches('dialog[open], [role="dialog"], [popover]:popover-open')) return true
          return (
            ['fixed', 'absolute'].includes(s.position) &&
            r.width > 80 &&
            r.height > 40 &&
            !node.matches('button,a,input,select,textarea,img,svg')
          )
        })
        .slice(0, 9),
    )
    const props = await nodes.getProperties(),
      ids: string[] = []
    try {
      for (const [key, value] of props) {
        const el = value.asElement()
        if (/^\d+$/.test(key) && el) ids.push(await identify(el as ElementHandle<Element>))
        else await value.dispose()
      }
    } finally {
      await nodes.dispose()
    }
    const facts = (await Promise.all(ids.map(fact))).filter((x): x is PopupFacts => !!x)
    return { facts, binding: hash(facts), complete: !!sameDocument && facts.length <= 8 }
  }
  async function measure(id: string, signal: AbortSignal, expected?: PopupFacts) {
    signal.throwIfAborted()
    const first = await fact(id)
    if (expected && first && hash(expected) !== hash(first)) return judgePopup([expected, first])
    await page.waitForTimeout(120)
    signal.throwIfAborted()
    const second = await fact(id)
    return judgePopup([first, second].filter((s): s is PopupFacts => !!s))
  }
  return {
    capture,
    fact,
    measure,
    async dispose() {
      for (const handle of handles.values()) await handle.dispose().catch(() => {})
      handles.clear()
      await documentHandle?.dispose().catch(() => {})
    },
  }
}
