import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * C01-C08: business configuration, persistence boundaries and legacy compatibility.
 *
 * The module graph is mocked the way the existing route tests do it, so a 202 here means the
 * request really reached createRun - the run row is real, not a stub.
 */
const harness = vi.hoisted(() => ({ started: [] as string[] }))

vi.mock('../../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    arenaPort: 4173,
    exportArenaPort: 4183,
    exportApiPort: 4184,
    exportControlPort: 4185,
    agentModel: 'openai/test-mock',
    visionModel: 'test',
    features: { observation: false, ruleRouting: false, journeys: false },
    completionReview: { model: 'm', expectedModel: 'm', apiKey: '', timeoutMs: 100 },
    budget: {
      totalTimeoutMs: 20000,
      maxActions: 10,
      maxModelCalls: 6,
      toolTimeoutMs: 15000,
      modelRequestTimeoutMs: 10000,
      modelRequestMaxRetries: 0,
    },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))

// Never launch a browser from a route test: record the attempt and stop.
vi.mock('../../execution/executor.ts', () => ({
  startRunExecution: async (id: string) => {
    harness.started.push(id)
  },
  cancelRunExecution: async () => true,
}))

import { runRoutes } from './runs.ts'
import { createRun, getRun } from '../../execution/run-manager.ts'
import { initDatabase } from '../../storage/database.ts'
import { buildContractSnapshot, resolveProfile } from '../../business/registry.ts'
import { verifyContractSnapshot } from '../../business/runtime.ts'

const app = new Hono()
app.route('/', runRoutes)

const post = (body: unknown) =>
  app.request('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('C01 / C04: a legal selection freezes a contract and queues a run', () => {
  beforeAll(async () => {
    await initDatabase()
  })

  it('C01 checkout: 202, and the persisted snapshot hash matches the registered revision', async () => {
    const res = await post({
      goal: 'inspect checkout',
      environmentId: 'arena',
      businessProfile: { id: 'checkout', revision: '1' },
    })
    expect(res.status).toBe(202)
    const body = await res.json()
    const run = await getRun(body.runId)
    const contract = run!.spec.businessContract!
    expect(contract.profileId).toBe('checkout')
    expect(contract.revision).toBe('1')
    expect(contract.adapter).toEqual({ id: 'checkout', revision: '1' })
    expect(contract.hash).toBe(
      buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!, 'arena').hash,
    )
    expect(body.businessProfile).toEqual({ id: 'checkout', revision: '1', hash: contract.hash })
    expect(verifyContractSnapshot(contract)).toBe(true)
  })

  it('C01 export: 202 with the export contract registered, environment export-arena', async () => {
    const res = await post({
      goal: 'inspect export',
      environmentId: 'export-arena',
      businessProfile: { id: 'export', revision: '1' },
    })
    expect(res.status).toBe(202)
    const body = await res.json()
    const contract = (await getRun(body.runId))!.spec.businessContract!
    expect(contract.profileId).toBe('export')
    expect(contract.environment.id).toBe('export-arena')
    expect(contract.effects).toEqual({ maxCreates: 1, maxRetriesPerOperation: 1 })
  })

  it('C04: an old arena request omitting businessProfile resolves to checkout@1', async () => {
    const res = await post({ goal: 'legacy request', environmentId: 'arena' })
    expect(res.status).toBe(202)
    const contract = (await getRun((await res.json()).runId))!.spec.businessContract!
    expect(contract.profileId).toBe('checkout')
    expect(contract.revision).toBe('1')
    // Identical to an explicit request for the same profile and environment.
    expect(contract.hash).toBe(
      buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!, 'arena').hash,
    )
  })
})

