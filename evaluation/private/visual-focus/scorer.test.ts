import { describe, expect, it } from 'vitest'
import {
  scoreVisualEvidence,
  type VisualScorerInput,
  type ScoredReceipt,
  type ScoredSample,
} from './scorer.ts'
import { visualTruthFor, type VisualCaseId } from '../../fixtures/visual.ts'
import { findForbiddenReachability } from '../../support/module-graph.ts'
import { witnessFromElement, type PrivateVisualTarget } from './witness.ts'

/**
 * The contracts are readonly; a mutation test needs a copy whose properties can be reassigned so it
 * can corrupt exactly one fact. Arrays are left as declared - the tests always reassign a whole array,
 * never push into one.
 */
type DeepMutable<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T

const TARGET: PrivateVisualTarget = {
  tag: 'input',
  type: 'search',
  id: 'product-search-input',
  selector: '.visual-search-region input',
}
const EPOCH = 'epoch-1'
const NODE = 'node-abc'

function sample(over: Partial<ScoredSample> = {}): DeepMutable<ScoredSample> {
  return {
    side: 'left',
    x: 480,
    y: 158,
    hit: { ref: 'e9', tag: 'div', relation: 'ancestor' },
    focusBefore: null,
    focusAfter: over.focusedWithinMs != null ? NODE : null,
    focusedWithinMs: null,
    observedWindowMs: 520,
    valueChanged: false,
    documentEpoch: EPOCH,
    integrity: { version: 1, status: 'clean', interventionIds: [] },
    stable: true,
    ...over,
  }
}

function viewportFor(caseId: VisualCaseId): { width: number; height: number } {
  const region = visualTruthFor(caseId).region
  return {
    width: Math.ceil(region.x + region.width) + 60,
    height: Math.ceil(region.y + region.height) + 60,
  }
}

function normalizedRawFor(caseId: VisualCaseId) {
  const region = visualTruthFor(caseId).region
  const viewport = viewportFor(caseId)
  const n = (v: number, d: number) => Math.round((v / d) * 1000)
  return {
    coordinateSpace: 'normalized-1000',
    candidates: [
      {
        perceivedRegion: {
          x: n(region.x, viewport.width),
          y: n(region.y, viewport.height),
          width: n(region.width, viewport.width),
          height: n(region.height, viewport.height),
        },
        targetDescription: 'Search input region',
        visualBasis: 'continuous light background around the field',
        excludedRegions: [],
        confidence: 'high',
      },
    ],
  }
}

/** A supported receipt at the case's fixed probe points: padding fails, the input control succeeds. */
function supportedReceipt(
  caseId: VisualCaseId = 'D0',
  over: Partial<ScoredReceipt> = {},
): DeepMutable<ScoredReceipt> {
  const region = visualTruthFor(caseId).region
  const y = region.y + region.height / 2
  const left = region.x + 0.12 * region.width
  const right = region.x + 0.88 * region.width
  const controlX = region.x + region.width / 2
  return {
    version: 1,
    windowMs: 500,
    candidateId: 'candidate-1',
    screenshotRef: 'shot-1',
    screenshotSha: 'a'.repeat(64),
    documentEpoch: EPOCH,
    viewport: viewportFor(caseId),
    binding: {
      elementRef: 'e1',
      nodeIdentity: NODE,
      reason: 'the only native search input whose bounds lie inside the perceived region',
      witnessRef: 'witness-1',
    },
    positiveControl: {
      x: controlX,
      y,
      hit: { ref: 'e1', tag: 'input', relation: 'self' },
      focusBefore: null,
      focusAfter: NODE,
      focusedWithinMs: 88,
      observedWindowMs: 520,
      valueChanged: false,
      documentEpoch: EPOCH,
      integrity: { version: 1, status: 'clean', interventionIds: [] },
      stable: true,
      ok: true,
    },
    samples: [
      sample({ side: 'left', x: left, y, focusedWithinMs: null }),
      sample({ side: 'right', x: right, y, focusedWithinMs: null }),
      sample({ side: 'retest', retestOf: 'left', x: left, y, focusedWithinMs: null }),
    ],
    resets: [
      {
        x: 20,
        y: 640,
        introducedChange: false,
        integrity: { version: 1, status: 'clean', interventionIds: [] },
      },
      {
        x: 20,
        y: 640,
        introducedChange: false,
        integrity: { version: 1, status: 'clean', interventionIds: [] },
      },
    ],
    actionCost: 6,
    integrity: { version: 1, status: 'clean', interventionIds: [] },
    algorithmVersion: 'visual-focus-3',
    ...over,
  }
}

