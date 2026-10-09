/**
 * Private ground truth for the visual-focus cases.
 *
 * This module is imported only by evaluation code and never by the arena, the server, or the agent's
 * tool surface, so nothing here can reach the browser the tested agent is looking at. The arena is
 * given a presentation string and nothing else; the mapping from presentation to case, the expected
 * outcome, the target identity and the true region all live here. Plan 5.
 */
export type VisualCaseId = 'D0' | 'H0' | 'H1' | 'D1' | 'D2' | 'H2'

const caseIds = new Set<string>(['D0', 'H0', 'H1', 'D1', 'D2', 'H2'])
export function isVisualCaseId(value: string): value is VisualCaseId {
  return caseIds.has(value)
}

/**
 * The presentation the arena is asked to draw. Deliberately says nothing about the case.
 *
 * Kept as a string rather than a union: this module is evaluation-side and must not depend on the
 * arena's vocabulary, and the preflight checks that every value here is one the arena accepts.
 */
export type VisualPresentation = string

export interface VisualCaseTruth {
  readonly id: VisualCaseId
  readonly presentation: VisualPresentation
  /** The native input the region is really about. Private: never sent to the browser. */
  readonly targetSelector: string
  /**
   * The native input's own box, in the same CSS pixels as `region`.
   *
   * Recorded because it is the thing the case is about: a candidate that covers the field is only a
   * defect if the fixed probe points fall outside this box. Without it, a "correct" candidate could
   * silently be the input itself and the case would score as a defect it never demonstrated.
   */
  readonly inputBox: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  /** The region the vision model is expected to perceive, in CSS pixels at the fixed viewport. */
  readonly region: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  /** Areas inside the region that are genuinely outside the input (icons, card padding). */
  readonly excludedRegions: readonly {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }[]
  /** Whether a click inside the region but outside the input focuses the input. */
  readonly edgeFocus: 'focused' | 'not-focused'
  /** Whether this case is expected to yield a supported finding. */
  readonly expectSupported: boolean
  /**
   * Whether the case must show a real probe was performed before it may pass as healthy.
   *
   * The acceptance plan draws this line between the healthy cases: H0 "must be refuted by a complete
   * probe triggered by a real visual candidate - it cannot pass by never looking", while "H1/H2 are
   * allowed to propose no reasonable candidate and record a limited observation scope". H1's control
   * is its own input, so a model seeing nothing wider to report is correct, not idle.
   */
  readonly requireProbe: boolean
  /** Minimum fraction of the candidate that must fall inside the true region to count as correct. */
  readonly regionOverlapMin: number
}

const TARGET = '.visual-search-region input'
const OVERLAP_MIN = 0.6

/**
 * The true geometry of the D0/H0 field, in CSS pixels at the 1280x768 run viewport.
 *
 * Measured from the live arena page rather than chosen by hand: the field is 420x50 and the native
 * input is a 240x28 box centred inside it. The preflight pins both against the real page, because a
 * stale rectangle here silently stops overlapping any candidate the agent could perceive, which turns
 * the scorer into a machine for failing correct work.
 *
 * These numbers moved with the fixture's styling fix: the field was previously drawn at 3/255 from
 * the page background with no border, so it was invisible, and real Qwen correctly reported the inner
 * input instead. With the border the box is two pixels taller, and the input starts one pixel further
 * left. See the perceivability check in the preflight.
 */
const REGION = { x: 430, y: 133, width: 420, height: 50 }
/** The narrower native input those probe points must fall outside of. */
const INPUT = { x: 495, y: 144, width: 240, height: 28 }

/** P4 geometry is measured from the rendered page at the frozen viewport. */
const D1_REGION = { x: 556, y: 150.78125, width: 360, height: 64 }
const D1_INPUT = { x: 639, y: 168.78125, width: 196, height: 28 }
const NARROW_VIEWPORT = { width: 900, height: 700 }
const D2_REGION = { x: 240, y: 183.828125, width: 360, height: 60 }
const D2_INPUT = { x: 323.171875, y: 199.828125, width: 164, height: 28 }
const D2_ICON = { x: 507.171875, y: 205.828125, width: 9.640625, height: 16 }

