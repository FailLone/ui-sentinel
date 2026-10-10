import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { hash } from '../agent/popup/contract.ts'
import { judgePopup } from '../execution/popup/geometry.ts'
import { floatingSurface } from '../execution/popup/surface.ts'
import { cleanEvidenceIntegrity } from '../shared/evidence-integrity.ts'
import type { Run, RunEvent } from '../shared/types.ts'
export async function popupUiArtifactIssues(
  run: Run,
  events: readonly RunEvent[],
  artifacts: readonly { id: string; type: string; path: string; metadata: any }[],
) {
  const issues: string[] = [],
    measurements = new Map<string, any>()
  for (const event of events.filter((e) =>
    ['popup:ui-measurement', 'popup:ui-summary'].includes(e.type),
  ))
    try {
      const summary = event.type === 'popup:ui-summary',
        a = artifacts.find((a) => a.id === event.payload.receiptRef)
      if (
        !a ||
        a.type !== (summary ? 'popup-ui-summary' : 'popup-ui-measurement') ||
        !cleanEvidenceIntegrity(a.metadata?.evidenceIntegrity)
      )
        throw Error('missing-or-intervened')
      const b = JSON.parse(await readFile(a.path, 'utf8'))
      if (
        hash(b) !== event.payload.receiptHash ||
        b.contractHash !== run.spec.uiContract?.hash ||
        b.taskId !== event.payload.taskId ||
        b.actionId !== null ||
        b.itemId !== null ||
        !b.frame?.reusable ||
        b.revision !== (summary ? 'popup-ui-summary-2' : 'popup-ui-measurement-2')
      )
        throw Error('receipt-invalid')
      if (
        !b.evidenceRefs.length ||
        !b.evidenceHashes ||
        Object.keys(b.evidenceHashes).length !== b.evidenceRefs.length ||
        !event.evidenceRefs.includes(a.id)
      )
        throw Error('seal-missing')
      for (const ref of b.evidenceRefs) {
        const file = artifacts.find((a) => a.id === ref)
        if (
          !file ||
          !event.evidenceRefs.includes(ref) ||
          !cleanEvidenceIntegrity(file.metadata?.evidenceIntegrity) ||
          createHash('sha256')
            .update(await readFile(file.path))
            .digest('hex') !== b.evidenceHashes[ref]
        )
          throw Error('evidence-changed-or-unowned')
      }
      if (summary) {
        const ids = b.frame.panels.filter((p: any) => p.visible).map((p: any) => p.id)
        if (
          !Array.isArray(b.checks) ||
          new Set(b.checks.map((c: any) => c.targetId)).size !== b.checks.length ||
          b.checks.some((c: any) => !ids.includes(c.targetId))
        )
          throw Error('summary-targets-invalid')
        for (const c of b.checks) {
          const m = measurements.get(c.receiptRef)
          if (
            !m ||
            !b.evidenceRefs.includes(c.receiptRef) ||
            m.targetId !== c.targetId ||
            m.measurement.verdict !== c.verdict ||
            hash(m.frame) !== hash(b.frame)
          )
            throw Error('summary-measurement-invalid')
        }
        const unchecked = ids.filter((id: string) => !b.checks.some((c: any) => c.targetId === id))
        const verdict =
          unchecked.length || !b.checks.length || b.checks.some((c: any) => c.verdict === 'unknown')
            ? 'unknown'
            : b.checks.some((c: any) => c.verdict === 'fail')
              ? 'fail'
              : 'pass'
        if (
          hash(unchecked) !== hash(b.unchecked) ||
          b.verdict !== verdict ||
          event.payload.verdict !== verdict
        )
          throw Error('summary-verdict-invalid')
      } else {
        const p = b.frame.panels.find((p: any) => p.id === b.targetId && p.visible)
        if (
          !p ||
          b.relation !== 'observed-visible-surface' ||
          b.ruleRevision !== 'popup-visible-viewport-2' ||
          b.applicable !== floatingSurface(p.kind, p.surface) ||
          b.measurement.targetId !== p.id ||
          event.payload.targetId !== b.targetId ||
          event.payload.reason !== b.measurement.reason ||
          event.payload.verdict !== b.measurement.verdict ||
          !b.evidenceRefs.includes(b.screenshotRef) ||
          !artifacts.some((a) => a.id === b.screenshotRef && a.type === 'screenshot')
        )
          throw Error('target-invalid')
        if (
          b.applicable
            ? hash(judgePopup(b.measurement.samples)) !== hash(b.measurement)
            : b.measurement.verdict !== 'unknown' ||
              b.measurement.samples.length ||
              b.measurement.reason !== 'floating-surface-type-unconfirmed'
        )
          throw Error('geometry-invalid')
        if (b.measurement.verdict !== 'unknown' && hash(p) !== hash(b.measurement.samples[0]))
          throw Error('sample-unbound')
        measurements.set(a.id, b)
      }
    } catch (e) {
      issues.push('popup-ui-evidence-invalid:' + String(e))
    }
  return issues
}
