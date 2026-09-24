import { describe, it, expect } from 'vitest'
import { selectBusinessContract } from './selection.ts'
import { buildContractSnapshot, resolveProfile } from './registry.ts'

const checkout = resolveProfile({ id: 'checkout', revision: '1' })!
const exporting = resolveProfile({ id: 'export', revision: '1' })!

describe('business selection (C01, C02, C03, C04, C05)', () => {
  it('resolves an explicit checkout selection in its declared environment', () => {
    const result = selectBusinessContract({
      requested: { id: 'checkout', revision: '1' },
      environmentId: 'arena',
    })
    expect(result.kind).toBe('resolved')
    if (result.kind !== 'resolved') return
    expect(result.contract.profileId).toBe('checkout')
    expect(result.contract.revision).toBe('1')
    expect(result.contract.adapter).toEqual({ id: 'checkout', revision: '1' })
    expect(result.contract.environment.id).toBe('arena')
    expect(result.contract.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('resolves an explicit export selection only in the export environment', () => {
    const ok = selectBusinessContract({
      requested: { id: 'export', revision: '1' },
      environmentId: 'export-arena',
    })
    expect(ok.kind).toBe('resolved')
    if (ok.kind === 'resolved') expect(ok.contract.environment.id).toBe('export-arena')
  })

  it('rejects an unknown profile, an unknown revision and a non-string revision', () => {
    for (const requested of [
      { id: 'cart', revision: '1' },
      { id: 'checkout', revision: '2' },
      { id: 'export', revision: '0' },
      { id: 'checkout', revision: 1 },
      { id: 'checkout', revision: '1', source: 'x' },
      { id: 'checkout', revision: '1', adapter: { revision: '1' } },
    ])
      expect(selectBusinessContract({ requested, environmentId: 'arena' }).kind).toBe(
        'unknown-profile',
      )
  })

  it('rejects a profile paired with an environment it is not registered for', () => {
    expect(
      selectBusinessContract({
        requested: { id: 'export', revision: '1' },
        environmentId: 'arena',
      }),
    ).toEqual({ kind: 'environment-mismatch', profileId: 'export', environmentId: 'arena' })
    expect(
      selectBusinessContract({
        requested: { id: 'checkout', revision: '1' },
        environmentId: 'export-arena',
      }),
    ).toEqual({
      kind: 'environment-mismatch',
      profileId: 'checkout',
      environmentId: 'export-arena',
    })
  })

  it('rejects an unregistered environment rather than accepting an arbitrary origin', () => {
    for (const environmentId of ['http://evil.example', 'export-arena-2', 'production', ''])
      expect(
        selectBusinessContract({ requested: { id: 'checkout', revision: '1' }, environmentId })
          .kind,
      ).toBe('unknown-environment')
  })

  it('requires an explicit configuration for the default environment instead of guessing', () => {
    expect(selectBusinessContract({ environmentId: 'default' })).toEqual({
      kind: 'configuration-required',
      environmentId: 'default',
    })
    // An explicit checkout selection on the default environment is legitimate.
    expect(
      selectBusinessContract({
        requested: { id: 'checkout', revision: '1' },
        environmentId: 'default',
      }).kind,
    ).toBe('resolved')
  })

  it('resolves an omitted profile on the legacy arena entry to checkout@1', () => {
    const legacy = selectBusinessContract({ environmentId: 'arena' })
    expect(legacy.kind).toBe('resolved')
    if (legacy.kind !== 'resolved') return
    expect(legacy.contract.profileId).toBe('checkout')
    expect(legacy.contract.revision).toBe('1')
    expect(legacy.legacyDefault).toBe(true)

    const explicit = selectBusinessContract({
      requested: { id: 'checkout', revision: '1' },
      environmentId: 'arena',
    })
    expect(explicit.kind).toBe('resolved')
    if (explicit.kind === 'resolved') {
      // The compatibility path must produce the same contract as an explicit request.
      expect(explicit.contract.hash).toBe(legacy.contract.hash)
      expect(explicit.legacyDefault).toBe(false)
    }
  })

  it('never falls back to a default when an explicit configuration is wrong', () => {
    for (const requested of [
      { id: 'checkout', revision: '9' },
      { id: 'nope', revision: '1' },
      { id: 'export', revision: '1' },
    ]) {
      const result = selectBusinessContract({ requested, environmentId: 'arena' })
      expect(result.kind === 'resolved').toBe(false)
    }
  })

  it('produces an identical hash for equivalent selections and a different one per environment', () => {
    const a = selectBusinessContract({ environmentId: 'arena' })
    const b = selectBusinessContract({ environmentId: 'arena' })
    expect(
      a.kind === 'resolved' && b.kind === 'resolved' && a.contract.hash === b.contract.hash,
    ).toBe(true)
    const def = selectBusinessContract({
      requested: { id: 'checkout', revision: '1' },
      environmentId: 'default',
    })
    expect(
      def.kind === 'resolved' && a.kind === 'resolved' && def.contract.hash !== a.contract.hash,
    ).toBe(true)
  })

  it('exposes the contract for both profiles through the same selection path', () => {
    // No profile-specific branching: the same function resolves both.
    const results = [
      selectBusinessContract({ environmentId: 'arena' }),
      selectBusinessContract({
        requested: { id: 'export', revision: '1' },
        environmentId: 'export-arena',
      }),
    ]
    expect(results.every((r) => r.kind === 'resolved')).toBe(true)
    expect(new Set(results.map((r) => (r.kind === 'resolved' ? r.contract.hash : ''))).size).toBe(2)
  })
})

describe('snapshot construction from a profile', () => {
  it('snapshots each profile without crossing environment or adapter identity', () => {
    const c = buildContractSnapshot(checkout, 'arena')
    const e = buildContractSnapshot(exporting, 'export-arena')
    expect(c.adapter).toEqual({ id: 'checkout', revision: '1' })
    expect(e.adapter).toEqual({ id: 'export', revision: '1' })
    expect(c.environment.publicOrigin).not.toBe(e.environment.publicOrigin)
  })

  it('refuses to snapshot a profile into an environment it does not declare', () => {
    expect(() => buildContractSnapshot(exporting, 'arena')).toThrow(
      /profile-not-registered-for-environment/,
    )
    expect(() => buildContractSnapshot(checkout, 'export-arena')).toThrow()
  })
})
