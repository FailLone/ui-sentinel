import type { RunEvent } from '../shared/types.ts'
export const terminalStatuses = new Set(['completed', 'blocked', 'timed-out', 'cancelled', 'execution-error', 'interrupted'])
export function mergeEvents(previous: readonly RunEvent[], incoming: readonly RunEvent[]): RunEvent[] {
  const byId = new Map(previous.map(event => [event.id, event]))
  for (const event of incoming) byId.set(event.id, event)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}
export function artifactUrl(runId: string, id: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(id)}`
}
