import type { RunEvent } from '../shared/types.ts'
import { proofDigest } from './completion.ts'

export interface BlockerEvidence {
  readonly eventId: string
  readonly digest: string
}

// Transport/execution failures are not policy blockers. Unknown reason codes fail closed.
const boundaryReasons = new Set([
  'port-not-allowed',
  'resolution-failed',
  'write-denied',
  'unsupported-data-method',
  'resource-origin-denied',
  'data-origin-denied',
  'outside-navigation-scope',
  'unsupported-channel',
  'control-surface',
  'private-address',
  'malformed-url',
  'request-budget-exhausted',
  'response-budget-exhausted',
])

export function isUiBlockerEvent(event: RunEvent): boolean {
  const p = event.payload
  if (typeof p.url !== 'string' || !p.url) return false
  if (event.type === 'network:channel-denied')
    return ['new-window', 'websocket'].includes(String(p.dimension))
  return (
    event.type === 'network:decision' &&
    p.allow === false &&
    boundaryReasons.has(String(p.reasonCode)) &&
    typeof p.requestId === 'string' &&
    !!p.requestId &&
    typeof p.method === 'string' &&
    !!p.method &&
    typeof p.policyRevision === 'string' &&
    !!p.policyRevision
  )
}

/** The seal binds the exact durable event, not just its URL or a model-supplied description. */
export function collectUiBlockers(runId: string, events: readonly RunEvent[]): BlockerEvidence[] {
  return events
    .filter((e) => e.runId === runId && isUiBlockerEvent(e))
    .map((e) => ({ eventId: e.id, digest: proofDigest(e) }))
}

export function blockerHistoryIssues(
  runId: string,
  history: readonly RunEvent[],
  refs: readonly BlockerEvidence[] | undefined,
  required: boolean,
): string[] {
  if (!Array.isArray(refs) || (required && refs.length === 0))
    return required ? ['blocker-proof-missing'] : []
  const valid = new Map(collectUiBlockers(runId, history).map((r) => [r.eventId, r.digest]))
  if (
    new Set(refs.map((r) => r.eventId)).size !== refs.length ||
    refs.some((r) => !r || valid.get(r.eventId) !== r.digest)
  )
    return ['blocker-proof-mismatch']
  return []
}