const witness = witnessFromElement({
  candidateId: 'candidate-1',
  elementRef: 'e1',
  snapshotRef: 'snap-1',
  documentEpoch: EPOCH,
  nodeIdentity: NODE,
  selector: 'html > body:nth-of-type(1) > div:nth-of-type(2) > input:nth-of-type(1)',
  tag: 'input',
  attributes: { id: 'product-search-input', type: 'search' },
  bounds: { x: 495, y: 144, width: 240, height: 28 },
  capturedAt: '2026-10-01T00:00:00.000Z',
})

/**
 * A complete, passing D0 evidence set. Every mutation below changes exactly one fact in a copy of it.
 */
function passing(caseId: VisualCaseId = 'D0'): DeepMutable<VisualScorerInput> {
  const truth = visualTruthFor(caseId)
  const candidate = {
    id: 'candidate-1',
    kind: 'input-focus-region' as const,
    perceivedRegion: truth.region,
    excludedRegions: truth.excludedRegions,
    confidence: 'high' as const,
    screenshotRef: 'shot-1',
    runId: 'run-1',
    documentEpoch: EPOCH,
  }
  return enrich({
    case: caseId,
    fixtureRevision: 'visual-holdout-1',
    fixtureHash: 'f'.repeat(64),
    target: TARGET,
    run: {
      runId: 'run-1',
      status: 'completed',
      businessResult: 'success',
      stopReason: 'goal-reached',
      usage: { actions: 12, modelCalls: 7 },
      budget: { maxActions: 40, maxModelCalls: 30 },
      coverage: { visualUnverified: [] },
      events: [
        {
          id: 'ev-1',
          seq: 1,
          type: 'finish:accepted',
          payload: { verifiedOperations: [] },
          evidenceRefs: [],
        },
        // Six committed clicks match the receipt's actionCost of 6.
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `ev-click-${i}`,
          seq: i + 2,
          type: 'visual-focus:click-dispatched',
          payload: { candidateId: 'candidate-1', kind: 'sample' },
          evidenceRefs: [],
        })),
      ],
      findings: [
        {
          id: 'f1',
          validationStatus: 'supported',
          candidateId: 'candidate-1',
          evidenceRefs: [
            'shot-1',
            'candidate-art-1',
            'receipt-art-1',
            'measurement-art-1',
            'annotated-1',
            'witness-1',
          ],
          title: 'Sampled input-region clicks did not focus the input',
        },
      ],
      hypotheses: [
        {
          id: 'h1',
          status: 'supported',
          evidenceRefs: ['receipt-art-1'],
          visualCandidateId: 'candidate-1',
        },
      ],
      focusMeasurements: [
        {
          candidateId: 'candidate-1',
          receiptRef: 'receipt-art-1',
          samplesRef: 'measurement-art-1',
          annotatedRef: 'annotated-1',
          originalRef: 'shot-1',
          nodeIdentity: NODE,
          algorithmVersion: 'visual-focus-3',
          documentEpoch: EPOCH,
        },
      ],
    },
    artifacts: {
      'shot-1': { type: 'screenshot', exists: true, sha256: 'a'.repeat(64), runId: 'run-1' },
      'candidate-art-1': {
        type: 'visual-candidate',
        exists: true,
        sha256: 'b'.repeat(64),
        runId: 'run-1',
        data: candidate,
      },
      'receipt-art-1': {
        type: 'focus-receipt',
        exists: true,
        sha256: 'c'.repeat(64),
        runId: 'run-1',
        data: supportedReceipt(caseId),
      },
      'measurement-art-1': {
        type: 'measurement',
        exists: true,
        sha256: 'd'.repeat(64),
        runId: 'run-1',
      },
      'annotated-1': { type: 'screenshot', exists: true, sha256: 'e'.repeat(64), runId: 'run-1' },
      'witness-1': {
        type: 'binding-witness',
        exists: true,
        sha256: 'g'.repeat(64),
        runId: 'run-1',
        data: witness,
      },
    },
    sentVision: [{ sha256: 'a'.repeat(64), raw: normalizedRawFor(caseId) }],
    gatewayCalls: [
      {
        model: 'deepseek/deepseek-v4.1-flash',
        tool: 'focus_probe',
        runId: 'run-1',
        body: { elementRef: 'e1' },
      },
    ],
    declaredVerdict: 'supported',
  })
}

