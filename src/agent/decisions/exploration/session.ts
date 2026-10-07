/**
 * Session facade: one caller session owns one budget ledger and one bounded score cache.
 *
 * The cache short-circuits the *transport*, never the guards. Budget and cancellation are
 * re-checked on every decision, cache hit or miss, so a warm entry can never authorize work the
 * caller has since withdrawn.
 */
import type { ExplorationInput } from './contracts.ts'
import { createBudgetLedger, type BudgetLedger, type BudgetLedgerInput } from './budget.ts'
import { createScoreCache, type ScoreCache } from './cache.ts'
import type { CandidateScore, FairnessState } from './ranking.ts'
import { requestExplorationScores, type ScoreResult, type SendFn } from './transport.ts'

export type ExplorationSession = {
  decide(
    input: unknown,
    options?: { signal?: AbortSignal; fairness?: FairnessState },
  ): Promise<ScoreResult>
  stats(): { ledger: ReturnType<BudgetLedger['snapshot']>; cache: ReturnType<ScoreCache['stats']> }
}

export function createExplorationSession(config: {
  readonly ledger?: BudgetLedger
  readonly budget?: BudgetLedgerInput
  readonly send: SendFn
  readonly cache?: ScoreCache
  readonly estimatedRequestCostUsd?: number | null
  readonly billableTransport?: boolean
  readonly currentVersions?: () => { relatedStateVersion: string; observationVersion: string }
}): ExplorationSession {
  const ledger = config.ledger ?? createBudgetLedger(config.budget!)
  const cache = config.cache ?? createScoreCache({ capacity: 64, ttlMs: 5 * 60_000 })

  return {
    async decide(input, options = {}) {
      // Live guards run first and run regardless of any cached entry.
      if (options.signal?.aborted) return refused(input, 'cancelled', 'caller-cancelled')
      if (ledger.snapshot().remainingDecisions <= 0)
        return refused(input, 'budget-exhausted', 'no-decisions')

      const cacheable = isCacheable(input)
      if (cacheable) {
        const hit = cache.get(input, options.fairness)
        if (hit) {
          const fresh = await requestExplorationScores({
            input,
            ledger,
            send: async () => ({
              kind: 'scores',
              modelId: null,
              scores: hit.scores as CandidateScore[],
              usage: {
                status: 'known',
                inputTokens: null,
                outputTokens: null,
                costUsd: 0,
                source: 'stub',
              },
            }),
            signal: options.signal,
            estimatedRequestCostUsd: null,
            billableTransport: false,
            currentVersions: config.currentVersions,
          })
          if (fresh.kind === 'ranked') {
            return {
              ...fresh,
              trace: {
                ...fresh.trace,
                attempted: false,
                requestDigest: null,
                cache: 'hit',
                // Attribute the ORIGINAL request's cost; the hit itself charged nothing.
                originCostUsd: hit.originCostUsd,
              },
            }
          }
          return fresh
        }
      }

      const result = await requestExplorationScores({
        input,
        ledger,
        send: config.send,
        signal: options.signal,
        estimatedRequestCostUsd: config.estimatedRequestCostUsd,
        billableTransport: config.billableTransport,
        currentVersions: config.currentVersions,
      })

      if (cacheable && result.kind === 'ranked' && result.scores)
        cache.set(input, result.scores, result.trace.usage, options.fairness)

      return { ...result, trace: { ...result.trace, cache: cacheable ? 'miss' : 'disabled' } }
    },
    stats() {
      return { ledger: ledger.snapshot(), cache: cache.stats() }
    },
  }
}

function isCacheable(input: unknown): input is ExplorationInput {
  return Boolean(
    input && typeof input === 'object' && (input as ExplorationInput).state?.cacheable === true,
  )
}

function refused(
  input: unknown,
  reasonCode: 'cancelled' | 'budget-exhausted',
  _detail: string,
): ScoreResult {
  const requestId =
    input && typeof input === 'object' && 'requestId' in input
      ? String((input as { requestId: unknown }).requestId)
      : ''
  return {
    schemaVersion: 'r1-exploration-result-1',
    requestId,
    kind: 'handoff',
    reasonCode,
    binding: null as never,
    outcome: 'handoff',
    trace: {
      attempted: false,
      attemptId: 'not-dispatched',
      requestDigest: null,
      durationMs: 0,
      transportMs: 0,
      usage: { status: 'known', inputTokens: null, outputTokens: null, costUsd: 0, source: 'stub' },
      deadLetter: [],
      cache: 'disabled',
    },
  } as ScoreResult
}
