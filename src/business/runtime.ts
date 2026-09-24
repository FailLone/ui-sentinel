import { createHash } from 'node:crypto'
import { resolveProfile } from './registry.ts'
import { resolveEnvironment } from './environments.ts'
import {
  decodeFact,
  resolveAdapter,
  type BusinessFact,
  type PublicExchange,
  type PublicRequest,
  type RequestIntent,
} from './adapters/index.ts'
import type { BusinessContractSnapshot } from './types.ts'

/**
 * Run-scoped business runtime.
 *
 * A run reads its configuration exactly once, from the snapshot persisted with the run. Nothing
 * here consults the live registry for requirements, thresholds or effects: a queued run that
 * survives a restart must execute the contract it was created with, and must fail loudly if that
 * adapter revision is no longer loadable rather than silently running today's defaults.
 */
export interface BusinessRuntime {
  readonly contract: BusinessContractSnapshot
  readonly adapterId: string
  readonly adapterRevision: string
  classifyRequest(request: PublicRequest): RequestIntent
  decodeResponse(exchange: PublicExchange): BusinessFact | null
  /** True when this run's declared adapter revision is still the registered one. */
  adapterAvailable(): boolean
}

export class AdapterUnavailableError extends Error {
  constructor(
    readonly adapterId: string,
    readonly revision: string,
  ) {
    super(`adapter-revision-unavailable:${adapterId}@${revision}`)
    this.name = 'AdapterUnavailableError'
  }
}

/**
 * Resolve a runtime from a persisted snapshot. Throws AdapterUnavailableError when the exact
 * adapter revision recorded in the snapshot is not the one this build provides, so the run stops
 * with a stated reason instead of applying a newer contract to an older request.
 */
export function createBusinessRuntime(contract: BusinessContractSnapshot): BusinessRuntime {
  const adapter = resolveAdapter(contract.adapter.id, contract.adapter.revision)
  if (!adapter) throw new AdapterUnavailableError(contract.adapter.id, contract.adapter.revision)
  // The environment must still be one this build serves, but its origin comes from the snapshot
  // so a changed port cannot silently retarget an in-flight contract.
  if (!resolveEnvironment(contract.environment.id))
    throw new AdapterUnavailableError(contract.environment.id, 'environment')
  return Object.freeze({
    contract,
    adapterId: adapter.id,
    adapterRevision: adapter.revision,
    classifyRequest: (request: PublicRequest) => adapter.classifyRequest(request),
    decodeResponse: (exchange: PublicExchange) => adapter.decodeResponse(exchange),
    adapterAvailable: () =>
      resolveAdapter(contract.adapter.id, contract.adapter.revision) !== undefined,
  })
}

/** Verify a snapshot's own hash before trusting it. Detects a tampered or truncated record. */
export function verifyContractSnapshot(contract: BusinessContractSnapshot): boolean {
  const { hash, ...rest } = contract
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  const expected = createHash('sha256').update(canonical(rest)).digest('hex')
  return expected === hash
}

/**
 * Identity of the operation a fact belongs to. `operationId` is entity identity, `attempt` is how
 * many times that entity has been tried, so the pair - not either alone - keys deduplication and
 * ordering. A fact with a missing identity cannot be correlated to a dispatched action.
 */
export function operationKey(operationId: string, attempt: number): string {
  return `${operationId}#${attempt}`
}

/** Result/phase vocabulary shared by every adapter. */
export type FactPhase = BusinessFact['phase']
export type FactResult = BusinessFact['result']
export type RetryEligibility = BusinessFact['retryEligibility']

/** A business outcome may only be concluded from a succeeded or rejected fact with an identity. */
export function concludeBusinessResult(facts: readonly BusinessFact[]): FactResult {
  const correlated = facts.filter((f) => f.operationId && f.phase !== 'processing')
  const succeeded = correlated.filter((f) => f.phase === 'succeeded')
  if (succeeded.length) return 'success'
  const rejected = correlated.filter((f) => f.phase === 'rejected')
  if (rejected.length && rejected.length === correlated.length) return 'rejected'
  return 'unknown'
}

/** Ordering key for fact deduplication: identity, attempt and the business status version. */
export function factOrderKey(fact: BusinessFact): string {
  return `${operationKey(fact.operationId, fact.attempt)}#${fact.version}`
}

/**
 * A retry may only fire when the newest fact for the entity explicitly allows it and the declared
 * policy permits one. Cooldown, exhausted allowance, in-flight work and unmet prerequisites all
 * deny eligibility rather than being treated as a defect.
 */
export function retryVerdict(
  fact: BusinessFact,
  contract: BusinessContractSnapshot,
): { eligible: false; reason: string } | { eligible: true; operationId: string; attempt: number } {
  if (fact.phase !== 'failed') return { eligible: false, reason: 'not-a-failed-operation' }
  if (fact.retryEligibility !== 'allowed')
    return { eligible: false, reason: `retry-${fact.retryEligibility}` }
  if (contract.effects.maxRetriesPerOperation < 1)
    return { eligible: false, reason: 'retry-not-permitted-by-contract' }
  const signal = fact.retry
  if (!signal) return { eligible: false, reason: 'retry-decision-missing' }
  if (signal.permitted !== true) return { eligible: false, reason: 'retry-not-permitted' }
  if (!signal.prerequisitesMet) return { eligible: false, reason: 'retry-prerequisites-unmet' }
  if (signal.remaining < 1) return { eligible: false, reason: 'retry-allowance-exhausted' }
  if (signal.afterMs > 0) return { eligible: false, reason: 'retry-cooldown-active' }
  if (fact.attempt + 1 > contract.effects.maxRetriesPerOperation)
    return { eligible: false, reason: 'retry-already-used' }
  return { eligible: true, operationId: fact.operationId, attempt: fact.attempt + 1 }
}
