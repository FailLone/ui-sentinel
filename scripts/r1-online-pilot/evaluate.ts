import { EVALUATION_VERSION, firstMeasurementEvent } from './measurement.ts'
/** Frozen fixture evaluation. Ranking choice is never a success criterion. */
export function evaluate(report: any, scenario: string, artifactIds: Set<string>) {
  const items = report.uiScan.inspection.items
  const effects = items.flatMap((i: any) =>
    (i.checks?.effects ?? []).map((e: any) => ({ itemId: i.itemId, ...e })),
  )
  const settled = effects.filter(
    (e: any) =>
      ['verified', 'failed'].includes(e.state) &&
      e.measurementRefs?.length &&
      e.measurementRefs.every((id: string) => artifactIds.has(id)),
  )
  const defectControl =
    scenario === 'expanded' ? 'Continue' : scenario === 'ambiguity' ? 'Configure' : null
  const failures = settled.filter(
    (e: any) => e.state === 'failed' && e.controlBinding?.name === defectControl,
  )
  const findings = report.findings.filter((f: any) => {
    try {
      const actual = JSON.parse(f.actual)
      return (
        f.validationStatus === 'supported' &&
        actual.outcome === 'failed' &&
        failures.some(
          (e: any) => e.requirementId === actual.requirementId && e.itemId === actual.itemId,
        ) &&
        f.evidenceRefs.length &&
        f.evidenceRefs.every((id: string) => artifactIds.has(id))
      )
    } catch {
      return false
    }
  })
  const events = report.events
  const start = events.find((e: any) => e.type === 'run:started')?.timestamp
  const reads = events.filter(
    (e: any) =>
      e.type === 'tool:started' &&
      ['page_inspect', 'page_observe', 'element_details'].includes(e.payload.tool),
  )
  const targets = events
    .filter((e: any) => e.type === 'action:executing')
    .map((e: any) => e.payload.target)
  const concluded = report.status === 'completed'
  return {
    version: EVALUATION_VERSION,
    ...firstMeasurementEvent(report, artifactIds),
    reference: 'fixture behavior; development reference, not a preferred candidate label',
    expectedDefects: defectControl ? 1 : 0,
    evidenceBackedExpectedFindings: findings.length,
    expectedDefectsNotFound: defectControl ? Math.max(0, 1 - findings.length) : 0,
    unmatchedFindings: report.findings.length - findings.length,
    falsePositiveCount: report.findings.length === findings.length ? 0 : null,
    unmatchedFindingPolicy: 'requires evidence review; not automatically labeled false or ignored',
    settledEffects: settled.length,
    checkedAndRemaining: report.uiScan.inspection.counts,
    firstFindingMs:
      start && findings[0] ? Date.parse(findings[0].createdAt) - Date.parse(start) : null,
    explicitReads: reads.length,
    uselessReadCount: reads.length === 0 ? 0 : null,
    readPolicy: 'read count alone does not establish lack of information gain',
    repeatedTargetDispatches: targets.length - new Set(targets).size,
    handoffs: events.filter((e: any) => e.type === 'r1:handoff').length,
    partial: !concluded,
    falseSuccess:
      concluded &&
      (defectControl
        ? findings.length !== 1
        : report.uiScan.checkCounts.requiredEffectVerifiedCount < 1 ||
          report.findings.length !== 0),
    persistenceVerified: report.persistence?.status === 'verified',
  }
}
