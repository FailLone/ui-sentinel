import { describe, expect, it } from 'vitest'
import { resolveRunKind } from './run-kind.ts'
import { businessResultAllowed } from './run-kind.ts'
import { buildUiContractSnapshot } from './contract.ts'

/**
 * Discriminating a run's kind (plan 3.1, 11.1).
 *
 * The important property is that *absence* never becomes a new meaning. A run stored before `kind`
 * existed has no uiContract either, so it stays a business run under the old rules; it is never
 * reinterpreted as a UI scan, and a business run can never present a UI contract.
 */
const UI_CONTRACT = buildUiContractSnapshot({
  entryUrl: 'https://example.org/?a=1',
  origin: 'https://example.org',
  scope: { maxPages: 3, maxDepth: 1 },
  access: { resourceOrigins: [], dataOrigins: [] },
  budget: { totalTimeoutMs: 300_000, maxActions: 20, maxModelCalls: 30 },
})

const BUSINESS_CONTRACT = {
  schemaVersion: '1' as const,
  profileId: 'checkout' as const,
  revision: '1',
  adapter: { id: 'checkout' as const, revision: '1' },
  requirements: [],
  retryAvailabilityMs: 0,
  feedbackWarningMs: 0,
  effects: { maxCreates: 1, maxRetriesPerOperation: 1 },
  environment: {
    id: 'arena' as const,
    entryUrl: 'http://127.0.0.1:4173',
    publicOrigin: 'http://127.0.0.1:4173',
  },
  hash: 'abc',
}

const base = {
  goal: 'g',
  environmentId: 'arena',
  entryUrl: 'https://example.org/?a=1',
  budget: { totalTimeoutMs: 1, maxActions: 1, maxModelCalls: 1 },
  viewport: { width: 1280, height: 768 },
}

describe('resolveRunKind', () => {
  it('reads an explicit ui-scan spec as a UI run', () => {
    const kind = resolveRunKind({ ...base, kind: 'ui-scan', uiContract: UI_CONTRACT })
    expect(kind).toEqual({ kind: 'ui-scan', contract: UI_CONTRACT })
  })

  it('reads a business spec as a business run', () => {
    const kind = resolveRunKind({ ...base, kind: 'business', businessContract: BUSINESS_CONTRACT })
    expect(kind.kind).toBe('business')
    if (kind.kind !== 'business') return
    expect(kind.legacyUnversioned).toBe(false)
  })

  it('treats a spec with no kind and no contract as a legacy business run', () => {
    // This is the historical record shape. It must not become a UI scan, and it must not gain
    // today's business requirements either.
    const kind = resolveRunKind({ ...base })
    expect(kind.kind).toBe('business')
    if (kind.kind !== 'business') return
    expect(kind.legacyUnversioned).toBe(true)
    expect(kind.contract).toBeUndefined()
  })

  it('refuses a ui-scan spec that also carries a business contract', () => {
    expect(
      resolveRunKind({
        ...base,
        kind: 'ui-scan',
        uiContract: UI_CONTRACT,
        businessContract: BUSINESS_CONTRACT,
      }),
    ).toMatchObject({ kind: 'invalid', reasonCode: 'mixed-contract' })
  })

  it('refuses a ui-scan spec with no UI contract', () => {
    expect(resolveRunKind({ ...base, kind: 'ui-scan' })).toMatchObject({
      kind: 'invalid',
      reasonCode: 'ui-contract-missing',
    })
  })

  it('refuses a business spec that carries a UI contract', () => {
    expect(
      resolveRunKind({
        ...base,
        kind: 'business',
        businessContract: BUSINESS_CONTRACT,
        uiContract: UI_CONTRACT,
      }),
    ).toMatchObject({ kind: 'invalid', reasonCode: 'mixed-contract' })
  })

  it('refuses a tampered UI contract', () => {
    expect(
      resolveRunKind({
        ...base,
        kind: 'ui-scan',
        uiContract: { ...UI_CONTRACT, scope: { maxPages: 9, maxDepth: 9 } },
      }),
    ).toMatchObject({ kind: 'invalid', reasonCode: 'ui-contract-hash-mismatch' })
  })
})

describe('businessResultAllowed', () => {
  it('lets a UI run record not-applicable but not a business outcome', () => {
    expect(businessResultAllowed('ui-scan', 'not-applicable')).toBe(true)
    // A UI run has no business adapter, so it cannot claim a business succeeded or was rejected.
    expect(businessResultAllowed('ui-scan', 'success')).toBe(false)
    expect(businessResultAllowed('ui-scan', 'rejected')).toBe(false)
    expect(businessResultAllowed('ui-scan', 'unknown')).toBe(false)
  })

  it('never lets a business run record not-applicable', () => {
    for (const result of ['success', 'rejected', 'unknown'] as const)
      expect(businessResultAllowed('business', result)).toBe(true)
    expect(businessResultAllowed('business', 'not-applicable')).toBe(false)
  })
})