function clone(input: VisualScorerInput): DeepMutable<VisualScorerInput> {
  return structuredClone(input) as DeepMutable<VisualScorerInput>
}

function failCodes(input: DeepMutable<VisualScorerInput>): readonly string[] {
  return scoreVisualEvidence(input).failedAssertions
}

describe('independent visual scorer', () => {
  it('passes a complete, consistent D0 evidence set', () => {
    const result = scoreVisualEvidence(passing('D0'))
    expect(result.failedAssertions).toEqual([])
    expect(result.passed).toBe(true)
    expect(result.classification).toBe('pass')
  })

  it('does not import the product verdict or the P2 smoke scorer, however indirectly', () => {
    // The scorer must recompute the conclusion from raw evidence; sharing the product's verdict
    // function would make the two agree by construction. This walks the whole import graph rather
    // than grepping the scorer's own source, because "directly or indirectly" is the requirement and
    // a re-export under another name is exactly how an indirect call would arrive - `witness.ts`, in
    // this tree, is itself such a facade.
    const found = findForbiddenReachability(new URL('./scorer.ts', import.meta.url).pathname, [
      'focusReceiptVerdict',
      'evaluateFocusVerdict',
      'focusReceiptSupports',
      'visualSmokeProblems',
      'isFocusReceipt',
    ])
    expect(found).toEqual([])
  })

  // --- S01 : supported with no vision request / image --------------------------------
  it('rejects a supported finding with no vision request (S01)', () => {
    const input = clone(passing('D0'))
    input.sentVision = []
    expect(failCodes(input)).toContain('provenance.vision-request-missing')
  })

  // --- S02 : swapped image bytes / wrong owner ---------------------------------------
  it('rejects a screenshot whose bytes do not match what was sent (S02)', () => {
    const input = clone(passing('D0'))
    input.sentVision = [{ sha256: 'z'.repeat(64), raw: normalizedRawFor('D0') }]
    expect(failCodes(input)).toContain('provenance.image-sha-mismatch')
  })

  it('rejects evidence owned by another run (S02)', () => {
    const input = clone(passing('D0'))
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, runId: 'other-run' }
    expect(failCodes(input)).toContain('provenance.same-run')
  })

  // --- S03 : wrong normalization but box still in viewport ---------------------------
  it('rejects a raw response that does not declare the normalized contract (S03)', () => {
    const input = clone(passing('D0'))
    input.sentVision = [{ sha256: 'a'.repeat(64), raw: { candidates: [] } }]
    expect(failCodes(input)).toContain('provenance.normalized-contract')
  })

  // --- S04 : bound a different same-sized node ---------------------------------------
  it('rejects a probe bound to a same-sized neighbour (S04)', () => {
    const input = clone(passing('D0'))
    const wrong = witnessFromElement({
      ...{
        candidateId: 'candidate-1',
        elementRef: 'e1',
        snapshotRef: 'snap-1',
        documentEpoch: EPOCH,
        nodeIdentity: NODE,
        selector: 'html > body:nth-of-type(1) > input:nth-of-type(2)',
        tag: 'input',
        bounds: witness.bounds,
        capturedAt: 'now',
      },
      attributes: { id: 'other-search', type: 'search' },
    })
    input.artifacts['witness-1'] = { ...input.artifacts['witness-1']!, data: wrong }
    expect(failCodes(input)).toContain('binding.witness-mismatch')
  })

  it('rejects a supported finding whose receipt carries no witness (S04)', () => {
    const input = clone(passing('D0'))
    const receipt = { ...supportedReceipt() }
    receipt.binding = { elementRef: 'e1', nodeIdentity: NODE, reason: 'r' }
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('binding.witness-missing')
  })

  // --- S05 : candidate is the whole card / failure point on the icon ------------------
  it('rejects a candidate that does not overlap the private region (S05)', () => {
    const input = clone(passing('D0'))
    const candidate = input.artifacts['candidate-art-1']!.data as { perceivedRegion: unknown }
    input.artifacts['candidate-art-1'] = {
      ...input.artifacts['candidate-art-1']!,
      data: { ...candidate, perceivedRegion: { x: 10, y: 10, width: 40, height: 20 } },
    }
    expect(failCodes(input)).toContain('geometry.candidate-overlap')
  })

  it('rejects a failing sample that lands inside the real input (S05)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.samples = [
      sample({ side: 'left', x: 600, y: 158, focusedWithinMs: null }),
      sample({ side: 'right', x: 800 }),
      sample({ side: 'retest', retestOf: 'left', x: 600, y: 158 }),
    ]
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('geometry.defect-inside-input')
  })

  // --- S06 : control missing / failed / already focused ------------------------------
  it('rejects a receipt whose positive control failed (S06)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.positiveControl = { ...receipt.positiveControl, ok: false, focusedWithinMs: null }
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.control-failed')
  })

  // --- S07 : baseline not established ------------------------------------------------
  it('rejects a sample taken while the input was already focused (S07)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.samples = [
      sample({ side: 'left', focusBefore: NODE }),
      sample({ side: 'right', x: 800 }),
      sample({ side: 'retest', retestOf: 'left', x: 480 }),
    ]
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.baseline-not-established')
  })

  // --- S08 : claims 500ms but observed 100ms -----------------------------------------
  it('rejects a declared window the observation did not cover (S08)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.samples = receipt.samples.map((s) => ({ ...s, observedWindowMs: 100 }))
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.observed-window')
  })

  // --- S09 : single failure with no independent retest -------------------------------
  it('rejects a supported finding with no independent retest (S09)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.samples = [sample({ side: 'left' }), sample({ side: 'right', x: 800 })]
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.missing-retest')
  })

  it('rejects a retest at a different coordinate (S09)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.samples = [
      sample({ side: 'left' }),
      sample({ side: 'right', x: 800 }),
      sample({ side: 'retest', retestOf: 'left', x: 481 }),
    ]
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.retest-not-same-point')
  })

  // --- S10 : missing a side / duplicate side -----------------------------------------
  it('rejects a sample set missing one side (S10)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.samples = [
      sample({ side: 'left' }),
      sample({ side: 'retest', retestOf: 'left', x: 480 }),
    ]
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.sampling-invalid')
  })

  // --- S11 : instability / intervention ----------------------------------------------
  it('rejects a sample that was not stable (S11)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.samples = [
      sample({ side: 'left', stable: false }),
      sample({ side: 'right', x: 800 }),
      sample({ side: 'retest', retestOf: 'left', x: 480 }),
    ]
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.unstable')
  })

  it('rejects a receipt whose integrity was intervened (S11)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.integrity = { version: 1, status: 'intervened', interventionIds: ['x'] }
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('measurement.integrity-intervened')
  })

  // --- S12 : click count does not match actionCost -----------------------------------
  it('rejects a receipt whose actionCost disagrees with the dispatched clicks (S12)', () => {
    const input = clone(passing('D0'))
    const receipt = supportedReceipt()
    receipt.actionCost = 5
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: receipt }
    expect(failCodes(input)).toContain('metering.click-count-mismatch')
  })

  // --- S13 : low-confidence candidate cannot support ---------------------------------
  it('rejects a supported finding from a low-confidence candidate (S13)', () => {
    const input = clone(passing('D0'))
    const candidate = input.artifacts['candidate-art-1']!.data as { confidence: string }
    input.artifacts['candidate-art-1'] = {
      ...input.artifacts['candidate-art-1']!,
      data: { ...candidate, confidence: 'low' },
    }
    expect(failCodes(input)).toContain('outcome.low-confidence-supported')
  })

  it('rejects a supported finding with no semantic binding call (S13)', () => {
    const input = clone(passing('D0'))
    input.gatewayCalls = []
    expect(failCodes(input)).toContain('binding.semantic-call-missing')
  })

  // --- S14 : healthy case not investigated / claimed healthy while unknown -----------
  it('rejects an H0 that was never probed (S14)', () => {
    const input = healthy('H0')
    input.run.findings = []
    input.run.hypotheses = []
    input.run.focusMeasurements = []
    expect(failCodes(input)).toContain('healthy.probe-missing')
  })

  it('rejects H1/H2 that claim a supported finding (S14)', () => {
    const input = healthy('H1')
    input.run.findings = [
      {
        id: 'f1',
        validationStatus: 'supported',
        candidateId: 'candidate-1',
        evidenceRefs: ['receipt-art-1'],
        title: 'x',
      },
    ]
    expect(failCodes(input)).toContain('outcome.false-positive')
  })

  it('rejects a healthy case with an unresolved visual coverage gap (S14)', () => {
    const input = healthy('H1')
    input.run.coverage = { visualUnverified: ['visual-scan-unverified'] }
    expect(failCodes(input)).toContain('healthy.coverage-gap')
  })

  // --- S15 : business failure behind a correct finding -------------------------------
  it('rejects a persisted region that is the wrong normalization but still in viewport (S03)', () => {
    const input = clone(passing('D0'))
    const candidate = input.artifacts['candidate-art-1']!.data as {
      perceivedRegion: { x: number; y: number; width: number; height: number }
    }
    // Shifted 30px: still inside the viewport, still overlapping the truth region, but not the
    // deterministic conversion of the raw normalized box. A naive check would pass it.
    input.artifacts['candidate-art-1'] = {
      ...input.artifacts['candidate-art-1']!,
      data: {
        ...candidate,
        perceivedRegion: { ...candidate.perceivedRegion, x: candidate.perceivedRegion.x + 30 },
      },
    }
    expect(failCodes(input)).toContain('provenance.normalized-transform')
  })

  it('rejects a candidate whose transform cannot be checked at all (S03)', () => {
    // The check compares the persisted region against the raw response converted by the saved
    // viewport. When either side is absent there is nothing to compare, and an assertion that passes
    // on "nothing to compare" is a false pass: a receipt that dropped its viewport, or a response
    // that never arrived, would sail through the exact check S03 exists to make.
    for (const drop of ['raw', 'viewport'] as const) {
      const input = clone(passing('D0'))
      if (drop === 'raw') input.sentVision = [{ sha256: 'a'.repeat(64), raw: null }]
      const receipt = input.artifacts['receipt-art-1']!.data as { viewport?: unknown }
      if (drop === 'viewport') {
        delete receipt.viewport
      }
      expect(failCodes(input), `missing ${drop}`).toContain('provenance.normalized-transform')
    }
  })

  it('accepts H1 and H2 when no candidate is proposed at all', () => {
    // The acceptance plan allows the healthy holdouts to raise no candidate and record a limited
    // scope. Their evidence is the completed scan and business run, not a probe.
    for (const id of ['H1', 'H2'] as const) {
      const input = clone(passing(id))
      input.run.findings = []
      input.run.hypotheses = []
      input.run.focusMeasurements = []
      input.artifacts = { 'shot-1': input.artifacts['shot-1']!, 'raw-1': input.artifacts['raw-1']! }
      input.sentVision = [
        { sha256: 'a'.repeat(64), raw: { coordinateSpace: 'normalized-1000', candidates: [] } },
      ]
      input.artifacts['raw-1'] = {
        ...input.artifacts['raw-1']!,
        data: {
          ...(input.artifacts['raw-1']!.data as any),
          text: JSON.stringify(input.sentVision[0]!.raw),
        },
      }
      const result = scoreVisualEvidence(input)
      expect(result.failedAssertions).toEqual([])
      expect(result.passed).toBe(true)
    }
  })

  it('rejects an H0 that was probed but whose receipt carries no witness (S14/S04)', () => {
    const input = healthy('H0')
    const receipt = supportedReceipt('H0')
    receipt.samples = [
      sample({ side: 'left', x: visualTruthFor('H0').region.x + 50, focusedWithinMs: 90 }),
      sample({ side: 'right', x: visualTruthFor('H0').region.x + 370, focusedWithinMs: 95 }),
    ]
    const noWitness = { ...receipt, binding: { ...receipt.binding, witnessRef: undefined } }
    input.artifacts['receipt-art-1'] = { ...input.artifacts['receipt-art-1']!, data: noWitness }
    expect(failCodes(input)).toContain('binding.witness-missing')
  })

  it('rejects a run that did not purchase even with a correct finding (S15)', () => {
    const input = clone(passing('D0'))
    input.run.businessResult = 'unknown'
    expect(failCodes(input)).toContain('business.purchase')
  })

  it('rejects a run with no explicit finish (S15)', () => {
    const input = clone(passing('D0'))
    input.run.events = input.run.events.filter((e) => e.type !== 'finish:accepted')
    expect(failCodes(input)).toContain('business.explicit-finish')
  })

  it('rejects an extra unsupported finding (S15)', () => {
    const input = clone(passing('D0'))
    input.run.findings = [
      ...input.run.findings,
      {
        id: 'f2',
        validationStatus: 'supported',
        candidateId: null,
        evidenceRefs: [],
        title: 'unfounded',
      },
    ]
    expect(failCodes(input)).toContain('business.extra-findings')
  })

  // --- S16 : forged verdict string, measurements unchanged ---------------------------
  it('does not follow a forged verdict string and flags the conflict (S16)', () => {
    const input = clone(passing('D0'))
    input.declaredVerdict = 'refuted'
    const result = scoreVisualEvidence(input)
    // The recomputed verdict comes from the measurement, not the string.
    expect(result.details.recomputedVerdict).toBe('supported')
    expect(result.failedAssertions).toContain('outcome.declared-verdict-conflict')
  })

  it('recomputes refuted from a healthy-but-probed H0 receipt', () => {
    const input = healthy('H0')
    const result = scoreVisualEvidence(input)
    expect(result.details.recomputedVerdict).toBe('refuted')
    expect(result.passed).toBe(true)
  })

  // --- R03: independent counts, one per failure kind ---------------------------------
  it('counts a real detection as a discovery and not as a miss or a false positive', () => {
    // D0 is a defect: the measured support is the discovery this case exists to make.
    const result = scoreVisualEvidence(passing('D0'))
    expect(result.counts.discoveries).toBe(1)
    expect(result.counts.falsePositives).toBe(0)
    expect(result.counts.missed).toBe(0)
    expect(result.counts.businessFailures).toBe(0)
    expect(result.counts.unverifiedScope).toBe(0)
  })

  it('counts a supported finding on a healthy page as a false positive, not a discovery', () => {
    const input = healthy('H0')
    input.run.findings = [{ ...passing().run.findings[0]!, validationStatus: 'supported' }]
    const result = scoreVisualEvidence(input)
    expect(result.counts.falsePositives).toBe(1)
    expect(result.counts.discoveries).toBe(0)
  })

  it('counts a defect the evidence failed to support as a miss on its own', () => {
    // S15 already fails the run for the wrong finding; the count says *why* independently.
    const input = clone(passing('D0'))
    input.run.findings = []
    const result = scoreVisualEvidence(input)
    expect(result.counts.missed).toBe(1)
    expect(result.counts.discoveries).toBe(0)
  })

  it('counts a business-path failure separately from the visual result', () => {
    const input = clone(passing('D0'))
    input.run.businessResult = 'unknown'
    const result = scoreVisualEvidence(input)
    expect(result.counts.businessFailures).toBe(1)
    // The discovery still happened; a failed purchase does not erase it.
    expect(result.counts.discoveries).toBe(1)
  })

  it('counts an unresolved visual coverage gap as unverified scope', () => {
    const input = healthy('H0')
    input.run.coverage.visualUnverified = ['visual-candidate:c1:unverified']
    const result = scoreVisualEvidence(input)
    expect(result.counts.unverifiedScope).toBe(1)
  })
})

