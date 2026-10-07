import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { RunEvent } from '../shared/types.ts'

export function probeHistoryIssues(events: readonly RunEvent[]): string[] {
  const issues: string[] = []
  for (const e of events.filter((e) => e.type === 'probe:measured')) {
    const p = e.payload as any
    const action = events.find(
      (a) => a.type === 'action:executing' && a.actionId === e.actionId && a.seq < e.seq,
    )
    const binding = events.find(
      (a) =>
        ['scope:candidate-bound', 'scope:candidate-reobserved'].includes(a.type) &&
        a.seq < e.seq &&
        a.payload.itemId === p.itemId &&
        a.payload.ref === p.ref &&
        a.payload.snapshotId === p.sourceSnapshot,
    )
    const intercepted = (m: any) =>
      m?.exists === true &&
      m.displayed === true &&
      m.enabled === true &&
      m.viewportFraction === 1 &&
      m.unclippedFraction === 1 &&
      m.hitFraction === 0
    if (
      !action ||
      action.payload.type !== 'probe' ||
      action.payload.target !== p.target ||
      !binding ||
      [action, binding].some((a) => a.runId !== e.runId) ||
      p.runId !== e.runId ||
      p.actionId !== e.actionId ||
      p.version !== 1 ||
      p.dispatched !== false ||
      p.method !== 'bound-trial-and-geometry' ||
      !['intercepted', 'actionable'].includes(p.outcome) ||
      (p.outcome === 'intercepted' && (!intercepted(p.before) || !intercepted(p.after))) ||
      !e.evidenceRefs.includes(p.receiptRef) ||
      !p.evidenceRefs?.length ||
      p.evidenceRefs.some((ref: string) => !e.evidenceRefs.includes(ref))
    )
      issues.push('probe-receipt-invalid')
  }
  for (const e of events.filter(
    (e) => e.type === 'scope:item-updated' && e.payload.reasonCode === 'probe-intercepted',
  )) {
    if (
      !events.some(
        (p) =>
          p.type === 'probe:measured' &&
          p.seq < e.seq &&
          p.runId === e.runId &&
          p.payload.itemId === e.payload.itemId &&
          p.payload.outcome === 'intercepted' &&
          e.payload.status === 'failed' &&
          e.payload.detail === p.payload.receiptRef &&
          (e.payload.evidenceRefs as string[])?.includes(String(p.payload.receiptRef)),
      )
    )
      issues.push('probe-resolution-unlinked')
  }
  return [...new Set(issues)]
}

export async function probeArtifactIssues(
  events: readonly RunEvent[],
  paths: ReadonlyMap<string, string>,
) {
  const issues: string[] = []
  for (const e of events.filter((e) => e.type === 'probe:measured')) {
    try {
      const { receiptRef, sha256, ...body } = e.payload
      const raw = await readFile(paths.get(String(receiptRef))!)
      if (
        createHash('sha256').update(raw).digest('hex') !== sha256 ||
        JSON.stringify(JSON.parse(raw.toString())) !== JSON.stringify(body)
      )
        throw Error('probe-bytes-mismatch')
    } catch {
      issues.push('probe-artifact-unverified')
    }
  }
  return issues
}
