import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CampaignLedger, ReserveInput } from '../../evaluation/support/campaign-ledger.ts'
import type { GatewayLedger } from '../../evaluation/support/model-gateway.ts'
import { POLICY, AGENT, type Mode } from './manifest.ts'
import {
  digest,
  onlinePriority,
  type PublicFrame,
} from '../../src/agent/exploration/integration/host.ts'
import { compileFrame, requestFor } from '../../src/agent/exploration/integration/jev.ts'
import { createJevTransport, type HttpFetch } from '../../src/agent/decisions/jev-provider/http.ts'
import { DEFAULT_PROFILE, sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import { normalizeResponse } from '../../src/agent/decisions/jev-provider/response.ts'
import { rankCandidates } from '../../src/agent/decisions/exploration/ranking.ts'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

const compileOnline: typeof compileFrame = (request, profile, maxBytes) => {
  const c = compileFrame(request, profile, maxBytes),
    body = JSON.parse(c.wire)
  body.provider.only = ['TypeSafe']
  const wire = JSON.stringify(body),
    byteLength = Buffer.byteLength(wire)
  if (byteLength > Math.min(maxBytes ?? POLICY.maxFrameBytes, POLICY.maxFrameBytes))
    throw Error('online-wire-bound')
  return { ...c, wire, byteLength, wireDigest: sha256(wire) }
}

export interface BatchClock {
  now(): number
  schedule(callback: () => void, delayMs: number): () => void
}
const systemClock: BatchClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    timer.unref()
    return () => clearTimeout(timer)
  },
}
export type BatchRow = {
  id: string
  scenario: string
  mode: Mode
  maxAgentRequests: number
  maxJevRequests: number
}
export function createBatch(
  ledger: CampaignLedger,
  manifest: { priceSourceSha: string },
  directory: string,
  clock: BatchClock = systemClock,
  continuationGuard: () => void = () => {},
  limits = {
    mainRequests: Number(POLICY.agent.batchRequests),
    jevRequests: Number(POLICY.jev.batchRequests),
    windowMs: Number(POLICY.batchWindowMs),
  },
) {
  const stopPath = join(directory, 'stop.json')
  let stopped = existsSync(stopPath) ? 'previously-stopped' : '',
    active: any = null
  const requests = new Map<string, ReserveInput>()
  const started = clock.now()
  const controller = new AbortController()
  const dispatchContext = new AsyncLocalStorage<ReserveInput>()
  const late = new Set<Promise<any>>()
  const log = (value: unknown) =>
    appendFileSync(join(directory, 'bindings.jsonl'), JSON.stringify(value) + '\n', {
      mode: 0o600,
      flush: true,
    })
  const stop = (reason: string) => {
    if (!stopped) {
      stopped = reason
      writeFileSync(
        stopPath,
        JSON.stringify({ reason, at: new Date().toISOString(), manifestHash: digest(manifest) }) +
          '\n',
        { flag: 'wx', flush: true },
      )
    }
    controller.abort(new Error(stopped))
  }
  const guard = () => {
    try {
      continuationGuard()
    } catch (error) {
      stop('continuation-lineage-changed')
      throw error
    }
    if (stopped || existsSync(stopPath)) throw Error('online-batch-stopped')
    if (clock.now() - started >= limits.windowMs) {
      stop('batch-window')
      throw Error('online-batch-stopped')
    }
  }
  const clearWindowTimer = clock.schedule(() => stop('batch-window'), limits.windowMs)
  const adapter: GatewayLedger = {
    stopState: () => ledger.stopState(),
    watchStop: (epoch, listener) => {
      const onStop = () => listener(stopped)
      controller.signal.addEventListener('abort', onStop, { once: true })
      const unwatch = ledger.watchStop(epoch, stop)
      if (controller.signal.aborted) onStop()
      return () => {
        unwatch()
        controller.signal.removeEventListener('abort', onStop)
      }
    },
    async reserve(input) {
      guard()
      if (!active || active.runId !== input.runId) throw Error('parent-run-binding')
      const jev = input.model === POLICY.jev.model
      if (!jev && input.model !== AGENT) {
        stop('unapproved-model-or-vision')
        throw Error('model-not-authorized')
      }
      const limit = jev ? active.row.maxJevRequests : active.row.maxAgentRequests
      const count = [...requests.values()].filter(
        (r) => r.runId === input.runId && r.model === input.model,
      ).length
      const all = [...requests.values()].filter((r) => r.model === input.model).length
      if (count >= limit || all >= (jev ? limits.jevRequests : limits.mainRequests)) {
        stop('request-limit')
        return { ok: false, reason: 'campaign-stopped' }
      }
      if (
        input.provider !== (jev ? 'TypeSafe' : 'Wafer') ||
        input.reservedUsd !== (jev ? POLICY.jev.reserveUsd : POLICY.agent.reserveUsd)
      )
        throw Error('quote-or-provider-mismatch')
      requests.set(input.requestId, input)
      log({
        stage: 'reserve-binding',
        manifestHash: digest(manifest),
        row: active.row.id,
        parentRun: input.runId,
        ...input,
      })
      return ledger.reserve(input)
    },
    async dispatch(id, epoch, begin) {
      guard()
      return ledger.dispatch(id, epoch, () => {
        guard()
        const binding = requests.get(id)
        if (!binding) throw Error('dispatch-without-reservation-binding')
        return dispatchContext.run(binding, begin)
      })
    },
    async settle(id, cost) {
      await ledger.settle(id, cost)
      if (cost > (requests.get(id)?.reservedUsd ?? 0) || (await ledger.spending()).exceeded)
        stop('cost-overrun')
    },
    async markUnknown(id, reason) {
      await ledger.markUnknown(id, reason)
      stop('cost-unknown')
    },
    release: (id, reason) => ledger.release(id, reason),
  }
  return {
    ledger: adapter,
    guard,
    stop,
    signal: controller.signal,
    log,
    auditWire(url: string, body: string) {
      const request = dispatchContext.getStore()
      if (!request) throw Error('wire-outside-ledger-dispatch')
      const wire = JSON.parse(body)
      const state = wire.state ?? wire.messages
      log({
        stage: 'actual-wire-binding',
        requestId: request.requestId,
        parentRun: request.runId,
        model: request.model,
        manifestHash: digest(manifest),
        wireHash: sha256(body),
        fullStateHash: digest(state),
        url,
        state,
      })
    },
    dispose() {
      clearWindowTimer()
    },
    activate(row: BatchRow, runId: string, origin: string) {
      guard()
      if (active) throw Error('run-already-active')
      active = { row, runId, origin, jevBusy: false }
      log({ stage: 'run-binding', row, runId, origin, manifestHash: digest(manifest) })
    },
    end() {
      active = null
    },
    async drain() {
      await Promise.race([
        Promise.allSettled([...late]),
        new Promise((r) => {
          const t = setTimeout(r, 20000)
          t.unref()
        }),
      ])
    },
    status: () => ({ stopped, requests: requests.size, active: active?.runId ?? null }),
    estimate(body: any) {
      guard()
      if (
        body.model !== AGENT ||
        Buffer.byteLength(JSON.stringify(body)) > POLICY.maxAgentBytes ||
        body.provider?.only?.[0] !== 'Wafer' ||
        body.provider?.allow_fallbacks !== false ||
        body.max_tokens !== 4096 ||
        JSON.stringify(body.messages).includes('data:image/')
      ) {
        stop('agent-wire-outside-manifest')
        throw Error('wire-outside-manifest')
      }
      return POLICY.agent.reserveUsd
    },
    async score(
      frame: PublicFrame,
      runId: string,
      signal: AbortSignal,
      key: string,
      upstream: HttpFetch,
    ) {
      guard()
      const row = active
      if (!row || row.runId !== runId || row.row.mode !== 'jev' || row.jevBusy)
        throw Error('dynamic-frame-run-binding')
      const input = frame.input
      if (!onlinePriority(frame).ambiguity) throw Error('program-sufficient-no-jev')
      if (
        input.state.url !== row.origin + '/' ||
        frame.facts.observation.url !== input.state.url ||
        input.task.goal !== frame.facts.goal ||
        input.task.goal !==
          (row.row.scenario === 'semantic'
            ? 'After clicking "Reveal", show text "Ready".'
            : 'Check this page and the UI interactions within the permitted scope, and report grounded problems and unverified scope.')
      )
        throw Error('frame-scope-binding')
      if (JSON.stringify(frame).includes(key)) throw Error('sensitive-frame')
      for (const c of input.candidates) {
        const item = frame.facts.inspectionScope.candidates.find((x: any) => x.itemId === c.id)
        const check = frame.facts.inspectionScope.checks.find((x: any) => x.itemId === c.id)?.checks
        if (
          !item ||
          item.category !== 'local-interaction' ||
          check?.sourceReview?.state !== 'sealed' ||
          check?.generic?.state !== 'pending'
        )
          throw Error('frame-candidate-source')
      }
      const compiled = compileOnline(requestFor(frame)),
        id = randomUUID(),
        hash = digest(frame)
      const currentEpoch = (await ledger.stopState()).epoch
      const combined = AbortSignal.any([
        signal,
        controller.signal,
        AbortSignal.timeout(POLICY.modelMs),
      ])
      const profile = { ...DEFAULT_PROFILE, readinessConfidence: POLICY.jevConfidence }
      let sent = false,
        event: any,
        responseCost: number | null = null
      let rawPromise: Promise<any> | undefined
      row.jevBusy = true
      // This is a constrained live frame, never a wildcard substitution for the old static authorization.
      log({
        stage: 'frame',
        id,
        row: row.row.id,
        parentRun: runId,
        manifestHash: digest(manifest),
        frameHash: hash,
        wireHash: compiled.wireDigest,
        frame,
      })
      const handoff = (reason: string) => ({
        binding: frame.binding,
        packetHash: hash,
        kind: 'handoff' as const,
        orderedIds: [],
        reason,
      })
      try {
        const transport = createJevTransport({
          profile,
          apiKey: key,
          compile: compileOnline,
          onEvent(e) {
            event = e.stage === 'response' ? e : event
            log({ channel: 'jev-audit', parentRun: runId, ...e })
          },
          fetch: async (url, init) => {
            const reserved = await adapter.reserve({
              requestId: id,
              runId,
              phase: row.row.id,
              model: POLICY.jev.model,
              provider: 'TypeSafe',
              reservedUsd: 0.003,
              priceSource: manifest.priceSourceSha,
              stopEpoch: currentEpoch,
            })
            if (!reserved.ok) throw Error('shared-budget-refused')
            let pending!: Promise<Response>
            const result = await adapter.dispatch(id, currentEpoch, () => {
              if (combined.aborted || active !== row) return false
              sent = true
              pending = upstream(url, init)
              void pending.catch(() => {})
              return true
            })
            if (!result.ok) {
              await adapter.release(id, 'not-sent')
              throw Error('dispatch-stopped')
            }
            // Preserve a late usage receipt without allowing it to revive advice or the batch.
            rawPromise = pending
              .then(async (r) => {
                const raw = (await r.clone().json()) as any
                if (JSON.stringify(raw).includes(key)) return
                if (Number.isFinite(raw.usage?.cost) && raw.usage.cost >= 0) {
                  responseCost = raw.usage.cost
                  log({ stage: 'jev-usage-body', id, parentRun: runId, raw })
                  const entry = (await ledger.entries()).find((e) => e.requestId === id)
                  if (
                    entry?.status === 'unknown' &&
                    raw.model === profile.expectedModel &&
                    raw.provider === profile.provider &&
                    raw.id
                  )
                    await ledger.reconcile({
                      requestId: id,
                      generationId: raw.id,
                      model: POLICY.jev.model,
                      provider: 'TypeSafe',
                      actualUsd: raw.usage.cost,
                      evidence: raw,
                    })
                }
              })
              .catch(() => {})
            late.add(rawPromise)
            void rawPromise.finally(() => late.delete(rawPromise!))
            return pending
          },
        })
        const envelope = await transport(requestFor(frame), {
          attemptId: id,
          requestDigest: compiled.requestDigest,
          signal: combined,
          deadline: Date.now() + POLICY.modelMs,
        })
        if (rawPromise) await rawPromise
        if (sent)
          await (responseCost === null
            ? adapter.markUnknown(id, 'usage-unavailable')
            : adapter.settle(id, responseCost))
        combined.throwIfAborted()
        guard()
        if (active !== row || !event?.responseText) return handoff('expired-run')
        const receipt = normalizeResponse(JSON.parse(event.responseText), compiled, profile)
        if (digest(receipt) !== digest((envelope as any).receipt))
          throw Error('raw-receipt-mismatch')
        if (receipt.kind === 'handoff') return handoff(receipt.reasonCode)
        return {
          binding: frame.binding,
          packetHash: hash,
          kind: 'scores' as const,
          orderedIds: [...rankCandidates(input, { scores: receipt.scores }).orderedCandidateIds],
        }
      } catch {
        if (sent) {
          if (responseCost === null) await adapter.markUnknown(id, 'cancelled-or-invalid-usage')
          else await adapter.settle(id, responseCost)
        } else if (requests.has(id)) await adapter.release(id, 'not-dispatched')
        stop('jev-request-failed')
        return handoff('online-request-stopped')
      } finally {
        row.jevBusy = false
      }
    },
  }
}
