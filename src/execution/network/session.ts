import { routeGuardSource } from './route-guard.ts'
import type { BrowserContext, Page } from 'playwright'
import { checkDestination } from './address.ts'
import { createBodyBudget, readPinnedResponse, TransportRefusal } from './transport.ts'
import { createNavigationBudget } from '../../inspection/navigation-scope.ts'
import type { NetworkDecision, NetworkPolicy } from '../../inspection/network-policy.ts'

export interface NetworkDecisionRecord extends NetworkDecision {
  readonly truncated?: boolean
  readonly sessionReason?: string
  /** An admitted read cancelled only after a finish claim passed its first fact check. */
  readonly finalizationShutdown?: boolean
}
export interface NetworkLimits {
  readonly maxRequests: number
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
  readonly lookup?: (host: string) => Promise<readonly string[]>
  readonly limits?: Partial<NetworkLimits>
  readonly scope?: { maxPages: number; maxDepth: number }
  readonly signal?: AbortSignal
  readonly isFinished?: () => boolean
  readonly onOpenPage?: (url: string, reason: 'unsupported-channel') => void
  readonly onWebSocket?: (url: string, reason: 'unsupported-channel') => void
}
export async function systemLookup(host: string): Promise<readonly string[]> {
  const { lookup } = await import('node:dns/promises')
  const { isIP } = await import('node:net')
  host = host.replace(/^\[|\]$/g, '')
  if (isIP(host)) return [host]
  return (await lookup(host, { all: true })).map((answer) => answer.address)
}

/** CDP spelling is not Playwright spelling. Unknown types never inherit a resource grant. */
export function destinationOf(type: string, isMainFrame: boolean): string {
  const types: Record<string, string> = {
    Document: isMainFrame ? 'document' : 'sub_frame',
    Stylesheet: 'style',
    Script: 'script',
    Image: 'image',
    Font: 'font',
    Media: 'media',
    Manifest: 'manifest',
    TextTrack: 'texttrack',
    XHR: 'xhr',
    Fetch: 'fetch',
    Preflight: 'cors-preflight',
    Ping: 'beacon',
    WebSocket: 'websocket',
    EventSource: 'unsupported',
    Other: 'other',
  }
  return types[type] ?? 'unsupported'
}

/** CDP pauses each hop; the browser never continues a network request itself. A pinned,
 * bounded Node stream supplies each response. The UI browser also has a denying proxy,
 * closing channels (workers/popups/speculation) which do not pass this page's CDP session.
 */