/**
 * D0/H0/H1 remain diagnostic regression cases; D1/D2/H2 are the fresh P4 holdout.
 * Geometry and focus behaviour are independently checked by the real-browser free preflight.
 */
export const VISUAL_TRUTH: Record<VisualCaseId, VisualCaseTruth> = {
  D0: {
    id: 'D0',
    inputBox: INPUT,
    presentation: 'search-padded-narrow-input',
    targetSelector: TARGET,
    region: REGION,
    excludedRegions: [],
    edgeFocus: 'not-focused',
    expectSupported: true,
    requireProbe: true,
    regionOverlapMin: OVERLAP_MIN,
  },
  H0: {
    id: 'H0',
    inputBox: INPUT,
    presentation: 'search-proxied-wide-region',
    targetSelector: TARGET,
    region: REGION,
    excludedRegions: [],
    edgeFocus: 'focused',
    expectSupported: false,
    requireProbe: true,
    regionOverlapMin: OVERLAP_MIN,
  },
  H1: {
    id: 'H1',
    // A plain bordered input: the whole control is the input, so a click anywhere in it focuses.
    // The card padding and the glyph beside it belong to the card and are not a "wider field".
    inputBox: { x: 490, y: 161, width: 260, height: 34 },
    presentation: 'search-bounded-line-card',
    targetSelector: TARGET,
    region: { x: 490, y: 161, width: 260, height: 34 },
    excludedRegions: [],
    edgeFocus: 'focused',
    expectSupported: false,
    requireProbe: false,
    regionOverlapMin: OVERLAP_MIN,
  },
  D1: {
    id: 'D1',
    inputBox: D1_INPUT,
    presentation: 'search-sage-grid-field',
    targetSelector: TARGET,
    region: D1_REGION,
    excludedRegions: [],
    edgeFocus: 'not-focused',
    expectSupported: true,
    requireProbe: true,
    regionOverlapMin: OVERLAP_MIN,
  },
  D2: {
    id: 'D2',
    inputBox: D2_INPUT,
    presentation: 'search-blue-trailing-field',
    targetSelector: TARGET,
    region: D2_REGION,
    excludedRegions: [D2_ICON],
    edgeFocus: 'not-focused',
    expectSupported: true,
    requireProbe: true,
    regionOverlapMin: OVERLAP_MIN,
  },
  H2: {
    id: 'H2',
    inputBox: D2_INPUT,
    presentation: 'search-blue-trailing-proxy',
    targetSelector: TARGET,
    region: D2_REGION,
    excludedRegions: [D2_ICON],
    edgeFocus: 'focused',
    expectSupported: false,
    requireProbe: false,
    regionOverlapMin: OVERLAP_MIN,
  },
}

/** The viewport each case must be run at: the narrow holdouts are not the diagnostic viewport. */
export const VISUAL_VIEWPORTS: Record<
  VisualCaseId,
  { readonly width: number; readonly height: number }
> = {
  D0: { width: 1280, height: 768 },
  H0: { width: 1280, height: 768 },
  H1: { width: 1280, height: 768 },
  D1: { width: 1280, height: 768 },
  D2: NARROW_VIEWPORT,
  H2: NARROW_VIEWPORT,
}

export function visualTruthFor(id: VisualCaseId): VisualCaseTruth {
  const truth = VISUAL_TRUTH[id]
  if (!truth) throw new Error(`No visual truth for case ${id}`)
  return truth
}

// ---------------------------------------------------------------------------
// Independent scoring. Grades the recorded evidence against the private truth; it never trusts the
// agent's own verdict, and it never trusts a candidate the agent described without a real measurement.
// ---------------------------------------------------------------------------

