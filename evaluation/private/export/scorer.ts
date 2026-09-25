import { createHash } from 'node:crypto'
import { evaluateTransition, type TransitionObservation } from '../../../src/rules/transition.ts'
import type { RunEvent } from '../../../src/shared/types.ts'
import type { PageSnapshot } from '../../../src/rules/types.ts'
import type { ExportVariantId } from './controller.ts'
import {
  REPORT_EXPECTATIONS,
  RETRY_DECLARATION_SHAPE,
  equivalentRetryRules,
  type DeclaredRule,
} from './expectations.ts'

/**
 * The private export scorer.
 *
 * It grades a run from three things that cannot be moved together by the code under test:
 *
 *   - the *public* report and events, which the run produced;
 *   - the arena's *private* business truth, which the run could never read;
 *   - independent file checks on the downloaded evidence.
 *
 * It deliberately does not ask the production adapter what the outcome should have been. The
 * expectation is stated a second time in `expectations.ts` from the acceptance table, so an adapter
 * defect moves the run's behaviour without moving the thing it is judged against.
 */

/** One artifact, downloaded over the public API and checked against its own bytes. */
export interface ScoredArtifact {
  readonly type: string
  readonly exists: boolean
  readonly available?: boolean
  readonly sha256?: string
  /** Parsed payload for JSON artifacts (a snapshot or a measurement). */
  readonly data?: unknown
}

export interface ExportRunInput {
  /** Private business truth, read from the arena's own controller. */
  readonly truth: {
    readonly creates: number
    readonly retries: number
    readonly jobs: number
    readonly artifacts: number
    readonly attempts?: readonly number[]
    readonly artifactContents?: readonly {
      readonly datasetId: string
      readonly format: string
      readonly rows: readonly string[]
    }[]
  }
  /** The public requests the *page* made, from the private controller's audit log. */
  readonly requests: readonly { readonly method: string; readonly path: string }[]
  readonly report: {
    readonly runId: string
    readonly status: string
    readonly businessResult: string
    readonly stopReason: string | null
    readonly persistence?: { readonly status?: string; readonly issues?: readonly string[] }
    readonly events: readonly RunEvent[]
    readonly findings: readonly {
      readonly id: string
      readonly source: string
      readonly ruleId?: string | null
      readonly validationStatus: string
      readonly evidenceRefs: readonly string[]
      readonly hypothesisId?: string | null
    }[]
    readonly hypotheses?: readonly {
      readonly id: string
      readonly status: string
      readonly evidenceRefs: readonly string[]
    }[]
    readonly usage: {
      readonly actions: number
      readonly modelCalls: number
      readonly elapsedMs: number
    }
    readonly budget: {
      readonly totalTimeoutMs: number
      readonly maxActions: number
      readonly maxModelCalls: number
    }
  }
  readonly artifacts: Readonly<Record<string, ScoredArtifact>>
  /** The contract the run executed under, as persisted with it. */
  readonly contract: {
    readonly profileId: string
    readonly revision: string
    readonly hash: string
    readonly retryAvailabilityMs: number
    readonly adapter: { readonly id: string; readonly revision: string }
    readonly environment: { readonly id: string; readonly origin: string }
    readonly effects: { readonly maxCreates: number; readonly maxRetriesPerOperation: number }
  }
  /** The dataset and format this run actually selected, from the arena's record. */
  readonly selection: { readonly datasetId: string; readonly format: string }
  /**
   * The rules enabled for this run. Group A expects only the built-ins; group B expects the
   * approved declaration loaded. Passed in rather than read here, so the scorer cannot be the
   * thing that decides whether the rule set was right.
   */
  readonly rules: readonly DeclaredRule[]
  /** In rule-migration mode, the approved declaration the run was supposed to execute. */
  readonly approvedRule?: {
    readonly id: string
    readonly revision: string
    readonly reviewedBy: string | null
    readonly ruleConfig: Record<string, unknown>
  }
  /**
   * The semantic target the run itself declared for its recovery measurement, when it made one.
   *
   * A discovery run has no approved rule to inherit, so this is the agent's own binding - and R02
   * requires the samples to carry that declared key rather than the control's visible text. Absent
   * here, the approved declaration's shape is used instead, which is the rule-migration case.
   */
  readonly declaredTarget?: string
  /** Set by the caller when the fixture or its evidence could not be produced at all. */
  readonly invalidReason?: string
}

