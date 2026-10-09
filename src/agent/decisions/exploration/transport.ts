/**
 * Score transport: builds the bounded question, dispatches through an INJECTED send function,
 * and validates the reply against the candidate set actually sent.
 *
 * The default transport is the in-repo stub. Nothing here reads `process.env`, loads dotenv, or
 * performs an implicit fetch, so no provider can be reached by accident.
 *
 * Every exit is a non-recommending result with a distinct reason. A transport failure is never
 * disguised as a low model score, and a late reply can never resurrect a recommendation.
 */
import { adapterReceiptSchema } from './adapter.ts'
import { parseScoreResult } from './result.ts'
import { randomUUID } from 'node:crypto'
import {
  CONTRACT_VERSION,
  POLICY_VERSION,
  parseExplorationInput,
  type ExplorationInput,
  type ExplorationResult,
  type ReasonCode,
  type ResultBinding,
} from './contracts.ts'
import type { BudgetLedger } from './budget.ts'
import { buildScoringRequest } from './prompt.ts'
import {
  validateReceipt,
  usageSchema,
  STUB_IDENTITY,
  type TransportIdentity,
  type Usage,
} from './receipt.ts'
import { rankCandidates, fairnessSchema } from './ranking.ts'
import { stateDigest, hasDecisionBudget } from './state.ts'
import type { CandidateScore, FairnessState } from './ranking.ts'

export type SendOptions = {
  readonly signal: AbortSignal
  readonly deadline: number
  readonly attemptId: string
  readonly requestDigest: string
}

export type SendFn = (
  request: { system: string; body: string },
  options: SendOptions,
) => Promise<unknown>

export type TransportTrace = {
  readonly attempted: boolean
  readonly attemptId: string
  readonly requestDigest: string | null
  readonly durationMs: number
  readonly transportMs: number
  readonly usage: Usage
  readonly deadLetter: readonly string[]
  /** Set by the session facade; the bare transport never reads a cache. */
  readonly cache?: 'hit' | 'miss' | 'disabled'
  /**
   * Cost of the ORIGINAL scoring request a cache hit was served from. `null` for a miss or when
   * the original usage was unknown. The hit itself adds no request and is never re-charged.
   */
  readonly originCostUsd?: number | null
}

export type ScoreResult = ExplorationResult & {
  readonly outcome: 'ranked' | 'handoff' | 'invalid-input'
  readonly orderedCandidateIds?: readonly string[]
  readonly scores?: readonly CandidateScore[]
  readonly rejected?: readonly { candidateId: string; reason: string }[]
  readonly policyVersion?: string
  readonly trace: TransportTrace
}

export type RequestOptions = {
  readonly input: unknown
  readonly ledger: BudgetLedger
  readonly send: SendFn
  readonly signal?: AbortSignal
  /** Worst-case request cost, when the caller can quote one. */
  readonly estimatedRequestCostUsd?: number | null
  /** Set for a transport that may bill; an unknown remaining cost then blocks dispatch. */
  readonly billableTransport?: boolean
  /** Live caller view of the versions under which the request is being made. */
  readonly identity?: TransportIdentity
  readonly fairness?: FairnessState
  readonly currentInput?: () => unknown
  readonly onLateUsage?: (event: { attemptId: string; usage: Usage }) => void
  readonly currentVersions?: () => { relatedStateVersion: string; observationVersion: string }
}

