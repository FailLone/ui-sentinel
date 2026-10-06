import type { BrowserContext, Page, Request } from 'playwright'
import type { BusinessRuntime } from '../../business/runtime.ts'
import type { BusinessFact } from '../../business/adapters/types.ts'
import { createNetworkPolicy } from '../../inspection/network-policy.ts'
import { installUiNetworkSession, type NetworkDecisionRecord } from './session.ts'
import type { UiContractSnapshot } from '../../inspection/contract.ts'
import type { SideEffectDecision, SideEffectPolicy } from '../side-effect-policy.ts'
import type { InspectionHost } from '../inspection-host.ts'
import { isAllowedPageUrl, isAllowedNavigationUrl } from '../browser.ts'
import { isAllowedBusinessDownload } from '../download-policy.ts'
import { latestFactForOperation } from '../../business/facts.ts'
import { config } from '../../shared/config.ts'

/**
 * The one place a run's request boundary is installed (plan 4.3, 8/B2).
 *
 * The two kinds of run enforce different rules, and they must not be reachable from one another:
 *
 * - A business run uses the Playwright route handler it has always used: same-origin page URLs, the
 *   environment's navigation rule, the side-effect policy for writes, popups closed as interventions.
 * - A `ui-scan` run installs the UI network session *before the first navigation*, so every hop is
 *   decided before dispatch. It never consults a side-effect policy, because it has no adapter and no
 *   write permission to spend.
 *
 * Keeping this in a module rather than inline is deliberate: the boundary is the run's security
 * property, and "which handler is installed for which kind" should be one readable decision rather
 * than two branches a thousand lines apart.
 */

export interface RunNetworkBoundaryDeps {
  readonly uiScan: UiContractSnapshot | null
  readonly page: Page
  readonly context: BrowserContext
  readonly entryUrl: string
  /** True once the run must stop dispatching: aborted, finished, or an unresolved write exists. */
  readonly isFinished: () => boolean
  readonly signal: AbortSignal
  /** Present only for a business run; a UI run has no adapter, so no write permission to consult. */
  readonly sideEffectPolicy: SideEffectPolicy | null
  readonly businessRuntime: BusinessRuntime | null
  readonly ownedOperations: ReadonlySet<string>
  /**
   * Read through, never captured.
   *
   * The executor *replaces* its fact list as each response is normalized, so a captured array would
   * be the empty one from before the first response - which silently disabled the download exception
   * that depends on a current fact.
   */
  readonly businessFacts: () => readonly BusinessFact[]
  /** Records an intervention that changes what the page can do, gating later site verdicts. */
  readonly recordIntervention: (input: {
    kind: 'write-denied' | 'access-denied' | 'popup-denied' | 'network-denied'
    url: string
    method?: string
  }) => Promise<unknown>
  readonly appendEvent: (
    type: string,
    payload: Record<string, unknown>,
    extra?: { evidenceRefs?: string[] },
  ) => Promise<unknown>
  /** Marks a request as refused by policy, so its failure is not read as a page-side mutation. */
  readonly denyWrite: (request: Request) => void
  /** Credits an allowed write to the action that dispatched it. */
  readonly allowWrite: (request: Request, decision: SideEffectDecision) => void
  readonly countDeniedWrite: () => void
  readonly inspection: InspectionHost | null
  /** Declares a dimension the release cannot measure, so it is reported rather than absent. */
  readonly recordUnsupported: (
    dimension: string,
    reasonCode: string,
  ) => Promise<unknown> | undefined
}

export interface RunNetworkBoundary {
  /** Resolves once every decision seen so far is persisted. Await before a finish decision. */
  settle: () => Promise<void>
  /** The refusals this run's UI policy produced, in the order they happened. */
  readonly decisions: readonly NetworkDecisionRecord[]
}

/**
 * Install the boundary this run's kind requires, before anything navigates.
 *
 * The ordering is a requirement, not a convenience: installing after the first navigation leaves the
 * entry document and everything it loaded already dispatched, which is precisely the state the
 * boundary exists to prevent.
 */
export async function installRunNetworkBoundary(
  deps: RunNetworkBoundaryDeps,
): Promise<RunNetworkBoundary> {
  if (deps.uiScan) return installUiBoundary(deps, deps.uiScan)
  await installBusinessBoundary(deps)
  return { settle: async () => {}, decisions: [] }
}

