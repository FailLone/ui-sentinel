import { describe, it, expect } from 'vitest'
import { createSideEffectPolicy } from './side-effect-policy.ts'
import { buildContractSnapshot, resolveProfile } from '../business/registry.ts'
import { checkoutAdapter } from '../business/adapters/checkout.ts'
import type { BusinessFact } from '../business/adapters/types.ts'
import { exportAdapter } from '../business/adapters/export.ts'
import { resolveEnvironment } from '../business/environments.ts'

const checkout = buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!, 'arena')
const exportContract = buildContractSnapshot(
  resolveProfile({ id: 'export', revision: '1' })!,
  'export-arena',
)

/** The contract's own origin, so the default request is same-origin as the run really is. */
const ARENA = resolveEnvironment('arena')!.publicOrigin
const EXPORT_ARENA = resolveEnvironment('export-arena')!.publicOrigin

const eligible = {
  operationId: 'job-1',
  attempt: 0,
  version: 2,
  phase: 'failed',
  retryEligibility: 'allowed',
  retry: { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true },
} as BusinessFact
const knownOperation = {
  currentFact: (id: string) => (id === 'job-1' ? eligible : undefined),
  ownsOperation: (id: string) => id === 'job-1',
}

const req = (path: string, method = 'POST', origin = ARENA) => ({
  url: `${origin}${path}`,
  method,
  origin,
})

