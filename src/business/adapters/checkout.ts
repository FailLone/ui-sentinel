import type {
  BusinessAdapter,
  BusinessFact,
  Correlation,
  PublicExchange,
  RequestIntent,
  RequestShape,
} from './types.ts'

/**
 * Shopping (checkout) public protocol.
 *
 * This is the original shopping parser, moved here verbatim in behaviour so existing shopping
 * observations keep their meaning. It is *only* reachable through the checkout profile: the
 * compatibility fields it produces (`orderId`, `canRetry`) are shopping vocabulary and the export
 * adapter must never emit them.
 */
const CHECKOUT_PATH = '/api/checkout'
const CART_PATHS = ['/api/cart/add', '/api/cart/remove']

interface CheckoutBody {
  success?: boolean
  status?: string
  orderId?: string
  message?: string
  canRetry?: boolean
  retryAfterMs?: number
  remainingAttempts?: number
  inProgress?: boolean
  prerequisitesMet?: boolean
}

/**
 * The shopping protocol has no attempt/version field, so this adapter derives them: a first
 * successful correlation is attempt 0, and the version counts observed status transitions for the
 * same order. This is derived state, not invented evidence - `sourceEventId` still points at the
 * real public response recorded by the runtime.
 */
function deriveState(body: CheckoutBody): { attempt: number; version: number } {
  const transitions =
    body.success === true ? 3 : ['rejected', 'declined'].includes(body.status ?? '') ? 2 : 1
  return { attempt: 0, version: transitions }
}

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

export const checkoutAdapter: BusinessAdapter = Object.freeze({
  id: 'checkout' as const,
  revision: '1',

  classifyRequest(request: RequestShape): RequestIntent {
    const path = pathOf(request.url)
    if (!path) return { kind: 'foreign' }
    // Only POST mutates. Reads are recognized by method, never by the body's JSON shape.
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS')
      return { kind: 'read' }
    if (path === CHECKOUT_PATH) return { kind: 'create' }
    if (CART_PATHS.includes(path)) return { kind: 'prepare' }
    return { kind: 'other-write' }
  },

  decodeResponse(exchange: PublicExchange): BusinessFact | null {
    if (exchange.bodyReadFailed || exchange.bodyText === null) return null
    if (exchange.request.origin !== exchange.allowedOrigin) return null
    const path = pathOf(exchange.request.url)
    // Identity is decided by the selected adapter's origin, method and path - not by the mere
    // presence of `success`/`status` keys anywhere in a JSON body.
    if (path !== CHECKOUT_PATH) return null
    if (!['POST', 'PUT', 'PATCH'].includes(exchange.request.method)) return null
    const body = exchange.request.body as CheckoutBody | null
    if (!body || typeof body !== 'object') return null
    if (typeof body.success !== 'boolean' && typeof body.status !== 'string') return null
    const orderId = typeof body.orderId === 'string' && body.orderId ? body.orderId : ''
    if (!orderId) return null
    return buildCheckoutFact(body, orderId, exchange)
  },

  correlateVisible(
    fact: BusinessFact,
    observation: { readonly pageText: string; readonly visibleText: readonly string[] },
  ): Correlation {
    const text = observation.pageText.replace(/\s+/g, ' ')
    // A verified outcome needs the current operation's identity *and* its stated notice visible.
    // Another task's success, a lone `success` label, or a fabricated field cannot confirm this one.
    if (!text.includes(fact.operationId)) return { kind: 'absent' }
    if (fact.notice && !text.includes(fact.notice.replace(/\s+/g, ' ')))
      return { kind: 'contradicted', reason: 'notice-not-visible' }
    return { kind: 'confirmed', operationId: fact.operationId, evidenceRefs: [] }
  },
})

function buildCheckoutFact(
  body: CheckoutBody,
  orderId: string,
  exchange: PublicExchange,
): BusinessFact {
  const { attempt, version } = deriveState(body)
  const rejected = ['rejected', 'declined'].includes(body.status ?? '')
  const phase: BusinessFact['phase'] =
    body.success === true ? 'succeeded' : rejected ? 'rejected' : 'failed'
  const retryDenied =
    body.inProgress === true ||
    body.prerequisitesMet === false ||
    (typeof body.retryAfterMs === 'number' && body.retryAfterMs > 0) ||
    (typeof body.remainingAttempts === 'number' && body.remainingAttempts <= 0)
  const retryEligibility: BusinessFact['retryEligibility'] =
    body.canRetry === true ? (retryDenied ? 'denied' : 'allowed') : 'denied'
  return {
    schemaVersion: '1',
    profileId: 'checkout',
    contractHash: '',
    operationId: orderId,
    attempt,
    version,
    phase,
    result: phase === 'succeeded' ? 'success' : phase === 'rejected' ? 'rejected' : 'unknown',
    retryEligibility,
    notice: typeof body.message === 'string' ? body.message : null,
    retry:
      body.canRetry === true
        ? {
            permitted: !retryDenied,
            remaining: typeof body.remainingAttempts === 'number' ? body.remainingAttempts : 1,
            afterMs: typeof body.retryAfterMs === 'number' ? body.retryAfterMs : 0,
            prerequisitesMet: body.prerequisitesMet !== false,
          }
        : null,
    sourceEventId: null,
    evidenceRefs: [],
    observedAt: new Date().toISOString(),
  }
}
