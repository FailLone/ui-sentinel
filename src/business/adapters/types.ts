import type { BusinessProfileId } from '../types.ts'

/** A request as the browser actually dispatched it. Adapters never call the business API. */
export interface PublicRequest {
  readonly url: string
  readonly method: string
  /** Response body, already parsed. `null` means the body could not be read or parsed. */
  readonly body: unknown
  readonly statusCode: number
  readonly origin: string
}

/** A dispatched request paired with its observed response. */
export interface PublicExchange {
  readonly request: PublicRequest
  /**
   * The only origin this run may treat as its business. Recognition is by the selected adapter's
   * origin, method, path and response schema: a response from another origin that happens to carry
   * the right keys is not this business's fact.
   */
  readonly allowedOrigin: string
  /** Raw response text; truncated or unreadable bodies are reported as `unreadable`. */
  readonly bodyText: string | null
  readonly bodyReadFailed: boolean
}

/**
 * What a request is, before any business meaning is attached.
 *
 * `retry` is separated from `create` on purpose: a retry re-uses an existing entity and must be
 * recognisable as such, or a profile that permits one retry could be satisfied by a second
 * create slipping through the same code path.
 */
export type RequestIntent =
  | { readonly kind: 'read' }
  | { readonly kind: 'prepare' }
  | { readonly kind: 'create' }
  | { readonly kind: 'retry'; readonly operationPath: string }
  | { readonly kind: 'other-write' }
  | { readonly kind: 'foreign' }

export interface RetrySignal {
  readonly permitted: boolean
  readonly remaining: number
  readonly afterMs: number
  readonly prerequisitesMet: boolean
}

/**
 * A normalized, persisted business fact.
 *
 * Every field an executor or rule may act on lives here, produced by trusted adapter code from a
 * public observation. Adapters cannot mint evidence ids: `sourceEventId` and `evidenceRefs` are
 * filled by the runtime after the public response has been persisted.
 */
export interface BusinessFact {
  readonly schemaVersion: '1'
  readonly profileId: BusinessProfileId
  readonly contractHash: string
  readonly operationId: string
  readonly attempt: number
  readonly version: number
  readonly phase: 'processing' | 'succeeded' | 'rejected' | 'failed'
  readonly result: 'success' | 'rejected' | 'unknown'
  readonly retryEligibility: 'allowed' | 'denied' | 'unknown'
  readonly notice: string | null
  readonly retry: RetrySignal | null
  readonly sourceEventId: string | null
  readonly evidenceRefs: readonly string[]
  readonly observedAt: string
}

/** Result of correlating a fact against the currently visible page. */
export type Correlation =
  | {
      readonly kind: 'confirmed'
      readonly operationId: string
      readonly evidenceRefs: readonly string[]
    }
  | { readonly kind: 'absent' }
  | { readonly kind: 'contradicted'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string }

/**
 * The minimum a request must expose to be classified. Adapters classify on origin, method and
 * path only, so classification cannot depend on a response body.
 */
export type RequestShape = Pick<PublicRequest, 'url' | 'method' | 'origin'>

export interface BusinessAdapter {
  readonly id: BusinessProfileId
  readonly revision: string
  classifyRequest(request: RequestShape): RequestIntent
  decodeResponse(exchange: PublicExchange): BusinessFact | null
  correlateVisible(
    fact: BusinessFact,
    observation: { readonly pageText: string; readonly visibleText: readonly string[] },
  ): Correlation
}
