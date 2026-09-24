import { stat } from 'node:fs/promises'
import { getRunSnapshot, isRunActive } from '../../execution/run-manager.ts'
import { completionIssues } from '../../execution/completion-integrity.ts'
import { interventionLimitation } from '../../shared/evidence-integrity.ts'
import { unresolvedAnalyses } from './legacy-analysis.ts'
import type { AnalysisTask } from './legacy-analysis-types.ts'
import { terminalRunStatuses as terminals } from '../../execution/run-status.ts'

export async function buildReport(runId: string) {
  const snapshot = await getRunSnapshot(runId)
  if (!snapshot) return null
  const { run, findings, events, hypothesisRows, artifactRows } = snapshot
  const active = isRunActive(runId)
  const settled = !active && ['completed', 'blocked'].includes(run.status)
  const issues = settled ? completionIssues(run, events) : []
  if (events.some((e) => e.type === 'run:storage-inconsistent'))
    issues.push('completion-commit-unverified')
  const invalid = issues.length > 0
  const artifacts = await Promise.all(
    artifactRows.rows.map(async (row) => {
      const id = String(row.id)
      let available = false
      try {
        available = (await stat(String(row.file_path))).isFile()
      } catch {
        /* evidence remains explicitly unavailable */
      }
      return {
        id,
        type: String(row.type),
        kind: String(row.type),
        metadata: JSON.parse(String(row.metadata)),
        available,
        url: `/api/runs/${runId}/artifacts/${encodeURIComponent(id)}`,
      }
    }),
  )
  const hypotheses = hypothesisRows.rows.map((row) => ({
    id: String(row.id),
    runId,
    phenomenon: String(row.phenomenon),
    basis: String(row.basis),
    verificationPlan: String(row.verification_plan),
    status: String(row.status),
    evidenceRefs: JSON.parse(String(row.evidence_refs)),
  }))
  const evaluations = events
    .filter((e) => e.type === 'rule:evaluated')
    .map((e) => ({
      ...e.payload,
      verdict: e.payload.verdict,
      eventId: e.id,
      stepId: e.stepId,
      evidenceRefs: e.evidenceRefs,
    }))
  const exploredStates = [
    ...new Set(
      events
        .filter((e) => e.type === 'exploration:state-reached')
        .map((e) => String(e.payload.state ?? e.payload.url ?? 'unknown')),
    ),
  ]
  const lastTask = [...events]
    .reverse()
    .find(
      (e) =>
        [
          'finish:accepted',
          'execution:partial',
          'execution:stopped',
          'exploration:coverage-updated',
        ].includes(e.type) && e.payload.task,
    )?.payload.task as
    | {
        unexploredBranches?: (
          | string
          | { description: string; trigger: string; applicability: string }
        )[]
        conditions?: unknown[]
      }
    | undefined
  const interventions = events.filter((e) => e.type === 'execution:intervention')
  const unverifiedInterventionScope = interventions.length ? [interventionLimitation] : []
  const unexploredBranches = [
    ...(lastTask?.unexploredBranches
      ? lastTask.unexploredBranches
          .filter((b) => typeof b === 'string' || b.applicability !== 'not-triggered')
          .map((b) => (typeof b === 'string' ? b : b.description))
      : events
          .filter(
            (e) =>
              e.type === 'exploration:branch-skipped' || e.type === 'exploration:branch-pending',
          )
          .map((e) => String(e.payload.branch ?? 'unknown'))),
    ...unverifiedInterventionScope,
  ]
  const untriggeredBranches =
    lastTask?.unexploredBranches?.filter(
      (b) => typeof b !== 'string' && b.applicability === 'not-triggered',
    ) ?? []
  const executionErrors = events.filter((e) =>
    ['action:failed', 'run:error', 'agent:error'].includes(e.type),
  )
  const analysisTasks = [
    ...new Map(
      events
        .filter((e) => e.type === 'analysis:state')
        .map((e) => [String(e.payload.id), e.payload as unknown as AnalysisTask]),
    ).values(),
  ]
  return {
    runId,
    status: invalid
      ? 'execution-error'
      : active && terminals.has(run.status)
        ? 'running'
        : run.status,
    businessResult: invalid ? 'unknown' : run.businessResult,
    stopReason: invalid ? 'reconciliation-required' : run.stopReason,
    persistence: {
      status: invalid ? 'inconsistent' : settled ? 'verified' : 'not-final',
      issues,
      recordedStatus: run.status,
      recordedBusinessResult: run.businessResult,
      recordedStopReason: run.stopReason,
      readConsistency: 'single-read-transaction',
    },
    conclusion: {
      reasonCode:
        [...events].reverse().find((e) => e.type === 'finish:accepted')?.payload.reasonCode ?? null,
      reason: invalid
        ? 'Execution records are incomplete or inconsistent; completion is unverified.'
        : ([...events].reverse().find((e) => e.type === 'finish:accepted')?.payload.summary ??
          null),
      source: invalid ? 'unverified-persistence' : 'persisted-evidence',
      supportedFindingIds: findings
        .filter((f) => f.validationStatus === 'supported')
        .map((f) => f.id),
      unresolvedFindingIds: findings
        .filter((f) => ['candidate', 'inconclusive'].includes(f.validationStatus))
        .map((f) => f.id),
    },
    inspectionIntegrity: {
      status: interventions.length ? 'intervened' : 'no-recorded-intervention',
      interventions: interventions.map((e) => ({ ...e.payload, eventId: e.id, seq: e.seq })),
      affectedArtifactIds: artifacts
        .filter((a) => a.metadata.evidenceIntegrity?.status === 'intervened')
        .map((a) => a.id),
    },
    findings,
    usage: run.usage,
    budget: run.spec.budget,
    events,
    hypotheses,
    artifacts,
    evaluations,
    evidenceRefs: artifacts.map((a) => a.id),
    exploredStates,
    unexploredBranches,
    untriggeredBranches,
    conditions: lastTask?.conditions ?? [],
    analysisTasks,
    evaluatedRuleCount: evaluations.length,
    unknownCount:
      evaluations.filter((e) => e.verdict === 'unknown').length +
      findings.filter((f) => f.validationStatus === 'inconclusive').length +
      unverifiedInterventionScope.length,
    coverage: {
      exploredStates,
      unexploredBranches,
      checks: evaluations.length ? 'checked' : 'not-checked',
      executionErrors,
      unverifiedInterventionScope,
      unverifiedAnalysisTasks: unresolvedAnalyses(analysisTasks).map((t) => t.id),
      persistenceIssues: issues,
      stopReason: invalid ? 'reconciliation-required' : run.stopReason,
    },
  }
}
