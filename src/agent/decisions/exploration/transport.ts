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
import { randomUUID } from 'node:crypto'
import {
  CONTRACT_VERSION,
  POLICY_VERSION,
  normalizeOutcome,
  parseExplorationInput,
  type ExplorationInput,
  type ExplorationResult,
  type ReasonCode,
  type ResultBinding,
} from './contracts.ts'
import type { BudgetLedger } from './budget.ts'
import { buildScoringRequest } from './prompt.ts'
import { validateReceipt, type NormalizedReceipt, type Usage } from './receipt.ts'
import { rankCandidates } from './ranking.ts'
import type { CandidateScore } from './ranking.ts'

export type SendOptions = {
  readonly signal: AbortSignal
  readonly deadline: number
  readonly attemptId: string
}

export type SendFn = (
  request: { system: string; body: string },
  options: SendOptions,
) => Promise<NormalizedReceipt>

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
  readonly currentVersions?: () => { relatedStateVersion: string; observationVersion: string }
}

const ZERO_USAGE: Usage = {
  status: 'known',
  inputTokens: null,
  outputTokens: null,
  costUsd: 0,
  source: 'stub',
}

function bindingFor(
  input: ExplorationInput,
  modelId: string | null,
  promptVersion: string | null,
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
    // The version constant, not a re-run of the ranking: bindingFor must not recompute the order.
    policyVersion: POLICY_VERSION,
    promptVersion,
    modelId,
  }
}

function rejection(
  requestId: string,
  reasonCode: ReasonCode,
  binding: ResultBinding,
  trace: Partial<TransportTrace> & { attempted?: boolean },
): ScoreResult {
  const result = {
    schemaVersion: 'r1-exploration-result-1',
    requestId,
    kind: 'handoff',
    reasonCode,
    binding,
  } as const
  return {
    ...result,
    outcome: normalizeOutcome(result),
    trace: {
      attempted: trace.attempted ?? false,
      attemptId: trace.attemptId ?? randomUUID(),
      requestDigest: trace.requestDigest ?? null,
      durationMs: trace.durationMs ?? 0,
      transportMs: trace.transportMs ?? 0,
      usage: trace.usage ?? ZERO_USAGE,
      deadLetter: trace.deadLetter ?? [],
    },
  }
}

