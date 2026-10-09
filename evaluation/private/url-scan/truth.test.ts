import { describe, it, expect } from 'vitest'
import { urlScanTruth, controlOrigin } from './truth.ts'

/**
 * Self-tests for the private truth (plan 10.3, U18).
 *
 * The truth is only useful if it stays private and stays honest. These tests assert the properties a
 * reviewer relies on when reading a score: a public entry URL carries no variant label, the healthy
 * control has no defect to find, every defect names a reproduction a person can follow, and the
 * control origin is a different service from the fixtures the scanned page can reach.
 */
describe('the private truth is shaped so a score can be trusted', () => {
  it('carries no build identity of its own, so a score names the build it actually ran', () => {
    expect(urlScanTruth().buildIdentity).toBe('')
    expect(urlScanTruth('frozen-build-abc').buildIdentity).toBe('frozen-build-abc')
  })

  it('is the 5-sample matrix of plan 10.2: three healthy controls and two defect pairs', () => {
    const truth = urlScanTruth('b')
    const healthy = truth.samples.filter((s) => s.variant === 'healthy')
    const defective = truth.samples.filter((s) => s.variant === 'defective')
    // Plan 10.2: one standalone healthy catalogue site, then two normal/abnormal pairs (one the
    // generic hit-testing rule can exercise, one needing the DOM investigation primitives). Every
    // defective sample needs a healthy control judged on the *same* public surface, because a defect
    // claim with no healthy counterpart cannot show the difference is the defect rather than the page.
    expect(truth.samples).toHaveLength(5)
    expect(healthy).toHaveLength(3)
    expect(defective).toHaveLength(2)
  })

  it('pairs every defect with a healthy control on the same public entry path', () => {
    const truth = urlScanTruth('b')
    const pathOf = (url: string) => new URL(url).pathname
    for (const defect of truth.samples.filter((s) => s.variant === 'defective')) {
      const control = truth.samples.find(
        (s) => s.variant === 'healthy' && pathOf(s.entryUrl) === pathOf(defect.entryUrl),
      )
      expect(
        control,
        `no healthy control shares ${pathOf(defect.entryUrl)} with ${defect.sampleId}`,
      ).toBeDefined()
    }
  })

  it('gives the healthy control no defect to find', () => {
    const healthy = urlScanTruth('b').samples.find((s) => s.variant === 'healthy')!
    expect(healthy.expectedFindingKey).toBeUndefined()
    expect(healthy.reproduction).toBeUndefined()
  })

  it('gives every defect a stable key and a reproduction a person can follow', () => {
    for (const sample of urlScanTruth('b').samples.filter((s) => s.variant === 'defective')) {
      expect(sample.expectedFindingKey).toBeTruthy()
      expect(sample.reproduction?.length ?? 0).toBeGreaterThan(40)
      // The reproduction must be about the *public* origin, not something only the control exposes.
      expect(sample.reproduction).toContain(sample.entryUrl.split('?')[0]!)
    }
  })

  it('never puts a variant label in a public entry URL', () => {
    for (const sample of urlScanTruth('b').samples)
      expect(sample.entryUrl).not.toMatch(/variant|defect|healthy|abnormal|control/i)
  })

  it('names the control origin as a separate service from the fixtures', () => {
    const truth = urlScanTruth('b')
    for (const sample of truth.samples) {
      const origin = new URL(sample.entryUrl).origin
      expect(origin).not.toBe(new URL(controlOrigin).origin)
    }
  })

  it('keeps each pair on one shared entry and different pairs apart', () => {
    const samples = urlScanTruth('b').samples
    // A pair *must* share its public entry: that is what makes the pair a controlled contrast, the
    // same page with only a private switch changed. Two different pairs must not collide, or a result
    // could be attributed to the wrong one.
    const pairs = new Map<string, string[]>()
    for (const sample of samples) {
      const url = new URL(sample.entryUrl)
      const key = url.pathname
      pairs.set(key, [...(pairs.get(key) ?? []), sample.variant])
    }
    for (const [path, variants] of pairs) {
      expect(variants.length, `${path} carries ${variants.length} samples`).toBeLessThanOrEqual(2)
      if (variants.length === 2)
        expect(new Set(variants)).toEqual(new Set(['healthy', 'defective']))
    }
    // Five samples across three distinct public entries: one standalone healthy site, two pairs.
    expect(pairs.size).toBe(3)
  })
})
