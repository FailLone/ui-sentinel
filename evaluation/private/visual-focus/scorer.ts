import { FOCUS_WINDOW_MS, MAX_PROBE_CLICKS } from '../../../src/execution/focus-constants.ts'
import type { EvidenceIntegrity } from '../../../src/shared/evidence-integrity.ts'
import type { Rect } from '../../../src/execution/focus-geometry.ts'
import { compareWitnessToTarget, type BindingWitness, type PrivateVisualTarget } from './witness.ts'
import { visualTruthFor, type VisualCaseId } from '../../fixtures/visual.ts'

/**
 * The independent visual scorer (plan P3.1).
 *
 * It grades a run from the persisted raw evidence and the private truth, and it never calls the
 * product's own verdict machinery. That independence is the point: the product's receipt-verdict and
 * focus-verdict functions decide what the *code under test* believes, so agreeing with them would
 * prove only that the scorer and that code share a bug. Everything below recomputes from the bytes.
 *
 * The import boundary is asserted by a test rather than trusted: nothing here may name the product's
 * verdict, receipt-supports or receipt-type-guard functions, nor the P2 smoke scorer. Shared *types*
 * and the frozen window/clicks constants are fine - they carry no verdict.
 *
 * A missing input is a stated failure, never a thrown error: a sample that cannot be graded must be
 * counted, not dropped.
 */

export interface ScoredHit {
  readonly ref: string | null
  readonly tag: string
  readonly relation: 'self' | 'descendant' | 'ancestor' | 'unrelated' | 'none'
}

export interface ScoredSample {
  readonly side: 'left' | 'right' | 'retest'
  readonly retestOf?: 'left' | 'right'
  readonly x: number
  readonly y: number
  readonly hit: ScoredHit
  readonly focusBefore: string | null
  readonly focusAfter: string | null
  readonly focusedWithinMs: number | null
  readonly observedWindowMs?: number
  readonly valueChanged: boolean
  readonly documentEpoch: string
  readonly integrity: EvidenceIntegrity
  readonly stable?: boolean
}

export interface ScoredReceipt {
  readonly version: number
  readonly windowMs?: number
  readonly candidateId: string
  readonly screenshotRef: string
  readonly screenshotSha: string
  readonly documentEpoch: string
  /** The CSS viewport the run recorded, the basis for the normalized->CSS conversion. */
  readonly viewport?: { readonly width: number; readonly height: number }
  readonly binding: {
    readonly elementRef: string
    readonly nodeIdentity: string
    readonly reason: string
    readonly witnessRef?: string
  }
  readonly positiveControl: Omit<ScoredSample, 'side'> & { readonly ok: boolean }
  readonly samples: readonly ScoredSample[]
  readonly resets: readonly {
    readonly x: number
    readonly y: number
    readonly introducedChange: boolean
    readonly integrity: EvidenceIntegrity
  }[]
  readonly actionCost: number
  readonly integrity: EvidenceIntegrity
  readonly algorithmVersion: string
}

export interface ScoredArtifact {
  readonly type: string
  readonly exists: boolean
  readonly sha256?: string
  readonly runId?: string
  readonly data?: unknown
}

export interface ScoredFinding {
  readonly id: string
  readonly validationStatus: string
  readonly candidateId: string | null
  readonly evidenceRefs: readonly string[]
  readonly title: string
}

export interface ScoredRun {
  readonly runId: string
  readonly status: string
  readonly businessResult: string
  readonly stopReason: string | null
  readonly usage: { readonly actions: number; readonly modelCalls: number }
  readonly budget: { readonly maxActions: number; readonly maxModelCalls: number }
  readonly coverage: { readonly visualUnverified: readonly string[] }
  readonly events: readonly {
    readonly id: string
    readonly seq: number
    readonly type: string
    readonly payload: any
    readonly evidenceRefs: readonly string[]
  }[]
  readonly findings: readonly ScoredFinding[]
  readonly hypotheses: readonly {
    readonly id: string
    readonly status: string
    readonly evidenceRefs: readonly string[]
    readonly visualCandidateId?: string
  }[]
  readonly focusMeasurements: readonly {
    readonly candidateId: string
    readonly receiptRef?: string
    readonly samplesRef?: string
    readonly annotatedRef?: string
    readonly originalRef?: string
    readonly nodeIdentity?: string
    readonly algorithmVersion?: string
    readonly documentEpoch?: string
  }[]
}

