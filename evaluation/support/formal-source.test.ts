import { describe, expect, it } from 'vitest'
import { validateFormalSource, type FormalSourceManifest } from './formal-source.ts'

const expected = { buildHash: 'b'.repeat(64), campaignId: 'campaign-1' }
const good: FormalSourceManifest = {
  kind: 'visual-focus-diagnostic',
  mode: 'real',
  stage: 'diagnostic',
  passed: true,
  buildHash: 'b'.repeat(64),
  campaignId: 'campaign-1',
}

describe('formal source validation (R02, R08)', () => {
  it('accepts a passed real diagnostic on the same build and campaign', () => {
    expect(validateFormalSource({ manifest: good, expected })).toEqual({ ok: true, reason: null })
  })

  it('refuses a preflight, a p2-smoke and a formal manifest', () => {
    for (const kind of ['visual-focus-preflight', 'visual-focus-p2-smoke', 'visual-focus-formal'])
      expect(validateFormalSource({ manifest: { ...good, kind }, expected }).reason).toContain(
        'wrong-kind',
      )
  })

  it('refuses a fixed-mode diagnostic, so a free run cannot authorise spending', () => {
    expect(validateFormalSource({ manifest: { ...good, mode: 'fixed' }, expected }).reason).toBe(
      'diagnostic-source-not-real',
    )
  })

  it('refuses a diagnostic that did not pass', () => {
    expect(validateFormalSource({ manifest: { ...good, passed: false }, expected }).reason).toBe(
      'diagnostic-source-not-passed',
    )
  })

  it('refuses a diagnostic from another build or campaign', () => {
    expect(
      validateFormalSource({ manifest: { ...good, buildHash: 'c'.repeat(64) }, expected }).reason,
    ).toBe('diagnostic-source-build-mismatch')
    expect(
      validateFormalSource({ manifest: { ...good, campaignId: 'other' }, expected }).reason,
    ).toBe('diagnostic-source-campaign-mismatch')
  })

  it('refuses a missing manifest', () => {
    expect(validateFormalSource({ manifest: null, expected }).reason).toBe(
      'diagnostic-source-missing',
    )
  })

  it('applies the holdout review gate to the source fixture revision', () => {
    const result = validateFormalSource({
      manifest: {
        ...good,
        fixtureRevision: {
          revision: 'visual-holdout-p4',
          hash: 'f'.repeat(64),
          purpose: 'holdout',
          reviewedBy: null,
          reviewedAt: null,
        },
      },
      expected,
    })
    expect(result.reason).toBe('holdout-revision-not-reviewed')
  })
})
