import { checkTaskArtifactIssues } from '../../execution/check-tasks/report.ts'
import { projectUiRuleReports } from './ui-rule-report.ts'
import { defaultCheckArtifactIssues } from '../../inspection/check-artifacts.ts'
import { interactionFindingIssues } from '../../execution/interaction-finding-proof.ts'
import { stat, readFile } from 'node:fs/promises'
import { getRunSnapshot, isRunActive } from '../../execution/run-manager.ts'
import { inspectionHistoryIssues } from '../../inspection/proof-history.ts'
import { recoveryArtifactIssues } from '../../inspection/recovery-history.ts'
import { probeArtifactIssues } from '../../inspection/probe-history.ts'
import { completionIssues } from '../../execution/completion-integrity.ts'
import { interventionLimitation } from '../../shared/evidence-integrity.ts'
import { unresolvedAnalyses } from './legacy-analysis.ts'
import type { AnalysisTask } from './legacy-analysis-types.ts'
import { terminalRunStatuses as terminals } from '../../execution/run-status.ts'
import type { RunSpec } from '../../shared/types.ts'
import { verifyContractSnapshot } from '../../business/runtime.ts'
import { resolveRunKind } from '../../inspection/run-kind.ts'
import { uiScanSummary } from './ui-scan-report.ts'

/**
 * Report-facing business provenance.
 *
 * `legacy-unversioned` is a real state, not a missing value to be filled in: a run with no
 * persisted contract is reported as unversioned and its `requirements` stay empty. Deriving today's
 * requirements for it would fabricate a contract the run never executed under.
 */
function businessSummary(spec: RunSpec) {
  const contract = spec.businessContract
  // A UI run has no business dimension, and that is a different fact from "a business run predating
  // contracts". Reporting the first as the second would suggest an older business run whose
  // requirements were simply not recorded, which is not what the record says.
  if (resolveRunKind(spec).kind === 'ui-scan')
    return {
      status: 'ui-scan-not-applicable' as const,
      profileId: null,
      revision: null,
      hash: null,
      adapter: null,
      requirements: [],
      effects: null,
      environment: null,
      integrity: 'not-applicable' as const,
    }
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
  /** Wall-clock time actually spent observing focus after this click (P3). */
  readonly observedWindowMs: number | null
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
  /**
   * The frame the model perceived, in page coordinates. Shown beside the bound element's own bounds
   * so a reader can see the region and the input are not the same box (W01).
   */
  readonly perceivedRegion: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  } | null
  /** The bound element's bounds, from the saved witness. `null` when no witness was recorded. */
  readonly boundBounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  } | null
}

/**
 * One bounded visual-focus measurement, as the report shows it.
 *
 * Every row is read back from the artifact the run saved, so the report shows what was measured rather
 * than a re-derivation, and it survives a server restart. A measurement whose file cannot be read is
 * reported as unavailable - never as an empty result, which would read as "nothing failed".
 */
/**
 * The candidate an artifact belongs to, read from its metadata then its own body.
 *
 * Both sources are checked because a row saved without metadata would otherwise be treated as no
 * artifact at all - and "no witness recorded" reads very differently from "the witness is unreadable".
 * A malformed row yields null rather than throwing the whole report.
 */
async function candidateBodyOf(
  row: Record<string, unknown> | undefined,
): Promise<{ candidateId: string | null; body: Record<string, any> | null }> {
  if (!row) return { candidateId: null, body: null }
  let body: Record<string, any> | null = null
  try {
    body = JSON.parse(await readFile(String(row.file_path), 'utf8'))
  } catch {
    /* the caller reports the field as absent */
  }
  let metadataId: string | null = null
  try {
    const metadata = JSON.parse(String(row.metadata))
    metadataId = metadata.candidateId == null ? null : String(metadata.candidateId)
  } catch {
    /* metadata is optional enrichment, not the identity */
  }
  const id = metadataId ?? body?.candidateId ?? body?.id ?? null
  return { candidateId: id == null ? null : String(id), body }
}

