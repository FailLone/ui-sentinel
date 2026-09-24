import { decodeFact } from './adapters/codec.ts'
import { factOrderKey } from './runtime.ts'
import type { BusinessFact, RetrySignal } from './adapters/types.ts'
import type { RunEvent } from '../shared/types.ts'

/**
 * The rule and task layers read *normalized* facts, never raw business payloads.
 *
 * This module is the single translation point: adapter output arrives as `business:fact` events
 * and is decoded, deduplicated and ordered here. Nothing downstream needs to know which business
 * produced a fact, so no rule or executor branch can be written against shopping vocabulary.
 */

/** Decode, drop malformed payloads, and order by the identity+attempt+version key. */
export function normalizeFactEvents(events: readonly RunEvent[]): BusinessFact[] {
  const byKey = new Map<string, BusinessFact>()
  for (const event of events) {
    if (event.type !== 'business:fact') continue
    const fact = decodeFact(event.payload)
    if (!fact) continue
    const key = factOrderKey(fact)
    const existing = byKey.get(key)
    // Same key means the same business fact; keep the first observation of it so a repeated
    // status read cannot re-open a closed investigation.
    //
    // `sourceEventId` stays the public observation the fact came from. Falling back to the fact
    // event's own id would make a fact cite itself as its own evidence, which is not evidence at
    // all - and would leave a rule binding unable to name the response it is bound to.
    if (!existing) byKey.set(key, { ...fact, sourceEventId: fact.sourceEventId ?? event.id })
  }
  return [...byKey.values()].sort((a, b) => (factOrderKey(a) < factOrderKey(b) ? -1 : 1))
}

/** The newest fact for one entity, chosen by business version rather than arrival order. */
export function latestFactForOperation(
  facts: readonly BusinessFact[],
  operationId: string,
): BusinessFact | undefined {
  return facts
    .filter((f) => f.operationId === operationId)
    .reduce<BusinessFact | undefined>(
      (best, fact) =>
        !best ||
        fact.version > best.version ||
        (fact.version === best.version && fact.attempt > best.attempt)
          ? fact
          : best,
      undefined,
    )
}

export interface RetryableTrigger {
  readonly eventRef: string
  readonly eventType: 'retryable-failure'
  readonly operationId: string
  readonly attempt: number
}

function retryAllowedFromSignal(signal: RetrySignal | null): boolean {
  return (
    signal !== null &&
    signal.permitted === true &&
    signal.prerequisitesMet !== false &&
    signal.remaining > 0 &&
    signal.afterMs <= 0
  )
}

/**
 * A retryable failure may only be offered from a fact that is explicitly eligible.
 *
 * `retryEligibility` is produced by the adapter from the public decision. A label, a button or an
 * error status alone is never enough: processing work, exhausted allowance, cooldown and unmet
 * prerequisites all deny eligibility instead of being read as a defect.
 */
export function retryableTriggerFromFacts(
  facts: readonly BusinessFact[],
  legacyEvents: readonly RunEvent[] = [],
  pageText = '',
): RetryableTrigger | undefined {
  const candidates = facts.filter((f) => f.phase === 'failed' && f.retryEligibility === 'allowed')
  for (const fact of [...candidates].sort((a, b) => (factOrderKey(a) < factOrderKey(b) ? 1 : -1))) {
    if (!retryAllowedFromSignal(fact.retry)) continue
    if (!fact.sourceEventId) continue
    return {
      eventRef: fact.sourceEventId,
      eventType: 'retryable-failure',
      operationId: fact.operationId,
      attempt: fact.attempt,
    }
  }
  // Compatibility: a shopping response already recorded as business:response under the old
  // shape still reaches a trigger, so existing shopping observations keep their meaning. Only
  // the checkout adapter produces these fields, so export can never satisfy this path.
  return legacyCheckoutTrigger(legacyEvents, pageText)
}

/**
 * The original shopping eligibility test, retained verbatim in behaviour.
 *
 * Kept in this module rather than the executor so exactly one place decides retry eligibility
 * from the legacy event shape, and it cannot be reached by a business that does not write it.
 */
export function legacyCheckoutTrigger(
  events: readonly RunEvent[],
  pageText: string,
): RetryableTrigger | undefined {
  const event = events.filter((e) => e.type === 'business:response').at(-1)
  if (!event) return undefined
  const p = event.payload
  if (
    p.success !== false ||
    p.status !== 'failed' ||
    p.canRetry !== true ||
    typeof p.orderId !== 'string' ||
    !p.orderId ||
    !pageText.includes(p.orderId) ||
    p.inProgress === true ||
    p.prerequisitesMet === false ||
    (typeof p.retryAfterMs === 'number' && p.retryAfterMs > 0) ||
    (typeof p.remainingAttempts === 'number' && p.remainingAttempts <= 0)
  )
    return undefined
  return { eventRef: event.id, eventType: 'retryable-failure', operationId: p.orderId, attempt: 0 }
}
