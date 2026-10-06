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

  it('includes exactly one healthy control and at least one defect pair member', () => {
    const truth = urlScanTruth('b')
    const healthy = truth.samples.filter((s) => s.variant === 'healthy')
    const defective = truth.samples.filter((s) => s.variant === 'defective')
    expect(healthy).toHaveLength(1)
    expect(defective.length).toBeGreaterThanOrEqual(1)
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

  it('keeps every sample on a distinct entry so a result cannot be attributed to the wrong one', () => {
    const entries = urlScanTruth('b').samples.map((s) => s.entryUrl)
    expect(new Set(entries).size).toBe(entries.length)
  })
})
