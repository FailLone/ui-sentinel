import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { CampaignLedger, ReserveInput } from '../../evaluation/support/campaign-ledger.ts'
import { POLICY } from './policy.ts'
export function createBatch(
  ledger: CampaignLedger,
  output: string,
  verifyChild: (child: string, parent: string) => Promise<boolean>,
) {
  const controller = new AbortController(),
    context = new AsyncLocalStorage<ReserveInput>()
  const requests = new Map<string, ReserveInput & { row: string }>()
  let active:
    | { id: string; parent?: string; deadline: number; bound: Promise<void>; bind: () => void }
    | undefined
  let stopped = ''
  const log = (data: unknown) =>
    appendFileSync(join(output, 'bindings.jsonl'), JSON.stringify(data) + '\n', { flush: true })
  const stop = (reason: string) => {
    if (stopped) return
    stopped = reason
    writeFileSync(
      join(output, 'stop.json'),
      JSON.stringify({ reason, at: new Date().toISOString() }),
      { flag: 'wx', flush: true },
    )
    controller.abort(Error(reason))
  }
  const timer = setTimeout(() => stop('batch-time-limit'), POLICY.batchMs)
  const guard = () => {
    if (stopped || !active || Date.now() >= active.deadline) {
      if (!stopped) stop('row-time-or-admission-limit')
      throw Error('batch-stopped')
    }
  }
  const adapter: CampaignLedger = {
    ...ledger,
    watchStop(epoch, listener) {
      const notify = () => listener(stopped)
      controller.signal.addEventListener('abort', notify, { once: true })
      const unwatch = ledger.watchStop(epoch, stop)
      if (controller.signal.aborted) notify()
      return () => {
        unwatch()
        controller.signal.removeEventListener('abort', notify)
      }
    },
    async reserve(input) {
      guard()
      const row = active!
      if (!row.parent)
        await Promise.race([
          row.bound,
          new Promise((_, reject) => {
            const t = setTimeout(() => reject(Error('parent-binding-timeout')), 5000)
            t.unref()
          }),
        ])
      guard()
      const jev = input.model === POLICY.jev.model,
        policy = jev ? POLICY.jev : POLICY.main
      const owner = jev ? input.runId : row.parent!
      if (
        active !== row ||
        input.model !== policy.model ||
        input.provider !== policy.provider ||
        input.reservedUsd !== policy.reserveUsd ||
        (!jev && input.runId !== row.id) ||
        (jev && !(await verifyChild(owner, row.parent!)))
      ) {
        stop('request-identity-or-owner-mismatch')
        throw Error('request-not-authorized')
      }
      guard()
      const all = [...requests.values()].filter((r) => r.model === input.model)
      if (
        all.length >= (jev ? POLICY.jevRequests : POLICY.mainRequests) ||
        all.filter((r) => r.row === row.id).length >=
          (jev ? POLICY.row.jevRequests : POLICY.row.mainRequests) ||
        requests.has(input.requestId)
      ) {
        stop('request-cap')
        return { ok: false, reason: 'campaign-stopped' }
      }
      // Count reservations synchronously before the underlying asynchronous SQLite transaction.
      const bound = { ...input, runId: owner, row: row.id }
      requests.set(input.requestId, bound)
      log({ stage: 'reserve', parent: row.parent, ...bound })
      const result = await ledger.reserve(bound)
      if (!result.ok) stop('fee-reservation-refused')
      return result
    },
    dispatch(id, epoch, begin) {
      guard()
      return ledger.dispatch(id, epoch, () => {
        guard()
        const request = requests.get(id)
        if (!request || request.row !== active!.id) {
          stop('dispatch-binding')
          return false
        }
        return context.run(request, begin)
      })
    },
    async settle(id, cost) {
      await ledger.settle(id, cost)
      if (cost > (requests.get(id)?.reservedUsd ?? 0) || (await ledger.spending()).exceeded)
        stop('fee-overrun')
    },
    async markUnknown(id, reason) {
      await ledger.markUnknown(id, reason)
      stop('new-unknown')
    },
  }
  return {
    ledger: adapter,
    signal: controller.signal,
    stop,
    guard,
    begin(id: string) {
      if (active || stopped) throw Error('batch-not-ready')
      let bind!: () => void
      const bound = new Promise<void>((resolve) => {
        bind = resolve
      })
      active = { id, deadline: Date.now() + POLICY.row.timeoutMs, bound, bind }
    },
    bind(parent: string) {
      guard()
      if (active!.parent) throw Error('duplicate-parent')
      active!.parent = parent
      active!.bind()
    },
    end() {
      active = undefined
    },
    close() {
      clearTimeout(timer)
    },
    status: () => ({ stopped, requests: [...requests.values()] }),
    estimate(body: any) {
      guard()
      if (
        body.model !== POLICY.main.model ||
        body.provider?.only?.join() !== POLICY.main.provider ||
        body.provider.allow_fallbacks !== false ||
        body.max_tokens !== POLICY.main.outputTokens ||
        Buffer.byteLength(JSON.stringify(body)) > 524288 ||
        /data:image\/|image_url/.test(JSON.stringify(body.messages))
      ) {
        stop('main-wire-outside-policy')
        throw Error('main-wire-outside-policy')
      }
      return POLICY.main.reserveUsd
    },
    auditWire(url: string, body: string) {
      guard()
      const request = context.getStore(),
        wire = JSON.parse(body)
      const jev = request?.model === POLICY.jev.model
      if (
        !request ||
        wire.model !== request.model ||
        wire.provider?.only?.join() !== request.provider ||
        wire.provider.allow_fallbacks !== false ||
        url !==
          (jev
            ? 'https://openrouter.ai/api/alpha/decisions'
            : 'https://openrouter.ai/api/v1/chat/completions') ||
        (jev &&
          (Buffer.byteLength(body) > 32768 || Object.keys(wire.questions ?? {}).join() !== 'popup'))
      ) {
        stop('wire-binding-or-permission')
        throw Error('wire-binding-or-permission')
      }
      log({
        stage: 'wire',
        requestId: request.requestId,
        owner: request.runId,
        at: new Date().toISOString(),
        hash: createHash('sha256').update(body).digest('hex'),
      })
    },
  }
}
