import { classifyHost, isPrivateAddress, sameOrigin } from './url.ts'

/**
 * The pure decision function behind a UI scan's network boundary (plan 4.2).
 *
 * It is deliberately separate from the browser: every interception path - the Playwright route
 * handler, the redirect hop, the proxy connection - asks this one function, so a decision can be
 * unit-tested and a receipt can name which revision produced it. Nothing here performs I/O, and
 * nothing here reads page content, so a page cannot influence its own permissions.
 */

export const UI_NETWORK_POLICY_REVISION = 'url-scan-network-1' as const

export type NetworkReasonCode =
  | 'allowed'
  | 'write-denied'
  | 'unsupported-data-method'
  | 'resource-origin-denied'
  | 'data-origin-denied'
  | 'outside-navigation-scope'
  | 'unsupported-channel'
  | 'control-surface'
  | 'private-address'
  | 'malformed-url'
  /** The run's round request budget is spent; exploration stops with a partial record (plan 4.4). */
  | 'request-budget-exhausted'
  /**
   * The run's round-wide byte budget is spent (plan 4.4: "整轮 50 MiB"). A page that pulls many
   * responses each under the per-response limit must still be stopped once their sum exceeds it.
   */
  | 'response-budget-exhausted'

export interface NetworkRequestInput {
  readonly requestId: string
  readonly url: string
  readonly method: string
  /** Playwright resource type, e.g. `document`, `script`, `xhr`, `fetch`, `websocket`. */
  readonly destination: string
  readonly isNavigation: boolean
  /** The URL this request redirected from, so a hop can be attributed to its chain. */
  readonly redirectFrom: string | null
  readonly actionId: string | null
  /** The address the connection would use, once known. `null` means "not yet resolved". */
  readonly resolvedAddress: string | null
  /**
   * True only when public page semantics state that this *read* writes (plan 1.2). Method alone is
   * never treated as the full side-effect meaning.
   */
  readonly declaredWrite?: boolean
}

export interface NetworkDecision {
  readonly allow: boolean
  readonly reasonCode: NetworkReasonCode
  readonly requestId: string
  readonly actionId: string | null
  readonly method: string
  readonly url: string
  readonly destination: string
  readonly redirectFrom: string | null
  readonly policyRevision: string
}

export interface NetworkPolicyConfig {
  readonly entryUrl: string
  readonly resourceOrigins: readonly string[]
  readonly dataOrigins: readonly string[]
  /**
   * Server-configured exact origins that may be *reached* on a non-standard port - the entry origin
   * and local fixtures. Never caller-supplied.
   *
   * This is an address-reachability grant, not a permission: an origin listed here can be connected
   * to at its own port, but it is still subject to every navigation, resource and data rule below.
   * Navigation in particular remains exclusive to `entryUrl`'s origin, because the plan fixes the
   * run to the entry origin and a resource origin is never a page destination. Keeping the two apart
   * is what stops "this CDN has to be reachable" from becoming "this CDN is a page I may visit".
   */
  readonly reachableOrigins: readonly string[]
}

const READ_METHODS = ['GET', 'HEAD']
const CONTROL_PREFIXES = ['/__control', '/evaluation', '/src/server', '/.git', '/.env']
/** Structures a browser renders but this release does not navigate to (plan 4.2). */
const UNSUPPORTED_DESTINATIONS = ['websocket', 'iframe', 'sub_frame', 'object', 'embed']
const RESOURCE_DESTINATIONS = [
  'script',
  'style',
  'image',
  'font',
  'media',
  'manifest',
  'imageset',
  'texttrack',
]
const DATA_DESTINATIONS = ['xhr', 'fetch', 'cors-preflight', 'ping', 'beacon']

