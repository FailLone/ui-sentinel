import { describe, expect, it } from 'vitest'
import { validateFormalSource, type FormalSourceManifest } from './formal-source.ts'
import { buildFreezeIdentity } from './freeze-identity.ts'

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

describe('formal source freeze identity (P3.2, R02)', () => {
  const protocol = {
    algorithmVersion: 'visual-focus-3',
    focusWindowMs: 500,
    maxProbeClicks: 8,
    models: { agent: 'deepseek', vision: 'qwen', review: 'jev' },
    providers: { agent: 'Alibaba', vision: 'Alibaba' },
    budgets: { seconds: 300, actions: 40, modelCalls: 30 },
  }
  const freeze = (over: Partial<Parameters<typeof buildFreezeIdentity>[0]> = {}) =>
    buildFreezeIdentity({
      commit: 'abc1234',
      buildHash: 'b'.repeat(64),
      buildFiles: {},
      protocol,
      fixtureRevision: 'visual-regression-1',
      fixtureHash: 'f'.repeat(64),
      scorerVersion: 'visual-scorer-1',
      target: { tag: 'input', type: 'search', id: 'product-search-input' },
      ...over,
    })

  it('refuses a diagnostic whose frozen protocol moved, even on the same build', () => {
    // A moved window, model, provider or budget is a different experiment. The manifest's buildHash
    // cannot see it, which is why the freeze identity exists and must actually be compared.
    const result = validateFormalSource({
      manifest: { ...good, freezeIdentity: freeze() },
      expected,
      expectedFreeze: freeze({ protocol: { ...protocol, focusWindowMs: 1000 } }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('protocol-hash')
  })

  it('accepts a diagnostic whose freeze identity matches the current one', () => {
    expect(
      validateFormalSource({
        manifest: { ...good, freezeIdentity: freeze() },
        expected,
        expectedFreeze: freeze(),
      }).ok,
    ).toBe(true)
  })

  it('refuses a changed scorer version or public target', () => {
    const scorer = validateFormalSource({
      manifest: { ...good, freezeIdentity: freeze() },
      expected,
      expectedFreeze: freeze({ scorerVersion: 'visual-scorer-2' }),
    })
    expect(scorer.reason).toContain('scorer-version')
    const target = validateFormalSource({
      manifest: { ...good, freezeIdentity: freeze() },
      expected,
      expectedFreeze: freeze({ target: { tag: 'input', type: 'search', id: 'other-input' } }),
    })
    expect(target.reason).toContain('target-hash')
  })

  it('refuses a real diagnostic that carries no freeze identity at all', () => {
    // Without the freeze the gate is back to trusting a lone buildHash, so a missing identity is a
    // refusal rather than a silent downgrade.
    const result = validateFormalSource({
      manifest: { ...good },
      expected,
      expectedFreeze: freeze(),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('diagnostic-source-freeze-missing')
  })
})