export interface VisualScorerInput {
  readonly case: VisualCaseId
  readonly fixtureRevision: string
  readonly fixtureHash: string
  readonly target: PrivateVisualTarget
  readonly run: ScoredRun
  readonly artifacts: Readonly<Record<string, ScoredArtifact>>
  /** The image bytes that were actually sent to the vision model this run. */
  readonly sentVision: readonly { readonly sha256: string; readonly raw: unknown }[]
  /** The gateway's record of tool calls this run made, for semantic-binding verification. */
  readonly gatewayCalls: readonly {
    readonly model: string
    readonly tool: string
    readonly runId: string
    readonly body: Record<string, unknown>
  }[]
  readonly declaredVerdict: string
}

export interface ScorerAssertion {
  readonly code: string
  readonly passed: boolean
  readonly expected: string
  readonly actual: string
  readonly evidenceRefs: readonly string[]
}

export interface VisualScore {
  readonly case: VisualCaseId
  readonly fixtureRevision: string
  readonly scorerVersion: string
  readonly classification: 'pass' | 'fail' | 'invalid'
  readonly passed: boolean
  readonly assertions: readonly ScorerAssertion[]
  readonly failedAssertions: readonly string[]
  readonly counts: {
    readonly supported: number
    readonly refuted: number
    readonly inconclusive: number
    readonly invalidEvidence: number
    readonly skippedNotRun: number
  }
  readonly details: Readonly<Record<string, unknown>>
}

export const SCORER_VERSION = 'visual-scorer-1'

function overlapFraction(candidate: Rect, region: Rect): number {
  const x = Math.max(candidate.x, region.x)
  const y = Math.max(candidate.y, region.y)
  const right = Math.min(candidate.x + candidate.width, region.x + region.width)
  const bottom = Math.min(candidate.y + candidate.height, region.y + region.height)
  if (right <= x || bottom <= y) return 0
  const area = candidate.width * candidate.height
  return area === 0 ? 0 : ((right - x) * (bottom - y)) / area
}

