import { describe, it, expect } from 'vitest'
import { buildUrlScanManifest } from './url-scan-freeze.ts'
import { describeUrlScanPlan } from './url-scan-plan.ts'

/**
 * What a dry run must be able to say before anyone is asked to authorise spending (plan 10.3, B5).
 *
 * A dry run exists so the cost decision is made from the *planned matrix* rather than from an
 * after-the-fact total. These tests pin the two things a reviewer needs from it: the exact rows that
 * will run, and the ceiling they must fit inside - including the case where the ceiling is too small,
 * which must be visible as a refusal rather than discovered after the money is spent.
 */
const manifest = buildUrlScanManifest({
  commit: 'a'.repeat(40),
  buildHash: 'b'.repeat(64),
  configuration: { model: 'openai/gpt-x' },
  fixtureHash: 'c'.repeat(64),
  scorerHash: 'd'.repeat(64),
  policyRevision: 'url-scan-1',
  promptRevision: 'policy-7',
  samples: ['healthy-catalog', 'overlay-defect'],
  repetitions: 3,
  costCeilingUsd: 2,
})

describe('the dry run describes the batch it would run', () => {
  it('lists every planned row so a 15-run matrix cannot become 14 by accident', () => {
    const plan = describeUrlScanPlan(manifest)
    expect(plan.totalRuns).toBe(6)
    expect(plan.rows.map((r) => `${r.sampleId}#${r.repetition}`)).toEqual([
      'healthy-catalog#1',
      'healthy-catalog#2',
      'healthy-catalog#3',
      'overlay-defect#1',
      'overlay-defect#2',
      'overlay-defect#3',
    ])
  })

  it('reports the ceiling and the per-run share, because that is the number being authorised', () => {
    const plan = describeUrlScanPlan(manifest)
    expect(plan.costCeilingUsd).toBe(2)
    expect(plan.perRunCeilingUsd).toBeCloseTo(2 / 6, 10)
  })

  it('names the frozen identity, so the plan cannot be read apart from the build it belongs to', () => {
    const plan = describeUrlScanPlan(manifest)
    expect(plan.manifestHash).toBe(manifest.hash)
    expect(plan.commit).toBe('a'.repeat(40))
    expect(plan.buildHash).toBe('b'.repeat(64))
    expect(plan.scorerHash).toBe('d'.repeat(64))
  })

  it('refuses a manifest whose own hash does not verify, rather than planning from it', () => {
    expect(() =>
      describeUrlScanPlan({ ...manifest, totalRuns: undefined, commit: 'e'.repeat(40) } as never),
    ).toThrow(/does not verify/)
  })
})
