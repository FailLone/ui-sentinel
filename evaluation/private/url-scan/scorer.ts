import type { UrlScanSampleTruth } from './truth.ts'

/**
 * The URL-scan scorer (plan 10.3).
 *
 * It decides whether a run's persisted report is *supported by independent facts*, and it is written
 * so that a false pass is hard by construction: the confirmations are gated behind a list of
 * rejections, and any one rejection makes the outcome a refusal regardless of what the report says.
 *
 * Two disciplines this file keeps, because the plan names them:
 *
 * - It never imports the production verdict functions. Those functions are what is under test; a
 *   scorer that reused them would agree with any bug in them.
 * - It reads the independent measurements - server request and write counts, a separate browser's
 *   reproduction, the build identity - rather than the report's own status text. "completed" in the
 *   report is an input, never the conclusion.
 */

export interface UrlScanRunView {
  readonly runId: string
  readonly status: string
  readonly businessResult: string
  readonly stopReason: string | null
  readonly persistence: { readonly status: string; readonly issues: readonly string[] }
  readonly finishAccepted: boolean
  readonly proofVerified: boolean
  readonly coverage: 'covered' | 'partial' | 'not-started' | string
  readonly items: readonly {
    readonly itemId: string
    readonly category: string
    readonly status: string
    readonly evidenceRefs: readonly string[]
  }[]
  readonly findings: readonly {
    readonly id: string
    readonly validationStatus: string
    readonly evidenceRefs: readonly string[]
  }[]
}

export interface UrlScanIndependentView {
  readonly buildIdentity: string
  readonly expectedBuildIdentity: string
  /** The run the batch manifest assigned to this sample; a result from any other run is not this one. */
  readonly expectedRunId?: string
  readonly batchId?: string
  readonly expectedBatchId?: string
  readonly serverRequestCount: number
  readonly writeCount: number
  readonly entryObserved: boolean
  readonly entryUrl: string
  readonly expectedEntryUrl: string
  readonly controlReplayPassed?: boolean
  readonly healthyReplayPassed?: boolean
  readonly agentBehaviorVerified?: boolean
  readonly readableEvidenceRefs?: readonly string[]
  readonly interventionCount?: number
  readonly findingKeysById?: Readonly<Record<string, string>>
  readonly interactionsPerformed: number
  readonly leakedPrivateAnswers: readonly string[]
  /** Finding keys a separate browser reproduced by hand against the same fixture. */
  readonly reproducedFindingKeys: readonly string[]
}

export interface UrlScanScoreInput {
  readonly run: UrlScanRunView
  readonly independent: UrlScanIndependentView
  readonly truth: UrlScanSampleTruth
  /** Ids of runs already used for another sample in this batch, so splicing is refused. */
  readonly usedRunIds?: readonly string[]
}

export interface UrlScanRejection {
  readonly code: string
  readonly detail: string
}

export type UrlScanOutcome = 'healthy-verified' | 'defect-verified' | 'not-verified'

export interface UrlScanVerdict {
  readonly outcome: UrlScanOutcome
  readonly rejections: readonly UrlScanRejection[]
  readonly reasons: readonly string[]
}

/**
 * Rejections that apply to *any* claim, healthy or defective.
 *
 * These are the integrity gates: a run that came from another build, measured another page, wrote to
 * the business, or was already spent on a different sample cannot support any conclusion. They are
 * checked first so a defective claim is held to exactly the same integrity bar as a healthy one -
 * the plan forbids relaxing the abnormal side to make a batch pass.
 */
