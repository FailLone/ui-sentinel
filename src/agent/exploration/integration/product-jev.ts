import { DatabaseSync } from 'node:sqlite'
/** Explicit product opt-in, using the existing durable campaign account, not a second inspection ledger. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { openCampaignSession } from '../../../../evaluation/support/campaign-session.ts'
import {
  createJevTransport,
  type ProviderEvent,
  type HttpFetch,
} from '../../decisions/jev-provider/http.ts'
import { DEFAULT_PROFILE } from '../../decisions/jev-provider/profile.ts'
import { normalizeResponse } from '../../decisions/jev-provider/response.ts'
import { rankCandidates } from '../../decisions/exploration/ranking.ts'
import { compileFrame, requestFor } from './jev.ts'
import { digest, onlinePriority, type Score } from './host.ts'

/** Same bounded frame, with an explicit provider allowlist as well as no fallback. */
export const compileProductFrame: typeof compileFrame = (request, profile, maxBytes) => {
  const compiled = compileFrame(request, profile, maxBytes)
  const body = JSON.parse(compiled.wire)
  body.provider.only = ['TypeSafe']
  const wire = JSON.stringify(body),
    byteLength = Buffer.byteLength(wire)
  if (byteLength > Math.min(maxBytes ?? 32768, 32768)) throw Error('r1-jev-frame-bound')
  return {
    ...compiled,
    wire,
    byteLength,
    wireDigest: createHash('sha256').update(wire).digest('hex'),
  }
}
export function productJevConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const directory = env.R1_JEV_ACCOUNT_DIRECTORY,
    limit = Number(env.R1_JEV_LIMIT_USD)
  if (
    env.EXECUTION_R1_JEV !== '1' ||
    !directory ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    !env.R1_JEV_API_KEY
  )
    return undefined
  // No automatic account creation/reset. Deployment must explicitly supply an existing account.
  if (
    !existsSync(resolve(directory, 'campaign.db')) ||
    !existsSync(resolve(directory, 'campaign-id.json'))
  )
    return undefined
  return { directory: resolve(directory), limitUsd: limit, key: () => env.R1_JEV_API_KEY! }
}
export function createProductJevScore(options: {
  runId: string
  countCall(): Promise<void>
  timeRemaining(): number
  save(kind: string, body: string): Promise<string>
  emit(payload: Record<string, unknown>, refs: string[]): Promise<void>
  configuration: NonNullable<ReturnType<typeof productJevConfiguration>>
  http?: HttpFetch
  quote?: () => Promise<void>
}): Score {
  let calls = 0
  return async (frame, signal) => {
    if (
      !onlinePriority(frame).ambiguity ||
      frame.input.candidates.length < 2 ||
      frame.input.candidates.length > 3
    )
      throw Error('r1-program-sufficient-no-score')
    if (++calls > 2 || options.timeRemaining() < 1000) throw Error('r1-scoring-budget-exhausted')
    signal.throwIfAborted()
    const account = JSON.parse(
      readFileSync(resolve(options.configuration.directory, 'campaign-id.json'), 'utf8'),
    )
    if (typeof account.campaignId !== 'string') throw Error('r1-existing-account-required')
    // Reject a stopped account without acquiring a lease or changing its database bytes.
    const readOnly = new DatabaseSync(resolve(options.configuration.directory, 'campaign.db'), {
      readOnly: true,
    })
    try {
      const campaign = readOnly
        .prepare('SELECT limit_usd FROM campaigns WHERE campaign_id=?')
        .get(account.campaignId)
      const stopped = readOnly
        .prepare('SELECT COUNT(*) AS count FROM ledger_stop_events WHERE campaign_id=?')
        .get(account.campaignId)
      const unknown = readOnly
        .prepare(
          "SELECT COUNT(*) AS count FROM ledger_requests WHERE campaign_id=? AND status='unknown'",
        )
        .get(account.campaignId)
      if (!campaign || Number(campaign.limit_usd) !== options.configuration.limitUsd)
        throw Error('r1-existing-account-required')
      if (Number(stopped?.count) || Number(unknown?.count))
        throw Error('r1-scoring-account-stopped')
    } finally {
      readOnly.close()
    }
    // Metadata is public and read before obtaining the private provider credential.
    await (
      options.quote ??
      (async () => {
        const r = await fetch('https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints', {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          redirect: 'error',
        })
        if (!r.ok) throw Error('r1-jev-quote-unavailable')
        const data: any = await r.json(),
          list = data?.data?.endpoints?.filter(
            (e: any) => e.provider_name === 'TypeSafe' && e.status === 0,
          )
        if (list?.length !== 1) throw Error('r1-jev-quote-changed')
        const e = list[0],
          p = e.pricing,
          number = (v: unknown) =>
            typeof v === 'string' && /^\d+(\.\d+)?(?:e-\d+)?$/i.test(v)
              ? Number(v)
              : typeof v === 'number'
                ? v
                : NaN
        if (
          e.model_id !== DEFAULT_PROFILE.requestModel ||
          e.name !== 'TypeSafe | ' + DEFAULT_PROFILE.expectedModel ||
          e.context_length !== 64000 ||
          e.max_prompt_tokens !== 32000 ||
          !Number.isFinite(number(p?.prompt)) ||
          number(p.prompt) < 0 ||
          number(p.prompt) > 0.000000042 ||
          number(p.completion) !== 0 ||
          Object.entries(p).some(
            ([k, v]) =>
              !['prompt', 'completion'].includes(k) &&
              (!['discount', 'request', 'image', 'input_cache_write'].includes(k) ||
                number(v) !== 0),
          )
        )
          throw Error('r1-jev-quote-changed')
      })
    )()
    let sent = false,
      reserved = false,
      responseSaved = false,
      cost: number | null = null,
      response: ProviderEvent | undefined,
      refs: string[] = [],
      problem: unknown
    const id = randomUUID(),
      profile = {
        ...DEFAULT_PROFILE,
        readinessConfidence: 0.5,
        maxQuestions: 7,
        maxResponseBytes: 65536,
      },
      compiled = compileProductFrame(requestFor(frame), profile)
    const session = await openCampaignSession(
      options.configuration.directory,
      String(options.configuration.limitUsd),
    )
    const stopped = new AbortController()
    let unwatch = () => {}
    const combined = AbortSignal.any([
      signal,
      stopped.signal,
      AbortSignal.timeout(Math.min(15000, options.timeRemaining())),
    ])
    try {
      if (session.campaignId !== account.campaignId) throw Error('r1-existing-account-changed')
      const state = await session.ledger.stopState()
      if (state.epoch || state.unknownCount) throw Error('r1-scoring-account-stopped')
      unwatch = session.ledger.watchStop(state.epoch, () =>
        stopped.abort(new Error('r1-scoring-account-stopped')),
      )
      const key = options.configuration.key()
      const transport = createJevTransport({
        profile,
        apiKey: key,
        compile: compileProductFrame,
        onEvent(e) {
          if (e.stage === 'response') {
            response = e
            if (e.usage?.status === 'known' && Number.isFinite(e.usage.costUsd))
              cost = e.usage.costUsd!
          }
        },
        fetch: async (url, init) => {
          combined.throwIfAborted()
          refs.push(await options.save('r1-jev-request', compiled.wire))
          const held = await session.ledger.reserve({
            requestId: id,
            runId: options.runId,
            phase: 'r1-product',
            model: profile.requestModel,
            provider: profile.provider,
            reservedUsd: 0.003,
            priceSource: 'TypeSafe <=0.042 USD/M input; <=32000 prompt; reserve 0.003',
            stopEpoch: state.epoch,
          })
          if (!held.ok) throw Error('r1-scoring-account-refused:' + held.reason)
          reserved = true
          await options.countCall()
          let request!: Promise<Response>
          const dispatched = await session.ledger.dispatch(id, state.epoch, () => {
            if (combined.aborted) return false
            sent = true
            request = (options.http ?? fetch)(url, init)
            void request.catch(() => {})
            return true
          })
          if (!dispatched.ok) throw Error('r1-scoring-dispatch-refused')
          return request
        },
      })
      const envelope = await transport(requestFor(frame), {
        attemptId: id,
        requestDigest: compiled.requestDigest,
        signal: combined,
        deadline: Date.now() + Math.min(15000, options.timeRemaining()),
      })
      if (response?.usage?.status === 'known' && Number.isFinite(response.usage.costUsd))
        cost = response.usage.costUsd!
      if (!response?.responseText) throw Error('r1-scoring-missing-receipt')
      refs.push(await options.save('r1-jev-response', response.responseText))
      responseSaved = true
      const receipt = normalizeResponse(JSON.parse(response.responseText), compiled, profile)
      if (digest(receipt) !== digest((envelope as any).receipt))
        throw Error('r1-scoring-receipt-mismatch')
      if (cost === null) throw Error('r1-scoring-unknown-cost')
      const current = await session.ledger.stopState()
      if (current.epoch !== state.epoch || current.unknownCount)
        throw Error('r1-scoring-account-stopped')
      combined.throwIfAborted()
      if (receipt.kind === 'handoff')
        return {
          binding: frame.binding,
          packetHash: digest(frame),
          kind: 'handoff',
          orderedIds: [],
          reason: receipt.reasonCode,
        }
      return {
        binding: frame.binding,
        packetHash: digest(frame),
        kind: 'scores',
        orderedIds: [
          ...rankCandidates(frame.input, { scores: receipt.scores }).orderedCandidateIds,
        ],
      }
    } catch (error) {
      problem = error
      throw error
    } finally {
      try {
        if (sent) {
          if (cost === null) await session.ledger.markUnknown(id, 'product-score-usage-unavailable')
          else await session.ledger.settle(id, cost)
        } else if (reserved) await session.ledger.release(id, 'not-sent')
        if (response?.responseText && !responseSaved)
          refs.push(await options.save('r1-jev-response', response.responseText))
        await options.emit(
          {
            requestId: id,
            campaignId: session.campaignId,
            frameHash: digest(frame),
            wireHash: compiled.wireDigest,
            dispatched: sent,
            actualUsd: cost,
            model: profile.expectedModel,
            provider: profile.provider,
            error: problem ? 'scoring-stopped' : null,
          },
          refs,
        )
        if (sent && (cost === null || (await session.ledger.spending()).exceeded))
          throw Error('r1-scoring-account-stopped')
      } finally {
        unwatch()
        await session.close()
      }
    }
  }
}
