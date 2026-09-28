import { stat, readFile } from 'node:fs/promises'
import { getRunSnapshot, isRunActive } from '../../execution/run-manager.ts'
import { completionIssues } from '../../execution/completion-integrity.ts'
import { interventionLimitation } from '../../shared/evidence-integrity.ts'
import { unresolvedAnalyses } from './legacy-analysis.ts'
import type { AnalysisTask } from './legacy-analysis-types.ts'
import { terminalRunStatuses as terminals } from '../../execution/run-status.ts'
import type { RunSpec } from '../../shared/types.ts'
import { verifyContractSnapshot } from '../../business/runtime.ts'

/**
 * Report-facing business provenance.
 *
 * `legacy-unversioned` is a real state, not a missing value to be filled in: a run with no
 * persisted contract is reported as unversioned and its `requirements` stay empty. Deriving today's
 * requirements for it would fabricate a contract the run never executed under.
 */
function businessSummary(spec: RunSpec) {
  const contract = spec.businessContract
  if (!contract)
    return {
      status: 'legacy-unversioned' as const,
      profileId: null,
      revision: null,
      hash: null,
      adapter: null,
      requirements: [],
      effects: null,
      environment: null,
      integrity: 'not-applicable' as const,
    }
  return {
    status: 'versioned' as const,
    profileId: contract.profileId,
    revision: contract.revision,
    hash: contract.hash,
    // Adapter identity is part of what was executed, so a report can be tied to it.
    adapter: contract.adapter,
    requirements: contract.requirements.map((r) => ({
      id: r.id,
      revision: r.revision,
      text: r.text,
      source: r.source,
    })),
    effects: contract.effects,
    environment: contract.environment,
    integrity: verifyContractSnapshot(contract)
      ? ('verified' as const)
      : ('hash-mismatch' as const),
  }
}

/** One point inside the perceived region, exactly as it was measured. */
export interface FocusPointRow {
  readonly side: string
  readonly x: number
  readonly y: number
  readonly hit: { ref: string | null; tag: string; relation: string }
  readonly focusBefore: string | null
  readonly focusAfter: string | null
  readonly focusedWithinMs: number | null
  readonly valueChanged: boolean
}

export interface FocusMeasurement {
  readonly candidateId: string
  readonly samplesRef: string
  /** False when the saved rows could not be read; `points` is then absent, not empty. */
  readonly samplesAvailable: boolean
  readonly points?: readonly FocusPointRow[]
  readonly originalRef: string | null
  readonly annotatedRef: string | null
  readonly receiptRef: string | null
  readonly nodeIdentity: string | null
  readonly bindingReason: string | null
  readonly positiveControlFocusedWithinMs: number | null
  readonly positiveControlOk: boolean | null
  readonly resets: readonly unknown[]
  readonly algorithmVersion: string | null
  readonly documentEpoch: string | null
}

/**
 * One bounded visual-focus measurement, as the report shows it.
 *
 * Every row is read back from the artifact the run saved, so the report shows what was measured rather
 * than a re-derivation, and it survives a server restart. A measurement whose file cannot be read is
 * reported as unavailable - never as an empty result, which would read as "nothing failed".
 */
async function focusMeasurements(
  artifactRows: { rows: readonly Record<string, unknown>[] },
  annotations: readonly { candidateId: string; annotatedRef: string }[],
): Promise<FocusMeasurement[]> {
  const byId = new Map(artifactRows.rows.map((row) => [String(row.id), row]))
  const measurements: FocusMeasurement[] = []

  for (const row of artifactRows.rows) {
    if (String(row.type) !== 'measurement') continue
    const metadata = JSON.parse(String(row.metadata))
    if (metadata.kind !== 'focus-samples') continue

    let body: {
      receiptRef?: string
      samples?: readonly FocusPointRow[]
    } = {}
    let samplesAvailable = true
    try {
      body = JSON.parse(await readFile(String(row.file_path), 'utf8'))
    } catch {
      samplesAvailable = false
    }

    const receiptRow = body.receiptRef ? byId.get(body.receiptRef) : undefined
    let receipt: Record<string, any> = {}
    try {
      if (receiptRow) receipt = JSON.parse(await readFile(String(receiptRow.file_path), 'utf8'))
    } catch {
      /* the receipt is reported as absent below rather than guessed */
    }

    const candidateId = String(metadata.candidateId ?? receipt.candidateId ?? 'unknown')
    // The annotated copy is named by the run when it was derived; a derived image carries no candidate
    // id of its own, so scanning artifacts for one would silently find nothing.
    const annotatedRef = annotations.find((a) => a.candidateId === candidateId)?.annotatedRef

    measurements.push({
      candidateId,
      samplesRef: String(row.id),
      samplesAvailable,
      ...(samplesAvailable
        ? {
            points: (body.samples ?? []).map((sample) => ({
              side: sample.side,
              x: sample.x,
              y: sample.y,
              hit: sample.hit,
              focusBefore: sample.focusBefore,
              focusAfter: sample.focusAfter,
              focusedWithinMs: sample.focusedWithinMs,
              valueChanged: sample.valueChanged,
            })),
          }
        : {}),
      originalRef: receipt.screenshotRef ?? null,
      annotatedRef: annotatedRef ?? null,
      receiptRef: body.receiptRef ?? null,
      nodeIdentity: receipt.binding?.nodeIdentity ?? null,
      bindingReason: receipt.binding?.reason ?? null,
      positiveControlFocusedWithinMs: receipt.positiveControl?.focusedWithinMs ?? null,
      positiveControlOk: receipt.positiveControl?.ok ?? null,
      resets: receipt.resets ?? [],
      algorithmVersion: receipt.algorithmVersion ?? null,
      documentEpoch: receipt.documentEpoch ?? null,
    })
  }

  // The finding a measurement produced is named by the findings list itself, so the two link by
  // hypothesisId rather than by a duplicate flag here.
  return measurements
}

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
    // Bounded visual-focus measurements, point by point, with the images they were taken from.
    focusMeasurements: await focusMeasurements(
      artifactRows,
      events
        .filter((e) => e.type === 'visual-focus:annotated')
        .map((e) => ({
          candidateId: String(e.payload.candidateId),
          annotatedRef: String(e.payload.annotatedRef),
        })),
    ),
    usage: run.usage,
    budget: run.spec.budget,
    // Business contract provenance. A run created before contracts existed reports
    // legacy-unversioned: its requirements are never back-filled from today's defaults.
    business: businessSummary(run.spec),
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
