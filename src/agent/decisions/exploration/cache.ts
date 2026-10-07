/**
 * Bounded, session-local score cache.
 *
 * The key covers every semantic dependency of a score: contract/policy/prompt versions, task
 * revision, page, document/observation/related-state versions, the public content and action
 * range of the candidate set, history, the executable scope, and the fairness rotation state.
 * Any change to any of those is a miss. `requestId` is deliberately NOT part of the key: a fresh
 * id for otherwise identical state must not defeat the cache.
 *
 * A hit can never bypass a live guard - the caller re-checks cancellation and budget on every
 * decision, hit or miss. Failures, uncertainty and cancellation are never cached.
 */
import { createHash } from 'node:crypto'
import { POLICY_VERSION, PROMPT_VERSION, type ExplorationInput } from './contracts.ts'
import type { Usage } from './receipt.ts'
import type { CandidateScore } from './ranking.ts'
import type { FairnessState } from './ranking.ts'

export type CacheEntry = {
  readonly scores: readonly CandidateScore[]
  /** `null` means the original usage was unknown. It is kept unknown, never rewritten as zero. */
  readonly usage: Usage | null
  readonly storedAt: number
}

export type CacheHit = {
  readonly scores: readonly CandidateScore[]
  /** Cost of the ORIGINAL scoring request. A hit adds no request of its own. */
  readonly originCostUsd: number | null
  readonly requestCount: 0
}

export function scoreCacheKey(input: ExplorationInput, fairness?: FairnessState): string {
  const material = JSON.stringify({
    contract: 'r1-exploration-contract-1',
    policy: POLICY_VERSION,
    prompt: PROMPT_VERSION,
    taskRevision: input.task.revision,
    pageId: input.state.pageId,
    documentVersion: input.state.documentVersion,
    observationVersion: input.state.observationVersion,
    relatedStateVersion: input.state.relatedStateVersion,
    task: input.task,
    candidates: input.candidates.map((c) => ({
      id: c.id,
      targetKey: c.targetKey,
      text: c.text,
      role: c.role,
      publicState: c.publicState,
      context: c.context,
      allowedActions: [...c.allowedActions],
    })),
    history: input.history,
    scope: input.scope,
    fairness: fairness ?? null,
  })
  return createHash('sha256').update(material).digest('hex')
}

export type ScoreCache = {
  get(input: ExplorationInput, fairness?: FairnessState): CacheHit | null
  set(
    input: ExplorationInput,
    scores: readonly CandidateScore[] | null,
    usage: Usage | null,
    fairness?: FairnessState,
  ): void
  invalidateAll(): void
  stats(): { hits: number; misses: number; size: number }
}

export function createScoreCache(options: {
  capacity: number
  ttlMs: number
  now?: () => number
}): ScoreCache {
  const now = options.now ?? (() => Date.now())
  const entries = new Map<string, CacheEntry>()
  let hits = 0
  let misses = 0

  return {
    get(input, fairness) {
      if (!input.state.cacheable) return null
      const key = scoreCacheKey(input, fairness)
      const entry = entries.get(key)
      if (!entry || now() - entry.storedAt > options.ttlMs) {
        if (entry) entries.delete(key)
        misses += 1
        return null
      }
      // Refresh LRU position.
      entries.delete(key)
      entries.set(key, entry)
      hits += 1
      return {
        scores: entry.scores,
        // A hit carries no request of its own; the original cost stays attributable but is not
        // re-charged and is not falsified into zero.
        originCostUsd: entry.usage && entry.usage.status === 'known' ? entry.usage.costUsd : null,
        requestCount: 0,
      }
    },
    set(input, scores, usage, fairness) {
      if (!input.state.cacheable) return
      // Only a complete, definite scoring result is cacheable. Failures, uncertainty and
      // cancellation arrive here as a null or empty score set and are refused.
      if (!scores || scores.length === 0) return
      const key = scoreCacheKey(input, fairness)
      entries.delete(key)
      entries.set(key, { scores, usage, storedAt: now() })
      while (entries.size > options.capacity) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    },
    invalidateAll() {
      entries.clear()
    },
    stats() {
      return { hits, misses, size: entries.size }
    },
  }
}