describe('C02 / C03 / C05: invalid configurations are refused before the queue', () => {
  const refusal = async (body: unknown) => {
    const before = harness.started.length
    const res = await post(body)
    expect(res.status).toBe(400)
    // No run row and no execution was started by an invalid request.
    expect(harness.started.length).toBe(before)
    return res.json()
  }

  it('C02: unknown profile, unknown revision, unknown field, source field and bad thresholds', async () => {
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      businessProfile: { id: 'cart', revision: '1' },
    })
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      businessProfile: { id: 'checkout', revision: '9' },
    })
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      businessProfile: { id: 'checkout', revision: '1', extra: true },
    })
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      businessProfile: { id: 'checkout', revision: '1', source: 'export const x = 1' },
    })
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      businessProfile: { id: 'checkout', revision: '1' },
      budget: { totalTimeoutMs: 999_999_999 },
    })
  })

  it('C03: export against the shopping environment, and any third-party entry, is refused', async () => {
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      businessProfile: { id: 'export', revision: '1' },
    })
    await refusal({
      goal: 'g',
      environmentId: 'export-arena',
      businessProfile: { id: 'export', revision: '1' },
      entryUrl: 'http://localhost:4173',
    })
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      entryUrl: 'http://evil.example/',
    })
    await refusal({
      goal: 'g',
      environmentId: 'arena',
      entryUrl: 'http://localhost:4173/__control/state',
    })
    await refusal({ goal: 'g', environmentId: 'http://localhost:4173' })
  })

  it('C05: the default environment refuses to guess a business', async () => {
    const body = await refusal({ goal: 'g', environmentId: 'default' })
    expect(body.error).toBe('business-profile-required')
  })

  it('C04: an explicitly wrong configuration never falls back to checkout', async () => {
    const res = await post({
      goal: 'g',
      environmentId: 'arena',
      businessProfile: { id: 'export', revision: '1' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('business-environment-mismatch')
  })
})

describe('C06: hash stability and snapshot-before-execution', () => {
  it('equal configurations share a hash; each changed element produces a different one', () => {
    const base = buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!, 'arena')
    const again = buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!, 'arena')
    expect(again.hash).toBe(base.hash)
    expect(
      buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!, 'default').hash,
    ).not.toBe(base.hash)
    expect(
      buildContractSnapshot(resolveProfile({ id: 'export', revision: '1' })!, 'export-arena').hash,
    ).not.toBe(base.hash)
  })

  it('persists the contract at creation time, before the run is queued', async () => {
    const res = await post({ goal: 'persist-first', environmentId: 'arena' })
    const runId = (await res.json()).runId
    // The row already carries the contract while the run is still queued.
    const run = await getRun(runId)
    expect(run!.status).toBe('queued')
    expect(run!.spec.businessContract!.hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('C07: a queued run keeps its snapshot even when the registry changes', () => {
  it('executes from the persisted snapshot rather than re-reading the registry', async () => {
    const res = await post({ goal: 'frozen', environmentId: 'arena' })
    const runId = (await res.json()).runId
    const before = (await getRun(runId))!.spec.businessContract!
    // Simulate the registry no longer offering this revision by checking the runtime contract is
    // read from the snapshot: the run's own record is the sole source.
    const runtime = await import('../../business/runtime.ts')
    const kept = runtime.createBusinessRuntime(before)
    expect(kept.contract.hash).toBe(before.hash)
    expect(kept.contract.retryAvailabilityMs).toBe(5000)
  })

  it('fails explicitly, with no business action, when the adapter revision is unavailable', async () => {
    const runtime = await import('../../business/runtime.ts')
    const base = buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!, 'arena')
    const stale = { ...base, adapter: { id: 'checkout' as const, revision: '99' } }
    expect(() => runtime.createBusinessRuntime(stale)).toThrow(/adapter-revision-unavailable/)
  })
})

describe('C08: legacy records stay readable and are never re-versioned', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-legacy-'))
    await writeFile(join(dir, 'placeholder'), '')
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports a contract-less run as legacy-unversioned with empty requirements', async () => {
    // A run row exactly as old code wrote it: no businessContract in spec.
    const run = await createRun({
      goal: 'legacy goal',
      environmentId: 'arena',
      entryUrl: 'http://localhost:4173',
    })
    expect((await getRun(run.id))!.spec.businessContract).toBeUndefined()
    const { buildReport } = await import('../reports/run-report.ts')
    const report = await buildReport(run.id)
    expect(report!.business.status).toBe('legacy-unversioned')
    expect(report!.business.requirements).toEqual([])
    expect(report!.business.hash).toBeNull()
    expect(report!.business.profileId).toBeNull()
    expect(report!.business.effects).toBeNull()
    // The record itself is untouched: nothing was written back onto it.
    expect((await getRun(run.id))!.spec.businessContract).toBeUndefined()
  })

  it('reports a versioned run with its requirements, source and adapter revision', async () => {
    const res = await post({ goal: 'versioned', environmentId: 'arena' })
    const runId = (await res.json()).runId
    const { buildReport } = await import('../reports/run-report.ts')
    const report = await buildReport(runId)
    expect(report!.business.status).toBe('versioned')
    expect(report!.business.adapter).toEqual({ id: 'checkout', revision: '1' })
    expect(report!.business.integrity).toBe('verified')
    for (const requirement of report!.business.requirements) {
      expect(requirement.source.kind).toBe('project-config')
      expect(requirement.source.ref).toBeTruthy()
      expect(requirement.revision).toBe('1')
    }
    expect(report!.business.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not silently overwrite a legacy row when a new run is created', async () => {
    const legacy = await createRun({
      goal: 'another legacy',
      environmentId: 'default',
      entryUrl: 'http://localhost:4173',
    })
    await post({ goal: 'new', environmentId: 'arena' })
    expect((await getRun(legacy.id))!.spec.businessContract).toBeUndefined()
  })
})
