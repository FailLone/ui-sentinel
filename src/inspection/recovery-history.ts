import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { RunEvent } from '../shared/types.ts'
import { recoveryDigest } from '../execution/interaction-recovery.ts'
/** The recovery chain is validated independently of the current in-memory registry. */
export function recoveryHistoryIssues(events: readonly RunEvent[]): string[] {
  const issues: string[] = []
  const record = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
  for (const event of events.filter((e) => e.type === 'interaction:recovered')) {
    const r = event.payload as any
    if (
      !record(r) ||
      !record(r.input) ||
      !Array.isArray(r.observationRefs) ||
      !['verified', 'failed', 'unverified'].includes(r.outcome)
    ) {
      issues.push('recovery-receipt-invalid')
      continue
    }
    const sourceEvent = events.find(
      (e) => e.type === 'interaction:verification-opened' && e.payload.checkRef === r.checkRef,
    )
    const source = sourceEvent?.payload as any
    const action = events.find((e) => e.type === 'action:executing' && e.actionId === r.actionId)
    const completed = events.find((e) => e.type === 'action:completed' && e.actionId === r.actionId)
    if (
      !sourceEvent ||
      !record(source) ||
      !record(source.evidenceHashes) ||
      !Object.keys(source.evidenceHashes).length ||
      !record(source.input) ||
      !action ||
      !completed ||
      !record(action.payload.verification)
    ) {
      issues.push('recovery-source-missing')
      continue
    }
    const { sourceHash, ...check } = source
    const original = events
      .filter(
        (e) =>
          e.type === 'scope:item-updated' &&
          e.payload.itemId === source.itemId &&
          e.seq < sourceEvent.seq,
      )
      .at(-1)
    const created = events.find(
      (e) => e.type === 'scope:item-created' && e.payload.itemId === source.itemId,
    )
    if (
      original?.payload.status !== 'unverified' ||
      created?.payload.category !== 'local-interaction' ||
      !sourceEvent.evidenceRefs.length ||
      Object.keys(source.evidenceHashes ?? {}).some(
        (ref) => !sourceEvent.evidenceRefs.includes(ref),
      )
    )
      issues.push('recovery-original-item-invalid')
    if (
      [sourceEvent, action, completed].some((e) => e.runId !== event.runId) ||
      sourceEvent.actionId !== r.actionId ||
      event.actionId !== r.actionId ||
      sourceHash !== recoveryDigest(check) ||
      r.sourceHash !== sourceHash ||
      source.itemId !== r.itemId ||
      source.actionId !== r.actionId ||
      recoveryDigest(r.input) !== recoveryDigest(source.input) ||
      recoveryDigest(action.payload.verification) !== recoveryDigest(source.input)
    )
      issues.push('recovery-association-mismatch')
    if (
      !(
        action.seq < completed.seq &&
        completed.seq < sourceEvent.seq &&
        sourceEvent.seq < event.seq
      ) ||
      events.some(
        (e) =>
          e.seq > action.seq &&
          e.seq < event.seq &&
          (e.type === 'action:executing' || e.type === 'execution:intervention'),
      )
    )
      issues.push('recovery-order-invalid')
    const { receiptRef, receiptHash, ...body } = r
    if (
      receiptHash !== recoveryDigest(body) ||
      !event.evidenceRefs.includes(receiptRef) ||
      !r.observationRefs?.length ||
      r.observationRefs.some(
        (ref: string) =>
          !events.some(
            (e) =>
              e.runId === event.runId &&
              e.type === 'page:observed' &&
              e.seq > sourceEvent.seq &&
              e.seq < event.seq &&
              e.evidenceRefs.includes(ref),
          ),
      )
    )
      issues.push('recovery-receipt-invalid')
  }
  for (const event of events.filter(
    (e) =>
      e.type === 'scope:item-updated' && e.payload.reasonCode === 'interaction-recovery-measured',
  )) {
    if (
      !events.some(
        (e) =>
          e.type === 'interaction:recovered' &&
          e.seq < event.seq &&
          e.payload.itemId === event.payload.itemId &&
          e.payload.outcome === event.payload.status &&
          (event.payload.eventIds as string[])?.includes(e.id),
      )
    )
      issues.push('recovery-resolution-unlinked')
  }
  return [...new Set(issues)]
}
export async function recoveryArtifactIssues(
  events: readonly RunEvent[],
  paths: ReadonlyMap<string, string>,
): Promise<string[]> {
  const issues: string[] = []
  for (const event of events.filter((e) =>
    ['interaction:verification-opened', 'interaction:recovered'].includes(e.type),
  )) {
    try {
      if (event.type === 'interaction:verification-opened') {
        for (const [ref, hash] of Object.entries(
          event.payload.evidenceHashes as Record<string, string>,
        )) {
          if (
            createHash('sha256')
              .update(await readFile(paths.get(ref)!))
              .digest('hex') !== hash
          )
            throw Error('source changed')
        }
      } else {
        const r = event.payload as any
        if (
          recoveryDigest(JSON.parse(await readFile(paths.get(r.receiptRef)!, 'utf8'))) !==
          r.receiptHash
        )
          throw Error('receipt changed')
      }
    } catch {
      issues.push('recovery-artifact-unverified')
    }
  }
  return [...new Set(issues)]
}