export const ZERO_USAGE: Usage = {
  status: 'known',
  inputTokens: null,
  outputTokens: null,
  costUsd: 0,
  source: 'stub',
}
const UNKNOWN_USAGE: Usage = {
  status: 'unknown',
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  source: 'provider',
}
export function bindingFor(
  input: ExplorationInput,
  modelId: string | null,
  promptVersion: string | null,
  identity: TransportIdentity = STUB_IDENTITY,
): ResultBinding {
  return {
    taskRevision: input.task.revision,
    pageId: input.state.pageId,
    documentVersion: input.state.documentVersion,
    observationVersion: input.state.observationVersion,
    relatedStateVersion: input.state.relatedStateVersion,
    scopeRevision: input.scope.revision,
    budgetRevision: input.budget.revision,
    contractVersion: CONTRACT_VERSION,
    policyVersion: POLICY_VERSION,
    promptVersion,
    modelId,
    provider: identity.provider,
    adapterRevision: identity.adapterRevision,
    stateDigest: stateDigest(input),
  }
}
async function performRequest(options: RequestOptions): Promise<ScoreResult> {
  const started = performance.now()
  const attemptId = randomUUID()
  const identity = structuredClone(options.identity ?? STUB_IDENTITY)
  const fairness = options.fairness ? structuredClone(options.fairness) : undefined
  const parsed = parseExplorationInput(options.input)
  const input = parsed.ok ? parsed.value : null
  let usage = ZERO_USAGE
  let attempted = false
  let transportStart = started
  let digest: string | null = null
  const reject = (reasonCode: ReasonCode, detail?: string): ScoreResult => ({
    schemaVersion: 'r1-exploration-result-1',
    requestId: input?.requestId ?? '',
    kind: 'handoff',
    reasonCode,
    binding: input
      ? bindingFor(input, identity.modelId, digest ? 'r1-exploration-prompt-2' : null, identity)
      : null,
    outcome: reasonCode === 'invalid-input' ? 'invalid-input' : 'handoff',
    trace: {
      attempted,
      attemptId,
      requestDigest: digest,
      durationMs: performance.now() - started,
      transportMs: attempted ? performance.now() - transportStart : 0,
      usage,
      deadLetter: detail ? [detail] : [],
    },
  })
  if (!parsed.ok || !input)
    return reject('invalid-input', !parsed.ok ? parsed.detail : 'invalid-input')
  if (fairness && !fairnessSchema.safeParse(fairness).success)
    return reject('invalid-input', 'invalid-fairness')
  options.ledger.tighten(input.budget)
  const liveGuard = (): ReasonCode | null => {
    if (options.signal?.aborted) return 'cancelled'
    let current: unknown
    try {
      current = options.currentInput?.() ?? options.input
    } catch {
      return 'stale-state'
    }
    const live = parseExplorationInput(current)
    if (
      !live.ok ||
      live.value.requestId !== input.requestId ||
      stateDigest(live.value) !== stateDigest(input)
    )
      return 'stale-state'
    let oldView: ReturnType<NonNullable<RequestOptions['currentVersions']>> | undefined
    try {
      oldView = options.currentVersions?.()
    } catch {
      return 'stale-state'
    }
    options.ledger.tighten(live.value.budget)
    if (
      oldView &&
      (oldView.observationVersion !== input.state.observationVersion ||
        oldView.relatedStateVersion !== input.state.relatedStateVersion)
    )
      return 'stale-state'
    if (!hasDecisionBudget(live.value) || options.ledger.snapshot().remainingMs <= 0)
      return 'budget-exhausted'
    if (
      options.billableTransport &&
      (live.value.budget.remainingCostUsd === null ||
        (options.estimatedRequestCostUsd != null &&
          live.value.budget.remainingCostUsd < options.estimatedRequestCostUsd))
    )
      return 'budget-exhausted'
    return null
  }
  const early = liveGuard()
  if (early) return reject(early)
  const baseline = rankCandidates(input)
  if (!baseline.eligible.length) return reject('no-eligible-candidates')
  const request = buildScoringRequest(input)
  digest = request.requestDigest
  if (!request.fits) return reject('unsupported', 'request-exceeds-byte-ceiling')
  if (
    options.billableTransport &&
    (!options.identity ||
      input.budget.remainingCostUsd === null ||
      options.estimatedRequestCostUsd == null)
  )
    return reject('budget-exhausted', 'billable-identity-or-budget-missing')
  const quote = options.estimatedRequestCostUsd
  if (options.billableTransport && quote != null && (input.budget.remainingCostUsd ?? 0) < quote)
    return reject('budget-exhausted')
  const ticket = options.ledger.reserve(quote ?? null, options.billableTransport)
  if (!ticket) return reject('budget-exhausted')
  const deadline =
    started +
    Math.min(
      input.budget.maxRequestMs,
      options.ledger.snapshot().maxRequestMs,
      input.budget.remainingMs,
      options.ledger.snapshot().remainingMs,
    )
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, Math.max(0, deadline - performance.now()))
  let finished = false
  let abortRace: (() => void) | undefined
  // Accounting is independent of recommendation validity, including late replies.
  const account = (reply: unknown): Usage => {
    const raw = reply && typeof reply === 'object' && 'usage' in reply ? reply.usage : null
    const valid = usageSchema.safeParse(raw)
    const observed = valid.success ? valid.data : UNKNOWN_USAGE
    options.ledger.settle(
      ticket,
      observed.status === 'known' ? observed.costUsd : options.billableTransport ? null : 0,
    )
    return observed
  }
  try {
    const before = liveGuard()
    if (before || performance.now() >= deadline) {
      options.ledger.release(ticket)
      return reject(before ?? 'timeout')
    }
    attempted = true
    transportStart = performance.now()
    usage = options.billableTransport ? UNKNOWN_USAGE : ZERO_USAGE
    options.ledger.dispatch(ticket)
    const operation = Promise.resolve(
      options.send(
        { system: request.system, body: request.body },
        {
          signal: controller.signal,
          deadline: Date.now() + Math.max(0, deadline - performance.now()),
          attemptId,
          requestDigest: request.requestDigest,
        },
      ),
    ).then(
      (reply) => {
        const envelope = adapterReceiptSchema.safeParse(reply)
        const observed = account(
          envelope.success &&
            envelope.data.attemptId === attemptId &&
            envelope.data.requestDigest === digest
            ? envelope.data.receipt
            : null,
        )
        if (finished) {
          try {
            options.onLateUsage?.({ attemptId, usage: observed })
          } catch {
            /* audit callbacks cannot revive a result */
          }
        }
        return reply
      },
      (error) => {
        const observed = account(error)
        if (finished) {
          try {
            options.onLateUsage?.({ attemptId, usage: observed })
          } catch {
            /* no recommendation */
          }
        }
        throw error
      },
    )
    const reply = await Promise.race([
      operation,
      new Promise<never>((_, rejectRace) => {
        abortRace = () => rejectRace(new Error('aborted'))
        controller.signal.addEventListener('abort', abortRace, { once: true })
        if (controller.signal.aborted) abortRace()
      }),
    ])
    const envelope = adapterReceiptSchema.safeParse(reply)
    usage = account(
      envelope.success &&
        envelope.data.attemptId === attemptId &&
        envelope.data.requestDigest === digest
        ? envelope.data.receipt
        : null,
    )
    if (options.signal?.aborted) return reject('cancelled')
    if (controller.signal.aborted || performance.now() >= deadline) return reject('timeout')
    const guarded = liveGuard()
    if (guarded) return reject(guarded)
    if (
      !envelope.success ||
      envelope.data.attemptId !== attemptId ||
      envelope.data.requestDigest !== request.requestDigest
    )
      return reject('invalid-receipt', 'adapter-receipt-misbound')
    const valid = validateReceipt(
      envelope.data.receipt,
      baseline.eligible.map((c) => c.id),
      identity,
    )
    if (!valid.ok) return reject('invalid-receipt', valid.detail)
    if (options.ledger.snapshot().overrun)
      return reject('budget-exhausted', 'provider-cost-exceeded-reservation')
    if (valid.value.kind === 'handoff') return reject(valid.value.reasonCode as ReasonCode)
    const ranked = rankCandidates(input, { scores: valid.value.scores, fairness })
    return {
      ...reject('ranked'),
      kind: 'ranked',
      reasonCode: 'ranked',
      outcome: 'ranked',
      scores: valid.value.scores,
      orderedCandidateIds: ranked.orderedCandidateIds,
      rejected: ranked.rejected,
      policyVersion: ranked.policyVersion,
    }
  } catch (error) {
    // A rejected/aborted request may have reached a provider. Keep unknown paid cost held.
    const failureUsage =
      error && typeof error === 'object' && 'usage' in error
        ? usageSchema.safeParse(error.usage)
        : null
    if (failureUsage?.success) usage = failureUsage.data
    options.ledger.settle(
      ticket,
      usage.status === 'known' ? usage.costUsd : options.billableTransport ? null : 0,
    )
    const reason = options.signal?.aborted
      ? 'cancelled'
      : controller.signal.aborted || performance.now() >= deadline
        ? 'timeout'
        : 'transport-failed'
    return reject(reason, `transport:${reason}`)
  } finally {
    finished = true
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    if (abortRace) controller.signal.removeEventListener('abort', abortRace)
  }
}

export async function requestExplorationScores(options: RequestOptions): Promise<ScoreResult> {
  const result = await performRequest(options)
  if (!parseScoreResult(result).success) throw new Error('internal-result-contract-violation')
  return result
}