/** A minimal passing healthy case: a probe was made and refuted, business completed. */
function healthy(caseId: 'H0' | 'H1' | 'H2'): DeepMutable<VisualScorerInput> {
  const truth = visualTruthFor(caseId)
  const base = passing('D0')
  const receipt = supportedReceipt()
  // A healthy page focuses at the sampled edge points, so the result is a measured refutation.
  receipt.samples = [
    sample({ side: 'left', x: 480, focusedWithinMs: 90 }),
    sample({ side: 'right', x: 800, focusedWithinMs: 95 }),
  ]
  receipt.actionCost = 5
  return enrich({
    ...base,
    case: caseId,
    sentVision: [{ sha256: 'a'.repeat(64), raw: normalizedRawFor('D0') }],
    artifacts: {
      ...base.artifacts,
      'candidate-art-1': {
        ...base.artifacts['candidate-art-1']!,
        data: {
          id: 'candidate-1',
          kind: 'input-focus-region',
          perceivedRegion: truth.region,
          excludedRegions: truth.excludedRegions,
          confidence: 'high',
          screenshotRef: 'shot-1',
          runId: 'run-1',
          documentEpoch: EPOCH,
        },
      },
      'receipt-art-1': { ...base.artifacts['receipt-art-1']!, data: receipt },
    },
    run: {
      ...base.run,
      events: [
        {
          id: 'ev-1',
          seq: 1,
          type: 'finish:accepted',
          payload: { verifiedOperations: [] },
          evidenceRefs: [],
        },
        // Five committed clicks match this receipt's actionCost of 5.
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `ev-click-${i}`,
          seq: i + 2,
          type: 'visual-focus:click-dispatched',
          payload: { candidateId: 'candidate-1', kind: 'sample' },
          evidenceRefs: [],
        })),
      ],
      findings: [],
      hypotheses: [
        {
          id: 'h1',
          status: 'refuted',
          evidenceRefs: ['receipt-art-1'],
          visualCandidateId: 'candidate-1',
        },
      ],
    },
    declaredVerdict: 'refuted',
  })
}

