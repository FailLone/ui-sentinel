/**
 * Session facade: one caller session owns one budget ledger and one bounded score cache.
 *
 * The cache short-circuits the *transport*, never the guards. Budget and cancellation are
 * re-checked on every decision, cache hit or miss, so a warm entry can never authorize work the
 * caller has since withdrawn.
 */
import { bindReceipt } from './adapter.ts'
import { parseExplorationInput } from './contracts.ts'
import { STUB_IDENTITY, type TransportIdentity } from './receipt.ts'
import { hasDecisionBudget } from './state.ts'
import { createBudgetLedger, type BudgetLedger, type BudgetLedgerInput } from './budget.ts'
import { createScoreCache, type ScoreCache } from './cache.ts'
import type { CandidateScore, FairnessState } from './ranking.ts'
import {
  requestExplorationScores,
  ZERO_USAGE,
  type RequestOptions,
  type ScoreResult,
  type SendFn,
} from './transport.ts'

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
  readonly identity?: TransportIdentity
  readonly currentInput?: () => unknown
  readonly onLateUsage?: RequestOptions['onLateUsage']
  readonly currentVersions?: () => { relatedStateVersion: string; observationVersion: string }
}): ExplorationSession {
  if (!config.ledger && !config.budget) throw new Error('session-budget-required')
  const ledger = config.ledger ?? createBudgetLedger(config.budget!)
  const cache = config.cache ?? createScoreCache({ capacity: 64, ttlMs: 5 * 60_000 })
  const identity = structuredClone(config.identity ?? STUB_IDENTITY)
  return {
    async decide(raw, options = {}) {
      const parsed = parseExplorationInput(raw)
      const input = parsed.ok ? parsed.value : raw
      const fairness = options.fairness ? structuredClone(options.fairness) : undefined
      const common = {
        input,
        ledger,
        signal: options.signal,
        fairness,
        identity,
        currentInput: config.currentInput ?? (() => raw),
        currentVersions: config.currentVersions,
        onLateUsage: config.onLateUsage,
      }
      // Only a validated private snapshot can enter the cache. Each hit runs all live guards.
      if (
        parsed.ok &&
        !options.signal?.aborted &&
        hasDecisionBudget(parsed.value) &&
        ledger.snapshot().remainingDecisions > 0
      ) {
        const hit = cache.get(parsed.value, fairness, identity)
        if (hit) {
          const result = await requestExplorationScores({
            ...common,
            billableTransport: false,
            send: async (_request, context) =>
              bindReceipt(
                {
                  kind: 'scores',
                  modelId: hit.identity.modelId,
                  provider: hit.identity.provider,
                  scores: hit.scores,
                  usage: ZERO_USAGE,
                },
                context,
              ),
          })
          return {
            ...result,
            trace: {
              ...result.trace,
              attempted: false,
              cache: 'hit',
              originCostUsd: hit.originCostUsd,
            },
          }
        }
      }
      const result = await requestExplorationScores({
        ...common,
        send: config.send,
        estimatedRequestCostUsd: config.estimatedRequestCostUsd,
        billableTransport: config.billableTransport,
      })
      if (parsed.ok && result.kind === 'ranked' && result.scores)
        cache.set(parsed.value, result.scores, result.trace.usage, fairness, identity)
      return {
        ...result,
        trace: {
          ...result.trace,
          cache: parsed.ok && parsed.value.state.cacheable ? 'miss' : 'disabled',
        },
      }
    },
    stats() {
      return { ledger: ledger.snapshot(), cache: cache.stats() }
    },
  }
}
