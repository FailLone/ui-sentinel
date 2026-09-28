import { describe, expect, it } from 'vitest'
import {
  VISUAL_TRUTH,
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

  it('requires the ground-truth region to actually overlap the candidate', () => {
    const truth = visualTruthFor('D0')
    expect(truth.regionOverlapMin).toBeGreaterThan(0)
    expect(truth.regionOverlapMin).toBeLessThanOrEqual(1)
  })

  it('is a closed union of the implemented cases', () => {
    const ids: readonly VisualCaseId[] = ['D0', 'H0']
    expect(ids.every(isVisualCaseId)).toBe(true)
  })
})
