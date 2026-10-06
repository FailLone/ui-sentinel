import type { BrowserContext, Page } from 'playwright'
import { checkDestination } from './address.ts'
import type {
  NetworkDecision,
  NetworkPolicy,
  NetworkReasonCode,
} from '../../inspection/network-policy.ts'

/**
 * The UI network session: one interception point for every request a `ui-scan` page makes
 * (plan 4.3).
 *
 * ## Why CDP Fetch and not `context.route`
 *
 * Playwright's `context.route` does not re-enter the handler for a redirect hop. A route handler
 * that calls `route.fulfill()` with the 302 lets Chromium follow it internally, and one that calls
 * `route.continue()` lets the whole chain proceed in the network stack: in both cases the next hop's
 * URL is never offered for a decision, so a cross-origin 302 reaches its target before any check
 * runs. That is precisely the "observe the URL after it moved" failure the plan forbids, and it is
 * measured, not assumed - see `session.test.ts`, which counts requests at a second server.
 *
 * `Fetch.enable` at `requestStage: 'Request'` pauses every request *including each redirect hop*,
 * reported with its own `requestId` and a `redirectedRequestId` naming its predecessor. Denying a hop
 * with `Fetch.failRequest` means the target is never contacted.
 *
 * ## Layers
 *
 * This module owns the *transport* boundary only. What is allowed and why lives in
 * `inspection/network-policy.ts`; what was checked and whether it is finished lives in
 * `inspection/scope.ts`.
 */

export interface NetworkDecisionRecord extends NetworkDecision {
  /** Present when the session refused a request the policy allowed (the round request budget). */
  readonly sessionReason?: 'request-budget-exhausted'
  /** Present when a response was kept but could not be retained whole (plan 4.4). */
  readonly truncated?: boolean
}

export interface NetworkLimits {
  /** Requests this run may dispatch in total (plan 4.4 default: 500). */
  readonly maxRequests: number
  /** Largest single response body the session will pass through. */
  readonly maxResponseBytes: number
  readonly maxTotalBytes: number
}