describe('side-effect policy (P01, P02, P03, P06, P10)', () => {
  it('permits reads without consuming any budget', () => {
    const policy = createSideEffectPolicy({ contract: checkout, adapter: checkoutAdapter })
    for (const path of ['/api/cart', '/api/checkout'])
      expect(policy.authorize(req(path, 'GET'))).toEqual({
        kind: 'allow',
        intent: { kind: 'read' },
      })
    expect(policy.snapshot()).toMatchObject({ createsReserved: 0, retriesReserved: 0 })
  })

  it('P05: export polling after a known 202 is a read, and is never isolated as a write', () => {
    const policy = createSideEffectPolicy({
      contract: exportContract,
      adapter: exportAdapter,
      ...knownOperation,
    })
    expect(policy.authorize(req('/api/exports', 'POST', EXPORT_ARENA))).toMatchObject({
      kind: 'allow',
      intent: { kind: 'create' },
    })
    // The asynchronous protocol is: one create, then reads until the job settles. The status and
    // eligibility reads are the business working as designed, not a boundary being probed - so
    // they must be allowed without limit and without consuming a budget.
    for (let i = 0; i < 12; i++) {
      expect(policy.authorize(req(`/api/exports/job-1`, 'GET', EXPORT_ARENA))).toEqual({
        kind: 'allow',
        intent: { kind: 'read' },
      })
      expect(policy.authorize(req(`/api/exports/job-1/eligibility`, 'GET', EXPORT_ARENA))).toEqual({
        kind: 'allow',
        intent: { kind: 'read' },
      })
    }
    expect(policy.snapshot()).toMatchObject({ createsReserved: 1, retriesReserved: 0 })
    // Reads stay free, so polling must never be what exhausts the budget and blocks a later retry.
    expect(policy.authorize(req('/api/exports/job-1/retry', 'POST', EXPORT_ARENA))).toMatchObject({
      kind: 'allow',
      intent: { kind: 'retry' },
    })
  })

  it('P10: permits cart preparation writes and spends only the action budget, then blocks them after the order', () => {
    const policy = createSideEffectPolicy({ contract: checkout, adapter: checkoutAdapter })
    expect(policy.authorize(req('/api/cart/add'))).toMatchObject({ kind: 'allow' })
    expect(policy.authorize(req('/api/cart/remove'))).toMatchObject({ kind: 'allow' })
    // Preparation is not a create.
    expect(policy.snapshot().createsReserved).toBe(0)
    expect(policy.authorize(req('/api/checkout'))).toMatchObject({ kind: 'allow' })
    expect(policy.snapshot().createsReserved).toBe(1)
    // P01: after the order, further cart writes are refused and recorded.
    expect(policy.authorize(req('/api/cart/add'))).toMatchObject({
      kind: 'deny',
      reason: 'create-budget-exhausted',
    })
    expect(policy.authorize(req('/api/checkout'))).toMatchObject({
      kind: 'deny',
      reason: 'create-budget-exhausted',
    })
  })

  it('P01: checkout permits exactly one create and refuses the second with a recorded reason', () => {
    const policy = createSideEffectPolicy({ contract: checkout, adapter: checkoutAdapter })
    expect(policy.authorize(req('/api/checkout'))).toMatchObject({ kind: 'allow' })
    const second = policy.authorize(req('/api/checkout'))
    expect(second).toMatchObject({ kind: 'deny', reason: 'create-budget-exhausted' })
    expect(policy.snapshot().createsReserved).toBe(1)
  })

  it('P03: reserves the create budget before dispatch, so two back-to-back requests cannot both pass', () => {
    const policy = createSideEffectPolicy({
      contract: exportContract,
      adapter: exportAdapter,
      ...knownOperation,
    })
    const first = policy.authorize(req('/api/exports', 'POST', EXPORT_ARENA))
    const second = policy.authorize(req('/api/exports', 'POST', EXPORT_ARENA))
    expect(first).toMatchObject({ kind: 'allow' })
    expect(second).toMatchObject({ kind: 'deny', reason: 'create-budget-exhausted' })
    // No response was involved: the second was refused purely on the reservation.
    expect(policy.snapshot().createsReserved).toBe(1)
  })

  it('P02: permits exactly one retry of the created entity, and the retry is not a create', () => {
    const policy = createSideEffectPolicy({
      contract: exportContract,
      adapter: exportAdapter,
      ...knownOperation,
    })
    policy.authorize(req('/api/exports', 'POST', EXPORT_ARENA))
    const retry = policy.authorize(req('/api/exports/job-1/retry', 'POST', EXPORT_ARENA))
    expect(retry).toMatchObject({ kind: 'allow', intent: { kind: 'retry' } })
    expect(policy.snapshot().createsReserved).toBe(1)
    expect(policy.snapshot().retriesReserved).toBe(1)
    // A second retry of the same entity exceeds the declared allowance.
    expect(policy.authorize(req('/api/exports/job-1/retry', 'POST', EXPORT_ARENA))).toMatchObject({
      kind: 'deny',
      reason: 'retry-budget-exhausted',
    })
  })

  it('P03: a retry for a different entity cannot borrow the consumed allowance', () => {
    const policy = createSideEffectPolicy({
      contract: exportContract,
      adapter: exportAdapter,
      ...knownOperation,
    })
    policy.authorize(req('/api/exports', 'POST', EXPORT_ARENA))
    policy.authorize(req('/api/exports/job-1/retry', 'POST', EXPORT_ARENA))
    // One retry per entity, one entity per run: a cross-entity retry is over the limit.
    expect(policy.authorize(req('/api/exports/job-2/retry', 'POST', EXPORT_ARENA))).toMatchObject({
      kind: 'deny',
    })
  })

  it('P06: refuses an undeclared write URL and a write under a read-only journey', () => {
    const policy = createSideEffectPolicy({
      contract: exportContract,
      adapter: exportAdapter,
      ...knownOperation,
    })
    expect(policy.authorize(req('/api/exports/telemetry', 'POST', EXPORT_ARENA))).toEqual({
      kind: 'deny',
      reason: 'undeclared-write',
      intent: { kind: 'other-write' },
    })
    const journey = createSideEffectPolicy({ contract: checkout, adapter: checkoutAdapter })
    journey.setReadOnly(true)
    expect(journey.authorize(req('/api/cart/add'))).toMatchObject({
      kind: 'deny',
      reason: 'journey-read-only-boundary',
    })
  })

  it('P06: refuses a write to another origin and never widens allowed addresses', () => {
    const policy = createSideEffectPolicy({ contract: checkout, adapter: checkoutAdapter })
    expect(policy.authorize(req('/api/checkout', 'POST', 'http://evil.example'))).toMatchObject({
      kind: 'deny',
    })
    expect(
      policy.authorize({ ...req('/api/checkout'), origin: 'http://evil.example' }),
    ).toMatchObject({ kind: 'deny', reason: 'outside-environment' })
  })

  it('does not decide write permission from button text or action intent', () => {
    const policy = createSideEffectPolicy({ contract: checkout, adapter: checkoutAdapter })
    // The same request is judged the same way regardless of the action that produced it.
    expect(policy.authorize(req('/api/checkout'))).toMatchObject({ kind: 'allow' })
    expect(policy.authorize(req('/api/checkout'))).toMatchObject({
      kind: 'deny',
      reason: 'create-budget-exhausted',
    })
  })
})

it('denies retries of unknown entities and every non-eligible current state before spending allowance', () => {
  for (const changed of [
    { phase: 'processing' },
    { phase: 'succeeded' },
    { retryEligibility: 'unknown' },
    { retry: { ...eligible.retry!, prerequisitesMet: false } },
    { retry: { ...eligible.retry!, afterMs: 100 } },
    { retry: { ...eligible.retry!, remaining: 0 } },
  ]) {
    const p = createSideEffectPolicy({
      contract: exportContract,
      adapter: exportAdapter,
      ownsOperation: (id) => id === 'job-1',
      currentFact: () => ({ ...eligible, ...changed }) as BusinessFact,
    })
    p.authorize(req('/api/exports', 'POST', EXPORT_ARENA))
    expect(p.authorize(req('/api/exports/job-1/retry', 'POST', EXPORT_ARENA)).kind).toBe('deny')
    expect(p.authorize(req('/api/exports/job-other/retry', 'POST', EXPORT_ARENA)).reason).toBe(
      'unknown-operation',
    )
    expect(p.snapshot().retriesReserved).toBe(0)
  }
})
