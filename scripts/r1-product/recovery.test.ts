import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { CONTINUATION } from '../r1-online-pilot/continuation.ts'
import {
  createProductContinuation,
  PRODUCT_RECOVERY,
  combinedProductSpending,
  productRiskAcceptance,
} from './recovery.ts'
function fixture() {
  const files = new Map<string, Buffer<ArrayBuffer>>([['old-db', Buffer.from('frozen')]])
  const io = {
    read: (p: string) => {
      const b = files.get(p)
      if (!b) throw Error('missing')
      return b
    },
    realpath: (p: string) => p,
    exists: (p: string) => files.has(p),
    write: ((p: string, b: string) => {
      if (files.has(p)) throw Error('EEXIST')
      files.set(p, Buffer.from(b))
    }) as any,
    pins: [{ path: 'old-db', sha256: createHash('sha256').update('frozen').digest('hex') }],
  }
  return {
    files,
    make: (hash = 'new', claims = CONTINUATION.canonicalClaims) =>
      createProductContinuation(hash, claims, 'output', io),
  }
}
it('requires a new once-only claim and preserves the already-consumed original continuation', () => {
  const f = fixture(),
    a = f.make()
  expect(() => a.guard()).toThrow('not-claimed')
  a.preflight()
  a.claim()
  a.guard()
  expect(() => f.make('another-manifest').preflight()).toThrow('already-consumed')
  expect(() => f.make().claim()).toThrow('EEXIST')
  expect(() => f.make('x', '/alternate').preflight()).toThrow('canonical')
  f.files.set(a.identity.riskClaim, Buffer.from('tampered'))
  expect(() => a.guard()).toThrow('claim-changed')
})
it('refuses changed source hashes and unclosed WAL for either previous account', () => {
  const f = fixture(),
    a = f.make()
  a.preflight()
  a.claim()
  for (const p of [CONTINUATION.pins[0].path, PRODUCT_RECOVERY.pins[0].path]) {
    f.files.set(p + '-wal', Buffer.from('new'))
    expect(() => a.guard()).toThrow('source-not-closed')
    f.files.delete(p + '-wal')
  }
  f.files.set('old-db', Buffer.from('late-cost'))
  expect(() => a.guard()).toThrow('source-changed')
})
it('retains actual spent and inherited unknown in every cumulative total', () => {
  const x = combinedProductSpending({
    limitUsd: 14.112,
    knownCostUsd: 0.1,
    unknownReservedUsd: 0.063,
    heldReservedUsd: 0,
    accountedUsd: 0.163,
    unknownCount: 1,
    exceeded: false,
  })
  expect(x.combinedKnownActualUsd).toBe(0.10502455)
  expect(x.combinedUnknownReservedUsd).toBe(0.179)
  expect(x.combinedUnknownCount).toBe(3)
  expect(x.combinedAccountedUsd).toBe(0.28402455)
  expect(x.combinedLimitUsd).toBe(14.23302455)
  expect(x.actualTotalUsd).toBeNull()
  expect(productRiskAcceptance(14.112).maxCombinedAccountedUsd).toBe(x.combinedLimitUsd)
})
