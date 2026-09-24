import { describe, it, expect } from 'vitest'
import {
  profileIds,
  resolveProfile,
  registeredProfiles,
  contractHash,
  buildContractSnapshot,
  listPublicProfiles,
  parseRequestedProfile,
} from './registry.ts'
import { businessConfigSchema, validateBusinessConfig } from './schema.ts'
import { resolveEnvironment } from './environments.ts'

describe('business registry', () => {
  it('registers exactly the fixed checkout and export profiles at revision 1', () => {
    expect([...profileIds]).toEqual(['checkout', 'export'])
    for (const id of profileIds) {
      const profile = resolveProfile({ id, revision: '1' })
      expect(profile).toBeDefined()
      expect(profile!.revision).toBe('1')
      expect(profile!.adapterRevision).toBe('1')
    }
  })

  it('freezes registered profiles so a later mutation cannot change a resolved contract', () => {
    const profile = resolveProfile({ id: 'checkout', revision: '1' })!
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.requirements)).toBe(true)
    expect(Object.isFrozen(profile.effects)).toBe(true)
    expect(() => {
      ;(profile as unknown as { revision: string }).revision = '2'
    }).toThrow()
  })

  it('rejects unknown ids and unknown revisions rather than falling back', () => {
    expect(resolveProfile({ id: 'checkout', revision: '2' })).toBeUndefined()
    expect(resolveProfile({ id: 'cart', revision: '1' })).toBeUndefined()
    expect(resolveProfile('checkout')).toBeUndefined()
  })

  it('uses the plan thresholds: five second retry, ten second feedback, per-profile effects', () => {
    const checkout = resolveProfile({ id: 'checkout', revision: '1' })!
    const exporting = resolveProfile({ id: 'export', revision: '1' })!
    for (const p of [checkout, exporting]) {
      expect(p.retryAvailabilityMs).toBe(5000)
      expect(p.feedbackWarningMs).toBe(10000)
      expect(p.effects.maxCreates).toBe(1)
    }
    expect(checkout.effects.maxRetriesPerOperation).toBe(0)
    expect(exporting.effects.maxRetriesPerOperation).toBe(1)
  })

  it('declares no prepare writes for export and prepare writes for checkout', () => {
    expect(resolveProfile({ id: 'export', revision: '1' })!.prepareWrites).toEqual([])
    expect(resolveProfile({ id: 'checkout', revision: '1' })!.prepareWrites.length).toBeGreaterThan(
      0,
    )
  })

  it('exposes only public profile data and never controller tokens, ports or answers', () => {
    const listed = listPublicProfiles()
    expect(listed.map((p) => p.id)).toEqual(['checkout', 'export'])
    const serialized = JSON.stringify(listed)
    // Actual leak shapes: control endpoints, token/credential fields, private ports, variant ids.
    for (const forbidden of [
      '__control',
      'controlToken',
      'token',
      'secret',
      'password',
      'authorization',
      'apiKey',
      'adapterRevision',
      'privateOrigin',
      'variant',
      'E0',
      'E1',
      'E2',
      'E3',
      'E4',
    ])
      expect(serialized).not.toContain(forbidden)
    // Environment ids are public by design (plan section 3.1), but no served port may appear.
    for (const port of [4173, 4174, 4175, 4183, 4184, 4185])
      expect(serialized).not.toContain(String(port))
    for (const profile of listed)
      for (const requirement of profile.requirements) {
        expect(Object.keys(requirement)).toEqual(['id', 'revision', 'text', 'source'])
        expect(Object.keys(requirement.source)).toEqual(['kind', 'ref'])
      }
  })

  it('keeps every registered profile resolvable and internally consistent', () => {
    for (const profile of registeredProfiles())
      expect(resolveProfile({ id: profile.id, revision: profile.revision })).toBe(profile)
  })
})