export async function installUiNetworkSession(options: UiNetworkSessionOptions) {
  const { policy } = options
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const lookup = options.lookup ?? systemLookup
  const budget = createBodyBudget(limits.maxResponseBytes, limits.maxTotalBytes)
  const navigation = createNavigationBudget({
    entryUrl: policy.entryUrl,
    ...(options.scope ?? { maxPages: 3, maxDepth: 1 }),
  })
  const decisions: NetworkDecisionRecord[] = []
  const requests = new Map<string, { url: string; hops: number }>()
  const controller = new AbortController()
  const stop = () => controller.abort()
  options.signal?.addEventListener('abort', stop, { once: true })
  if (options.signal?.aborted) stop()
  options.context.on('close', stop)
  options.page.on('close', stop)
  const pending = new Set<Promise<void>>()
  let dispatched = 0
  let sealed = false
  const emit = (decision: NetworkDecisionRecord) => {
    decisions.push(decision)
    options.onDecision?.(decision)
  }
  const cdp = await options.context.newCDPSession(options.page)
  const { frameTree } = await cdp.send('Page.getFrameTree')
  const mainFrameId = frameTree.frame.id
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  await cdp.send('Runtime.enable')
  await cdp.send('Runtime.addBinding', {
    name: '__sentinelRouteDecision',
    executionContextName: 'ui-sentinel-navigation',
  })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    worldName: 'ui-sentinel-navigation',
    source: routeGuardSource({
      entryUrl: policy.entryUrl,
      ...(options.scope ?? { maxPages: 3, maxDepth: 1 }),
      state: navigation.snapshot(),
    }),
  })
  cdp.on('Runtime.bindingCalled', (event) => {
    if (sealed) return
    if (event.name !== '__sentinelRouteDecision') return
    const route = JSON.parse(event.payload)
    if (route.ready) {
      void cdp
        .send('Runtime.evaluate', {
          contextId: event.executionContextId,
          expression: `globalThis.__sentinelUpdate(${JSON.stringify(navigation.snapshot())})`,
        })
        .catch(() => {})
      return
    }
    const checked = route.allow ? navigation.reserve(route.url, route.from) : null
    if (route.allow && checked?.allow) navigation.arrive(route.url)
    else {
      emit({
        allow: false,
        reasonCode: 'outside-navigation-scope',
        sessionReason: route.reason ?? 'route-budget-mismatch',
        requestId: `route:${route.url}`,
        actionId: null,
        method: 'GET',
        url: route.url,
        destination: 'document',
        redirectFrom: null,
        policyRevision: policy.policyRevision,
      })
      if (!route.prevented) stop()
    }
  })

  options.page.on(
    'websocket',
    (socket) => !sealed && options.onWebSocket?.(socket.url(), 'unsupported-channel'),
  )
  options.context.on('page', (opened) => {
    if (opened === options.page) return
    if (!sealed) options.onOpenPage?.(opened.url(), 'unsupported-channel')
    void opened.close().catch(() => {})
  })

  cdp.on('Fetch.requestPaused', (event) => {
    if (sealed) {
      // No new inspection facts after the shutdown boundary. Already admitted work is drained.
      void cdp
        .send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
        .catch(() => {})
      return
    }
    const task = (async () => {
      const previous = event.redirectedRequestId
        ? requests.get(event.redirectedRequestId)
        : undefined
      const destination = destinationOf(event.resourceType, event.frameId === mainFrameId)
      const receipt = {
        requestId: event.requestId,
        actionId: null,
        method: event.request.method,
        url: event.request.url,
        destination,
        redirectFrom: previous?.url ?? null,
        policyRevision: policy.policyRevision,
      }
      const refuse = async (
        reasonCode: NetworkDecisionRecord['reasonCode'],
        sessionReason?: string,
      ) => {
        emit({
          ...receipt,
          allow: false,
          reasonCode,
          ...(sessionReason ? { sessionReason } : {}),
          ...(sealed && reasonCode === 'execution-stopped' ? { finalizationShutdown: true } : {}),
        })
        await cdp
          .send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
          .catch(() => {})
      }
      try {
        if (controller.signal.aborted || options.isFinished?.())
          return await refuse('execution-stopped')
        const preliminary = policy.decide({
          ...receipt,
          isNavigation: destination === 'document',
          resolvedAddress: null,
        })
        if (!preliminary.allow) return await refuse(preliminary.reasonCode)
        if (dispatched >= limits.maxRequests) return await refuse('request-budget-exhausted')
        if (budget.exhausted()) return await refuse('response-budget-exhausted')
        // Reserve before any await, so concurrent DNS lookups cannot overspend the request cap.
        dispatched++
        const hops = previous ? previous.hops + 1 : 0
        if (hops > 5) return await refuse('outside-navigation-scope', 'redirect-limit')
        if (destination === 'document') {
          const decision = navigation.reserve(event.request.url, options.page.url(), previous?.url)
          if (!decision.allow) return await refuse('outside-navigation-scope', decision.reasonCode)
        }
        requests.set(event.requestId, { url: event.request.url, hops })
        const url = new URL(event.request.url)
        const answers = await lookup(url.hostname).catch(() => [] as readonly string[])
        const trusted = policy.fixtureOrigins.includes(url.origin)
        const check = checkDestination({
          host: url.hostname,
          port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
          fixtureOrigins: trusted ? [url.origin] : [],
          lookup: () => answers,
        })
        if (!check.allow)
          return await refuse(
            check.reasonCode === 'allowed' ? 'resolution-failed' : check.reasonCode,
          )
        if (!answers.length) return await refuse('resolution-failed')
        const decision = policy.decide({
          ...receipt,
          isNavigation: destination === 'document',
          resolvedAddress: answers[0]!,
        })
        if (!decision.allow) return await refuse(decision.reasonCode)
        if (controller.signal.aborted || options.isFinished?.())
          return await refuse('execution-stopped')
        const response = await readPinnedResponse({
          url: event.request.url,
          address: answers.find((address) => !address.includes(':')) ?? answers[0]!,
          method: event.request.method,
          headers: event.request.headers,
          budget,
          signal: controller.signal,
        })
        if (destination === 'document' && !(response.status >= 300 && response.status < 400)) {
          navigation.arrive(event.request.url)
        }
        emit(decision)
        await cdp.send('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: response.status,
          responseHeaders: response.headers,
          body: response.body.toString('base64'),
        })
      } catch (error) {
        await refuse(error instanceof TransportRefusal ? error.reason : 'transport-error')
      }
    })()
    pending.add(task)
    void task.finally(() => pending.delete(task))
  })
  // Same-document changes cannot dispatch a document request. Track their real route identity;
  // exceeding the scope changes page behaviour and therefore emits a persisted intervention.
  cdp.on('Page.navigatedWithinDocument', (event) => {
    if (sealed) return
    if (event.frameId !== mainFrameId || event.url === navigation.current()) return
    const result = navigation.reserve(event.url, navigation.current())
    if (result.allow) navigation.arrive(event.url)
    else {
      emit({
        allow: false,
        reasonCode: 'outside-navigation-scope',
        sessionReason: result.reasonCode,
        requestId: `route:${event.url}`,
        actionId: null,
        method: 'GET',
        url: event.url,
        destination: 'document',
        redirectFrom: null,
        policyRevision: policy.policyRevision,
      })
      stop()
    }
  })
  await cdp.send('Page.enable')
  return {
    decisions,
    requestsDispatched: () => dispatched,
    navigation,
    seal: () => {
      sealed = true
      controller.abort()
    },
    settle: async () => {
      while (pending.size) await Promise.all([...pending])
    },
  }
}