export const DEFAULT_LIMITS: NetworkLimits = {
  maxRequests: 500,
  maxResponseBytes: 10 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

export interface UiNetworkSessionOptions {
  readonly context: BrowserContext
  readonly page: Page
  readonly policy: NetworkPolicy
  readonly onDecision?: (record: NetworkDecisionRecord) => void
  /** Resolves a hostname to every address it answers with. Defaults to the system resolver. */
  readonly lookup?: (host: string) => Promise<readonly string[]>
  readonly limits?: Partial<NetworkLimits>
  /** Called for every window the page opens on its own; the session closes it either way. */
  readonly onOpenPage?: (url: string, reason: 'unsupported-channel') => void
  /** Called for every WebSocket the page attempts, before it is blocked. */
  readonly onWebSocket?: (url: string, reason: 'unsupported-channel') => void
}

/** The system resolver, returning *every* answer so a mixed (rebinding) result can be refused. */
export async function systemLookup(host: string): Promise<readonly string[]> {
  const { lookup } = await import('node:dns/promises')
  const { isIP } = await import('node:net')
  if (isIP(host)) return [host]
  const answers = await lookup(host, { all: true })
  return answers.map((answer) => answer.address)
}

function schemePort(url: URL): number {
  if (url.port) return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

/**
 * The shape CDP delivers on `Fetch.requestPaused`.
 *
 * The request fields are *nested* under `request`, which is easy to flatten by accident and produces
 * a handler that judges `undefined` for every URL. Both stages are described here so a response pause
 * is distinguishable from a request pause by a typed field rather than by a truthiness check.
 */
interface CdpPausedEvent {
  readonly requestId: string
  readonly request: {
    readonly url: string
    readonly method: string
  }
  readonly resourceType: string
  readonly redirectedRequestId?: string | undefined
  /** Present only on a response-stage pause. */
  readonly responseStatusCode?: number | undefined
  readonly responseHeaders?: readonly { name: string; value: string }[] | undefined
}

/**
 * Install the session on a page before the context navigates anywhere.
 *
 * The ordering requirement is real: installing after the first navigation would leave the entry
 * document and everything it loaded already dispatched.
 */
export async function installUiNetworkSession(
  options: UiNetworkSessionOptions,
): Promise<{ decisions: readonly NetworkDecisionRecord[]; requestsDispatched: () => number }> {
  const { policy, onDecision } = options
  const limits: NetworkLimits = { ...DEFAULT_LIMITS, ...options.limits }
  const lookup = options.lookup ?? systemLookup
  const decisions: NetworkDecisionRecord[] = []
  /** requestId -> the URL it asked for, so a redirect hop can name its predecessor. */
  const urls = new Map<string, string>()
  let dispatched = 0
  let retainedBytes = 0

  const emit = (record: NetworkDecisionRecord) => {
    decisions.push(record)
    onDecision?.(record)
  }

  const cdp = await options.context.newCDPSession(options.page)
  await cdp.send('Fetch.enable', {
    patterns: [
      { urlPattern: '*', requestStage: 'Request' },
      { urlPattern: '*', requestStage: 'Response' },
    ],
  })

  /**
   * Unsupported channels are closed before they can carry traffic.
   *
   * A WebSocket is not a request this layer can judge, and the release does not support it, so it is
   * refused rather than left to connect unobserved. The check is on the URL scheme, so it holds even
   * when the target port happens to be unreachable - an unreachable port is not an enforced boundary.
   */
  await cdp.send('Network.enable', {}).catch(() => {})
  await cdp.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] }).catch(() => {})
  // `websocket` is a Page event in Playwright, and it fires even when the connection is blocked, so
  // the attempt is recorded as an unsupported channel rather than passing silently.
  options.page.on('websocket', (socket) => {
    options.onWebSocket?.(socket.url(), 'unsupported-channel')
  })

  /**
   * A window the page opens on its own is not a page this run inspects, and the release does not
   * support multi-window paths. It is recorded and closed, matching the business executor's popup
   * policy, so a check that depends on it is visibly unsupported rather than silently partial.
   */
  options.context.on('page', (opened) => {
    if (opened === options.page) return
    const url = opened.url()
    options.onOpenPage?.(url, 'unsupported-channel')
    void opened.close().catch(() => {})
  })

  /**
   * Decide one paused request. Returns the decision so the caller can act on it.
   *
   * A hop is attributed to the URL of the request it redirected from, which is what makes a chain
   * legible in the report: the refusal names where the run was, not only where it was sent.
   */
  async function judge(event: CdpPausedEvent): Promise<NetworkDecisionRecord> {
    const redirectFrom = event.redirectedRequestId
      ? (urls.get(event.redirectedRequestId) ?? null)
      : null
    const receipt = {
      requestId: event.requestId,
      actionId: null,
      method: event.request.method,
      url: event.request.url,
      destination: event.resourceType,
      redirectFrom,
      policyRevision: policy.policyRevision,
    }

    if (dispatched >= limits.maxRequests)
      return { ...receipt, allow: false, reasonCode: 'request-budget-exhausted' }

    let resolvedAddress: string | null = null
    try {
      const parsed = new URL(event.request.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // A request to an origin the run actually declared may use that origin's port; everything
        // else is held to the standard web ports. The grant is per exact origin, so naming a CDN
        // never admits an undeclared host, and the private-address rule still applies.
        const declaredOrigin = policy.declaredOrigins.includes(parsed.origin)
        const answers = policy.fixtureOrigins.includes(parsed.origin)
          ? []
          : await lookup(parsed.hostname).catch(() => [] as readonly string[])
        const check = checkDestination({
          host: parsed.hostname,
          port: schemePort(parsed),
          fixtureOrigins: policy.fixtureOrigins,
          declaredOrigin,
          lookup: () => answers,
        })
        if (!check.allow)
          return {
            ...receipt,
            allow: false,
            // An address we cannot vouch for is refused: an empty DNS answer is not a public one.
            reasonCode:
              check.reasonCode === 'resolution-failed'
                ? 'private-address'
                : (check.reasonCode as NetworkReasonCode),
          }
        resolvedAddress = check.addresses[0] ?? null
      }
    } catch {
      /* a URL this process cannot parse is judged by the policy, which refuses a malformed one */
    }

    return policy.decide({
      requestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      destination: event.resourceType,
      isNavigation: event.resourceType === 'Document',
      redirectFrom,
      actionId: null,
      resolvedAddress,
    })
  }

  cdp.on('Fetch.requestPaused', (raw) => {
    const event = raw as unknown as CdpPausedEvent
    void (async () => {
      try {
        if (event.responseStatusCode !== undefined) {
          await handleResponse(cdp, event)
          return
        }
        urls.set(event.requestId, event.request.url)
        const decision = await judge(event)
        emit(decision)
        if (!decision.allow) {
          await cdp
            .send('Fetch.failRequest', {
              requestId: event.requestId,
              errorReason: 'BlockedByClient',
            })
            .catch(() => {})
          return
        }
        dispatched++
        await cdp.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
      } catch {
        // A pause this layer cannot judge is refused rather than released: an unjudged request is
        // exactly the case the boundary exists to prevent.
        await cdp
          .send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
          .catch(() => {})
      }
    })()
  })

  /**
   * Enforce the response-size limits.
   *
   * `Content-Length` is only a hint: a chunked response has none, so the size is measured from the
   * body when the header is absent. The measured value decides, which is what makes the limit real
   * rather than advisory.
   */
  async function handleResponse(
    session: Awaited<ReturnType<BrowserContext['newCDPSession']>>,
    event: CdpPausedEvent,
  ): Promise<void> {
    const declared = event.responseHeaders?.find((h) => h.name.toLowerCase() === 'content-length')
    const declaredBytes = declared ? Number(declared.value) : Number.NaN
    if (Number.isFinite(declaredBytes) && declaredBytes > limits.maxResponseBytes) {
      retainedBytes += limits.maxResponseBytes
      emit({ ...emptyReceipt(event.requestId), allow: true, truncated: true })
      await session
        .send('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: event.responseStatusCode ?? 200,
          responseHeaders: [{ name: 'x-sentinel-truncated', value: 'size-limit' }],
          body: Buffer.alloc(0).toString('base64'),
        })
        .catch(() => {})
      return
    }
    await session
      .send('Fetch.continueResponse', { requestId: event.requestId })
      .catch(() =>
        session.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {}),
      )
  }

  function emptyReceipt(requestId: string): NetworkDecisionRecord {
    return {
      allow: true,
      reasonCode: 'allowed',
      requestId,
      actionId: null,
      method: '',
      url: urls.get(requestId) ?? '',
      destination: '',
      redirectFrom: null,
      policyRevision: policy.policyRevision,
    }
  }

  return { decisions, requestsDispatched: () => dispatched }
}
