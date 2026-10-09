import { launchBrowser } from '../execution/browser.ts'
import { createEvidenceIntegrity } from '../execution/evidence-integrity.ts'
import { installUiNetworkSession } from '../execution/network/session.ts'
import { appendEvent, createRun, updateRunStatus } from '../execution/run-manager.ts'
import { createNetworkPolicy } from '../inspection/network-policy.ts'
import { createImageBindingExperiment } from './image-bindings.ts'

/** A read-only, single-page diagnostic host. No agent, R0 completion contract or registry changes. */
export async function openImageBindingExperiment(options: {
  entryUrl: string
  resourceOrigins?: readonly string[]
  /** Operator-configured local fixture origins, never granted by a page or candidate material. */
  trustedOrigins: readonly string[]
}) {
  const url = new URL(options.entryUrl)
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw Error('invalid-entry-url')
  const resourceOrigins = options.resourceOrigins ?? []
  if (
    resourceOrigins.length > 8 ||
    resourceOrigins.some((value) => {
      try {
        const origin = new URL(value)
        return origin.origin !== value || value.includes('*') || !/^https?:$/.test(origin.protocol)
      } catch {
        return true
      }
    })
  )
    throw Error('invalid-resource-origins')
  const run = await createRun({
    goal: 'Independent image binding experiment; no acceptance claim',
    environmentId: 'image-binding-experiment',
    entryUrl: url.href,
  })
  const worker = await launchBrowser({
    viewport: run.spec.viewport,
    uiScan: true,
    collectImageResources: true,
  })
  const integrity = createEvidenceIntegrity()
  let eventTail: Promise<unknown> = Promise.resolve()
  const record = (type: string, payload: Record<string, unknown>) => {
    eventTail = eventTail.then(() => appendEvent(run.id, type, payload))
    // Avoid an unhandled rejection while retaining it for settle/close to report.
    void eventTail.catch(() => {})
  }
  const session = createImageBindingExperiment({
    page: worker.page,
    runId: run.id,
    evidenceIntegrity: integrity.snapshot,
    settleEvidence: () => eventTail,
  })
  let network: Awaited<ReturnType<typeof installUiNetworkSession>> | undefined
  let closed = false
  async function close() {
    if (closed) return
    closed = true
    try {
      await session.close()
      network?.seal()
      await network?.settle()
    } finally {
      await worker.close()
    }
    await eventTail
    // End the diagnostic owner explicitly; do not manufacture R0 scope-covered/finish evidence.
    await updateRunStatus(run.id, 'cancelled', { stopReason: 'cancelled' })
    await appendEvent(run.id, 'run:completed', {
      status: 'cancelled',
      stopReason: 'cancelled',
      experiment: 'image-bindings-1',
      acceptanceClaim: false,
    })
  }
  try {
    network = await installUiNetworkSession({
      page: worker.page,
      context: worker.context,
      policy: createNetworkPolicy({
        entryUrl: url.href,
        resourceOrigins,
        dataOrigins: [],
        reachableOrigins: options.trustedOrigins,
      }),
      scope: { maxPages: 1, maxDepth: 0 },
      onDecision: (decision) => {
        if (!decision.allow && !decision.finalizationShutdown)
          integrity.intervene({
            kind: 'network-denied',
            url: decision.url,
            method: decision.method,
          })
        record('network:decision', { ...decision, experiment: 'image-bindings-1' })
      },
      onOpenPage: (target) => {
        integrity.intervene({ kind: 'popup-denied', url: target })
        record('image-bindings:intervention', { reason: 'popup', url: target })
      },
      onWebSocket: (target) => {
        integrity.intervene({ kind: 'network-denied', url: target })
        record('image-bindings:intervention', { reason: 'websocket', url: target })
      },
    })
    await worker.page.goto(url.href, { waitUntil: 'load', timeout: 15000 })
    await eventTail
    await appendEvent(run.id, 'image-bindings:session-started', {
      entryUrl: url.href,
      mode: 'read-only-experiment',
      modelCalls: 0,
    })
    return {
      runId: run.id,
      observe: async () => {
        await eventTail
        return session.observe()
      },
      diagnose: async (input: unknown) => {
        await eventTail
        return session.diagnose(input)
      },
      check: async (input: unknown) => {
        await eventTail
        return session.check(input)
      },
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
