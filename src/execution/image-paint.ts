import { createHash } from 'node:crypto'
import type { Page } from 'playwright'
import type { ImagePaintFact } from '../rules/image-shape.ts'

type Resource = { bytes: Buffer; sha256: string; format: 'png' | 'jpeg' }
const MAX_BYTES = 4 * 1024 * 1024
const resources = new WeakMap<Page, Map<string, Promise<Resource | undefined>>>()

function raster(bytes: Buffer): Resource | undefined {
  if (bytes.length > MAX_BYTES) return
  let format: Resource['format']
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    // APNG frames are not a single static source. Parse chunks, not a substring in compressed data.
    let ended = false
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = bytes.readUInt32BE(offset)
      const type = bytes.toString('ascii', offset + 4, offset + 8)
      if (offset + 12 + length > bytes.length || type === 'acTL') return
      offset += length + 12
      if (type === 'IEND') {
        ended = true
        break
      }
    }
    if (!ended) return
    format = 'png'
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    format = 'jpeg'
  } else return
  return { bytes, format, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/** Observe existing browser responses only. No second fetch, canvas readback or page mutation. */
export function installImageResourceCollector(page: Page): void {
  if (resources.has(page)) return
  const entries = new Map<string, Promise<Resource | undefined>>()
  resources.set(page, entries)
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'image') return
    const url = response.url()
    const previous = entries.get(url)
    if (!previous && entries.size >= 32) return
    entries.set(
      url,
      (async () => {
        try {
          if (Number(response.headers()['content-length']) > MAX_BYTES) return
          const value = raster(await response.body())
          // Same URL with changed bytes cannot be safely attributed to an already painted img.
          if (previous && (await previous)?.sha256 !== value?.sha256) return
          return value
        } catch {
          return
        }
      })(),
    )
  })
}

export async function imageResource(page: Page, url: string): Promise<Resource | undefined> {
  if (url.startsWith('data:')) {
    const match = /^data:image\/(?:png|jpeg);base64,([a-z\d+/=\s]+)$/i.exec(url)
    if (!match || match[1]!.length > MAX_BYTES * 1.4) return
    return raster(Buffer.from(match[1]!, 'base64'))
  }
  // Do not wait for a stalled download. The next observation can obtain completed evidence.
  return Promise.race([
    resources.get(page)?.get(url) ?? Promise.resolve(undefined),
    new Promise<undefined>((resolve) => {
      const timer = setTimeout(resolve, 100)
      ;(timer as unknown as { unref(): void }).unref()
    }),
  ])
}