export interface ExportScore {
  readonly variant: ExportVariantId
  readonly runId: string
  readonly assertions: Readonly<Record<string, boolean>>
  readonly failedAssertions: readonly string[]
  readonly classification: 'pass' | 'fail' | 'invalid'
  readonly passed: boolean
  readonly details: Readonly<Record<string, unknown>>
}

function isSnapshot(value: unknown): value is PageSnapshot {
  return !!value && Array.isArray((value as PageSnapshot).elements)
}

function since(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * A supported finding must cite evidence that exists and was actually downloaded.
 *
 * Existence is checked against the bytes, not the report's own `available` flag: a report that
 * merely claims an artifact is available is the claim under test.
 */
function citableEvidence(
  finding: { evidenceRefs: readonly string[] },
  artifacts: Readonly<Record<string, ScoredArtifact>>,
) {
  const refs = finding.evidenceRefs.map((id) => ({ id, artifact: artifacts[id] }))
  return {
    refs,
    allExist: refs.length > 0 && refs.every((r) => r.artifact?.exists === true),
    hasScreenshot: refs.some((r) => r.artifact?.type === 'screenshot'),
  }
}

function hasText(snapshot: PageSnapshot | undefined, predicate: (text: string) => boolean) {
  return !!snapshot?.elements?.some((el) => el.visible && predicate(el.text))
}

/**
 * The one intervention check that matters for a finding.
 *
 * A finding whose measurement was taken while the executor was blocking requests describes what the
 * executor did, not what the product does - so it cannot support a claim about the product.
 */
function interventionFree(
  events: readonly RunEvent[],
  refs: readonly { artifact?: ScoredArtifact }[],
) {
  if (events.some((e) => e.type === 'execution:intervention')) return false
  return refs.every((r) => {
    const integrity = (r.artifact?.data as { evidenceIntegrity?: unknown } | undefined)
      ?.evidenceIntegrity
    if (integrity === undefined) return true
    const receipt = integrity as { status?: string; interventionIds?: unknown[] }
    return receipt.status === 'clean' && (receipt.interventionIds?.length ?? 0) === 0
  })
}

/**
 * The E2 defect finding, judged on its own evidence.
 *
 * The window requirement is checked by calling the *existing* `evaluateTransition` with the
 * declared shape and the run's own retry budget. That is deliberate: the acceptance plan asks for
 * E2 to satisfy the existing five-second coverage, spacing and non-null thresholds, and passing
 * the real evaluator is the only way to show it does. The verdict must come out `fail` - the retry
 * control never became actionable across the whole window - which is exactly the defect claimed.
 */
function defectFindingValid(input: ExportRunInput, finding: { evidenceRefs: readonly string[] }) {
  const { artifacts, contract } = input
  const { refs, allExist, hasScreenshot } = citableEvidence(finding, artifacts)
  const snapshots = refs
    .map((r) => r.artifact?.data)
    .filter((data): data is PageSnapshot => isSnapshot(data))
  const measurements = refs
    .map((r) => r.artifact?.data)
    .filter(
      (data): data is TransitionObservation & { selector?: string } =>
        !!data && Array.isArray((data as TransitionObservation).samples),
    )
  // The page must be showing the job this run created: a measurement against some other entity
  // would be evidence about a different operation.
  const created = input.report.events.find(
    (e) =>
      e.type === 'business:observation' &&
      e.payload.method === 'POST' &&
      (() => {
        try {
          return new URL(String(e.payload.url)).pathname === '/api/exports'
        } catch {
          return false
        }
      })(),
  )
  const jobId = (created?.payload.body as { jobId?: string } | undefined)?.jobId
  const jobVisible = !!jobId && snapshots.some((s) => hasText(s, (text) => text.includes(jobId)))
  const eligibilityCited = refs.some((r) => {
    const body = r.artifact?.data as
      | { jobId?: string; prerequisite?: unknown; backendPermitsRetry?: boolean }
      | undefined
    return (
      r.artifact?.type === 'resource' &&
      !!jobId &&
      body?.jobId === jobId &&
      typeof body.prerequisite === 'object' &&
      body.prerequisite !== null &&
      body.backendPermitsRetry === true
    )
  })
  // The target to measure against. A discovery run carries no approved declaration to inherit, so the
  // agent names the recovery control itself and R02 requires its samples to carry *that* declared
  // semantic key rather than a copy of the button's visible text. Comparing against a target the run
  // cannot read would report a complete measurement of a disabled control as `unknown` and discard
  // the finding - which is what a hardcoded target did to the real E2 run.
  const declaredTarget = input.declaredTarget ?? RETRY_DECLARATION_SHAPE.target
  const windows = measurements.map((observation) => {
    const verdict = evaluateTransition(
      {
        type: 'transition',
        name: declaredTarget,
        description: 'retry must become actionable inside the declared window',
        trigger: { eventType: RETRY_DECLARATION_SHAPE.eventType },
        expectation: {
          condition: 'element-actionable',
          target: declaredTarget,
          timeoutMs: contract.retryAvailabilityMs,
        },
        severity: 'error',
      },
      observation,
    )
    // A stable target is required: samples that drift between targets do not describe one control.
    const targets = new Set(observation.samples.map((s) => s.target))
    const values = observation.samples.map((s) => s.value)
    // The referenced element must exist in a cited snapshot with the same selector, so the
    // measurement is tied to a real control rather than to a label the agent typed.
    const selectorBound =
      !!observation.selector &&
      snapshots.some((s) =>
        s.elements?.some(
          (el) =>
            el.selector === observation.selector &&
            el.tag === 'button' &&
            el.visible &&
            el.enabled === false,
        ),
      )
    return {
      verdict,
      targets: [...targets],
      nonNull: values.length > 0 && values.every((v) => v !== null),
      // `evaluateTransition` already refuses non-null-free sample sets, but the scorer states it
      // separately so a null-heavy measurement cannot be read as a clean negative proof.
      spanning: (() => {
        const started = since(observation.startedAtMs)
        const until = since(observation.observedUntilMs)
        return started !== null && until !== null && until - started >= contract.retryAvailabilityMs
      })(),
      selectorBound,
    }
  })
  const window = windows[0]
  return {
    assertions: {
      evidenceExists: allExist,
      hasScreenshot,
      jobVisible,
      eligibilityCited,
      oneMeasurement: measurements.length === 1,
      // `fail` is the claim: the control was not operable for the entire declared window. `unknown`
      // here would mean the window was not fully covered, i.e. the claim is unproven.
      fullWindowCovered: window?.verdict === 'fail',
      stableTarget: window?.targets.length === 1,
      nonNullSamples: window?.nonNull === true,
      windowSpansDeclaredBudget: window?.spanning === true,
      selectorBound: window?.selectorBound === true,
      noIntervention: interventionFree(input.report.events, refs),
    },
    windows,
  }
}

export function scoreExportRun(variant: ExportVariantId, input: ExportRunInput): ExportScore {
  const expected = REPORT_EXPECTATIONS[variant]
  const base = {
    variant,
    runId: input.report.runId,
    assertions: {} as Record<string, boolean>,
    failedAssertions: [] as string[],
    classification: 'invalid' as const,
    passed: false,
    details: {},
  }
  // Without the fixture there is nothing to grade. `invalid` is not `fail`: a run whose fixture
  // could not be verified is not evidence of a product defect, and must not be counted as one.
  if (input.invalidReason)
    return { ...base, details: { reason: input.invalidReason, classification: 'invalid' } }

  const assertions: Record<string, boolean> = {}
  const { report, truth, contract } = input

  // --- Explicit finish (E01) -------------------------------------------------------------
  // "completed" text without a server-accepted finish is not a completion. The finish is what makes
  // the conclusion the run's own, so its absence is checked before anything else.
  const finishAccepted = report.events.filter((e) => e.type === 'finish:accepted')
  assertions.explicitFinish = finishAccepted.length === 1
  assertions.finishCitesContract = finishAccepted.some(
    (e) => (e.payload as { verifiedOperations?: unknown }).verifiedOperations !== undefined,
  )

  // --- Business consistency (E02) --------------------------------------------------------
  // Three things must agree: the report's own verdict, the arena's private truth, and the entity
  // the business facts name. A success report for a job that is still processing, or for a
  // different job, fails here even though it reads as a success.
  assertions.businessResultMatchesTruth =
    report.businessResult === expected.businessResult && report.status === expected.status
  assertions.truthMatchesVariant =
    truth.creates === expected.truth.creates &&
    truth.retries === expected.truth.retries &&
    truth.jobs === expected.truth.jobs &&
    truth.artifacts === expected.truth.artifacts

  const facts = report.events
    .filter((e) => e.type === 'business:fact')
    .map(
      (e) =>
        e.payload as {
          operationId?: string
          phase?: string
          contractHash?: string
          result?: string
        },
    )
  // Every fact must belong to the job this run created, carry this run's contract, and cite the
  // public response it came from. A fact from another entity cannot support this run's conclusion.
  const createdJobs = new Set(
    report.events
      .filter(
        (e) =>
          e.type === 'business:observation' &&
          e.payload.method === 'POST' &&
          (() => {
            try {
              return new URL(String(e.payload.url)).pathname === '/api/exports'
            } catch {
              return false
            }
          })(),
      )
      .map((e) => (e.payload as { body?: { jobId?: string } }).body?.jobId)
      .filter((id): id is string => typeof id === 'string'),
  )
  assertions.factsBelongToCreatedJob =
    facts.length > 0 && facts.every((f) => !!f.operationId && createdJobs.has(f.operationId))
  assertions.factsCarryContract = facts.every((f) => f.contractHash === contract.hash)
  assertions.factsCitePublicEvidence = report.events
    .filter((e) => e.type === 'business:fact')
    .every((e) =>
      report.events.some(
        (source) =>
          source.id === e.payload.sourceEventId &&
          source.type === 'business:observation' &&
          (source.payload.body as { jobId?: unknown })?.jobId === e.payload.operationId,
      ),
    )

  // The terminal fact must be the one the expectation names. This is where a "succeeded" fact for
  // a job whose truth is `failed` is caught, rather than being read as a success.
  const terminalPhases = facts.filter((f) => f.phase !== 'processing').map((f) => f.phase)
  const expectedPhase =
    expected.businessResult === 'success'
      ? 'succeeded'
      : expected.businessResult === 'rejected'
        ? 'rejected'
        : 'failed'
  assertions.terminalPhaseMatchesTruth =
    expected.businessResult === 'unknown'
      ? terminalPhases.includes('failed') && terminalPhases.every((phase) => phase !== 'succeeded')
      : terminalPhases.includes(expectedPhase)
  // Processing is never an outcome: a report that treated one as its result would have claimed a
  // business conclusion the business had not yet produced.
  assertions.notConcludedWhileProcessing =
    expected.businessResult === 'unknown' ? true : facts.some((f) => f.phase !== 'processing')

  // --- Recovery actually used (E03) ------------------------------------------------------
  // The retry must be a real second attempt of the same job: exactly one retry, one job, and the
  // attempt advanced. A second *create* masquerading as recovery would show up as retries=0 with
  // creates=2, which the truth check above already refuses - this states it directly.
  const retried = truth.retries === 1
  assertions.recoveryIsRetryNotCreate =
    expected.truth.retries === 1
      ? retried && truth.creates === 1
      : truth.retries === 0 && truth.creates === 1
  // Every request the page made must address this run's own job. A retry that quietly targeted
  // another entity, or a poll of someone else's job, would still produce plausible counters.
  const jobIds = new Set(createdJobs)
  assertions.requestsTargetCreatedJob = input.requests.every((r) => {
    const match = /^\/api\/exports\/(job-[0-9a-z]+)(?:\/[a-z]+)?$/.exec(r.path)
    return !match || jobIds.has(match[1]!)
  })
  // A successful recovery must leave a real artifact, and a failed one must not. An artifact is
  // the only proof the business actually produced output.
  assertions.artifactMatchesOutcome =
    expected.truth.artifacts === 0
      ? truth.artifacts === 0
      : truth.artifacts === expected.truth.artifacts
  // And its *content* must match the selection: HTTP 200 or a download button is not proof.
  const contents = truth.artifactContents ?? []
  assertions.artifactContentMatchesSelection =
    expected.truth.artifacts === 0
      ? contents.length === 0
      : contents.some(
          (a) =>
            a.datasetId === input.selection.datasetId &&
            a.format === input.selection.format &&
            a.rows.length > 0,
        )

  // --- Findings (E05) and rule execution (E06) -------------------------------------------
  const supported = report.findings.filter((f) => f.validationStatus === 'supported')
  const evidenced = supported.filter((f) => citableEvidence(f, input.artifacts).allExist)
  assertions.healthyVariantHasNoSupportedFinding =
    expected.finding === 'required' ? true : supported.length === 0
  assertions.noDuplicateFindings =
    (expected.finding !== 'required' || supported.length === 1) &&
    new Set(supported.map((f) => `${f.ruleId ?? f.hypothesisId ?? ''}:${f.evidenceRefs.join('|')}`))
      .size === supported.length
  assertions.supportedFindingsHaveEvidence = supported.every(
    (f) => citableEvidence(f, input.artifacts).allExist,
  )

  const ruleChecks = report.events.filter((e) => e.type === 'rule:check-completed')
  const ruleVerdicts = report.events
    .filter((e) => e.type === 'rule:evaluated')
    .map((e) => e.payload as { ruleId?: string; verdict?: string })
  const approved = input.approvedRule
  if (approved) {
    // E06/E07: the run must have executed the approved rule, and a real check must exist - an
    // exploratory finding alone would mean the rule was loaded but never exercised.
    assertions.approvedRuleExecuted = ruleVerdicts.some(
      (v) => v.ruleId === approved.id && v.verdict === (variant === 'E2' ? 'fail' : 'pass'),
    )
    assertions.approvedRuleCheckCompleted = ruleChecks.some(
      (e) =>
        e.payload.ruleId === approved.id &&
        e.payload.verdict === (variant === 'E2' ? 'fail' : 'pass'),
    )
    // The declaration must be the approved one, unchanged. A rule whose target, timeout or
    // applicability moved is a different declaration wearing the same id.
    const declared = approved.ruleConfig as {
      trigger?: { eventType?: string }
      expectation?: { condition?: string; target?: string; timeoutMs?: number }
    }
    assertions.approvedDeclarationUnchanged =
      declared.trigger?.eventType === RETRY_DECLARATION_SHAPE.eventType &&
      declared.expectation?.condition === RETRY_DECLARATION_SHAPE.condition &&
      declared.expectation?.target === RETRY_DECLARATION_SHAPE.target &&
      declared.expectation?.timeoutMs === contract.retryAvailabilityMs
    // Approval provenance: an enabled rule with no named human reviewer has no approval to inherit.
    assertions.approvalProvenancePresent = !!approved.reviewedBy && approved.reviewedBy.length > 0
  } else {
    // E06's other half: a discovery group must not already contain a rule that answers the question.
    assertions.noEquivalentRetryRule = equivalentRetryRules(input.rules).length === 0
  }

  // --- The E2 defect finding, on its own evidence (E04) ----------------------------------
  if (expected.finding === 'required') {
    const defect = supported.find((f) => defectFindingValid(input, f).assertions.fullWindowCovered)
    const judged = defect ? defectFindingValid(input, defect) : undefined
    if (judged)
      for (const [name, ok] of Object.entries(judged.assertions)) assertions[`defect_${name}`] = ok
    else {
      // No finding covered the declared window. State each requirement as unmet rather than
      // reporting a single opaque failure, so the evidence gap is legible.
      for (const name of [
        'evidenceExists',
        'hasScreenshot',
        'jobVisible',
        'eligibilityCited',
        'oneMeasurement',
        'fullWindowCovered',
        'stableTarget',
        'nonNullSamples',
        'windowSpansDeclaredBudget',
        'selectorBound',
        'noIntervention',
      ])
        assertions[`defect_${name}`] = false
    }
    assertions.defectFindingIsRuleOrAgentSourced =
      !!defect &&
      (approved
        ? defect.source === 'rule' && defect.ruleId === approved.id
        : defect.source === 'agent')
    // A blocked run must leave its uncovered scope behind, not report a clean sweep.
    assertions.blockedLeavesUnexploredScope =
      (report as { unexploredBranches?: readonly unknown[] }).unexploredBranches === undefined ||
      ((report as { unexploredBranches?: readonly unknown[] }).unexploredBranches?.length ?? 0) > 0
  }

  // --- Answer leakage (E08) --------------------------------------------------------------
  // The variant id, the expected-finding list and the private control must not appear in anything
  // the run could read. Visible business symptoms - "Export could not complete" - are not leakage.
  // The request log is scanned as well as the events and artifacts: a control plane the run reached
  // is leakage wherever it shows up, not only where the run chose to record it.
  const serialized = JSON.stringify([report.events, input.artifacts, input.requests])
  assertions.noVariantIdLeak = !/(?:^|[^A-Za-z0-9])E[0-4](?:[^0-9]|$)/.test(serialized)
  assertions.noPrivateControlLeak = !serialized.includes('__control')
  assertions.noControlRequestSucceeded = !input.requests.some((r) => r.path.includes('__control'))

  // --- Persistence (E09) -----------------------------------------------------------------
  // The report is only usable if the store agrees with it.
  assertions.persistenceVerified = report.persistence?.status === 'verified'
  assertions.usageWithinBudget =
    report.usage.actions <= report.budget.maxActions &&
    report.usage.modelCalls <= report.budget.maxModelCalls &&
    report.usage.elapsedMs <= report.budget.totalTimeoutMs + 1000
  assertions.effectsWithinContract =
    truth.creates <= contract.effects.maxCreates &&
    truth.retries <= contract.effects.maxRetriesPerOperation

  // --- Contract provenance ---------------------------------------------------------------
  assertions.contractIsExport = contract.profileId === 'export' && contract.adapter.id === 'export'
  assertions.contractHashPresent = /^[0-9a-f]{64}$/.test(contract.hash)

  const failedAssertions = Object.entries(assertions)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
  const passed = failedAssertions.length === 0
  return {
    ...base,
    assertions,
    failedAssertions,
    classification: passed ? 'pass' : 'fail',
    passed,
    details: {
      expected,
      truth,
      supportedFindings: supported.map((f) => f.id),
      ruleVerdicts,
      status: report.status,
      businessResult: report.businessResult,
    },
  }
}

/**
 * Campaign-level integrity (E10).
 *
 * A batch is only comparable if it is complete and single-build. A scoreboard assembled from the
 * successful rounds of two builds is not a worse result, it is a different, unstated experiment -
 * so the batch fails rather than reporting a rate over whatever survived.
 */
export interface BatchRow {
  readonly group: string
  readonly case: string
  readonly repeat: number
  readonly planned: boolean
  readonly runId: string | null
  readonly status: 'not-run' | 'failed' | 'passed' | 'blocked'
  readonly buildHash: string | null
  readonly score?: ExportScore
}

export function scoreExportBatch(
  rows: readonly BatchRow[],
  expectedPlan: readonly { group: string; case: string; repeats: number }[],
) {
  const plannedRows = rows.filter((r) => r.planned)
  const missing = expectedPlan.flatMap((plan) =>
    Array.from({ length: plan.repeats }, (_, i) => `${plan.group}/${plan.case}/${i + 1}`).filter(
      (key) =>
        !plannedRows.some(
          (r) =>
            `${r.group}/${r.case}/${r.repeat}` === key &&
            r.runId !== null &&
            r.runId !== 'not-created',
        ),
    ),
  )
  const counts = expectedPlan.map((plan) => ({
    group: plan.group,
    expected: plan.case ? plan.repeats : plan.repeats,
    observed: plannedRows.filter((r) => r.group === plan.group && r.case === plan.case).length,
  }))
  const builds = [...new Set(rows.map((r) => r.buildHash).filter((h): h is string => !!h))]
  const assertions = {
    // Every planned row ran. A batch that quietly dropped its failures cannot be compared.
    planComplete: missing.length === 0,
    countsMatchPlan: counts.every((c) => c.observed === c.expected),
    // One build throughout: results from different builds must never be summed.
    singleBuild: builds.length === 1 && rows.every((r) => !!r.buildHash),
    everyRunPassed:
      rows.length > 0 && rows.every((r) => r.status === 'passed' && r.score?.passed === true),
    uniqueRuns: new Set(rows.map((r) => r.runId)).size === rows.length,
    // A row is only `passed` if its own run scored a pass - never because a group average is high.
    passedRowsAreScoredPasses: rows.every((r) => r.status !== 'passed' || r.score?.passed === true),
    // `not-run` and `blocked` rows are recorded rather than omitted, so the failure distribution is
    // complete instead of silent.
    everyRowRecorded: rows.length === plannedRows.length,
  }
  return {
    assertions,
    failedAssertions: Object.entries(assertions)
      .filter(([, ok]) => !ok)
      .map(([name]) => name),
    missing,
    builds,
    counts,
    passed: Object.values(assertions).every(Boolean),
  }
}

/**
 * Offline verification of downloaded evidence.
 *
 * The report says an artifact exists; this reads the bytes and hashes them, so the two claims are
 * independent. A screenshot that is not a PNG, or an artifact that is missing from disk, fails here
 * rather than being carried into a score.
 */
export function verifyArtifactBytes(
  id: string,
  type: string,
  bytes: Uint8Array,
  claimed: { available: boolean },
) {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const exists =
    claimed.available &&
    (type === 'screenshot'
      ? bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(png)
      : bytes.length > 0)
  return {
    id,
    exists,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  }
}

/**
 * Stop-the-service audit (E09, second half).
 *
 * The API report and the database are read through different paths on purpose. Comparing a value
 * against itself proves nothing, so the recorded terminal state, the event tail and the rule
 * approvals are read fresh and compared with what the API already claimed.
 */
export function auditDurability(input: {
  readonly apiReport: {
    readonly status: string
    readonly businessResult: string
    readonly stopReason: string | null
  }
  readonly dbRun: {
    readonly status: string
    readonly businessResult: string
    readonly stopReason: string | null
  }
  readonly apiTailSeq: number
  readonly dbTailSeq: number
  readonly apiArtifactIds: readonly string[]
  readonly dbArtifactIds: readonly string[]
  readonly apiReviewedRules: readonly string[]
  readonly dbReviewedRules: readonly string[]
}) {
  const assertions = {
    statusMatches: input.apiReport.status === input.dbRun.status,
    businessResultMatches: input.apiReport.businessResult === input.dbRun.businessResult,
    stopReasonMatches: input.apiReport.stopReason === input.dbRun.stopReason,
    // The event tail must be complete on both sides. A lost tail means the report described a run
    // the store does not fully hold, which is exactly the inconsistency that must not ship.
    eventTailMatches: input.apiTailSeq === input.dbTailSeq,
    artifactsMatch:
      [...input.apiArtifactIds].sort().join('|') === [...input.dbArtifactIds].sort().join('|'),
    approvalsMatch:
      [...input.apiReviewedRules].sort().join('|') === [...input.dbReviewedRules].sort().join('|'),
  }
  return {
    assertions,
    failedAssertions: Object.entries(assertions)
      .filter(([, ok]) => !ok)
      .map(([name]) => name),
    passed: Object.values(assertions).every(Boolean),
  }
}