function enrich(input: DeepMutable<VisualScorerInput>): DeepMutable<VisualScorerInput> {
  const v = structuredClone(input) as any,
    c = v.artifacts['candidate-art-1'].data,
    r = v.artifacts['receipt-art-1'].data
  const viewport = r.viewport
  Object.assign(c, {
    screenshotSha: 'a'.repeat(64),
    rawRef: 'raw-1',
    viewport,
    algorithmVersion: 'visual-focus-3',
  })
  v.artifacts['raw-1'] = {
    type: 'visual-response',
    exists: true,
    runId: v.run.runId,
    data: {
      text: JSON.stringify(v.sentVision[0].raw),
      screenshotRef: 'shot-1',
      screenshotSha: 'a'.repeat(64),
      coordinateTransform: {
        source: 'normalized-1000',
        destination: 'css-pixels',
        scaleX: viewport.width / 1000,
        scaleY: viewport.height / 1000,
        viewport,
      },
    },
  }
  const w = v.artifacts['witness-1'].data
  v.artifacts['snap-1'] = {
    type: 'snapshot',
    exists: true,
    runId: v.run.runId,
    data: {
      elements: [
        {
          selector: w.domPath.join(' > '),
          tag: w.native.tag,
          attributes: { id: w.native.id, type: w.native.type },
          bounds: w.bounds,
        },
      ],
    },
  }
  v.artifacts['measurement-art-1'].data = { receiptRef: 'receipt-art-1', samples: r.samples }
  const clicks: any[] = []
  let n = 0,
    resets = 0
  const emit = (p: any, kind: string) =>
    clicks.push({
      id: 'click-' + n,
      seq: ++n,
      type: 'visual-focus:click-dispatched',
      payload: { candidateId: c.id, kind, x: p.x, y: p.y },
      evidenceRefs: [],
    })
  const points = [r.positiveControl, ...r.samples]
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && (points[i - 1].focusAfter === NODE || points[i].side === 'retest'))
      emit(r.resets[resets++], 'neutral-reset')
    emit(points[i], 'sample')
  }
  v.run.events = [
    ...clicks,
    {
      id: 'annotated',
      seq: ++n,
      type: 'visual-focus:annotated',
      payload: { candidateId: c.id, annotatedRef: 'annotated-1', sourceRef: 'shot-1' },
      evidenceRefs: [],
    },
    { id: 'finish', seq: ++n, type: 'finish:accepted', payload: {}, evidenceRefs: [] },
  ]
  r.actionCost = clicks.length
  for (const h of v.run.hypotheses) h.evidenceRefs = ['receipt-art-1', 'candidate-art-1']
  v.gatewayCalls[0].body = {
    candidateId: c.id,
    elementRef: r.binding.elementRef,
    bindingReason: r.binding.reason,
  }
  return v
}

