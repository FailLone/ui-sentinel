import { launchBrowser } from '../execution/browser.ts'
import { createEvidenceIntegrity } from '../execution/evidence-integrity.ts'
import { installUiNetworkSession } from '../execution/network/session.ts'
import { appendEvent, createRun, updateRunStatus } from '../execution/run-manager.ts'
import { createNetworkPolicy } from '../inspection/network-policy.ts'
import { createRulesBatch2Experiment } from './rules-batch2.ts'

/** A read-only, single-page diagnostic host. No agent, R0 completion contract or registry changes. */
export async function openRulesBatch2Experiment(options: {
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
    goal: 'Independent rules batch2 experiment; no acceptance claim',
    environmentId: 'rules-batch2-experiment',
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
  const session = createRulesBatch2Experiment({
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
      experiment: 'rules-batch2-1',
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
        record('network:decision', { ...decision, experiment: 'rules-batch2-1' })
      },
      onOpenPage: (target) => {
        integrity.intervene({ kind: 'popup-denied', url: target })
        record('rules-batch2:intervention', { reason: 'popup', url: target })
      },
      onWebSocket: (target) => {
        integrity.intervene({ kind: 'network-denied', url: target })
        record('rules-batch2:intervention', { reason: 'websocket', url: target })
      },
    })
    await worker.page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await eventTail
    await appendEvent(run.id, 'rules-batch2:session-started', {
      entryUrl: url.href,
      mode: 'read-only-experiment',
      modelCalls: 0,
    })
    return {
      runId: run.id,
      capture: async (input?: unknown) => {
        await eventTail
        return session.capture(input)
      },
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
