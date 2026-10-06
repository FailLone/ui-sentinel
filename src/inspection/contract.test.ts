import { describe, expect, it } from 'vitest'
import {
  buildUiContractSnapshot,
  resolveUiScanContract,
  uiScanRequestSchema,
  verifyUiContractSnapshot,
  UI_CONTRACT_SCHEMA_VERSION,
} from './contract.ts'

/**
 * The `ui-scan` contract (plan 3.1, 5.1).
 *
 * A UI run is a *different kind* of run, not a business run without a profile: it carries its own
 * frozen contract, it can never also carry a business contract, and the permissions it grants are
 * narrower than a business run's. These tests pin the discrimination, the narrowing, and the
 * self-excluding hash that makes the snapshot tamper-evident.
 */
const REQUEST = {
  kind: 'ui-scan',
  entryUrl: 'https://example.org/catalog?category=books#items',
  goal: 'Check catalogue browsing and filtering',
  scope: { maxPages: 3, maxDepth: 1 },
  access: { resourceOrigins: ['https://cdn.example.org'], dataOrigins: [] },
  budget: { totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 },
} as const

describe('uiScanRequestSchema', () => {
  it('accepts a complete ui-scan request', () => {
    expect(uiScanRequestSchema.safeParse(REQUEST).success).toBe(true)
  })

  it('accepts an omitted goal', () => {
    const { goal, ...rest } = REQUEST
    expect(uiScanRequestSchema.safeParse(rest).success).toBe(true)
  })

  it('accepts only 1..3 pages and depth 0..1', () => {
    const scopeOk = (scope: object) => uiScanRequestSchema.safeParse({ ...REQUEST, scope }).success
    expect(scopeOk({ maxPages: 1, maxDepth: 0 })).toBe(true)
    expect(scopeOk({ maxPages: 3, maxDepth: 1 })).toBe(true)
    expect(scopeOk({ maxPages: 4, maxDepth: 1 })).toBe(false)
    expect(scopeOk({ maxPages: 0, maxDepth: 0 })).toBe(false)
    expect(scopeOk({ maxPages: 2, maxDepth: 2 })).toBe(false)
  })

  it('caps the UI budget below the shared API maximum', () => {
    const budgetOk = (budget: object) =>
      uiScanRequestSchema.safeParse({ ...REQUEST, budget }).success
    expect(budgetOk({ totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 })).toBe(true)
    expect(budgetOk({ totalTimeoutMs: 300001 })).toBe(false)
    expect(budgetOk({ maxActions: 41 })).toBe(false)
    expect(budgetOk({ maxModelCalls: 61 })).toBe(false)
  })

  it('refuses business fields smuggled into a ui-scan request', () => {
    // Plan 3.1: a UI spec may not also carry a business contract.
    expect(
      uiScanRequestSchema.safeParse({
        ...REQUEST,
        businessProfile: { id: 'checkout', revision: '1' },
      }).success,
    ).toBe(false)
    expect(uiScanRequestSchema.safeParse({ ...REQUEST, environmentId: 'arena' }).success).toBe(
      false,
    )
  })

  it('refuses a wildcard or suffix resource origin', () => {
    const accessOk = (access: object) =>
      uiScanRequestSchema.safeParse({ ...REQUEST, access }).success
    expect(accessOk({ resourceOrigins: ['*'] })).toBe(false)
    expect(accessOk({ resourceOrigins: ['https://*.example.org'] })).toBe(false)
    expect(accessOk({ resourceOrigins: ['example.org'] })).toBe(false)
    // An exact origin is fine.
    expect(accessOk({ resourceOrigins: ['https://cdn.example.org'] })).toBe(true)
  })

  it('caps the declared origins', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn${i}.example.org`)
    expect(
      uiScanRequestSchema.safeParse({ ...REQUEST, access: { resourceOrigins: many(8) } }).success,
    ).toBe(true)
    expect(
      uiScanRequestSchema.safeParse({ ...REQUEST, access: { resourceOrigins: many(9) } }).success,
    ).toBe(false)
  })
})

describe('resolveUiScanContract', () => {
  it('resolves a valid request into a frozen snapshot with a hash', () => {
    const resolved = resolveUiScanContract(REQUEST, { reachableOrigins: [] })
    expect(resolved.kind).toBe('resolved')
    if (resolved.kind !== 'resolved') return
    expect(resolved.contract.schemaVersion).toBe(UI_CONTRACT_SCHEMA_VERSION)
    expect(resolved.contract.entryUrl).toBe(REQUEST.entryUrl)
    expect(resolved.contract.origin).toBe('https://example.org')
    expect(resolved.contract.businessWrites).toBe('none')
    expect(resolved.contract.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never carries a business contract', () => {
    const resolved = resolveUiScanContract(REQUEST, { reachableOrigins: [] })
    if (resolved.kind !== 'resolved') throw new Error('expected resolution')
    expect(resolved.contract).not.toHaveProperty('businessContract')
    expect(resolved.contract).not.toHaveProperty('profileId')
  })

  it('applies the plan default scope and budget when omitted', () => {
    const resolved = resolveUiScanContract(
      { kind: 'ui-scan', entryUrl: 'https://example.org/' },
      { reachableOrigins: [] },
    )
    if (resolved.kind !== 'resolved') throw new Error('expected resolution')
    expect(resolved.contract.scope).toEqual({ maxPages: 3, maxDepth: 1 })
    expect(resolved.contract.budget).toMatchObject({ maxActions: 20, maxModelCalls: 30 })
  })

  it('refuses a public host that resolves to a private address', () => {
    const resolved = resolveUiScanContract(REQUEST, {
      reachableOrigins: [],
      resolveAddress: () => '127.0.0.1',
    })
    expect(resolved).toMatchObject({ kind: 'refused', reasonCode: 'private-address' })
  })

  it('refuses a private literal entry unless its exact origin is configured', () => {
    const privateRequest = { kind: 'ui-scan', entryUrl: 'http://127.0.0.1:5055/fixture' }
    expect(resolveUiScanContract(privateRequest, { reachableOrigins: [] })).toMatchObject({
      kind: 'refused',
      reasonCode: 'private-address',
    })
    expect(
      resolveUiScanContract(privateRequest, { reachableOrigins: ['http://127.0.0.1:5055'] }),
    ).toMatchObject({ kind: 'resolved' })
  })

  it('refuses an entry on the service control surface', () => {
    expect(
      resolveUiScanContract(
        { kind: 'ui-scan', entryUrl: 'https://example.org/__control' },
        { reachableOrigins: [] },
      ),
    ).toMatchObject({ kind: 'refused', reasonCode: 'control-surface' })
  })

  it('reports the offending field for a schema failure', () => {
    const resolved = resolveUiScanContract(
      { kind: 'ui-scan', entryUrl: 'ftp://example.org/' },
      {
        reachableOrigins: [],
      },
    )
    expect(resolved.kind).toBe('refused')
    if (resolved.kind !== 'refused') return
    expect(resolved.reasonCode).toBe('unsupported-scheme')
  })
})

describe('buildUiContractSnapshot', () => {
  const base = {
    entryUrl: 'https://example.org/catalog?a=1#x',
    origin: 'https://example.org',
    scope: { maxPages: 3, maxDepth: 1 },
    access: { resourceOrigins: ['https://cdn.example.org'], dataOrigins: [] },
    budget: { totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 },
  }

  it('hashes the whole contract but not the hash field itself', () => {
    const one = buildUiContractSnapshot(base)
    expect(one.hash).toMatch(/^[0-9a-f]{64}$/)
    // Same content rebuilt produces the same hash: the field is excluded from its own input.
    expect(buildUiContractSnapshot(base).hash).toBe(one.hash)
  })

  it('changes the hash when any permission-bearing field changes', () => {
    const original = buildUiContractSnapshot(base)
    const variants = [
      { ...base, entryUrl: 'https://example.org/catalog?a=2#x' },
      { ...base, entryUrl: 'https://example.org/catalog?a=1#y' },
      { ...base, scope: { maxPages: 2, maxDepth: 1 } },
      { ...base, access: { resourceOrigins: [], dataOrigins: [] } },
      { ...base, budget: { totalTimeoutMs: 300000, maxActions: 19, maxModelCalls: 30 } },
    ]
    for (const variant of variants)
      expect(buildUiContractSnapshot(variant).hash, JSON.stringify(variant)).not.toBe(original.hash)
  })

  it('stays stable across key insertion order', () => {
    const reordered = {
      budget: base.budget,
      access: base.access,
      scope: base.scope,
      origin: base.origin,
      entryUrl: base.entryUrl,
    }
    expect(buildUiContractSnapshot(reordered).hash).toBe(buildUiContractSnapshot(base).hash)
  })

  it('verifies its own snapshot and rejects a tampered one', () => {
    const snapshot = buildUiContractSnapshot(base)
    expect(verifyUiContractSnapshot(snapshot)).toBe(true)
    expect(verifyUiContractSnapshot({ ...snapshot, scope: { maxPages: 9, maxDepth: 9 } })).toBe(
      false,
    )
    expect(verifyUiContractSnapshot({ ...snapshot, hash: 'deadbeef' })).toBe(false)
  })
})
