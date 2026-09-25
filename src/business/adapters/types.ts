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
 * A public business resource a run must retain as citable evidence.
 *
 * Some business claims are about a resource the business publishes *alongside* its entity, not
 * about the entity's own response. Export recovery is the case that forced this: E2's defect is the
 * contradiction between the recovery eligibility resource (prerequisite unmet) and the API's own
 * answer (the backend permits the retry), while the job payload is byte-identical for E1 and E2 and
 * therefore cannot carry the claim at all. An agent that does not retain the resource has nothing
 * independent to cite, so "the control was inoperable although recovery was permitted" stays an
 * assertion about one screen rather than a finding about the business.
 *
 * Declared by the adapter, never by the executor: a business without the concept contributes
 * nothing rather than borrowing another business's resource meaning.
 */
export interface RetainedResource {
  /** Stable business-neutral name for what was retained, e.g. `recovery-eligibility`. */
  readonly kind: string
  /** The entity this resource describes, when it names one. */
  readonly operationId: string | null
  /** The resource's own published body, retained verbatim. */
  readonly value: unknown
}

/**
 * The minimum a request must expose to be classified. Adapters classify on origin, method and
 * path only, so classification cannot depend on a response body.
 */
export type RequestShape = Pick<PublicRequest, 'url' | 'method' | 'origin'>

/**
 * Legacy trigger projection.
 *
 * Rules and task scope were written before normalized facts existed and use trigger names from
 * that vocabulary (`payment-success`, `payment-rejected`). A business that predates the fact
 * layer declares here how its facts map back onto those names. A business with no such history
 * returns nothing rather than borrowing another business's triggers - which is what stops an
 * export rejection from ever being reported as a payment event.
 */
export interface CompatibilityTriggers {
  readonly paymentOutcome?: 'paid' | 'rejected' | undefined
}

export interface BusinessAdapter {
  readonly id: BusinessProfileId
  readonly revision: string
  classifyRequest(request: RequestShape): RequestIntent
  decodeResponse(exchange: PublicExchange): BusinessFact | null
  correlateVisible(
    fact: BusinessFact,
    observation: { readonly pageText: string; readonly visibleText: readonly string[] },
  ): Correlation
  /**
   * Optional thin compatibility projection.
   *
   * Adapters that predate the normalized fact layer may expose their original public event here,
   * so historical event shapes and their readers keep working. The executor appends whatever the
   * adapter returns without knowing which business produced it, which is what keeps shopping
   * vocabulary inside the shopping adapter - a business with no such projection returns nothing
   * rather than fabricating another business's fields.
   */
  compatibilityEvent?(
    exchange: PublicExchange,
  ): { readonly type: string; readonly payload: Record<string, unknown> } | null
  /**
   * Recognize a public business resource this run must retain as evidence.
   *
   * Recognition is by the adapter's own origin, method and path plus the response schema, exactly
   * like `decodeResponse` - so another site's same-shaped document is not retained under this
   * business's name. Returning `null` means "not a resource of this business's", which is also the
   * answer for every exchange a business without the concept sees.
   */
  retainResource?(exchange: PublicExchange): RetainedResource | null
  /**
   * Optional mapping of a normalized fact onto the pre-existing trigger vocabulary. Declared by
   * the adapter, so the executor never branches on a profile id to decide which business's
   * compatibility meaning applies.
   */
  compatibilityTriggers?(fact: BusinessFact): CompatibilityTriggers
}