function isControlPath(pathname: string): boolean {
  return CONTROL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** The reason a literal or resolved private address must be refused, or `null` when it may proceed. */
function addressReason(host: string, resolvedAddress: string | null): NetworkReasonCode | null {
  // A literal private host is refused without waiting for DNS; a public name is refused when the
  // address it actually resolved to is private. An unresolved name is allowed to reach resolution,
  // which re-checks the address at connect time - the two layers of plan 4.3.
  if (classifyHost(host) === 'private-literal') return 'private-address'
  if (resolvedAddress && isPrivateAddress(resolvedAddress)) return 'private-address'
  return null
}

export function createNetworkPolicy(config: NetworkPolicyConfig) {
  const entryOrigin = new URL(config.entryUrl).origin
  const reachable = new Set(config.reachableOrigins)
  const resources = new Set(config.resourceOrigins)
  const data = new Set(config.dataOrigins)

  /**
   * Page destinations are the entry origin and nothing else (plan 4.1: "入口 origin 固定").
   *
   * A declared resource or data origin is a dependency, not a page: listing a CDN so its CSS loads
   * must never make that CDN a URL the run can be navigated to, or an in-page script could turn a
   * resource grant into a navigation grant.
   */
  const navigationAllowed = (origin: string) => origin === entryOrigin

  function decide(input: NetworkRequestInput): NetworkDecision {
    const receipt = {
      requestId: input.requestId,
      actionId: input.actionId,
      method: input.method,
      url: input.url,
      destination: input.destination,
      redirectFrom: input.redirectFrom,
      policyRevision: UI_NETWORK_POLICY_REVISION,
    }
    const deny = (reasonCode: NetworkReasonCode): NetworkDecision => ({
      ...receipt,
      allow: false,
      reasonCode,
    })

    // A blob or data subresource is the page's own in-memory content, not a network destination.
    if (/^(blob|data):/i.test(input.url)) {
      if (input.isNavigation) return deny('unsupported-channel')
      return { ...receipt, allow: true, reasonCode: 'allowed' }
    }

    if (UNSUPPORTED_DESTINATIONS.includes(input.destination)) return deny('unsupported-channel')

    let url: URL
    try {
      url = new URL(input.url)
    } catch {
      return deny('malformed-url')
    }
    if (!/^https?:$/.test(url.protocol)) return deny('unsupported-channel')

    const pathname = url.pathname
    // The control surface is refused first and unconditionally: not even a configured local fixture
    // origin may point at it (plan 4.1).
    if (isControlPath(pathname)) return deny('control-surface')
    // A server-configured reachable origin is the documented exception for local development and
    // fixtures, so it is exempt from the private-address refusal - but from nothing else.
    if (!reachable.has(url.origin)) {
      const address = addressReason(url.hostname, input.resolvedAddress)
      if (address) return deny(address)
    }

    // Navigation: exclusive to the entry origin and the configured local fixture origins.
    if (input.isNavigation || input.destination === 'document') {
      if (!navigationAllowed(url.origin)) return deny('outside-navigation-scope')
      // A top-level navigation with a declared write is refused before it is dispatched: the
      // executor does not visit a URL to find out whether it wrote (plan 1.2).
      if (input.declaredWrite) return deny('write-denied')
      if (!READ_METHODS.includes(input.method)) return deny('write-denied')
      return { ...receipt, allow: true, reasonCode: 'allowed' }
    }

    const sameOriginAsEntry = url.origin === entryOrigin
    if (RESOURCE_DESTINATIONS.includes(input.destination)) {
      if (!sameOriginAsEntry && !resources.has(url.origin)) return deny('resource-origin-denied')
      if (!READ_METHODS.includes(input.method)) return deny('write-denied')
      return { ...receipt, allow: true, reasonCode: 'allowed' }
    }

    if (DATA_DESTINATIONS.includes(input.destination)) {
      // A data reading is permitted on the entry origin or a declared data origin. OPTIONS is a
      // preflight for a declared destination only, and grants nothing to the request that follows.
      const granted = sameOriginAsEntry || data.has(url.origin)
      if (!granted) return deny('data-origin-denied')
      if (input.method === 'OPTIONS') {
        if (!data.has(url.origin)) return deny('data-origin-denied')
        return { ...receipt, allow: true, reasonCode: 'allowed' }
      }
      if (!READ_METHODS.includes(input.method)) return deny('unsupported-data-method')
      if (input.declaredWrite) return deny('write-denied')
      return { ...receipt, allow: true, reasonCode: 'allowed' }
    }

    // Any surviving method that mutates - including a beacon to a granted origin - is a write.
    if (!READ_METHODS.includes(input.method) && input.method !== 'OPTIONS')
      return deny(sameOriginAsEntry || data.has(url.origin) ? 'write-denied' : 'data-origin-denied')
    if (input.declaredWrite) return deny('write-denied')
    // An unclassified destination on an origin the run was told about is allowed only as a read.
    if (sameOriginAsEntry || resources.has(url.origin))
      return { ...receipt, allow: true, reasonCode: 'allowed' }
    return deny('resource-origin-denied')
  }

  return {
    decide,
    entryOrigin,
    policyRevision: UI_NETWORK_POLICY_REVISION,
    /**
     * Exact origins the address layer may admit on a non-standard port: the reachable fixtures plus
     * every origin this run actually declared a dependency on. This is a *reachability* set only -
     * `decide` still applies the navigation, resource and data rules independently, so being listed
     * here grants no permission beyond "the socket may be opened".
     */
    declaredOrigins: [
      ...config.reachableOrigins,
      entryOrigin,
      ...config.resourceOrigins,
      ...config.dataOrigins,
    ],
    /** The subset usable as local fixtures, so the session does not repeat the private-address rule. */
    fixtureOrigins: [...config.reachableOrigins],
  }
}

export type NetworkPolicy = ReturnType<typeof createNetworkPolicy>

/** Re-exported for callers that judge a single hop without constructing a policy. */
export { sameOrigin }
