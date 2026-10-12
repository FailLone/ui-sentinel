import { expect, it } from 'vitest'
import { authorize, policy, rows, executionFailure } from './policy.ts'
import { digest } from '../../../src/agent/exploration/integration/host.ts'
it('a D-only scope cannot consume the earlier four-run approval or changed inputs', () => {
  const frozen = { policy, rows }
  const approval = {
    approvedBy: 'fixture-not-user',
    approvalReference: 'unit-test-only',
    manifestHash: digest(frozen),
    maxRuns: 1,
    maxRequests: 12,
    maxCostUsd: 0.96,
    expiresAt: '2099-01-01T00:00:00Z',
  }
  expect(rows).toHaveLength(1)
  expect(policy.reserveUsd * policy.maxRequests).toBe(policy.maxCostUsd)
  expect(() => authorize(frozen, approval, frozen)).not.toThrow()
  for (const change of [
    { maxRuns: 4, maxRequests: 32, maxCostUsd: 2.56 },
    { expiresAt: '2000-01-01T00:00:00Z' },
    { manifestHash: 'old-claim' },
  ])
    expect(() => authorize(frozen, { ...approval, ...change }, frozen)).toThrow()
  expect(() => authorize(frozen, approval, { ...frozen, origin: 'new-origin' })).toThrow(
    'frozen-input-or-build-changed',
  )
})

it('stops on the observed D bind rejection and output-length error, including SDK refused calls', () => {
  expect(
    executionFailure([
      {
        type: 'tool:finished',
        payload: { status: 'error', error: 'product-target-not-unique-source-match' },
      },
    ]),
  ).toBe('model-or-tool-error')
  expect(
    executionFailure([
      {
        type: 'model:request-finished',
        payload: { status: 'error', error: 'model-stream-incomplete:length' },
      },
    ]),
  ).toBe('model-or-tool-error')
  expect(
    executionFailure([
      {
        type: 'agent:response',
        payload: {
          toolResults: [{ type: 'tool-error', payload: { toolName: 'product_path_bind' } }],
        },
      },
    ]),
  ).toBe('tool-call-refused')
  expect(
    executionFailure([
      { type: 'finish:rejected', payload: { error: 'product-requirements-unverified' } },
    ]),
  ).toBe('finish-rejected')
  expect(
    executionFailure([{ type: 'finish:accepted', payload: { reasonCode: 'unverified-scope' } }]),
  ).toBeUndefined()
})