async function installUiBoundary(
  deps: RunNetworkBoundaryDeps,
  contract: UiContractSnapshot,
): Promise<RunNetworkBoundary> {
  /**
   * The run's policy comes from its *persisted* contract, and the fixture list from server
   * configuration. The contract names the origins the caller declared; the configuration names the
   * local origins an operator vouched for. Neither can be widened by page content or model output.
   */
  const policy = createNetworkPolicy({
    entryUrl: contract.entryUrl,
    resourceOrigins: contract.access.resourceOrigins,
    dataOrigins: contract.access.dataOrigins,
    reachableOrigins: config.urlScan.trustedOrigins,
  })

  const decisions: NetworkDecisionRecord[] = []
  /**
   * Receipts are written on their own serialized tail.
   *
   * The session decides synchronously, deep inside Chromium's event loop, so persistence cannot be
   * awaited there without stalling the page. A tail gives the ordering that matters - the run's own
   * event sequence - while `settle()` is what a finish decision awaits, so no receipt lands after
   * the claim it belongs to.
   */
  let tail: Promise<unknown> = Promise.resolve()
  /**
   * The allowed requests, bounded.
   *
   * The plan retains every refusal and *summarises* allowed requests, because a page may dispatch
   * hundreds within its round budget and the record only has to be auditable. The summary is
   * per-origin and per-destination, so "the run did reach its entry document" and "it loaded its
   * stylesheet from the declared CDN" are both legible without a line per request.
   */
  const allowed = new Map<string, { origin: string; destination: string; count: number }>()
  const record = (decision: NetworkDecisionRecord) => {
    decisions.push(decision)
    if (decision.allow) {
      let origin = 'unparseable'
      try {
        origin = new URL(decision.url).origin
      } catch {
        /* a URL this process cannot parse keeps its own bucket rather than being dropped */
      }
      const key = `${origin}|${decision.destination}`
      const entry = allowed.get(key)
      if (entry) entry.count++
      else allowed.set(key, { origin, destination: decision.destination, count: 1 })
      return
    }
    tail = tail
      .then(async () => {
        await deps.recordIntervention({
          kind: 'network-denied',
          url: decision.url,
          method: decision.method,
        })
        await deps.appendEvent('network:decision', { ...decision })
        if (decision.destination === 'Document')
          await deps.inspection?.recordNavigationDenied({
            url: decision.url,
            reasonCode: decision.reasonCode,
          })
      })
      .catch(() => {})
  }

  await installUiNetworkSession({
    context: deps.context,
    page: deps.page,
    policy,
    onDecision: record,
    onOpenPage: (url) => {
      tail = tail.then(() => recordUnsupportedChannel(deps, url, 'new-window')).catch(() => {})
    },
    onWebSocket: (url) => {
      tail = tail.then(() => recordUnsupportedChannel(deps, url, 'websocket')).catch(() => {})
    },
  })

  await deps.appendEvent('network:policy', {
    policyRevision: policy.policyRevision,
    contractHash: contract.hash,
    entryOrigin: policy.entryOrigin,
    resourceOrigins: contract.access.resourceOrigins,
    dataOrigins: contract.access.dataOrigins,
  })

  // The dimensions this release declares rather than silently lacks. A page that needed one is
  // reported, and a check that depended on it cannot claim completion (plan 5.2).
  for (const dimension of contract.unsupportedCapabilities)
    await deps.recordUnsupported(dimension, 'unsupported-release-capability')

  return {
    settle: async () => {
      await tail
      if (allowed.size)
        await deps.appendEvent('network:allowed-summary', {
          policyRevision: policy.policyRevision,
          entries: [...allowed.values()],
          total: [...allowed.values()].reduce((sum, entry) => sum + entry.count, 0),
        })
    },
    decisions,
  }
}

async function recordUnsupportedChannel(
  deps: RunNetworkBoundaryDeps,
  url: string,
  dimension: string,
): Promise<void> {
  await deps.recordUnsupported(dimension, 'unsupported-channel')
  await deps.recordIntervention({ kind: 'access-denied', url })
  await deps.appendEvent('network:channel-denied', { url, dimension })
}

async function installBusinessBoundary(deps: RunNetworkBoundaryDeps): Promise<void> {
  const sideEffectPolicy = deps.sideEffectPolicy
  // A business boundary without a policy would refuse nothing and allow everything, so its absence
  // is a construction error rather than a state to handle.
  if (!sideEffectPolicy)
    throw new Error(
      'A business run requires its side-effect policy before the boundary is installed.',
    )
  await deps.context.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    let origin = ''
    try {
      origin = new URL(url).origin
    } catch {
      origin = ''
    }
    // Every write is judged by the run's side-effect policy: what the adapter says the request
    // is, against the contract's budget. Button wording and action intent never grant a write.
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    if (isWrite) {
      if (deps.isFinished() || deps.signal.aborted) {
        deps.denyWrite(request)
        await route.abort('blockedbyclient')
        return
      }
      const decision = sideEffectPolicy.authorize({
        url,
        method: request.method(),
        origin,
      })
      if (decision.kind === 'deny') {
        deps.denyWrite(request)
        deps.countDeniedWrite()
        await deps.recordIntervention({
          kind: 'write-denied',
          url,
          method: request.method(),
        })
        await deps.appendEvent('write:denied', {
          reason: decision.reason,
          method: request.method(),
          url,
          intent: decision.intent.kind,
        })
        await route.abort('blockedbyclient')
        return
      }
      deps.allowWrite(request, decision)
    }
    if (businessRequestAllowed(deps, request, url, origin)) {
      await route.continue()
      return
    }
    deps.denyWrite(request)
    await deps.recordIntervention({ kind: 'access-denied', url, method: request.method() })
    await deps.appendEvent('access:denied', { reason: 'outside-environment' })
    await route.abort()
  })
  deps.context.on('page', (opened) => {
    if (opened === deps.page) return
    void deps
      .recordIntervention({ kind: 'popup-denied', url: opened.url() })
      .then(() => opened.close())
      .catch(() => {})
  })
}

/** The business boundary's allow rule, unchanged from the executor's original route handler. */
function businessRequestAllowed(
  deps: RunNetworkBoundaryDeps,
  request: Request,
  url: string,
  origin: string,
): boolean {
  if (!isAllowedPageUrl(url, deps.entryUrl)) return false
  if (!request.isNavigationRequest()) return true
  if (isAllowedNavigationUrl(url, deps.entryUrl)) return true
  if (!deps.businessRuntime) return false
  return isAllowedBusinessDownload(
    { url, method: request.method(), origin },
    deps.businessRuntime,
    (id) => deps.ownedOperations.has(id),
    (id) => latestFactForOperation(deps.businessFacts(), id),
  )
}