/** Generic paint facts, deliberately separate from the existing R0 element/candidate sampling. */
export async function readImagePaintFacts(
  page: Page,
  selectors: readonly string[],
): Promise<ImagePaintFact[]> {
  return page.evaluate(
    async ({ selectors, targetBudgetExceeded }) => {
      const host = window as typeof window & {
        __sentinelImages?: {
          ids: WeakMap<Element, number>
          next: number
          documentId: string
          mutationEpoch: number
        }
      }
      const firstObservation = !host.__sentinelImages
      const store = (host.__sentinelImages ??= {
        ids: new WeakMap(),
        next: 1,
        documentId: Math.random().toString(36),
        mutationEpoch: 0,
      })
      if (firstObservation)
        new MutationObserver(() => {
          store.mutationEpoch++
        }).observe(document, {
          subtree: true,
          attributes: true,
          childList: true,
          characterData: true,
        })
      // Resolve/decode together before the shared geometry pass, so targets use one scan epoch.
      const targets = await Promise.all(
        selectors.map(async (selector) => {
          if (selector.length > 1000)
            return {
              selector: selector.slice(0, 1000),
              matchCount: 0,
              unsupported: ['visibility-selector-budget-exceeded'],
            }
          let matches: NodeListOf<Element>
          try {
            matches = document.querySelectorAll(selector)
          } catch {
            return { selector, matchCount: 0, unsupported: ['invalid-selector'] }
          }
          if (matches.length !== 1) return { selector, matchCount: matches.length }
          const el = matches[0]!
          if (!(el instanceof HTMLImageElement))
            return { selector, matchCount: 1, unsupported: ['not-native-img'] }
          const decoded =
            el.complete &&
            el.naturalWidth > 0 &&
            (await Promise.race([
              el.decode().then(
                () => true,
                () => false,
              ),
              new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 150)),
            ]))
          return { selector, matchCount: 1, el, decoded }
        }),
      )
      const rectangles = targets.flatMap((t) => (t.el ? [t.el.getBoundingClientRect()] : []))
      // Ancestor paint is governed by the existing per-target clipping/transform/effect checks.
      // Overflow contributed by a measured child is not itself an unknown foreground layer.
      const targetAncestors = new Set<Element>()
      for (const target of targets) {
        let ancestor: Element | null = target.el ?? null
        for (let depth = 0; ancestor && depth < 128; depth++, ancestor = ancestor.parentElement)
          targetAncestors.add(ancestor)
      }
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.width > 0 &&
        a.height > 0 &&
        b.width > 0 &&
        b.height > 0 &&
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
      // A complete bounded walk, not a prefix sample. Geometry is read once per element and
      // retained only if it intersects a target. Pointer transparency never excludes a layer.
      const limits = { nodes: 4096, candidates: 256, milliseconds: 250, batch: 256 }
      const visibilityScan = {
        version: 'bounded-layers-1' as const,
        complete: false,
        visited: 0,
        rectangleReads: 0,
        candidates: 0,
        intersectionChecks: 0,
      }
      const layers: { el: Element; box: DOMRect }[] = []
      const visibilityIssues = new Set<string>()
      const started = performance.now(),
        epoch = store.mutationEpoch
      const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT)
      let node = walker.nextNode() as Element | null
      if (targetBudgetExceeded) visibilityIssues.add('visibility-target-budget-exceeded')
      while (node && !targetBudgetExceeded) {
        if (visibilityScan.visited >= limits.nodes) {
          visibilityIssues.add('visibility-node-budget-exceeded')
          break
        }
        if (performance.now() - started >= limits.milliseconds) {
          visibilityIssues.add('visibility-time-budget-exceeded')
          break
        }
        visibilityScan.visited++
        const s = getComputedStyle(node),
          box = node.getBoundingClientRect()
        visibilityScan.rectangleReads++
        if (s.display !== 'none') {
          // These surfaces may paint beyond the element's border box, or in an unwalked tree.
          // A rectangle-only proof cannot discard them just because their host is offscreen.
          if (
            node.shadowRoot ||
            node.localName.includes('-') ||
            node.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
            ['IFRAME', 'OBJECT', 'EMBED'].includes(node.tagName) ||
            ['::before', '::after'].some(
              (p) => !['none', 'normal'].includes(getComputedStyle(node!, p).content),
            ) ||
            s.boxShadow !== 'none' ||
            s.textShadow !== 'none' ||
            s.filter !== 'none' ||
            s.backdropFilter !== 'none' ||
            (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
            (s.display === 'list-item' && s.listStyleType !== 'none') ||
            (!targetAncestors.has(node) &&
              ((s.overflowX === 'visible' &&
                node.clientWidth > 0 &&
                node.scrollWidth > node.clientWidth) ||
                (s.overflowY === 'visible' &&
                  node.clientHeight > 0 &&
                  node.scrollHeight > node.clientHeight)))
          )
            visibilityIssues.add('visibility-unbounded-paint')
          if (node.getAnimations().some((a) => a.playState === 'running' || a.pending))
            visibilityIssues.add('visibility-animated-paint')
          if (
            s.visibility === 'visible' &&
            Number(s.opacity) > 0 &&
            rectangles.some((rect) => {
              visibilityScan.intersectionChecks++
              return overlaps(box, rect)
            })
          ) {
            if (layers.length >= limits.candidates) {
              visibilityIssues.add('visibility-candidate-budget-exceeded')
              break
            }
            layers.push({ el: node, box })
            visibilityScan.candidates++
          }
        }
        node = walker.nextNode() as Element | null
        if (visibilityScan.visited % limits.batch === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      // Flush mutation callbacks even for short scans. Any change poisons this entire scan;
      // no restarting, resetting epochs or ignoring changes outside the target is allowed.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (store.mutationEpoch !== epoch) visibilityIssues.add('visibility-dom-changed')
      if (performance.now() - started >= limits.milliseconds)
        visibilityIssues.add('visibility-time-budget-exceeded')
      visibilityScan.complete = node === null && visibilityIssues.size === 0
      return targets.map((target) => {
        const { selector, matchCount, el, decoded } = target
        if (!el) return { selector, matchCount, unsupported: target.unsupported }
        if (!store.ids.has(el)) store.ids.set(el, store.next++)
        const style = getComputedStyle(el),
          rect = el.getBoundingClientRect()
        const unsupported: string[] = [...visibilityIssues]
        let excluded: string | undefined
        let matrix = new DOMMatrix()
        let ancestorCount = 0
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (ancestorCount++ >= 128) {
            unsupported.push('image-ancestor-budget-exceeded')
            break
          }
          const s = getComputedStyle(node)
          if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0)
            excluded = 'not-visible'
          if (Number(s.opacity) !== 1) unsupported.push('opacity')
          if (s.perspective !== 'none' || s.transformStyle === 'preserve-3d')
            unsupported.push('3d-transform')
          if (s.scale !== 'none' || s.rotate !== 'none' || s.translate !== 'none')
            unsupported.push('individual-transform')
          if (s.offsetPath !== 'none' || Number(s.zoom) !== 1)
            unsupported.push('motion-path-or-zoom')
          if (
            s.filter !== 'none' ||
            s.clipPath !== 'none' ||
            s.maskImage !== 'none' ||
            s.mixBlendMode !== 'normal'
          )
            unsupported.push('paint-effect')
          if (s.contentVisibility !== 'visible') unsupported.push('content-visibility')
          if (
            ['::before', '::after'].some(
              (pseudo) =>
                !['none', 'normal', '""'].includes(getComputedStyle(node!, pseudo).content),
            )
          )
            unsupported.push('generated-content')
          if (node !== el && (s.overflowX !== 'visible' || s.overflowY !== 'visible'))
            unsupported.push('ancestor-clipping')
          if (node.getAnimations().some((a) => a.playState === 'running' || a.pending))
            unsupported.push('animation')
          const local = new DOMMatrix(s.transform === 'none' ? undefined : s.transform)
          if (!local.is2D) unsupported.push('3d-transform')
          matrix = local.multiply(matrix)
        }
        if (style.content !== 'normal') unsupported.push('css-replaced-content')
        if (style.imageOrientation !== 'from-image') unsupported.push('image-orientation')
        if (!['horizontal-tb'].includes(style.writingMode)) unsupported.push('writing-mode')
        if (
          rect.right <= 0 ||
          rect.bottom <= 0 ||
          rect.left >= innerWidth ||
          rect.top >= innerHeight
        )
          excluded = 'outside-viewport'
        else if (
          rect.left < 0 ||
          rect.top < 0 ||
          rect.right > innerWidth ||
          rect.bottom > innerHeight
        )
          unsupported.push('partial-viewport')
        if (
          layers.some(
            (layer) => layer.el !== el && !layer.el.contains(el) && overlaps(layer.box, rect),
          )
        )
          unsupported.push('overlapping-paint-surface')
        const originalRect = rectangles[targets.filter((t) => t.el).findIndex((t) => t.el === el)]!
        if (
          !el.isConnected ||
          ['x', 'y', 'width', 'height'].some((k) => rect[k as 'x'] !== originalRect[k as 'x'])
        )
          unsupported.push('visibility-target-changed')
        if (document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) !== el)
          unsupported.push('visible-content-not-confirmed')
        if (Math.min(rect.width, rect.height) < 2) unsupported.push('subpixel-or-empty-display')
        const number = (value: string) => Number.parseFloat(value)
        let width = number(style.width),
          height = number(style.height)
        if (style.boxSizing === 'border-box') {
          width -=
            number(style.paddingLeft) +
            number(style.paddingRight) +
            number(style.borderLeftWidth) +
            number(style.borderRightWidth)
          height -=
            number(style.paddingTop) +
            number(style.paddingBottom) +
            number(style.borderTopWidth) +
            number(style.borderBottomWidth)
        }
        // Object-position changes cropping, not scale. Extreme offsets may hide all meaningful pixels;
        // this candidate only accepts the default centred paint position.
        if (style.objectPosition !== '50% 50%') unsupported.push('object-position')
        const fact = {
          selector,
          matchCount: 1,
          visibilityScan,
          documentId: store.documentId,
          mutationEpoch: store.mutationEpoch,
          decoded,
          nodeId: store.ids.get(el),
          currentSrc: el.currentSrc,
          complete: el.complete,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          contentWidth: width,
          contentHeight: height,
          objectFit: style.objectFit,
          objectPosition: style.objectPosition,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          matrix: [matrix.a, matrix.b, matrix.c, matrix.d] as [number, number, number, number],
          excluded,
          unsupported: [...new Set(unsupported)],
        }
        // Bound returned facts, including pathological CSS strings or inline resource URLs.
        // An omitted identity is intentionally unusable; no truncated URL is treated as the source.
        if (JSON.stringify(fact).length > 70000)
          return { selector, matchCount: 1, unsupported: ['image-fact-output-budget-exceeded'] }
        return fact
      })
    },
    { selectors: [...selectors.slice(0, 32)], targetBudgetExceeded: selectors.length > 32 },
  )
}
