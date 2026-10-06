import { describe, expect, it } from 'vitest'
import {
  VISUAL_TRUTH,
  VISUAL_VIEWPORTS,
  visualTruthFor,
  isVisualCaseId,
  scoreVisualCase,
  type VisualCaseId,
} from './visual.ts'

describe('private visual truth', () => {
  it('defines the P1 cases and their presentations', () => {
    expect(isVisualCaseId('D0')).toBe(true)
    expect(isVisualCaseId('H0')).toBe(true)
    expect(isVisualCaseId('C0')).toBe(false)
  })

  it('keeps the truth out of anything the browser could read', () => {
    for (const truth of Object.values(VISUAL_TRUTH)) {
      // The truth names its case, its expected outcome and the target identity; the arena exposes only
      // a presentation string, so none of this may appear in the public presentation vocabulary.
      expect(truth.presentation).not.toMatch(/\bD[0-9]\b|\bH[0-9]\b/)
    }
  })

  it('records for D0 that the region edges do not focus, and for H0 that they do', () => {
    const d0 = visualTruthFor('D0')
    const h0 = visualTruthFor('H0')
    expect(d0.edgeFocus).toBe('not-focused')
    expect(d0.expectSupported).toBe(true)
    expect(h0.edgeFocus).toBe('focused')
    expect(h0.expectSupported).toBe(false)
  })

  it('points both cases at the same presentation-independent target selector', () => {
    expect(visualTruthFor('D0').targetSelector).toBe(visualTruthFor('H0').targetSelector)
  })
})

const candidate = {
  id: 'candidate-1',
  kind: 'input-focus-region' as const,
  // Deliberately close to the truth region but not identical, so the overlap rule is exercised
  // rather than trivially satisfied by the same numbers.
  perceivedRegion: { x: 440, y: 140, width: 400, height: 44 },
  excludedRegions: [],
  confidence: 'medium' as const,
  screenshotRef: 'shot-1',
}

function receipt(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    candidateId: 'candidate-1',
    screenshotRef: 'shot-1',
    samples: [{ side: 'left', focusedWithinMs: null }],
    ...over,
  }
}

describe("visual case scoring (independent of the agent's own verdict)", () => {
  it('passes D0 only when a supported finding cites a receipt for a genuine candidate', () => {
    const verdict = scoreVisualCase('D0', {
      findings: [{ id: 'f1', validationStatus: 'supported', candidateId: 'candidate-1' }],
      candidates: [candidate],
      receipts: [receipt()],
    })
    expect(verdict.passed).toBe(true)
  })

  it('fails D0 when the only supported finding has no candidate behind it', () => {
    // A verdict the agent simply asserted is not evidence: plan 5 scores against private truth.
    const verdict = scoreVisualCase('D0', {
      findings: [{ id: 'f1', validationStatus: 'supported', candidateId: null }],
      candidates: [],
      receipts: [],
    })
    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toContain('supported-without-candidate')
  })

  it('fails D0 when the candidate lies outside the true region', () => {
    const verdict = scoreVisualCase('D0', {
      findings: [{ id: 'f1', validationStatus: 'supported', candidateId: 'candidate-1' }],
      candidates: [{ ...candidate, perceivedRegion: { x: 10, y: 10, width: 20, height: 20 } }],
      receipts: [receipt()],
    })
    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toContain('candidate-outside-truth-region')
  })

  it('fails D0 on an already-focused false positive', () => {
    const verdict = scoreVisualCase('D0', {
      findings: [{ id: 'f1', validationStatus: 'supported', candidateId: 'candidate-1' }],
      candidates: [candidate],
      receipts: [receipt({ samples: [{ side: 'left', focusedWithinMs: 100 }] })],
    })
    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toContain('no-failing-sample')
  })

  it('rejects H0 when a supported finding is produced on a healthy page', () => {
    const verdict = scoreVisualCase('H0', {
      findings: [{ id: 'f1', validationStatus: 'supported', candidateId: 'candidate-1' }],
      candidates: [candidate],
      receipts: [receipt()],
    })
    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toContain('false-positive-on-healthy-page')
  })

  it('passes H0 when the region was probed and refuted, not merely skipped', () => {
    const verdict = scoreVisualCase('H0', {
      findings: [{ id: 'f1', validationStatus: 'refuted', candidateId: 'candidate-1' }],
      candidates: [candidate],
      receipts: [receipt({ samples: [{ side: 'left', focusedWithinMs: 80 }] })],
    })
    expect(verdict.passed).toBe(true)
  })

  it('passes H1 when no candidate is proposed at all', () => {
    // The acceptance plan gives H1 and H2 a different rule from H0: "H1/H2 allow no reasonable
    // candidate, record the limited observation scope, do not claim to be exhaustive". H1's control
    // IS its input, so a model that looks at it and sees nothing wider to report is right. Requiring
    // a probe here would fail the run for being correct, and H0 is the only healthy case the plan
    // insists must be probed.
    const verdict = scoreVisualCase('H1', { findings: [], candidates: [], receipts: [] })

    expect(verdict.reasons).not.toContain('healthy-case-not-probed')
    expect(verdict.passed).toBe(true)
  })

  it('passes H2 on the same terms', () => {
    const verdict = scoreVisualCase('H2', { findings: [], candidates: [], receipts: [] })

    expect(verdict.reasons).not.toContain('healthy-case-not-probed')
    expect(verdict.passed).toBe(true)
  })

  it('still requires H0 to have been probed rather than merely skipped', () => {
    // The rule the plan does insist on: H0 must not pass by never looking. Its three runs have to be
    // "triggered by a real visual candidate and refuted", so a bare H0 run with nothing is a failure.
    const verdict = scoreVisualCase('H0', { findings: [], candidates: [], receipts: [] })

    expect(verdict.reasons).toContain('healthy-case-not-probed')
    expect(verdict.passed).toBe(false)
  })

  it('requires the ground-truth region to actually overlap the candidate', () => {
    const truth = visualTruthFor('D0')
    expect(truth.regionOverlapMin).toBeGreaterThan(0)
    expect(truth.regionOverlapMin).toBeLessThanOrEqual(1)
  })

  it('is a closed union of the implemented cases', () => {
    const ids: readonly VisualCaseId[] = ['D0', 'H0', 'H1', 'D1', 'D2', 'H2']
    expect(ids.every(isVisualCaseId)).toBe(true)
  })
})

