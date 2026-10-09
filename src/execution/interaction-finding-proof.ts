import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { RunEvent } from '../shared/types.ts'
import { cleanEvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { recoveryDigest } from './interaction-recovery.ts'
import { evaluateInteraction, interactionVerificationInput } from './interaction-verification.ts'
import { recoveryArtifactIssues, recoveryHistoryIssues } from '../inspection/recovery-history.ts'

export type InteractionArtifact = { id: string; type: string; path: string; metadata: any }
export const digestBytes = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex')

/** Check the immutable server association, then replay only the recorded, pre-action predicate. */
export async function assertInteractionFindingProof(
  runId: string,
  events: readonly RunEvent[],
  artifacts: readonly InteractionArtifact[],
  hypothesisId: string,
  refs: readonly string[],
) {
  const seals = events.filter(
    (e) => e.type === 'interaction:finding-measured' && e.payload.hypothesisId === hypothesisId,
  )
  if (seals.length !== 1) throw Error('interaction-finding-seal-required')
  const seal = seals[0]!,
    p = seal.payload as any
  if (seal.runId !== runId || !p.evidenceHashes || !Object.keys(p.evidenceHashes).length)
    throw Error('interaction-finding-ownership')
  for (const [id, hash] of Object.entries(p.evidenceHashes)) {
    const artifact = artifacts.find((a) => a.id === id)
    if (
      !refs.includes(id) ||
      !artifact ||
      !cleanEvidenceIntegrity(artifact.metadata?.evidenceIntegrity) ||
      digestBytes(await readFile(artifact.path)) !== hash
    )
      throw Error('interaction-finding-artifact-invalid')
  }
  const source = artifacts.find(
    (a) => a.id === p.receiptRef && a.type === 'interaction-measurement',
  )
  if (!source || !p.evidenceHashes[p.receiptRef])
    throw Error('interaction-finding-receipt-required')
  const receipt = JSON.parse(await readFile(source.path, 'utf8'))
  const input = interactionVerificationInput.parse(receipt.input)
  const action = events.find((e) => e.type === 'action:executing' && e.actionId === p.actionId)
  const completed = events.find((e) => e.type === 'action:completed' && e.actionId === p.actionId)
  const measured = events.find((e) => e.id === p.measurementEventId)
  const created = events.find(
    (e) => e.type === 'scope:item-created' && e.payload.itemId === p.itemId,
  )
  const resolved = events.find((e) => e.id === p.resolutionEventId)
  if (
    !action ||
    !completed ||
    !measured ||
    !created ||
    !resolved ||
    [action, completed, measured, created, resolved].some((e) => e.runId !== runId) ||
    receipt.actionId !== p.actionId ||
    measured.actionId !== p.actionId ||
    created.payload.category !== 'local-interaction' ||
    resolved.type !== 'scope:item-updated' ||
    resolved.payload.itemId !== p.itemId ||
    resolved.payload.status !== 'failed' ||
    !(resolved.payload.evidenceRefs as string[])?.includes(p.receiptRef) ||
    !measured.evidenceRefs.includes(p.receiptRef) ||
    !['interaction:measured', 'interaction:recovered'].includes(measured.type) ||
    recoveryDigest(input) !== recoveryDigest(action.payload.verification) ||
    receipt.outcome !== 'failed' ||
    evaluateInteraction(input, receipt.measured) !== 'failed' ||
    receipt.binding?.mode !== 'post-action-current' ||
    receipt.binding.selector !== input.selector ||
    !(
      action.seq < completed.seq &&
      completed.seq < measured.seq &&
      measured.seq < resolved.seq &&
      resolved.seq < seal.seq
    ) ||
    events.some(
      (e) =>
        e.seq > action.seq &&
        e.seq < measured.seq &&
        ['action:executing', 'execution:intervention'].includes(e.type),
    )
  )
    throw Error('interaction-finding-association-invalid')
  if (
    measured.type === 'interaction:measured' &&
    (receipt.target !== action.payload.target ||
      measured.payload.target !== receipt.target ||
      measured.payload.sourceSnapshot !== receipt.sourceSnapshot)
  )
    throw Error('interaction-finding-target-invalid')
  if (
    !receipt.evidenceRefs?.length ||
    receipt.evidenceRefs.some(
      (id: string) =>
        !p.evidenceHashes[id] || !artifacts.some((a) => a.id === id && a.type === 'screenshot'),
    )
  )
    throw Error('interaction-finding-screenshot-required')
  const observation = events.find(
    (e) =>
      e.type === 'page:observed' &&
      e.seq > completed.seq &&
      e.seq < measured.seq &&
      e.evidenceRefs.length &&
      e.evidenceRefs.every((id) => !!p.evidenceHashes[id]),
  )
  if (!observation) throw Error('interaction-finding-observation-required')
  if (
    measured.type === 'interaction:recovered' &&
    (receipt.itemId !== p.itemId ||
      recoveryHistoryIssues(events).length ||
      (await recoveryArtifactIssues(events, new Map(artifacts.map((a) => [a.id, a.path])))).length)
  )
    throw Error('interaction-finding-recovery-invalid')
}

/** Used on a fresh completion reader and again when restoring historical reports. */
export async function interactionFindingIssues(
  runId: string,
  events: readonly RunEvent[],
  artifacts: readonly InteractionArtifact[],
): Promise<string[]> {
  try {
    for (const created of events.filter(
      (e) => e.type === 'hypothesis:created' && e.payload.kind === 'ui-interaction',
    ))
      if (
        !events.some(
          (e) =>
            e.type === 'interaction:finding-measured' &&
            e.payload.hypothesisId === created.payload.hypothesisId,
        )
      )
        throw Error('interaction-finding-seal-missing')
    for (const seal of events.filter((e) => e.type === 'interaction:finding-measured'))
      await assertInteractionFindingProof(
        runId,
        events,
        artifacts,
        String(seal.payload.hypothesisId),
        seal.evidenceRefs,
      )
    return []
  } catch {
    return ['interaction-finding-unverified']
  }
}
