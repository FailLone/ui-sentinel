/** Caller-authored design evidence, never inferred from alt text, tag names or box ratios. */
export interface ImageShapeContract {
  readonly id: string
  readonly pageUrl: string
  readonly selector: string
  readonly resourceUrl: string
  readonly resourceSha256: string
  readonly viewport: { readonly width: number; readonly height: number }
  readonly intent: 'preserve' | 'intentional-distortion'
  readonly basis: {
    readonly reference: string
    readonly statement: string
    readonly confirmedBy: string
  }
}

export interface ImagePaintFact {
  readonly selector: string
  readonly matchCount: number
  readonly mutationEpoch?: number
  readonly documentId?: string
  readonly decoded?: boolean
  readonly nodeId?: number
  readonly currentSrc?: string
  readonly complete?: boolean
  readonly naturalWidth?: number
  readonly naturalHeight?: number
  readonly contentWidth?: number
  readonly contentHeight?: number
  readonly objectFit?: string
  readonly objectPosition?: string
  readonly bounds?: { x: number; y: number; width: number; height: number }
  /** Composed linear transform, outermost ancestor through the image; translation is irrelevant. */
  readonly matrix?: readonly [number, number, number, number]
  readonly excluded?: string
  readonly unsupported?: readonly string[]
  readonly stable?: boolean
  readonly resource?: { sha256: string; format: 'png' | 'jpeg'; evidenceRef: string }
}