describe('business contract snapshot', () => {
  const snapshot = buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!)

  it('carries the declared shape, including adapter revision and a hash', () => {
    expect(snapshot.schemaVersion).toBe('1')
    expect(snapshot.profileId).toBe('checkout')
    expect(snapshot.revision).toBe('1')
    expect(snapshot.adapter).toEqual({ id: 'checkout', revision: '1' })
    expect(snapshot.effects).toEqual({ maxCreates: 1, maxRetriesPerOperation: 0 })
    expect(snapshot.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable: identical content produces an identical hash regardless of key order', () => {
    const reordered = {
      hash: snapshot.hash,
      effects: { maxRetriesPerOperation: 0, maxCreates: 1 },
      environment: { ...snapshot.environment },
      feedbackWarningMs: snapshot.feedbackWarningMs,
      retryAvailabilityMs: snapshot.retryAvailabilityMs,
      requirements: snapshot.requirements.map((r) => ({ ...r, source: { ...r.source } })),
      adapter: { revision: '1', id: 'checkout' as const },
      revision: snapshot.revision,
      profileId: snapshot.profileId,
      schemaVersion: snapshot.schemaVersion,
    }
    expect(contractHash(reordered)).toBe(snapshot.hash)
  })

  it('changes the hash when a requirement, policy, environment or adapter revision changes', () => {
    const base = { ...snapshot, hash: undefined as unknown as string }
    expect(contractHash({ ...base, retryAvailabilityMs: 6000 })).not.toBe(snapshot.hash)
    expect(contractHash({ ...base, feedbackWarningMs: 12000 })).not.toBe(snapshot.hash)
    expect(contractHash({ ...base, adapter: { id: 'checkout', revision: '2' } })).not.toBe(
      snapshot.hash,
    )
    expect(
      contractHash({
        ...base,
        environment: { ...snapshot.environment, entryUrl: 'http://localhost:9999' },
      }),
    ).not.toBe(snapshot.hash)
    expect(
      contractHash({
        ...base,
        requirements: [
          { ...snapshot.requirements[0]!, text: 'changed wording' },
          ...snapshot.requirements.slice(1),
        ],
      }),
    ).not.toBe(snapshot.hash)
    expect(
      contractHash({
        ...base,
        requirements: snapshot.requirements.slice(1),
      }),
    ).not.toBe(snapshot.hash)
  })

  it('never depends on the difference between an absent hash and an explicit one', () => {
    const withHash = { ...snapshot } as Record<string, unknown>
    delete withHash.hash
    expect(contractHash(withHash)).toBe(snapshot.hash)
  })
})

describe('business configuration validation', () => {
  it('accepts a well formed selection and normalizes revision to a string', () => {
    expect(validateBusinessConfig({ id: 'checkout', revision: '1' })).toEqual({
      id: 'checkout',
      revision: '1',
    })
  })

  it('rejects unknown fields, unknown ids, unknown revisions and source-bearing input', () => {
    for (const bad of [
      { id: 'checkout', revision: '1', extra: true },
      { id: 'cart', revision: '1' },
      { id: 'checkout', revision: '99' },
      { id: 'checkout' },
      { id: 'checkout', revision: '1', source: 'import x from "y"' },
      { id: 'checkout', revision: '1', adapter: { id: 'checkout', revision: '1' } },
      { id: 'checkout', revision: 1 },
      null,
      'checkout@1',
    ])
      expect(validateBusinessConfig(bad)).toBeUndefined()
  })

  it('rejects an error-shaped schema rather than coercing it', () => {
    expect(businessConfigSchema.safeParse({ id: 'checkout', revision: '1' }).success).toBe(true)
    expect(businessConfigSchema.safeParse({ id: 'export', revision: '1' }).success).toBe(true)
    expect(
      businessConfigSchema.safeParse({ id: 'checkout', revision: '1', requirements: [] }).success,
    ).toBe(false)
  })

  it('parses an optional selection and reports explicit-unknown separately', () => {
    expect(parseRequestedProfile(undefined)).toEqual({ kind: 'absent' })
    expect(parseRequestedProfile({ id: 'export', revision: '1' })).toEqual({
      kind: 'resolved',
      profile: resolveProfile({ id: 'export', revision: '1' }),
    })
    expect(parseRequestedProfile({ id: 'export', revision: '7' })).toEqual({
      kind: 'unknown',
    })
  })
})

describe('business environments', () => {
  it('resolves the three registered environments and nothing else', () => {
    // 127.0.0.1, not localhost: the arena binds the loopback address, and a browser treats the
    // two names as different origins - claiming localhost would refuse the arena's own writes.
    expect(resolveEnvironment('arena')!.publicOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(resolveEnvironment('default')!.publicOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const exporting = resolveEnvironment('export-arena')!
    expect(exporting.publicOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(exporting.entryUrl).toContain(exporting.publicOrigin)
    expect(resolveEnvironment('http://evil.example')).toBeUndefined()
    expect(resolveEnvironment('export-arena-2')).toBeUndefined()
  })

  it('does not let export run against the shopping origin or vice versa', () => {
    const checkoutEnvs = resolveProfile({ id: 'checkout', revision: '1' })!.environments
    const exportEnvs = resolveProfile({ id: 'export', revision: '1' })!.environments
    expect(exportEnvs).toEqual(['export-arena'])
    expect(checkoutEnvs).not.toContain('export-arena')
    expect(exportEnvs).not.toContain('arena')
  })
})