describe('review regressions: evidence identity and raw focus facts', () => {
  it('accepts a generated artifact id rather than a fixture-only literal', () => {
    const input = passing(),
      old = 'candidate-art-1',
      id = '3c41528f-1dfc-4a51-9e90-cf30cd65e87e.json'
    const changed = JSON.parse(JSON.stringify(input).replaceAll(old, id))
    expect(scoreVisualEvidence(changed).failedAssertions).toEqual([])
  })
  it.each([
    [
      'focusAfter contradicts focus time',
      'measurement.focus-contradiction',
      (v: any) => {
        v.artifacts['receipt-art-1'].data.samples[0].focusAfter = NODE
      },
    ],
    [
      'missing explicit stable observation',
      'measurement.unstable',
      (v: any) => {
        delete v.artifacts['receipt-art-1'].data.samples[0].stable
      },
    ],
    [
      'witness refers to another node',
      'binding.witness-mismatch',
      (v: any) => {
        v.artifacts['witness-1'].data.nodeIdentity = 'another-node'
      },
    ],
    [
      'finding refers to another candidate',
      'binding.finding-chain',
      (v: any) => {
        v.run.findings[0].candidateId = 'another-candidate'
      },
    ],
    [
      'measurement artifact removed',
      'evidence.artifact-unavailable',
      (v: any) => {
        delete v.artifacts[v.run.focusMeasurements[0].samplesRef]
      },
    ],
  ] as const)('%s', (name, code, mutate) => {
    const input = passing()
    mutate(input)
    expect(scoreVisualEvidence(input).failedAssertions, name).toContain(code)
  })
  it('accepts the actual healthy API shape: a refuted hypothesis and no finding', () => {
    const input = healthy('H0')
    expect(input.run.findings).toHaveLength(0)
    expect(scoreVisualEvidence(input).passed).toBe(true)
  })
})

it('S13 refuses a renamed claim borrowing a valid focus receipt', () => {
  const input = passing()
  input.run.findings = [{ ...input.run.findings[0]!, title: 'Submit button is covered' }]
  expect(failCodes(input)).toContain('binding.finding-scope')
})
it('S13 refuses a supported finding that dropped the receipt reference', () => {
  const input = passing()
  input.run.findings = [{ ...input.run.findings[0]!, evidenceRefs: ['shot-1'] }]
  expect(failCodes(input)).toContain('binding.finding-chain')
})

it('S14 an empty-candidate response still requires its actual source image', () => {
  const input = healthy('H1')
  input.artifacts['shot-1'] = { ...input.artifacts['shot-1']!, sha256: 'b'.repeat(64) }
  expect(failCodes(input)).toContain('provenance.image-sha-mismatch')
})
