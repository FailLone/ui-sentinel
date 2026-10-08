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
    async (selectors) => {
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
      return Promise.all(
        selectors.map(async (selector) => {
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
          if (!store.ids.has(el)) store.ids.set(el, store.next++)
          const style = getComputedStyle(el),
            rect = el.getBoundingClientRect()
          const unsupported: string[] = []
          let excluded: string | undefined
          let matrix = new DOMMatrix()
          for (let node: Element | null = el; node; node = node.parentElement) {
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
          // Hit testing misses pointer-transparent paint. Any intersecting non-ancestor surface
          // is an unresolved visual layer, even if it might actually paint behind the image.
          const nodes = Array.from(document.querySelectorAll('*'))
          if (nodes.length > 600) unsupported.push('large-document-visibility-unmeasured')
          else if (
            nodes.some((other) => {
              if (other === el || other.contains(el)) return false
              const otherStyle = getComputedStyle(other),
                box = other.getBoundingClientRect()
              return (
                otherStyle.display !== 'none' &&
                otherStyle.visibility === 'visible' &&
                Number(otherStyle.opacity) > 0 &&
                box.width > 0 &&
                box.height > 0 &&
                box.left < rect.right &&
                box.right > rect.left &&
                box.top < rect.bottom &&
                box.bottom > rect.top
              )
            })
          )
            unsupported.push('overlapping-paint-surface')
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
          return {
            selector,
            matchCount: 1,
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
        }),
      )
    },
    [...selectors],
  )
}
