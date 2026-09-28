import { describe, expect, it } from 'vitest'
import {
  bindServerCandidate,
  CANDIDATE_MAX,
  EXCLUDED_MAX,
  parseVisualScanOutput,
  type VisualCandidate,
} from './visual-candidate.ts'

const viewport = { width: 1280, height: 768 }
const region = { x: 100, y: 200, width: 400, height: 40 }

function output(over: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        perceivedRegion: region,
        targetDescription: 'the wide light search area',
        visualBasis: 'continuous light fill with no inner border, looks like one input row',
        excludedRegions: [],
        confidence: 'medium',
      },
    ],
    ...over,
  }
}

describe('parseVisualScanOutput (strict; illegal output is rejected whole)', () => {
  it('accepts a minimal valid scan', () => {
    const parsed = parseVisualScanOutput(output(), viewport)
    expect(parsed.ok).toBe(true)
  })

  it('treats an empty candidate list as a valid result, not an error', () => {
    const parsed = parseVisualScanOutput({ candidates: [] }, viewport)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.candidates).toEqual([])
  })

  it('rejects output carrying more than the capped number of candidates', () => {
    const one = output().candidates[0]
    const parsed = parseVisualScanOutput(
      { candidates: Array(CANDIDATE_MAX + 1).fill(one) },
      viewport,
    )
    expect(parsed.ok).toBe(false)
  })

  it('rejects more excluded regions than the cap', () => {
    const base = output().candidates[0]
    const parsed = parseVisualScanOutput(
      {
        candidates: [
          {
            ...base,
            excludedRegions: Array(EXCLUDED_MAX + 1).fill({ x: 1, y: 1, width: 2, height: 2 }),
          },
        ],
      },
      viewport,
    )
    expect(parsed.ok).toBe(false)
  })

  it('rejects a candidate region outside the viewport instead of clipping it', () => {
    const parsed = parseVisualScanOutput(
      { candidates: [{ ...output().candidates[0], perceivedRegion: { ...region, x: 1200 } }] },
      viewport,
    )
    expect(parsed.ok).toBe(false)
  })

  it('rejects an over-long description rather than truncating it', () => {
    const parsed = parseVisualScanOutput(
      { candidates: [{ ...output().candidates[0], targetDescription: 'x'.repeat(301) }] },
      viewport,
    )
    expect(parsed.ok).toBe(false)
  })

  it('rejects an unknown confidence level', () => {
    const parsed = parseVisualScanOutput(
      { candidates: [{ ...output().candidates[0], confidence: 'certain' }] },
      viewport,
    )
    expect(parsed.ok).toBe(false)
  })

  it('rejects the model trying to supply its own id or verdict', () => {
    // Extra keys are not silently accepted: the model does not get to name identities or conclusions.
    const parsed = parseVisualScanOutput(
      { candidates: [{ ...output().candidates[0], id: 'mine', verdict: 'supported' }] },
      viewport,
    )
    expect(parsed.ok).toBe(false)
  })
})

describe('bindServerCandidate', () => {
  const model = {
    perceivedRegion: region,
    targetDescription: 'wide search area',
    visualBasis: 'continuous light fill',
    excludedRegions: [],
    confidence: 'medium' as const,
  }

  it('generates the identity and observation binding on the server', () => {
    const candidate: VisualCandidate = bindServerCandidate(
      model,
      {
        runId: 'run-1',
        observationId: 'obs-1',
        screenshotRef: 'shot-1',
        algorithmVersion: 'visual-focus-1',
        now: '2026-09-28T00:00:00.000Z',
      },
      () => 'candidate-1',
    )

    expect(candidate.id).toBe('candidate-1')
    expect(candidate.runId).toBe('run-1')
    expect(candidate.kind).toBe('input-focus-region')
    expect(candidate.screenshotRef).toBe('shot-1')
    expect(candidate.algorithmVersion).toBe('visual-focus-1')
  })

  it('never lets a low-confidence candidate carry high confidence forward', () => {
    const candidate = bindServerCandidate(
      { ...model, confidence: 'low' },
      {
        runId: 'run-1',
        observationId: 'obs-1',
        screenshotRef: 'shot-1',
        algorithmVersion: 'visual-focus-1',
        now: '2026-09-28T00:00:00.000Z',
      },
      () => 'candidate-1',
    )

    expect(candidate.confidence).toBe('low')
  })
})
