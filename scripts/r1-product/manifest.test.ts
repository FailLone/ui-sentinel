import { expect, it } from 'vitest'
import { makeProductManifest, authorizeProduct, LIMITS } from './manifest.ts'
import { digest } from '../../src/agent/exploration/integration/host.ts'
it('freezes 12 cases with separate return/refresh/public-view, twice, explicit program mode and zero Jev budget', () => {
  expect(LIMITS.modelMs).toBe(60000)
  expect(LIMITS.totalTimeoutMs).toBe(180000)
  expect(LIMITS.windowMs).toBe(5400000)
  const manifest = makeProductManifest('candidate')
  expect(manifest.rows).toHaveLength(28)
  expect(manifest.rows.reduce((n, r) => n + r.maxAgentRequests, 0)).toBe(224)
  expect(Number(manifest.rows.reduce((n, r) => n + r.reserveUsd, 0).toFixed(6))).toBe(
    LIMITS.maxCostUsd,
  )
  expect(manifest.rows.every((r) => r.mode === 'program' && r.maxJevRequests === 0)).toBe(true)
  expect(manifest.continuation.acceptance.maxCombinedAccountedUsd).toBe(14.23302455)
  const approval = {
    approvedBy: 'synthetic-test',
    approvalReference: 'free test only',
    manifestHash: digest(manifest),
    maxRuns: 28,
    maxCostUsd: 14.112,
    riskAcceptance: manifest.continuation.acceptance,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }
  expect(() => authorizeProduct(manifest, approval, 'candidate')).not.toThrow()
  for (const change of [
    { maxRuns: 9 },
    { maxCostUsd: 4.554 },
    { approvedBy: '' },
    { riskAcceptance: {} },
    { manifestHash: 'old' },
    { expiresAt: 'invalid' },
  ])
    expect(() => authorizeProduct(manifest, { ...approval, ...change }, 'candidate')).toThrow(
      'specific-approval',
    )
  expect(() => authorizeProduct(manifest, approval, 'different-code')).toThrow('manifest-mismatch')
})
