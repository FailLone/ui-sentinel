import { describe, it, expect } from 'vitest'
import {
  buildUrlScanManifest,
  verifyUrlScanManifest,
  dirtyPathsAffectingRuns,
} from './url-scan-freeze.ts'

/**
 * The frozen identity a paid URL batch is tied to (plan 10.3, B5).
 *
 * A paid batch that is not tied to a recorded identity is the "dirty tree acceptance" the plan
 * forbids: results that cannot be attributed to the build, samples and scorer that produced them. Two
 * disciplines are tested here, and both are about refusing rather than about passing:
 *
 * - The manifest carries its own hash so a result can never be attributed to a build it did not come
 *   from, and a mismatch is detected rather than tolerated.
 * - The plan is *derived*, not asserted: the number of runs in the matrix comes from the sample list
 *   and the repetition count, so a "dry run" cannot claim a matrix its samples do not add up to.
 */
const inputs = {
  commit: 'a'.repeat(40),
  buildHash: 'b'.repeat(64),
  configuration: { model: 'openai/gpt-x', provider: 'openrouter', maxActions: 20 },
  fixtureHash: 'c'.repeat(64),
  scorerHash: 'd'.repeat(64),
  policyRevision: 'url-scan-1',
  promptRevision: 'policy-7',
  samples: ['healthy-catalog', 'overlay-defect'],
  repetitions: 3,
  costCeilingUsd: 2,
}

describe('the batch manifest is a self-describing frozen identity', () => {
  it('hashes its own body so a result cannot be attributed to another build', () => {
    const manifest = buildUrlScanManifest(inputs)
    expect(manifest.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyUrlScanManifest(manifest)).toBe(true)
  })

  it('detects a tampered body rather than reporting it as the frozen identity', () => {
    const manifest = buildUrlScanManifest(inputs)
    expect(verifyUrlScanManifest({ ...manifest, commit: 'e'.repeat(40) })).toBe(false)
    expect(verifyUrlScanManifest({ ...manifest, samples: ['healthy-catalog'] })).toBe(false)
    expect(verifyUrlScanManifest(null)).toBe(false)
  })

  it('derives the planned matrix from the samples and the repetitions', () => {
    const manifest = buildUrlScanManifest(inputs)
    expect(manifest.plan.runsPerSample).toBe(3)
    expect(manifest.plan.totalRuns).toBe(6)
    expect(manifest.plan.rows).toHaveLength(6)
    // Every row names its sample and its repetition, so a batch cannot quietly drop or duplicate one.
    expect(new Set(manifest.plan.rows.map((r) => `${r.sampleId}#${r.repetition}`)).size).toBe(6)
  })

  it('carries the cost ceiling rather than leaving it to the runner to remember', () => {
    expect(buildUrlScanManifest(inputs).costCeilingUsd).toBe(2)
  })

  it('refuses a manifest with nothing to run or a nonsensical repetition count', () => {
    expect(() => buildUrlScanManifest({ ...inputs, samples: [] })).toThrow(/at least one sample/)
    expect(() => buildUrlScanManifest({ ...inputs, repetitions: 0 })).toThrow(/repetitions/)
    expect(() => buildUrlScanManifest({ ...inputs, costCeilingUsd: 0 })).toThrow(/ceiling/)
  })

  it('refuses a commit that is not a full SHA, so a moving reference cannot be frozen', () => {
    expect(() => buildUrlScanManifest({ ...inputs, commit: 'HEAD' })).toThrow(/full commit SHA/)
  })
})

describe('deciding whether a tree is clean enough to freeze', () => {
  it('treats a change to code, config, fixtures or the lockfile as dirtying the build', () => {
    // Everything that can move a result. A batch cut from a tree where any of these is
    // uncommitted is exactly the "dirty tree acceptance" the plan forbids.
    for (const line of [
      ' M src/execution/executor.ts',
      '?? scripts/validation/url-scan.ts',
      ' M package.json',
      ' M pnpm-lock.yaml',
      ' M evaluation/private/url-scan/scorer.ts',
      ' M arena/checkout/src/App.tsx',
      ' M .env',
    ])
      expect(dirtyPathsAffectingRuns(line)).toEqual([line.trim().replace(/^\S+\s+/, '')])
  })

  it('ignores changes that cannot affect a run', () => {
    // A plan document, a README or another agent's note is not part of the identity a paid batch
    // rests on, and letting it block the freeze would make the gate about the working tree rather
    // than about the build.
    for (const line of [
      ' M plans/r0-url-scan-plan.md',
      ' M README.md',
      ' M docs/architecture.md',
      '?? data/r0-url-scan/x/y.json',
      ' M .superpowers/sdd/x/progress.md',
      ' M docs/product-roadmap.md',
    ])
      expect(dirtyPathsAffectingRuns(line)).toEqual([])
  })
})