function inside(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function clean(integrity: EvidenceIntegrity | undefined): boolean {
  return (
    !!integrity &&
    integrity.version === 1 &&
    integrity.status === 'clean' &&
    Array.isArray(integrity.interventionIds) &&
    integrity.interventionIds.length === 0
  )
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function receiptFor(input: VisualScorerInput, ref: string | undefined): ScoredReceipt | undefined {
  if (!ref) return undefined
  const artifact = input.artifacts[ref]
  if (!artifact?.data) return undefined
  return artifact.data as ScoredReceipt
}

/**
 * Recompute, from raw samples only, the verdict this receipt can justify.
 *
 * A second implementation of the rule on purpose, not a call into the product's: the two agree only
 * if the measurement really supports the claim.
 */
export function recomputeVerdict(receipt: ScoredReceipt): {
  verdict: 'supported' | 'refuted' | 'inconclusive'
  reasons: string[]
} {
  const reasons: string[] = []
  const control = receipt.positiveControl
  if (
    !control?.ok ||
    !finite(control.focusedWithinMs) ||
    control.focusedWithinMs < 0 ||
    control.focusedWithinMs > FOCUS_WINDOW_MS ||
    !clean(control.integrity) ||
    control.focusBefore === receipt.binding.nodeIdentity
  ) {
    reasons.push('control-invalid')
    return { verdict: 'inconclusive', reasons }
  }
  if (!receipt.resets.every((r) => !r.introducedChange && clean(r.integrity))) {
    reasons.push('reset-changed-state')
    return { verdict: 'inconclusive', reasons }
  }
  const attempts = receipt.samples
  if (attempts.some((s) => s.stable === false || s.valueChanged)) {
    reasons.push('sample-unstable')
    return { verdict: 'inconclusive', reasons }
  }
  if (
    attempts.some(
      (s) =>
        !clean(s.integrity) ||
        s.documentEpoch !== receipt.documentEpoch ||
        s.focusBefore === receipt.binding.nodeIdentity,
    )
  ) {
    reasons.push('sample-untraceable')
    return { verdict: 'inconclusive', reasons }
  }
  const firstPass = attempts.filter((s) => s.side !== 'retest')
  if (firstPass.length !== 2 || new Set(firstPass.map((s) => s.side)).size !== 2) {
    reasons.push('sampling-invalid')
    return { verdict: 'inconclusive', reasons }
  }
  const failures = firstPass.filter((s) => s.focusedWithinMs === null)
  if (failures.length === 0) return { verdict: 'refuted', reasons: [] }
  const retests = attempts.filter((s) => s.side === 'retest')
  const first = failures[0]
  if (
    retests.length !== 1 ||
    retests[0].retestOf !== first.side ||
    retests[0].x !== first.x ||
    retests[0].y !== first.y ||
    retests[0].focusedWithinMs !== null
  ) {
    reasons.push('missing-independent-retest')
    return { verdict: 'inconclusive', reasons }
  }
  return { verdict: 'supported', reasons: [] }
}

function isNeighbourControl(hit: ScoredHit): boolean {
  return hit.tag === 'button' || (hit.tag === 'a' && hit.relation === 'self')
}

function pickVerdict(
  verdicts: readonly ('supported' | 'refuted' | 'inconclusive')[],
): 'supported' | 'refuted' | 'inconclusive' | undefined {
  if (verdicts.includes('supported')) return 'supported'
  if (verdicts.length > 0 && verdicts.every((v) => v === 'refuted')) return 'refuted'
  return verdicts.length > 0 ? 'inconclusive' : undefined
}

/**
 * Grade one case. `failed` is true when the evidence violates the requirement, so a failure code names
 * the reason it was refused.
 */
export function scoreVisualEvidence(input: VisualScorerInput): VisualScore {
  const truth = visualTruthFor(input.case)
  const assertions: ScorerAssertion[] = []
  const add = (
    code: string,
    failed: boolean,
    expected: string,
    actual: string,
    evidenceRefs: readonly string[] = [],
  ) => assertions.push({ code, passed: !failed, expected, actual, evidenceRefs: [...evidenceRefs] })

  const findings = input.run.findings
  const measurements = input.run.focusMeasurements
  const supported = findings.filter((f) => f.validationStatus === 'supported')
  const refuted = findings.filter((f) => f.validationStatus === 'refuted')
  const inconclusive = findings.filter((f) => f.validationStatus === 'inconclusive')
  const receipts = measurements
    .map((m) => receiptFor(input, m.receiptRef))
    .filter((r): r is ScoredReceipt => !!r)
  const measured = measurements.length > 0
  const graded = supported.length + refuted.length > 0
  const candidateArt = input.artifacts['candidate-art-1']?.data as
    | { perceivedRegion: Rect; excludedRegions: readonly Rect[]; confidence: string }
    | undefined

  // --- Business layer: a correct visual finding never excuses a failed purchase ----------------
  add(
    'business.purchase',
    !(input.run.businessResult === 'success' && input.run.status === 'completed'),
    'the run completed its purchase',
    `${input.run.status}/${input.run.businessResult}`,
  )
  add(
    'business.explicit-finish',
    input.run.events.filter((e) => e.type === 'finish:accepted').length !== 1,
    'exactly one explicit finish',
    String(input.run.events.filter((e) => e.type === 'finish:accepted').length),
  )
  add(
    'business.usage-within-budget',
    input.run.usage.actions > input.run.budget.maxActions ||
      input.run.usage.modelCalls > input.run.budget.maxModelCalls,
    'usage within budget',
    `actions ${input.run.usage.actions}/${input.run.budget.maxActions}, calls ${input.run.usage.modelCalls}/${input.run.budget.maxModelCalls}`,
  )

  // --- Provenance: a claim needs a real image that really went to the model -------------------
  add(
    'provenance.vision-request-missing',
    input.sentVision.length === 0 || input.sentVision.length > 2,
    'one or two vision requests',
    `${input.sentVision.length}`,
  )
  add(
    'provenance.image-sha-mismatch',
    receipts.some((receipt) => {
      const shot = input.artifacts[receipt.screenshotRef]
      return (
        !shot?.exists ||
        shot.sha256 !== receipt.screenshotSha ||
        !input.sentVision.some((v) => v.sha256 === receipt.screenshotSha)
      )
    }),
    'sent image bytes equal the receipt screenshot',
    'receipt ' + receipts.map((r) => r.screenshotSha.slice(0, 8)).join(','),
  )
  add(
    'provenance.normalized-contract',
    input.sentVision.length === 0 ||
      !input.sentVision.every(
        (v) => (v.raw as { coordinateSpace?: unknown })?.coordinateSpace === 'normalized-1000',
      ),
    'raw response declares normalized-1000',
    input.sentVision
      .map((v) => String((v.raw as { coordinateSpace?: unknown })?.coordinateSpace))
      .join(','),
  )
  add(
    'provenance.same-run',
    Object.values(input.artifacts).some(
      (a) => a.runId !== undefined && a.runId !== input.run.runId,
    ),
    'all cited evidence belongs to this run',
    'run ' + input.run.runId,
  )
  // The persisted candidate must be the deterministic conversion of the raw normalized response, using
  // the saved CSS viewport - never a plausible-looking box that came from somewhere else. A wrong
  // transform that happens to stay inside the viewport passes a naive check, so compare the numbers.
  const rawRegion = (input.sentVision[0]?.raw as { candidates?: { perceivedRegion?: Rect }[] })
    ?.candidates?.[0]?.perceivedRegion
  const viewport = receipts[0]?.viewport
  const expectedRegion =
    rawRegion && viewport
      ? {
          x: (rawRegion.x * viewport.width) / 1000,
          y: (rawRegion.y * viewport.height) / 1000,
          width: (rawRegion.width * viewport.width) / 1000,
          height: (rawRegion.height * viewport.height) / 1000,
        }
      : undefined
  const closeTo = (a: number, b: number) => Math.abs(a - b) <= 1
  add(
    'provenance.normalized-transform',
    !!candidateArt &&
      !!expectedRegion &&
      !(
        closeTo(candidateArt.perceivedRegion.x, expectedRegion.x) &&
        closeTo(candidateArt.perceivedRegion.y, expectedRegion.y) &&
        closeTo(candidateArt.perceivedRegion.width, expectedRegion.width) &&
        closeTo(candidateArt.perceivedRegion.height, expectedRegion.height)
      ),
    'the persisted region is the normalized response converted by the saved viewport',
    !candidateArt
      ? 'no candidate to convert'
      : expectedRegion
        ? `${candidateArt.perceivedRegion.width.toFixed(1)} vs ${expectedRegion.width.toFixed(1)}`
        : 'raw or viewport absent',
  )

  // --- Geometry: candidate overlap, point placement, exclusions -------------------------------
  // A measurement without a candidate is a contradiction; a healthy case with neither is legal.
  add(
    'geometry.candidate-present',
    measurements.length > 0 && !candidateArt,
    'a persisted candidate for any measurement',
    candidateArt ? 'present' : 'missing',
  )
  add(
    'geometry.candidate-overlap',
    !!candidateArt &&
      overlapFraction(candidateArt.perceivedRegion, truth.region) < truth.regionOverlapMin,
    `candidate overlaps the private region >= ${truth.regionOverlapMin}`,
    candidateArt ? overlapFraction(candidateArt.perceivedRegion, truth.region).toFixed(3) : 'n/a',
  )

  const points = receipts.flatMap((r) => r.samples)
  add(
    'geometry.points-in-region',
    points.some((s) => !inside(candidateArt?.perceivedRegion ?? truth.region, s)),
    'every sample inside the candidate',
    `${points.length} samples`,
  )
  add(
    'geometry.defect-inside-input',
    truth.expectSupported &&
      points.some((s) => s.focusedWithinMs === null && inside(truth.inputBox, s)),
    'no failing point inside the real input',
    'checked',
  )
  add(
    'geometry.samples-avoid-excluded',
    points.some((s) => truth.excludedRegions.some((r) => inside(r, s))),
    'no sample on an excluded area',
    'checked',
  )
  add(
    'geometry.avoids-neighbour-controls',
    truth.expectSupported &&
      points.some((s) => s.focusedWithinMs === null && isNeighbourControl(s.hit)),
    'no defect sample on a neighbouring control',
    'checked',
  )

  // --- Binding: the witness must name the intended node, and a binding call must exist --------
  const witnessFor = receipts.map((r) => r.binding.witnessRef)
  const witnessData = witnessFor
    .map((ref) => (ref ? (input.artifacts[ref]?.data as BindingWitness | undefined) : undefined))
    .filter((w): w is BindingWitness => !!w)
  add(
    'binding.witness-missing',
    graded &&
      receipts.some((r) => !r.binding.witnessRef || !input.artifacts[r.binding.witnessRef]?.data),
    'each graded probe carries a binding witness',
    `${receipts.filter((r) => r.binding.witnessRef).length}/${receipts.length}`,
    witnessFor.filter((r): r is string => !!r),
  )
  add(
    'binding.witness-mismatch',
    graded && witnessData.some((w) => !compareWitnessToTarget(w, input.target).ok),
    'the witness names the intended node',
    `${witnessData.length} witnesses`,
    witnessFor.filter((r): r is string => !!r),
  )
  const bindingCalls = input.gatewayCalls.filter(
    (c) => c.tool === 'focus_probe' && c.runId === input.run.runId,
  )
  add(
    'binding.semantic-call-missing',
    graded && bindingCalls.length === 0,
    'a semantic binding call exists for a graded probe',
    `${bindingCalls.length}`,
  )

  // --- Measurement: everything one receipt must satisfy to be trustworthy ---------------------
  const committedClicks = input.run.events.filter((e) => e.type === 'visual-focus:click-dispatched')
  const clickCount = (candidateId: string) =>
    committedClicks.filter((e) => e.payload?.candidateId === candidateId).length

  add(
    'measurement.control-failed',
    receipts.some(
      (r) => r.positiveControl?.ok !== true || r.positiveControl.focusedWithinMs === null,
    ),
    'a valid positive control',
    'checked',
  )
  add(
    'measurement.baseline-not-established',
    receipts.some((r) => r.samples.some((s) => s.focusBefore === r.binding.nodeIdentity)),
    'each sample on a verified unfocused baseline',
    'checked',
  )
  add(
    'measurement.observed-window',
    receipts.some((r) =>
      r.samples.some(
        (s) => !finite(s.observedWindowMs) || (s.observedWindowMs ?? 0) < FOCUS_WINDOW_MS,
      ),
    ),
    `each sample observed the full ${FOCUS_WINDOW_MS}ms window`,
    'checked',
  )
  add(
    'measurement.integrity-intervened',
    receipts.some((r) => !clean(r.integrity) || r.samples.some((s) => !clean(s.integrity))),
    'clean integrity',
    'checked',
  )
  add(
    'measurement.unstable',
    receipts.some((r) => r.samples.some((s) => s.stable === false || s.valueChanged)),
    'stable samples',
    'checked',
  )
  add(
    'measurement.sampling-invalid',
    receipts.some((r) => {
      const firstPass = r.samples.filter((s) => s.side !== 'retest')
      return firstPass.length !== 2 || new Set(firstPass.map((s) => s.side)).size !== 2
    }),
    'two distinct first-pass sides',
    'checked',
  )
  const retestMissing = receipts.some((r) => {
    const failures = r.samples.filter((s) => s.side !== 'retest' && s.focusedWithinMs === null)
    return failures.length > 0 && r.samples.filter((s) => s.side === 'retest').length !== 1
  })
  const retestMoved = receipts.some((r) => {
    const failures = r.samples.filter((s) => s.side !== 'retest' && s.focusedWithinMs === null)
    const retests = r.samples.filter((s) => s.side === 'retest')
    if (failures.length === 0 || retests.length !== 1) return false
    return (
      retests[0].retestOf !== failures[0].side ||
      retests[0].x !== failures[0].x ||
      retests[0].y !== failures[0].y
    )
  })
  add(
    'measurement.missing-retest',
    retestMissing,
    'one independent retest of the first failure',
    'checked',
  )
  add(
    'measurement.retest-not-same-point',
    retestMoved,
    'the retest is at the same point',
    'checked',
  )
  add(
    'metering.click-count-mismatch',
    measurements.some((m) => {
      const r = receiptFor(input, m.receiptRef)
      return !!r && (clickCount(m.candidateId) !== r.actionCost || r.actionCost > MAX_PROBE_CLICKS)
    }),
    'actionCost equals dispatched clicks',
    'checked',
  )

  // --- Outcome: recomputed verdict vs expectation vs declaration ------------------------------
  const gradedVerdict = pickVerdict(receipts.map((r) => recomputeVerdict(r).verdict))

  if (truth.expectSupported) {
    add(
      'outcome.defect-not-supported',
      gradedVerdict !== 'supported',
      'a supported visual finding',
      gradedVerdict ?? 'none',
    )
    add(
      'outcome.low-confidence-supported',
      candidateArt?.confidence === 'low' && supported.length > 0,
      'a low-confidence candidate cannot support a finding',
      String(candidateArt?.confidence ?? 'none'),
    )
    add(
      'business.extra-findings',
      supported.length !== (gradedVerdict === 'supported' ? 1 : 0),
      'exactly the measured supported findings',
      `${supported.length}`,
    )
  } else {
    add(
      'outcome.false-positive',
      supported.length > 0,
      'no supported finding on a healthy page',
      `${supported.length}`,
    )
    if (truth.requireProbe) {
      const probed = refuted.some((f) => measurements.some((m) => m.candidateId === f.candidateId))
      add('healthy.probe-missing', !probed, 'a real probe refuted the candidate', String(probed))
    }
    add(
      'healthy.coverage-gap',
      input.run.coverage.visualUnverified.length > 0,
      'no unresolved visual coverage gap',
      `${input.run.coverage.visualUnverified.length}`,
    )
  }

  add(
    'outcome.declared-verdict-conflict',
    supported.length > 0 && input.declaredVerdict !== (gradedVerdict ?? 'inconclusive'),
    'the declared verdict agrees with the recomputed one',
    `declared ${input.declaredVerdict}, recomputed ${gradedVerdict ?? 'none'}`,
  )

  const failedAssertions = assertions.filter((a) => !a.passed).map((a) => a.code)
  const passed = failedAssertions.length === 0
  return {
    case: input.case,
    fixtureRevision: input.fixtureRevision,
    scorerVersion: SCORER_VERSION,
    classification: passed ? 'pass' : 'fail',
    passed,
    assertions,
    failedAssertions,
    counts: {
      supported: supported.length,
      refuted: refuted.length,
      inconclusive: inconclusive.length,
      invalidEvidence: failedAssertions.filter(
        (c) => c.startsWith('provenance.') || c.startsWith('binding.'),
      ).length,
      skippedNotRun: 0,
    },
    details: {
      recomputedVerdict: gradedVerdict,
      declaredVerdict: input.declaredVerdict,
      fixtureRevision: input.fixtureRevision,
      fixtureHash: input.fixtureHash,
      target: input.target.id ?? input.target.tag,
    },
  }
}
