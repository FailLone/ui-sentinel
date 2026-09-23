import type { Page } from 'playwright'
import { createHash } from 'node:crypto'
import { profileOperation } from './profiling.ts'

export interface ObservationVersion {
  key: string
  reusable: boolean
  reason: string
}

/** Local validation data never enters the model context. Dynamic surfaces conservatively opt out. */
export async function readObservationVersion(page: Page): Promise<ObservationVersion> {
  const state = await profileOperation('validation', () =>
    page.evaluate(() => {
      const host = window as typeof window & {
        __sentinelObservation?: {
          document: Document
          id: string
          ids: WeakMap<Element, number>
          nextId: number
        }
      }
      if (!host.__sentinelObservation || host.__sentinelObservation.document !== document)
        host.__sentinelObservation = {
          document,
          id: Math.random().toString(36),
          ids: new WeakMap(),
          nextId: 1,
        }
      const store = host.__sentinelObservation
      const nodes = Array.from(document.querySelectorAll('*'))
      const dynamic =
        nodes.length > 600 ||
        document.readyState !== 'complete' ||
        document.fonts.status !== 'loaded' ||
        !!document.querySelector(
          'canvas,video,audio,iframe,object,embed,img,svg,input,textarea,select,[contenteditable],li,summary',
        ) ||
        document.getAnimations().some((a) => a.playState === 'running' || a.pending)
      if (dynamic) return { reusable: false, reason: 'dynamic-or-large-document', value: '' }
      let unsupported = false
      const values = nodes.map((el) => {
        if (!store.ids.has(el)) store.ids.set(el, store.nextId++)
        const style = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        const pseudo = ['::before', '::after'].map((p) => getComputedStyle(el, p).content)
        if (
          el.shadowRoot ||
          el.tagName.includes('-') ||
          style.backgroundImage !== 'none' ||
          pseudo.some((p) => !['none', 'normal', '""'].includes(p))
        )
          unsupported = true
        const interactive = el.matches('button,a,input,select,textarea,[role="button"]')
        const hit = interactive
          ? [
              [0.5, 0.5],
              [0.2, 0.2],
              [0.8, 0.2],
              [0.2, 0.8],
              [0.8, 0.8],
            ].map(([x, y]) => {
              const node = document.elementFromPoint(
                rect.x + rect.width * x!,
                rect.y + rect.height * y!,
              )
              if (node && !store.ids.has(node)) store.ids.set(node, store.nextId++)
              return node ? store.ids.get(node) : null
            })
          : []
        return [
          store.ids.get(el),
          el.tagName,
          Array.from(el.attributes, (a) => [a.name, a.value]),
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          Array.from(style, (p) => style.getPropertyValue(p)),
          'value' in el ? el.value : null,
          'checked' in el ? el.checked : null,
          el.scrollTop,
          el.scrollLeft,
          hit,
        ]
      })
      return {
        reusable: !unsupported,
        reason: unsupported
          ? 'untracked-visual-surface'
          : 'same-document-layout-style-and-hit-facts',
        value: JSON.stringify([
          store.id,
          location.href,
          document.title,
          innerWidth,
          innerHeight,
          scrollX,
          scrollY,
          document.body.innerText,
          document.activeElement ? store.ids.get(document.activeElement) : null,
          values,
        ]),
      }
    }),
  )
  return {
    key: createHash('sha256').update(state.value).digest('hex'),
    reusable: state.reusable,
    reason: state.reason,
  }
}

export function sameObservationVersion(
  a: ObservationVersion | undefined,
  b: ObservationVersion,
): boolean {
  return !!a?.reusable && b.reusable && a.key === b.key
}
