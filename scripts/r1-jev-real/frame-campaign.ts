/** Full-state experiment through existing audited HTTP and fsynced campaign ledger. No bare fetch. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { openCampaignLedger } from './ledger.ts'
import { createJevTransport, type HttpFetch } from '../../src/agent/decisions/jev-provider/http.ts'
import { DEFAULT_PROFILE } from '../../src/agent/decisions/jev-provider/profile.ts'
import { adapterReceiptSchema } from '../../src/agent/decisions/exploration/adapter.ts'
import { normalizeResponse } from '../../src/agent/decisions/jev-provider/response.ts'
import { rankCandidates } from '../../src/agent/decisions/exploration/ranking.ts'
import { compileFrame, requestFor } from '../../src/agent/exploration/integration/jev.ts'
import {
  digest,
  type PublicFrame,
  type ScoreReply,
} from '../../src/agent/exploration/integration/host.ts'
import { sealEvidence, writeJson } from './evidence.ts'
export const RESERVATION_USD = 0.003 // 64,000 * $0.042/M = $0.002688, rounded upward. Published-unit bound, not a billing SLA.
export const FRAME_LIMITS = { maxAttempts: 1, maxCostUsd: RESERVATION_USD, maxWallMs: 15000 }
export function createFrameCampaign(options: {
  directory: string
  getKey: () => string
  fetch?: HttpFetch
  current: () => PublicFrame
  authorizedPacketHash: string
}) {
  mkdirSync(options.directory, { recursive: false })
  const ledger = openCampaignLedger(options.directory, FRAME_LIMITS)
  let stopped = false
  const decide = async (frame: PublicFrame, signal: AbortSignal): Promise<ScoreReply> => {
    const hash = digest(frame),
      handoff = (reason: string): ScoreReply => ({
        binding: frame.binding,
        packetHash: hash,
        kind: 'handoff',
        orderedIds: [],
        reason,
      })
    if (stopped || ledger.snapshot().attempts >= 1 || ledger.snapshot().pending)
      return handoff('campaign-stopped')
    signal.throwIfAborted()
    if (hash !== options.authorizedPacketHash || digest(options.current()) !== hash)
      return handoff('stale-or-unauthorized-state')
    const request = requestFor(frame),
      compiled = compileFrame(request)
    writeJson(join(options.directory, 'frame.json'), frame)
    writeJson(join(options.directory, 'request.json'), compiled)
    const id = randomUUID(),
      events: any[] = []
    const transport = createJevTransport({
      profile: DEFAULT_PROFILE,
      apiKey: options.getKey(),
      compile: compileFrame,
      fetch: options.fetch,
      onEvent: (event) => {
        if (event.stage === 'dispatch') ledger.reserve(event.attemptId, RESERVATION_USD)
        events.push(event)
        writeJson(join(options.directory, `${event.stage}.json`), event)
        if (event.usage && ledger.snapshot().attempts)
          ledger.settle(
            event.attemptId,
            event.usage.status === 'known' ? event.usage.costUsd : null,
          )
      },
    })
    try {
      const envelope = adapterReceiptSchema.parse(
        await transport(request, {
          attemptId: id,
          requestDigest: compiled.requestDigest,
          signal,
          deadline: Date.now() + Math.min(15000, ledger.snapshot().remainingMs),
        }),
      )
      if (
        envelope.attemptId !== id ||
        envelope.requestDigest !== compiled.requestDigest ||
        digest(options.current()) !== hash ||
        signal.aborted
      )
        return handoff('stale-response')
      // Recompute readiness and scores from raw HTTP body; never trust a stored summary as judgment.
      const event = events.find((e) => e.stage === 'response')
      const receipt = normalizeResponse(JSON.parse(event.responseText), compiled, DEFAULT_PROFILE)
      if (digest(receipt) !== digest(envelope.receipt)) throw new Error('raw-receipt-mismatch')
      const budget = ledger.snapshot()
      if (budget.pending || budget.overrun)
        return handoff(budget.pending ? 'unknown-cost' : 'cost-overrun')
      if (receipt.kind === 'handoff') return handoff(receipt.reasonCode)
      return {
        binding: frame.binding,
        packetHash: hash,
        kind: 'scores',
        orderedIds: [
          ...rankCandidates(frame.input, { scores: receipt.scores }).orderedCandidateIds,
        ],
      }
    } catch {
      return handoff(ledger.snapshot().pending ? 'unknown-cost' : 'invalid-or-failed-response')
    } finally {
      stopped = true
      writeJson(join(options.directory, 'summary.json'), {
        ledger: ledger.snapshot(),
        stopped: true,
        frameHash: hash,
        realHttp: !options.fetch,
      })
    }
  }
  return {
    decide,
    snapshot: ledger.snapshot,
    close() {
      ledger.close()
      sealEvidence(options.directory)
    },
  }
}
/** Exact frozen-frame authorization; caller must pass human approval, never infer it from a budget. */
export async function runAuthorizedFrame(options: {
  frame: PublicFrame
  freeze: { sourceSha: string; packetHash: string; wireHash: string; maxCostUsd: number }
  authorization: {
    approvedBy: string
    approvalReference: string
    freezeHash: string
    expiresAt: string
  }
  sourceSha: string
  directory: string
  claimDirectory: string
  getKey: () => string
  signal: AbortSignal
  fetch?: HttpFetch
}) {
  const { freeze, authorization, frame } = options
  if (
    freeze.sourceSha !== options.sourceSha ||
    freeze.packetHash !== digest(frame) ||
    freeze.wireHash !== compileFrame(requestFor(frame)).wireDigest ||
    freeze.maxCostUsd !== RESERVATION_USD ||
    authorization.freezeHash !== digest(freeze) ||
    !authorization.approvedBy ||
    !authorization.approvalReference ||
    Date.parse(authorization.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(authorization.expiresAt))
  )
    throw new Error('frame-authorization-invalid')
  mkdirSync(options.claimDirectory, { recursive: true })
  writeFileSync(
    join(options.claimDirectory, digest(freeze) + '.claim'),
    JSON.stringify({ directory: options.directory, freeze }),
    { flag: 'wx', mode: 0o600 },
  )
  const campaign = createFrameCampaign({
    directory: options.directory,
    getKey: options.getKey,
    fetch: options.fetch,
    current: () => frame,
    authorizedPacketHash: freeze.packetHash,
  })
  try {
    return await campaign.decide(frame, options.signal)
  } finally {
    campaign.close()
  }
}