/** The first row of `type` that belongs to this candidate, with its parsed body. */
async function findCandidateArtifact(
  rows: readonly Record<string, unknown>[],
  type: string,
  candidateId: string,
): Promise<{ candidateId: string | null; body: Record<string, any> | null }> {
  for (const row of rows) {
    if (String(row.type) !== type) continue
    const found = await candidateBodyOf(row)
    if (found.candidateId === candidateId) return found
  }
  return { candidateId: null, body: null }
}

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
      if (!Array.isArray(body.samples) || !body.receiptRef) samplesAvailable = false
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

    if (!receiptRow || !receipt.binding) samplesAvailable = false
    const candidateId = String(metadata.candidateId ?? receipt.candidateId ?? 'unknown')
    // Both boxes come from saved artifacts, not from a re-derivation: the perceived frame the model
    // proposed and the bounds of the element the probe actually bound to. A reader comparing the two
    // is the point of the section - the region and the input are not the same box.
    const candidateBody = await findCandidateArtifact(
      artifactRows.rows,
      'visual-candidate',
      candidateId,
    )
    const perceivedRegion: FocusMeasurement['perceivedRegion'] =
      candidateBody.body?.perceivedRegion ?? null
    const witnessBody = await findCandidateArtifact(
      artifactRows.rows,
      'binding-witness',
      candidateId,
    )
    // Absent witness bounds are reported as null, never as a box at 0,0.
    const boundBounds: FocusMeasurement['boundBounds'] = witnessBody.body?.bounds ?? null
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
              // Absent on a pre-P3 receipt; reported as null ("not recorded") rather than 0.
              observedWindowMs:
                typeof sample.observedWindowMs === 'number' ? sample.observedWindowMs : null,
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
      perceivedRegion,
      boundBounds,
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
  const visionFinished = events.filter(
    (e) => e.type === 'model:request-finished' && e.payload?.purpose === 'visual-discovery',
  )
  const visionStarted = events.filter(
    (e) => e.type === 'model:request-started' && e.payload?.purpose === 'visual-discovery',
  )
  const visionCount = Math.max(visionStarted.length, visionFinished.length)
  const visionTokens = (key: 'inputTokens' | 'outputTokens') =>
    visionCount > 0 &&
    visionFinished.length === visionCount &&
    visionFinished.every((e) => typeof e.payload[key] === 'number')
      ? visionFinished.reduce((sum, e) => sum + Number(e.payload[key]), 0)
      : null
  const active = isRunActive(runId)
  const settled = !active && ['completed', 'blocked'].includes(run.status)
  const issues = settled ? completionIssues(run, events) : []
  if (events.some((e) => e.type === 'run:storage-inconsistent'))
    issues.push('completion-commit-unverified')
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
  const readable = new Set(artifacts.filter((a) => a.available).map((a) => a.id))
  issues.push(
    ...(await checkTaskArtifactIssues(
      events,
      artifactRows.rows.map((row) => ({
        id: String(row.id),
        path: String(row.file_path),
        metadata: JSON.parse(String(row.metadata)),
      })),
    )),
  )
  if (settled && run.spec.kind === 'ui-scan')
    issues.push(...inspectionHistoryIssues(run, events, readable))
  issues.push(
    ...(await defaultCheckArtifactIssues(
      run,
      events,
      artifactRows.rows.map((r) => ({
        id: String(r.id),
        type: String(r.type),
        path: String(r.file_path),
        metadata: JSON.parse(String(r.metadata)),
      })),
    )),
  )
  const recoveryIssues =
    run.spec.kind === 'ui-scan'
      ? await recoveryArtifactIssues(
          events,
          new Map(artifactRows.rows.map((r) => [String(r.id), String(r.file_path)])),
        )
      : []
  issues.push(...recoveryIssues)
  if (run.spec.kind === 'ui-scan')
    issues.push(
      ...(await probeArtifactIssues(
        events,
        new Map(
          artifactRows.rows.map((r) => [
            String(r.id),
            { path: String(r.file_path), type: String(r.type) },
          ]),
        ),
      )),
    )
  if (run.spec.kind === 'ui-scan')
    issues.push(
      ...(await interactionFindingIssues(
        runId,
        events,
        artifactRows.rows.map((r) => ({
          id: String(r.id),
          type: String(r.type),
          path: String(r.file_path),
          metadata: JSON.parse(String(r.metadata)),
        })),
      )),
    )

  const invalid = issues.length > 0
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
  const visualUnverified = [
    ...events
      .filter((e) => e.type === 'visual-scan:unavailable')
      .map((e) => `visual-scan:${String(e.payload.reason)}`),
    ...artifactRows.rows
      .filter((r) => r.type === 'visual-candidate')
      .map((r) => JSON.parse(String(r.metadata)).candidateId as string)
      .filter(
        (id) =>
          !events.some(
            (e) =>
              e.type === 'visual-focus:completed' &&
              e.payload.candidateId === id &&
              ['supported', 'refuted'].includes(String(e.payload.validationStatus)),
          ),
      )
      .map((id) => `visual-candidate:${id}:unverified`),
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
    visualDiscovery: events.find((e) => e.type === 'visual-discovery:configured')?.payload ?? {
      enabled: false,
      algorithmVersion: null,
      source: 'legacy-unversioned',
    },
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
    // Visual request accounting. The product persists token usage, not dollars, so a cost the run
    // never recorded is reported as `not-recorded` - the report must never show 0, which would read
    // as "free" rather than "unknown".
    visual: {
      visionRequests: visionCount,
      inputTokens: visionTokens('inputTokens'),
      outputTokens: visionTokens('outputTokens'),
      costUsd: null,
      costStatus: 'not-recorded' as const,
    },
    // Business contract provenance. A run created before contracts existed reports
    // legacy-unversioned: its requirements are never back-filled from today's defaults.
    business: businessSummary(run.spec),
    // The `ui-scan` section, projected from this run's own persisted events. Absent entirely for a
    // business or legacy record, so a reader can tell "no UI scan" from "a UI scan with no items".
    uiScan: uiScanSummary(run, events, readable, issues),
    uiRules:
      resolveRunKind(run.spec).kind === 'ui-scan'
        ? await projectUiRuleReports(
            runId,
            events,
            artifactRows.rows as unknown as { id: unknown; file_path: unknown }[],
          )
        : [],
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
      unverifiedInterventionScope.length +
      visualUnverified.length,
    coverage: {
      exploredStates,
      unexploredBranches,
      checks: evaluations.length ? 'checked' : 'not-checked',
      executionErrors,
      unverifiedInterventionScope,
      visualUnverified,
      unverifiedAnalysisTasks: unresolvedAnalyses(analysisTasks).map((t) => t.id),
      persistenceIssues: issues,
      stopReason: invalid ? 'reconciliation-required' : run.stopReason,
    },
  }
}