function integrityRejections(input: UrlScanScoreInput): UrlScanRejection[] {
  const { run, independent } = input
  const rejections: UrlScanRejection[] = []
  if (
    run.status !== 'completed' ||
    run.stopReason !== 'goal-reached' ||
    run.businessResult !== 'not-applicable'
  )
    rejections.push({
      code: 'terminal-invalid',
      detail: 'A complete UI result must have completed / goal-reached / not-applicable',
    })
  if (run.persistence.status !== 'verified' || run.persistence.issues.length)
    rejections.push({ code: 'persistence-unverified', detail: 'Durable state must be verified' })
  if (!independent.buildIdentity || !independent.expectedBuildIdentity)
    rejections.push({ code: 'build-identity-empty', detail: 'No build identity supplied' })
  if (independent.interventionCount !== 0)
    rejections.push({
      code: 'intervened-or-unknown',
      detail: 'Site verdict requires known clean evidence',
    })
  if (!independent.readableEvidenceRefs)
    rejections.push({ code: 'evidence-not-read', detail: 'Artifacts were not independently read' })
  for (const item of run.items.filter((i) => ['verified', 'failed'].includes(i.status)))
    if (
      !item.evidenceRefs.length ||
      item.evidenceRefs.some((ref) => !independent.readableEvidenceRefs?.includes(ref))
    )
      rejections.push({ code: 'item-evidence-unreadable', detail: item.itemId })
  if (independent.expectedRunId !== undefined && independent.expectedRunId !== run.runId)
    rejections.push({
      code: 'run-identity-mismatch',
      detail: `scored run ${run.runId}, but the batch assigned ${independent.expectedRunId} to this sample`,
    })
  if (independent.buildIdentity !== independent.expectedBuildIdentity)
    rejections.push({
      code: 'build-identity-mismatch',
      detail: `result came from build ${independent.buildIdentity}, expected ${independent.expectedBuildIdentity}`,
    })
  if (
    independent.expectedBatchId !== undefined &&
    independent.batchId !== independent.expectedBatchId
  )
    rejections.push({
      code: 'batch-identity-mismatch',
      detail: `result came from batch ${independent.batchId ?? 'unknown'}, expected ${independent.expectedBatchId}`,
    })
  if (input.usedRunIds?.includes(run.runId))
    rejections.push({
      code: 'run-identity-mismatch',
      detail: `run ${run.runId} was already used for another sample in this batch`,
    })
  if (independent.entryUrl !== independent.expectedEntryUrl)
    rejections.push({
      code: 'entry-url-mismatch',
      detail: `result started from ${independent.entryUrl}, expected ${independent.expectedEntryUrl}`,
    })
  if (run.persistence.status === 'inconsistent')
    rejections.push({
      code: 'report-inconsistent',
      detail: `persistence issues: ${run.persistence.issues.join(', ') || 'unspecified'}`,
    })
  if (!run.finishAccepted)
    rejections.push({ code: 'no-accepted-finish', detail: 'the run recorded no accepted finish' })
  if (!run.proofVerified)
    rejections.push({
      code: 'proof-unverified',
      detail: 'the inspection proof does not verify against its hash',
    })
  if (independent.writeCount > 0)
    rejections.push({
      code: 'write-performed',
      detail: `the target recorded ${independent.writeCount} business write(s)`,
    })
  if (!independent.entryObserved)
    rejections.push({
      code: 'entry-not-observed',
      detail: 'the independent server saw no request for the entry document',
    })
  if (independent.leakedPrivateAnswers.length)
    rejections.push({
      code: 'private-answer-leak',
      detail: `private answers reached the agent: ${independent.leakedPrivateAnswers.join(', ')}`,
    })
  if (!run.items.length)
    rejections.push({
      code: 'no-inspection-items',
      detail: 'the run completed with an empty inspection ledger',
    })
  // A verified item is the unit of a real check; an all-unverified ledger is the "all unknown" case
  // the plan calls out, dressed as coverage.
  if (
    run.items.length &&
    !run.items.some((item) => item.status === 'verified' || item.status === 'failed')
  )
    rejections.push({
      code: 'no-verified-items',
      detail: 'no item in the ledger has a completed measurement',
    })
  return rejections
}

/** A finding supports a conclusion only when it was independently reproduced and cites evidence. */
function findingRejections(input: UrlScanScoreInput): UrlScanRejection[] {
  const { run, independent, truth } = input
  const rejections: UrlScanRejection[] = []
  const supported = run.findings.filter((f) => f.validationStatus === 'supported')
  if (truth.variant === 'healthy' && supported.length)
    rejections.push({
      code: 'healthy-false-positive',
      detail: `a healthy control produced ${supported.length} supported finding(s)`,
    })
  for (const finding of supported) {
    if (
      !finding.evidenceRefs.length ||
      finding.evidenceRefs.some((ref) => !independent.readableEvidenceRefs?.includes(ref))
    )
      rejections.push({
        code: 'finding-without-evidence',
        detail: `finding ${finding.id} cites no evidence`,
      })
  }
  if (truth.variant === 'defective') {
    if (independent.controlReplayPassed !== true)
      rejections.push({
        code: 'healthy-control-not-replayed',
        detail: 'Defects require independent healthy counterpart verification',
      })
    if (!supported.length)
      rejections.push({
        code: 'no-supported-finding',
        detail: 'a defective sample produced no supported finding',
      })
    for (const finding of supported)
      if (independent.findingKeysById?.[finding.id] !== truth.expectedFindingKey)
        rejections.push({ code: 'finding-target-unverified', detail: finding.id })
    const key = truth.expectedFindingKey
    if (key && !independent.reproducedFindingKeys.includes(key))
      rejections.push({
        code: 'finding-not-reproduced',
        detail: `the independent replay did not reproduce ${key}`,
      })
  }
  return rejections
}

export function scoreUrlScan(input: UrlScanScoreInput): UrlScanVerdict {
  const rejections = [...integrityRejections(input), ...findingRejections(input)]
  // A healthy claim needs a real interaction: a page that was only observed cannot show that a
  // control works. This is checked here rather than in the integrity list because a defective sample
  // may legitimately be inconclusive for a different reason and is reported as such.
  if (
    input.truth.variant === 'healthy' &&
    (input.independent.interactionsPerformed === 0 ||
      input.independent.healthyReplayPassed !== true ||
      input.independent.agentBehaviorVerified !== true ||
      !input.run.items.some((i) => i.category === 'local-interaction' && i.status === 'verified'))
  )
    rejections.push({
      code: 'no-interaction',
      detail:
        'the healthy control was never interacted with, so its controls were not shown to work',
    })
  if (rejections.length) return { outcome: 'not-verified', rejections, reasons: [] }

  if (input.truth.variant === 'healthy') {
    if (input.run.coverage !== 'covered')
      return {
        outcome: 'not-verified',
        rejections: [
          {
            code: 'coverage-not-claimed',
            detail: `a healthy control reported coverage ${input.run.coverage}, not covered`,
          },
        ],
        reasons: [],
      }
    return {
      outcome: 'healthy-verified',
      rejections: [],
      reasons: [
        'entry observed and at least one interaction performed',
        `${input.run.items.filter((i) => i.status === 'verified').length} item(s) with completed measurements`,
        'no supported finding, and the independent server recorded no write',
      ],
    }
  }

  return {
    outcome: 'defect-verified',
    rejections: [],
    reasons: [
      `the independent replay reproduced ${input.truth.expectedFindingKey}`,
      'the supported finding cites saved evidence',
      'the run reached completion without a business write',
    ],
  }
}
