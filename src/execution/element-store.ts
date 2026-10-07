import type { FullElement, SlimSnapshot } from './observation-slim.ts'
import { toSlimSnapshot } from './observation-slim.ts'

interface StoredElement {
  readonly fullElement: FullElement
  readonly snapshotId: string
  readonly registeredAt: number
}

export interface ElementDetailResult {
  readonly found: true
  readonly ref: string
  readonly fresh: boolean
  readonly snapshotId: string
  readonly element: FullElement
}

export interface ElementNotFound {
  readonly found: false
  readonly ref: string
  readonly reason: string
}

export function createElementStore() {
  const store = new Map<string, StoredElement>()
  let latestSnapshotId: string | null = null
  let nextRefNum = 1

  function registerSnapshot(
    snapshotId: string,
    fullSnapshot: {
      readonly url: string
      readonly title: string
      readonly viewport: { readonly width: number; readonly height: number }
      readonly elements: readonly FullElement[]
      readonly text: string
      readonly observedAt: string
    },
    screenshotRef: string,
  ): SlimSnapshot {
    latestSnapshotId = snapshotId

    const refMap = new Map<string, string>()
    for (const el of fullSnapshot.elements) {
      const ref = `e${nextRefNum++}`
      refMap.set(ref, el.selector)
      store.set(ref, {
        fullElement: el,
        snapshotId,
        registeredAt: Date.now(),
      })
    }

    return toSlimSnapshot(fullSnapshot, snapshotId, screenshotRef, refMap)
  }

  function getDetail(ref: string): ElementDetailResult | ElementNotFound {
    const entry = store.get(ref)
    if (!entry) {
      return { found: false, ref, reason: 'unknown ref' }
    }
    return {
      found: true,
      ref,
      fresh: entry.snapshotId === latestSnapshotId,
      snapshotId: entry.snapshotId,
      element: entry.fullElement,
    }
  }

  function getLatestSnapshotId(): string | null {
    return latestSnapshotId
  }

  function getRefCount(): number {
    return store.size
  }

  return { registerSnapshot, getDetail, getLatestSnapshotId, getRefCount }
}

export type ElementStore = ReturnType<typeof createElementStore>