export interface ScorableCandidate {
  readonly id: string
  readonly kind: 'input-focus-region'
  readonly perceivedRegion: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly excludedRegions: readonly {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }[]
  readonly confidence: 'low' | 'medium' | 'high'
  readonly screenshotRef: string
}

export interface ScorableFinding {
  readonly id: string
  readonly validationStatus: 'candidate' | 'supported' | 'inconclusive' | 'refuted'
  /** The candidate the hypothesis was bound to, or null when none was. */
  readonly candidateId: string | null
}

export interface ScorableReceipt {
  readonly version: number
  readonly candidateId: string
  readonly screenshotRef: string
  readonly samples: readonly { readonly side: string; readonly focusedWithinMs: number | null }[]
}

export interface VisualCaseEvidence {
  readonly findings: readonly ScorableFinding[]
  readonly candidates: readonly ScorableCandidate[]
  readonly receipts: readonly ScorableReceipt[]
}

export interface VisualCaseVerdict {
  readonly case: VisualCaseId
  readonly passed: boolean
  readonly reasons: readonly string[]
}

function overlapFraction(
  candidate: ScorableCandidate['perceivedRegion'],
  region: VisualCaseTruth['region'],
): number {
  const x = Math.max(candidate.x, region.x)
  const y = Math.max(candidate.y, region.y)
  const right = Math.min(candidate.x + candidate.width, region.x + region.width)
  const bottom = Math.min(candidate.y + candidate.height, region.y + region.height)
  if (right <= x || bottom <= y) return 0
  const candidateArea = candidate.width * candidate.height
  return candidateArea === 0 ? 0 : ((right - x) * (bottom - y)) / candidateArea
}

/**
 * Grade one case.
 *
 * A supported finding only counts when a genuine candidate exists, sits inside the true region, and
 * carries a receipt with at least one sample that genuinely failed to focus within the window. A
 * healthy case fails if any supported finding survives, but a measured refutation counts as probing
 * rather than as skipping - "we never looked" is not a pass.
 */
export function scoreVisualCase(id: VisualCaseId, evidence: VisualCaseEvidence): VisualCaseVerdict {
  const truth = visualTruthFor(id)
  const reasons: string[] = []
  const supported = evidence.findings.filter((f) => f.validationStatus === 'supported')
  const refuted = evidence.findings.filter((f) => f.validationStatus === 'refuted')

  if (truth.expectSupported) {
    if (supported.length === 0) reasons.push('no-supported-finding')
    for (const finding of supported) {
      if (!finding.candidateId) {
        reasons.push('supported-without-candidate')
        continue
      }
      const candidate = evidence.candidates.find((c) => c.id === finding.candidateId)
      if (!candidate) {
        reasons.push('supported-without-candidate')
        continue
      }
      if (overlapFraction(candidate.perceivedRegion, truth.region) < truth.regionOverlapMin)
        reasons.push('candidate-outside-truth-region')
      const receipt = evidence.receipts.find((r) => r.candidateId === candidate.id)
      if (!receipt || receipt.version !== 1) {
        reasons.push('supported-without-receipt')
        continue
      }
      const failing = receipt.samples.filter((s) => s.focusedWithinMs === null)
      if (failing.length === 0) reasons.push('no-failing-sample')
    }
  } else {
    if (supported.length > 0) reasons.push('false-positive-on-healthy-page')
    // Some healthy cases have to prove they were looked at, and some are allowed to see nothing
    // worth proposing. Which is which comes from the truth, because the plan sets it per case: an
    // unprobed H0 proves nothing, while an H1 with no candidate is a correct answer. Requiring a
    // probe from both would fail H1 for being right.
    if (truth.requireProbe) {
      const probed = refuted.some((f) =>
        evidence.receipts.some((r) => r.candidateId === f.candidateId),
      )
      if (!probed) reasons.push('healthy-case-not-probed')
    }
  }

  return { case: id, passed: reasons.length === 0, reasons }
}
