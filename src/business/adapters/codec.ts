import type { BusinessFact } from './types.ts'

/**
 * Facts cross a persistence boundary, so they are decoded defensively: a stored fact that does
 * not match the declared shape yields `null` rather than being half-trusted. This is the reason
 * `decodeFact` lives in its own module - both the event log and the rule layer read through it.
 */
function isRetrySignal(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const signal = value as Record<string, unknown>
  return (
    typeof signal.permitted === 'boolean' &&
    Number.isFinite(signal.remaining) &&
    Number.isFinite(signal.afterMs) &&
    typeof signal.prerequisitesMet === 'boolean'
  )
}

export function decodeFact(value: unknown): BusinessFact | null {
  if (!value || typeof value !== 'object') return null
  const f = value as Record<string, unknown>
  if (f.schemaVersion !== '1') return null
  if (typeof f.operationId !== 'string' || !f.operationId) return null
  if (!Number.isInteger(f.attempt) || (f.attempt as number) < 0) return null
  if (!Number.isInteger(f.version) || (f.version as number) < 0) return null
  if (!['processing', 'succeeded', 'rejected', 'failed'].includes(String(f.phase))) return null
  if (!['success', 'rejected', 'unknown'].includes(String(f.result))) return null
  if (!['allowed', 'denied', 'unknown'].includes(String(f.retryEligibility))) return null
  if (f.retry !== null && f.retry !== undefined && !isRetrySignal(f.retry)) return null
  return {
    schemaVersion: '1',
    profileId: String(f.profileId) as BusinessFact['profileId'],
    contractHash: String(f.contractHash ?? ''),
    operationId: String(f.operationId),
    attempt: f.attempt as number,
    version: f.version as number,
    phase: f.phase as BusinessFact['phase'],
    result: f.result as BusinessFact['result'],
    retryEligibility: f.retryEligibility as BusinessFact['retryEligibility'],
    notice: typeof f.notice === 'string' ? f.notice : null,
    retry: (f.retry ?? null) as BusinessFact['retry'],
    sourceEventId: typeof f.sourceEventId === 'string' ? f.sourceEventId : null,
    evidenceRefs: Array.isArray(f.evidenceRefs)
      ? f.evidenceRefs.filter((r): r is string => typeof r === 'string')
      : [],
    observedAt: String(f.observedAt ?? ''),
  }
}
