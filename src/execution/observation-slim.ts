export interface HitSummary {
  readonly sampled: number
  readonly self: number
  readonly descendant: number
  readonly blocked: number
  readonly blockerRefs: readonly string[]
}

export interface SlimElement {
  readonly ref: string
  readonly selector: string
  readonly tag: string
  readonly text: string
  readonly visible: boolean
  readonly enabled: boolean
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly attributes: Readonly<Record<string, string>>
  readonly hit: HitSummary
}

export interface SlimSnapshot {
  readonly snapshotId: string
  readonly url: string
  readonly title: string
  readonly viewport: { readonly width: number; readonly height: number }
  readonly observedAt: string
  readonly screenshotRef: string
  readonly elementCount: number
  readonly elements: readonly SlimElement[]
  readonly pageText: string
}

export interface FullElement {
  readonly selector: string
  readonly tag: string
  readonly text: string
  readonly visible: boolean
  readonly enabled: boolean
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly attributes: Readonly<Record<string, string>>
  readonly hitSamples: readonly FullHitSample[]
}

export interface FullHitSample {
  readonly x: number
  readonly y: number
  readonly hitSelector: string | null
  readonly relation: string
  readonly blockerBounds?: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

const TEXT_LIMIT = 120

export function toSlimSnapshot(
  fullSnapshot: {
    readonly url: string
    readonly title: string
    readonly viewport: { readonly width: number; readonly height: number }
    readonly elements: readonly FullElement[]
    readonly text: string
    readonly observedAt: string
  },
  snapshotId: string,
  screenshotRef: string,
  refMap: ReadonlyMap<string, string>,
): SlimSnapshot {
  const selectorToRef = new Map<string, string>()
  for (const [ref, selector] of refMap) {
    selectorToRef.set(selector, ref)
  }

  const elements: SlimElement[] = fullSnapshot.elements.map((el) => {
    const ref = selectorToRef.get(el.selector) ?? '?'
    return {
      ref,
      selector: el.selector,
      tag: el.tag,
      text: el.text.length > TEXT_LIMIT ? el.text.slice(0, TEXT_LIMIT) + '…' : el.text,
      visible: el.visible,
      enabled: el.enabled,
      bounds: el.bounds,
      attributes: el.attributes,
      hit: summarizeHits(el.hitSamples, selectorToRef),
    }
  })

  return {
    snapshotId,
    url: fullSnapshot.url,
    title: fullSnapshot.title,
    viewport: fullSnapshot.viewport,
    observedAt: fullSnapshot.observedAt,
    screenshotRef,
    elementCount: fullSnapshot.elements.length,
    elements,
    pageText: fullSnapshot.text,
  }
}

function summarizeHits(
  samples: readonly FullHitSample[],
  selectorToRef: ReadonlyMap<string, string>,
): HitSummary {
  let self = 0
  let descendant = 0
  let blocked = 0
  const blockerSelectors = new Set<string>()

  for (const s of samples) {
    switch (s.relation) {
      case 'self':
        self++
        break
      case 'descendant':
        descendant++
        break
      case 'ancestor':
      case 'unrelated':
        blocked++
        if (s.hitSelector) blockerSelectors.add(s.hitSelector)
        break
      case 'none':
        blocked++
        break
    }
  }

  const blockerRefs: string[] = []
  for (const sel of blockerSelectors) {
    const ref = selectorToRef.get(sel)
    if (ref) blockerRefs.push(ref)
  }

  return { sampled: samples.length, self, descendant, blocked, blockerRefs }
}

export function estimateSlimSavings(
  fullObsBytes: number,
  slimObsBytes: number,
): { savedBytes: number; savedPercent: number } {
  const savedBytes = fullObsBytes - slimObsBytes
  const savedPercent = fullObsBytes > 0 ? (savedBytes / fullObsBytes) * 100 : 0
  return { savedBytes, savedPercent: Math.round(savedPercent * 10) / 10 }
}