export async function requestExplorationScores(options: RequestOptions): Promise<ScoreResult> {
  const started = Date.now()
  const attemptId = randomUUID()

  const parsed = parseExplorationInput(options.input)
  if (!parsed.ok) {
    const empty = {
      schemaVersion: 'r1-exploration-result-1' as const,
      requestId:
        options.input && typeof options.input === 'object' && 'requestId' in options.input
          ? String((options.input as { requestId: unknown }).requestId)
          : '',
      kind: 'handoff' as const,
      reasonCode: 'invalid-input' as const,
      binding: null as unknown as ResultBinding,
    }
    return {
      ...empty,
      outcome: 'invalid-input',
      trace: {
        attempted: false,
        attemptId,
        requestDigest: null,
        durationMs: Date.now() - started,
        transportMs: 0,
        usage: ZERO_USAGE,
        deadLetter: [parsed.detail],
      },
    }
  }

  const input = parsed.value
  const baseline = rankCandidates(input)
  if (baseline.eligible.length === 0) {
    return rejection(input.requestId, 'no-eligible-candidates', bindingFor(input, null, null), {
      durationMs: Date.now() - started,
    })
  }

  const reserve = options.ledger.reserve(options.estimatedRequestCostUsd ?? null)
  if (!reserve) {
    return rejection(input.requestId, 'budget-exhausted', bindingFor(input, null, null), {
      durationMs: Date.now() - started,
    })
  }

  if (options.billableTransport && options.ledger.snapshot().remainingCostUsd === null) {
    options.ledger.release(reserve)
    return rejection(input.requestId, 'budget-exhausted', bindingFor(input, null, null), {
      durationMs: Date.now() - started,
    })
  }

  const request = buildScoringRequest(input)
  if (!request.fits) {
    options.ledger.release(reserve)
    return rejection(
      input.requestId,
      'unsupported',
      bindingFor(input, null, request.promptVersion),
      {
        durationMs: Date.now() - started,
        requestDigest: request.requestDigest,
        deadLetter: ['request-exceeds-byte-ceiling'],
      },
    )
  }

  const controller = new AbortController()
  const callerSignal = options.signal
  const onCallerAbort = () => controller.abort(callerSignal?.reason ?? new Error('cancelled'))
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
  if (callerSignal?.aborted) onCallerAbort()

  const snapshot = options.ledger.snapshot()
  // Deadline = min(request cap, caller's CURRENT remaining time, session's declared remaining time).
  // `input.budget.remainingMs` is the caller's live view and may have shrunk since the session
  // ledger was created; the ledger's own value is frozen at construction and never ticks down.
  // Taking the smallest of the three means a stale session value can never grant more time than
  // the caller currently allows.
  const budgetMs = Math.max(
    1,
    Math.min(input.budget.maxRequestMs, input.budget.remainingMs, snapshot.remainingMs),
  )
  const timer = setTimeout(() => controller.abort(new Error('exploration-timeout')), budgetMs)

  const transportStart = Date.now()
  let transportMs = 0
  let usage: Usage = ZERO_USAGE
  const deadLetter: string[] = []

  // A transport that ignores AbortSignal must not be able to hold the caller past the deadline.
  // Race it against the abort signal and drop whatever arrives too late.
  const withSignal = <T>(operation: Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const abort = () => reject(controller.signal.reason ?? new Error('cancelled'))
      controller.signal.addEventListener('abort', abort, { once: true })
      if (controller.signal.aborted) abort()
      operation
        .then(resolve, reject)
        .finally(() => controller.signal.removeEventListener('abort', abort))
    })

  try {
    const reply = await withSignal(
      options.send(
        { system: request.system, body: request.body },
        { signal: controller.signal, deadline: transportStart + budgetMs, attemptId },
      ),
    )
    transportMs = Date.now() - transportStart
    usage = reply.usage

    // Re-check after the await, before trusting anything in the reply.
    if (controller.signal.aborted) {
      options.ledger.settle(reserve, usage.status === 'known' ? usage.costUsd : null)
      const reason: ReasonCode = options.signal?.aborted ? 'cancelled' : 'timeout'
      return rejection(
        input.requestId,
        reason,
        bindingFor(input, reply.modelId, request.promptVersion),
        {
          attempted: true,
          attemptId,
          requestDigest: request.requestDigest,
          durationMs: Date.now() - started,
          transportMs,
          usage,
          deadLetter,
        },
      )
    }
    if (options.signal?.aborted) {
      options.ledger.settle(reserve, usage.status === 'known' ? usage.costUsd : null)
      return rejection(
        input.requestId,
        'cancelled',
        bindingFor(input, reply.modelId, request.promptVersion),
        {
          attempted: true,
          attemptId,
          requestDigest: request.requestDigest,
          durationMs: Date.now() - started,
          transportMs,
          usage,
          deadLetter,
        },
      )
    }

    const live = options.currentVersions?.()
    if (
      live &&
      (live.relatedStateVersion !== input.state.relatedStateVersion ||
        live.observationVersion !== input.state.observationVersion)
    ) {
      options.ledger.settle(reserve, usage.status === 'known' ? usage.costUsd : null)
      return rejection(
        input.requestId,
        'stale-state',
        bindingFor(input, reply.modelId, request.promptVersion),
        {
          attempted: true,
          attemptId,
          requestDigest: request.requestDigest,
          durationMs: Date.now() - started,
          transportMs,
          usage,
          deadLetter: ['versions-changed-while-waiting'],
        },
      )
    }

    options.ledger.settle(reserve, usage.status === 'known' ? usage.costUsd : null)
    const eligibleIds = baseline.eligible.map((e) => e.id)
    const validated = validateReceipt(reply, eligibleIds)
    if (!validated.ok) {
      return rejection(
        input.requestId,
        'invalid-receipt',
        bindingFor(input, reply.modelId, request.promptVersion),
        {
          attempted: true,
          attemptId,
          requestDigest: request.requestDigest,
          durationMs: Date.now() - started,
          transportMs,
          usage,
          deadLetter: [validated.detail],
        },
      )
    }
    if (validated.value.kind === 'handoff') {
      const reason = validated.value.reasonCode
      return rejection(
        input.requestId,
        reason === 'requires-agent-investigation'
          ? 'requires-agent-investigation'
          : 'insufficient-information',
        bindingFor(input, reply.modelId, request.promptVersion),
        {
          attempted: true,
          attemptId,
          requestDigest: request.requestDigest,
          durationMs: Date.now() - started,
          transportMs,
          usage,
          deadLetter,
        },
      )
    }

    const scores: CandidateScore[] = validated.value.scores.map((s) => ({
      candidateId: s.candidateId,
      relevance: s.relevance,
      informationGain: s.informationGain,
      uncertainty: s.uncertainty,
    }))
    const ranked = rankCandidates(input, { scores })
    const result = {
      schemaVersion: 'r1-exploration-result-1',
      requestId: input.requestId,
      kind: 'ranked',
      reasonCode: 'ranked',
      binding: bindingFor(input, reply.modelId, request.promptVersion),
    } as const
    return {
      ...result,
      outcome: normalizeOutcome(result),
      orderedCandidateIds: ranked.orderedCandidateIds,
      scores,
      rejected: ranked.rejected,
      policyVersion: ranked.policyVersion,
      trace: {
        attempted: true,
        attemptId,
        requestDigest: request.requestDigest,
        durationMs: Date.now() - started,
        transportMs,
        usage,
        deadLetter,
      },
    }
  } catch (error) {
    transportMs = Date.now() - transportStart
    const reason: ReasonCode = options.signal?.aborted
      ? 'cancelled'
      : controller.signal.aborted
        ? 'timeout'
        : 'transport-failed'
    // Deliberately record only a coarse class: provider error bodies can echo credentials.
    deadLetter.push(`transport:${reason}`)
    // No reply was received, so no cost was incurred: free this ticket's hold. The decision
    // itself stays consumed, since the request really was dispatched.
    options.ledger.release(reserve)
    void error
    return rejection(input.requestId, reason, bindingFor(input, null, request.promptVersion), {
      attempted: true,
      attemptId,
      requestDigest: request.requestDigest,
      durationMs: Date.now() - started,
      transportMs,
      usage,
      deadLetter,
    })
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}