describe('the full six-case matrix', () => {
  const ids: readonly VisualCaseId[] = ['D0', 'H0', 'H1', 'D1', 'D2', 'H2']

  it('defines every case, with three defects and three healthy twins', () => {
    expect(Object.keys(VISUAL_TRUTH).sort()).toEqual([...ids].sort())
    const defective = ids.filter((id) => visualTruthFor(id).expectSupported)
    expect(defective).toEqual(['D0', 'D1', 'D2'])
    // A healthy case is worth nothing without a defective counterpart to compare against.
    for (const id of ['D0', 'D1', 'D2'] as const)
      expect(visualTruthFor(id).expectSupported).toBe(true)
    for (const id of ['H0', 'H1', 'H2'] as const)
      expect(visualTruthFor(id).expectSupported).toBe(false)
  })

  it('gives every case its own presentation', () => {
    // Two cases sharing one presentation would render the same page twice and quietly delete the
    // comparison the pair exists to make.
    const presentations = ids.map((id) => visualTruthFor(id).presentation)
    expect(new Set(presentations).size).toBe(ids.length)
  })

  it('never lets a presentation name a case', () => {
    for (const id of ids) {
      expect(visualTruthFor(id).presentation).not.toMatch(/\bD[0-9]\b|\bH[0-9]\b|truth|expect/i)
    }
  })

  it('keeps the two holdout defects structurally unlike D0', () => {
    // The holdouts exist to show the capability is not fitted to one layout. If D1/D2 reused D0's
    // geometry or styling vocabulary they would test nothing the diagnostic set had not.
    const d0 = visualTruthFor('D0')
    for (const id of ['D1', 'D2'] as const) {
      const truth = visualTruthFor(id)
      // Counted rather than checked field by field: a holdout that happened to share one number with
      // D0 would still be a different page, and demanding every field differ would force the fixture
      // into unnatural shapes for no evidential gain.
      const differences = [
        truth.presentation !== d0.presentation,
        truth.region.x !== d0.region.x,
        truth.region.width !== d0.region.width,
        truth.region.height !== d0.region.height,
        truth.inputBox.width !== d0.inputBox.width,
        VISUAL_VIEWPORTS[id].width !== VISUAL_VIEWPORTS.D0.width,
      ].filter(Boolean).length
      expect(differences).toBeGreaterThanOrEqual(4)
    }
    // D2's whole point is a different viewport, so it must not be run at the diagnostic size.
    expect(VISUAL_VIEWPORTS.D1).toEqual(VISUAL_VIEWPORTS.D0)
    expect(VISUAL_VIEWPORTS.D2).not.toEqual(VISUAL_VIEWPORTS.D0)
  })

  it('records the narrow viewport for the narrow holdouts and nothing else', () => {
    expect(VISUAL_VIEWPORTS.D2.width).toBeLessThan(VISUAL_VIEWPORTS.D0.width)
    expect(VISUAL_VIEWPORTS.H2).toEqual(VISUAL_VIEWPORTS.D2)
    expect(VISUAL_VIEWPORTS.D0).toEqual({ width: 1280, height: 768 })
  })

  it('excludes the decorative icon in D2 and H2, so an icon failure cannot stand as the evidence', () => {
    for (const id of ['D2', 'H2'] as const) {
      const truth = visualTruthFor(id)
      expect(truth.excludedRegions.length).toBeGreaterThan(0)
      for (const icon of truth.excludedRegions) {
        // The icon must be inside the region and outside the input: that is what makes it a
        // genuinely excluded area rather than a second control.
        expect(icon.x).toBeGreaterThanOrEqual(truth.region.x)
        expect(icon.x + icon.width).toBeLessThanOrEqual(truth.region.x + truth.region.width)
        expect(
          icon.x + icon.width <= truth.inputBox.x ||
            icon.x >= truth.inputBox.x + truth.inputBox.width,
        ).toBe(true)
      }
    }
  })

  it('makes every probe point land outside the input for a defect, and inside it for H1', () => {
    // The point of the whole matrix: for a defect the fixed procedure must sample padding, and for
    // H1 - whose control IS its input - it must not.
    for (const id of ids) {
      const truth = visualTruthFor(id)
      const points = [
        truth.region.x + 0.12 * truth.region.width,
        truth.region.x + 0.88 * truth.region.width,
      ]
      const inside = points.map(
        (x) => x >= truth.inputBox.x && x <= truth.inputBox.x + truth.inputBox.width,
      )
      if (id === 'H1') expect(inside).toEqual([true, true])
      else expect(inside).toEqual([false, false])
    }
  })
})
