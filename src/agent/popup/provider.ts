import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { type PopupAccountOwner } from './account-owner.ts'
import { openCampaignSession } from '../../../evaluation/support/campaign-session.ts'
import { verifyProductJevQuote } from '../exploration/integration/product-jev.ts'
import { parseStrictJson } from '../decisions/jev-provider/strict-json.ts'
import { readUsage } from '../decisions/jev-provider/response.ts'
import {
  choices,
  hash,
  validateSuggestion,
  wireQuestion,
  type PopupDecision,
  type PopupQuestion,
} from './contract.ts'

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason ?? Error('popup-cancelled'))
    signal.addEventListener('abort', aborted, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', aborted)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', aborted)
        reject(error)
      },
    )
  })
}
export function popupConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const directory = env.POPUP_JEV_ACCOUNT_DIRECTORY,
    limitUsd = Number(env.POPUP_JEV_LIMIT_USD)
  if (
    env.EXECUTION_POPUP_JEV !== '1' ||
    !directory ||
    !Number.isFinite(limitUsd) ||
    limitUsd <= 0 ||
    !env.POPUP_JEV_API_KEY ||
    !existsSync(resolve(directory, 'campaign.db')) ||
    !existsSync(resolve(directory, 'campaign-id.json'))
  )
    return undefined
  return { directory: resolve(directory), limitUsd, key: () => env.POPUP_JEV_API_KEY! }
}
export function normalizePopupResponse(raw: any, packet: PopupQuestion) {
  if (
    raw?.provider !== 'TypeSafe' ||
    raw.model !== 'typesafe/jev-1.13-20260917' ||
    typeof raw.id !== 'string' ||
    Object.keys(raw.answers ?? {}).join() !== 'popup'
  )
    throw Error('popup-provider-identity-or-protocol')
  const a = raw.answers.popup,
    ids = Object.keys(choices(packet)).sort()
  if (
    a?.type !== 'choice' ||
    !a.probabilities ||
    Object.keys(a.probabilities).sort().join() !== ids.join() ||
    Object.values(a.probabilities).some(
      (v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1,
    ) ||
    Math.abs(
      Object.values(a.probabilities).reduce<number>((sum, v) => sum + (v as number), 0) - 1,
    ) > 0.001 ||
    !Object.hasOwn(a.probabilities, a.choice) ||
    Object.values(a.probabilities).some((v) => (v as number) > a.probabilities[a.choice] + 1e-12)
  )
    throw Error('popup-invalid-distribution')
  return validateSuggestion(packet, {
    binding: packet.binding,
    choice: a.choice,
    confidence: a.confidence,
  })
}
export function createPopupProvider(options: {
  configuration: NonNullable<ReturnType<typeof popupConfiguration>>
  runId: string
  accountOwner?: PopupAccountOwner
  countCall(): Promise<void>
  timeRemaining(): number
  save(kind: string, body: string): Promise<string>
  emit(payload: Record<string, unknown>, refs: string[]): Promise<void>
  http?: typeof fetch
  quote?: (signal: AbortSignal) => Promise<void>
}): PopupDecision {
  let calls = 0,
    stopped = false
  return async (packet, signal) => {
    signal.throwIfAborted()
    if (stopped || ++calls > 6 || options.timeRemaining() < 2000)
      throw Error('popup-decision-budget')
    const wire = wireQuestion(packet),
      c = options.configuration
    const account = JSON.parse(readFileSync(resolve(c.directory, 'campaign-id.json'), 'utf8'))
    const db = new DatabaseSync(resolve(c.directory, 'campaign.db'), { readOnly: true })
    try {
      const row = db
        .prepare('SELECT limit_usd FROM campaigns WHERE campaign_id=?')
        .get(account.campaignId)
      const stop = db
        .prepare('SELECT COUNT(*) AS count FROM ledger_stop_events WHERE campaign_id=?')
        .get(account.campaignId)
      const unknown = db
        .prepare(
          "SELECT COUNT(*) AS count FROM ledger_requests WHERE campaign_id=? AND status='unknown'",
        )
        .get(account.campaignId)
      if (
        !row ||
        Number(row.limit_usd) !== c.limitUsd ||
        Number(stop?.count) ||
        Number(unknown?.count)
      )
        throw Error('popup-account-not-approved-or-stopped')
    } finally {
      db.close()
    }
    await (options.quote ?? verifyProductJevQuote)(signal)
    signal.throwIfAborted()
    const borrowed = options.accountOwner ? await options.accountOwner.acquire(c) : undefined
    const session =
      borrowed?.session ?? (await openCampaignSession(c.directory, String(c.limitUsd)))
    const id = randomUUID(),
      refs: string[] = [],
      cancelled = new AbortController()
    const combined = AbortSignal.any([
      signal,
      cancelled.signal,
      AbortSignal.timeout(Math.min(8000, options.timeRemaining())),
    ])
    let unwatch = () => {},
      sent = false,
      held = false,
      cost: number | null = null,
      problem = false
    try {
      const state = await session.ledger.stopState()
      if (session.campaignId !== account.campaignId || state.epoch || state.unknownCount)
        throw Error('popup-account-stopped')
      unwatch = session.ledger.watchStop(state.epoch, () =>
        cancelled.abort(Error('popup-account-stopped')),
      )
      refs.push(await options.save('popup-jev-request', wire))
      const reserve = await session.ledger.reserve({
        requestId: id,
        runId: options.runId,
        phase: 'popup-product',
        model: 'typesafe/jev-1.13',
        provider: 'TypeSafe',
        reservedUsd: 0.003,
        priceSource: 'TypeSafe <=0.042 USD/M input; <=32000 prompt; reserve 0.003',
        stopEpoch: state.epoch,
      })
      if (!reserve.ok) throw Error('popup-account-refused')
      held = true
      await options.countCall()
      combined.throwIfAborted()
      const key = c.key()
      let request!: Promise<Response>
      const dispatched = await session.ledger.dispatch(id, state.epoch, () => {
        if (combined.aborted) return false
        sent = true
        request = (options.http ?? fetch)('https://openrouter.ai/api/alpha/decisions', {
          method: 'POST',
          redirect: 'error',
          signal: combined,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: wire,
        })
        void request.catch(() => {})
        return true
      })
      if (!dispatched.ok) throw Error('popup-dispatch-refused')
      const response = await abortable(request, combined)
      if (!response.ok || !response.body) throw Error('popup-provider-http')
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = []
      let bytes = 0
      try {
        while (true) {
          combined.throwIfAborted()
          const { value, done } = await abortable(reader.read(), combined)
          if (done) break
          bytes += value.length
          if (bytes > 65536) throw Error('popup-provider-response-bound')
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => {})
      }
      const body = Buffer.concat(chunks).toString('utf8')
      refs.push(await options.save('popup-jev-response', body))
      const raw = parseStrictJson(body),
        usage = readUsage(raw)
      if (usage.status === 'known') cost = usage.costUsd ?? null
      if (cost === null) throw Error('popup-provider-unknown-cost')
      const suggestion = normalizePopupResponse(raw, packet)
      const after = await session.ledger.stopState()
      if (after.epoch !== state.epoch || after.unknownCount) throw Error('popup-account-stopped')
      combined.throwIfAborted()
      return suggestion
    } catch {
      problem = true
      stopped = true
      throw Error('popup-provider-unavailable')
    } finally {
      try {
        if (sent) {
          if (cost === null) await session.ledger.markUnknown(id, 'popup-usage-unavailable')
          else await session.ledger.settle(id, cost)
        } else if (held) await session.ledger.release(id, 'not-sent')
        await options.emit(
          {
            requestId: id,
            campaignId: session.campaignId,
            packetHash: hash(packet),
            wireHash: hash(wire),
            dispatched: sent,
            actualUsd: cost,
            error: problem ? 'popup-provider-unavailable' : null,
          },
          refs,
        )
        if (sent && (cost === null || (await session.ledger.spending()).exceeded)) {
          stopped = true
          throw Error('popup-account-stopped')
        }
      } finally {
        unwatch()
        if (borrowed) borrowed.release()
        else await session.close()
      }
    }
  }
}
