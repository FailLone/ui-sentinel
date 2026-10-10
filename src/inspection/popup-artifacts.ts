import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { hash } from '../agent/popup/contract.ts'
import { judgePopup } from '../execution/popup/geometry.ts'
import { cleanEvidenceIntegrity } from '../shared/evidence-integrity.ts'
import type { Run, RunEvent } from '../shared/types.ts'

export async function popupArtifactIssues(
  run: Run,
  events: readonly RunEvent[],
  artifacts: readonly { id: string; type: string; path: string; metadata: any }[],
) {
  if (!run.spec.uiContract?.popupCheck) return []
  const issues: string[] = []
  for (const event of events.filter(
    (e) => e.type === 'popup:measurement' || e.type === 'popup:candidate-geometry',
  )) {
    try {
      const candidate = event.type === 'popup:candidate-geometry'
      const a = artifacts.find((a) => a.id === event.payload.receiptRef)
      if (
        !a ||
        a.type !== (candidate ? 'popup-candidate-geometry' : 'popup-measurement') ||
        !cleanEvidenceIntegrity(a.metadata?.evidenceIntegrity)
      )
        throw Error('popup-receipt-missing-or-intervened')
      const body = JSON.parse(await readFile(a.path, 'utf8'))
      if (
        hash(body) !== event.payload.receiptHash ||
        body.contractHash !== run.spec.uiContract.hash ||
        body.revision !== (candidate ? 'popup-candidate-geometry-1' : 'popup-receipt-1') ||
        body.taskId !== event.payload.taskId ||
        body.targetId !== body.measurement.targetId ||
        hash(judgePopup(body.measurement.samples)) !== hash(body.measurement) ||
        body.measurement.verdict !==
          (candidate ? event.payload.geometryVerdict : event.payload.verdict)
      )
        throw Error('popup-receipt-invalid')
      if (
        !artifacts.some((a) => a.id === body.screenshotRef && a.type === 'screenshot') ||
        !body.evidenceRefs.includes(body.screenshotRef)
      )
        throw Error('popup-screenshot-missing')
      const frame = candidate ? body.frame : body.after
      if (
        !frame?.reusable ||
        !frame.panels.some((p: any) => p.id === body.targetId && p.visible) ||
        body.evidenceRefs.length === 0 ||
        body.evidenceRefs.some((ref: string) => !artifacts.some((a) => a.id === ref))
      )
        throw Error('popup-target-unbound')
      if (
        !body.evidenceHashes ||
        Object.keys(body.evidenceHashes).length !== body.evidenceRefs.length
      )
        throw Error('popup-evidence-seal-missing')
      for (const ref of body.evidenceRefs) {
        const file = artifacts.find((a) => a.id === ref)!
        if (
          !cleanEvidenceIntegrity(file.metadata?.evidenceIntegrity) ||
          createHash('sha256')
            .update(await readFile(file.path))
            .digest('hex') !== body.evidenceHashes[ref]
        )
          throw Error('popup-evidence-bytes-changed')
      }
      if (candidate) {
        const target = frame.panels.find((p: any) => p.id === body.targetId && p.visible)
        if (
          body.association !== 'unconfirmed' ||
          event.payload.association !== 'unconfirmed' ||
          body.actionId !== null ||
          body.itemId !== null ||
          event.payload.targetId !== body.targetId ||
          body.policy !== 'popup-purpose-policy-2' ||
          !target ||
          target.unsupported.length ||
          !event.evidenceRefs.includes(a.id) ||
          body.evidenceRefs.some((ref: string) => !event.evidenceRefs.includes(ref)) ||
          (body.measurement.verdict !== 'unknown' &&
            hash(target) !== hash(body.measurement.samples[0]))
        )
          throw Error('popup-candidate-attribution-or-binding-invalid')
      } else if (body.actionId) {
        const original = events.find(
          (e) =>
            e.type === 'interaction:generic-collected-v2' &&
            e.payload.actionId === body.actionId &&
            e.payload.itemId === body.itemId,
        )
        if (!original || original.seq >= event.seq)
          throw Error('popup-original-item-association-missing')
        const action = events.find(
          (e) => e.type === 'action:executing' && e.actionId === body.actionId,
        )
        const done = events.find(
          (e) => e.type === 'action:completed' && e.actionId === body.actionId,
        )
        if (
          !action ||
          !done ||
          action.seq >= done.seq ||
          done.seq >= event.seq ||
          !body.itemId ||
          !body.before.entries.some((e: any) => e.id === body.itemId) ||
          body.before.panels.some((p: any) => p.id === body.targetId && p.visible)
        )
          throw Error('popup-action-binding-invalid')
      } else if (!frame.panels.some((p: any) => p.id === body.targetId && p.kind !== 'custom'))
        throw Error('popup-initial-target-ambiguous')
    } catch (error) {
      issues.push(
        'popup-evidence-invalid:' + (error instanceof Error ? error.message : 'unreadable'),
      )
    }
  }
  return issues
}
