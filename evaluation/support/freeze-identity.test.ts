import { describe, expect, it } from 'vitest'
import {
  buildFreezeIdentity,
  protocolHash,
  publicTargetHash,
  validateFreeze,
  type FreezeIdentity,
  type FreezeProtocol,
} from './freeze-identity.ts'
import { formalRevisionAllowed, type FixtureRevision } from './fixture-revision.ts'

const protocol: FreezeProtocol = {
  algorithmVersion: 'visual-focus-3',
  focusWindowMs: 500,
  maxProbeClicks: 8,
  models: {
    agent: 'deepseek/deepseek-v4.1-flash',
    vision: 'qwen/qwen3.7-plus',
    review: 'typesafe/jev-1.13',
  },
  providers: { agent: 'Alibaba', vision: 'Alibaba' },
  budgets: { seconds: 300, actions: 40, modelCalls: 30 },
}

function identity(over: Partial<FreezeIdentity> = {}): FreezeIdentity {
  return {
    ...buildFreezeIdentity({
      commit: 'abc123',
      buildHash: 'b'.repeat(64),
      buildFiles: { 'dist/server/index.js': 'x' },
      protocol,
      fixtureRevision: 'visual-regression-1',
      fixtureHash: 'f'.repeat(64),
      scorerVersion: 'visual-scorer-1',
      target: { tag: 'input', type: 'search', id: 'product-search-input' },
    }),
    ...over,
  }
}

describe('freeze identity', () => {
  it('changes the protocol hash when a single knob moves', () => {
    const moved = protocolHash({ ...protocol, budgets: { ...protocol.budgets, actions: 41 } })
    expect(moved).not.toBe(protocolHash(protocol))
  })

  it('changes the protocol hash when a provider moves', () => {
    const moved = protocolHash({ ...protocol, providers: { agent: 'OpenAI', vision: 'Alibaba' } })
    expect(moved).not.toBe(protocolHash(protocol))
  })

  it('accepts an identical identity', () => {
    expect(validateFreeze(identity(), identity())).toEqual({ ok: true, mismatches: [] })
  })

  it('treats the same feature flags in a different key order as the same condition', () => {
    // A flag set is a set. Comparing it as serialized text would refuse a formal run whose manifest
    // happened to write the same flags in another order.
    const a = identity({
      featureProfile: { visualDiscovery: '1', blockerReview: '1' },
    })
    const b = identity({
      featureProfile: { blockerReview: '1', visualDiscovery: '1' },
    })
    expect(validateFreeze(a, b)).toEqual({ ok: true, mismatches: [] })
  })

  it('names each kind of drift rather than failing opaquely', () => {
    const cases: [Partial<FreezeIdentity>, string][] = [
      [{ buildHash: 'c'.repeat(64) }, 'build-hash'],
      [{ protocolHash: 'd'.repeat(64) }, 'protocol-hash'],
      [{ fixtureRevision: 'visual-holdout-2' }, 'fixture-revision'],
      [{ fixtureHash: 'e'.repeat(64) }, 'fixture-hash'],
      [{ scorerVersion: 'visual-scorer-2' }, 'scorer-version'],
      [{ publicTargetHash: 'a'.repeat(64) }, 'target-hash'],
      [{ models: { ...protocol.models, vision: 'other' } }, 'models'],
      [{ providers: { agent: 'Other', vision: 'Alibaba' } }, 'providers'],
      [{ budgets: { seconds: 301, actions: 40, modelCalls: 30 } }, 'budgets'],
      [{ featureProfile: { blockerReview: '0' } }, 'feature-profile'],
    ]
    for (const [over, expected] of cases) {
      const result = validateFreeze(identity(over), identity())
      expect(result.ok).toBe(false)
      expect(result.mismatches).toContain(expected)
    }
  })

  it('hashes the public target without ever exposing the private selector', () => {
    const hash = publicTargetHash({ tag: 'input', type: 'search', id: 'product-search-input' })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('.visual-search-region')
    // Two targets differing only by id produce different hashes - identity, not coincidence.
    expect(publicTargetHash({ tag: 'input', type: 'search', id: 'other' })).not.toBe(hash)
  })
})

describe('fixture revision review gate', () => {
  const regression: FixtureRevision = {
    revision: 'visual-regression-1',
    hash: 'f'.repeat(64),
    purpose: 'regression',
    reviewedBy: null,
    reviewedAt: null,
  }
  const unreviewedHoldout: FixtureRevision = {
    revision: 'visual-holdout-p4',
    hash: 'g'.repeat(64),
    purpose: 'holdout',
    reviewedBy: null,
    reviewedAt: null,
  }
  const reviewedHoldout: FixtureRevision = {
    ...unreviewedHoldout,
    reviewedBy: 'main-agent',
    reviewedAt: '2026-10-01T00:00:00.000Z',
  }
  const testOnly: FixtureRevision = {
    revision: 'visual-test-only',
    hash: 'h'.repeat(64),
    purpose: 'holdout',
    reviewedBy: null,
    reviewedAt: null,
    testOnly: true,
  }

  it('allows a regression revision for formal', () => {
    expect(formalRevisionAllowed(regression).ok).toBe(true)
  })

  it('refuses an unreviewed holdout for formal', () => {
    const result = formalRevisionAllowed(unreviewedHoldout)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('not-reviewed')
  })

  it('allows a reviewed holdout for formal', () => {
    expect(formalRevisionAllowed(reviewedHoldout).ok).toBe(true)
  })

  it('refuses a test-only revision for formal but not for a free test', () => {
    expect(formalRevisionAllowed(testOnly).ok).toBe(false)
    expect(formalRevisionAllowed(testOnly, { free: true }).ok).toBe(true)
  })
})
