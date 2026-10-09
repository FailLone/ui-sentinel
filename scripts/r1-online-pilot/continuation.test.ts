import { expect, it, vi } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONTINUATION, createContinuation, combinedSpending } from './continuation.ts'
import { makeManifest, authorize, POLICY, AGENT } from './manifest.ts'
import { digest } from '../../src/agent/exploration/integration/host.ts'
import { preparePaidAccess } from './preflight.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from './batch.ts'
import { startGateway } from '../../evaluation/support/model-gateway.ts'

function memoryIO() {
  // Existing immutable evidence bytes only; no writes to source DB or canonical claims.
  const copies = [
    'artifacts/r1-online-pilot/authorized-batch-1/account/campaign.db',
    'artifacts/r1-online-pilot/authorized-batch-1/authorization-claim.json',
    CONTINUATION.pins[2].path,
  ]
  const files = new Map(CONTINUATION.pins.map((p, i) => [p.path, readFileSync(copies[i])]))
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
  }
  return { files, io }
}
const approved = (m: ReturnType<typeof makeManifest>) => ({
  approvedBy: 'test',
  approvalReference: 'test-only',
  manifestHash: digest(m),
  maxCostUsd: POLICY.batchMaxUsd,
  maxRuns: 9,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  riskAcceptance: m.continuation.acceptance,
})

it('requires explicit bound risk acceptance before quotes, credential or claim; no legacy approval reuse', async () => {
  const m = makeManifest('test'),
    approval = approved(m)
  const read = vi.fn(),
    credential = vi.fn(),
    claim = vi.fn()
  for (const bad of [
    undefined,
    { ...approval.riskAcceptance, acceptUnsettledRiskUsd: 0 },
    { ...approval.riskAcceptance, maxCombinedAccountedUsd: 4.554 },
    { ...approval.riskAcceptance, stopOnAnyNewUnknown: false },
  ]) {
    await expect(
      preparePaidAccess(m, { ...approval, riskAcceptance: bad }, 'test', {
        read: read as any,
        credential,
        claim,
      }),
    ).rejects.toThrow('authorization')
  }
  expect(read).not.toHaveBeenCalled()
  expect(credential).not.toHaveBeenCalled()
  expect(claim).not.toHaveBeenCalled()
  expect(() => authorize(m, approval, 'test')).not.toThrow()
  expect(approval.riskAcceptance.maxCombinedAccountedUsd).toBe(4.607)
  expect(m.rows.reduce((n, r) => n + r.reserveUsd, 0)).toBeCloseTo(POLICY.batchMaxUsd)
})

it('claims the old lineage once across manifests and refuses changed sources, wrong directory or live WAL', () => {
  const { files, io } = memoryIO(),
    original = files.get(CONTINUATION.pins[0].path)!
  const c = createContinuation('new-manifest', CONTINUATION.canonicalClaims, 'output-A', io)
  expect(() => c.guard()).toThrow('not-claimed')
  c.preflight()
  c.claim()
  c.guard()
  expect(() =>
    createContinuation(
      'different-manifest',
      CONTINUATION.canonicalClaims,
      'output-B',
      io,
    ).preflight(),
  ).toThrow('already-consumed')
  expect(() => createContinuation('same', '/different', 'output-C', io).preflight()).toThrow(
    'canonical',
  )
  files.set(CONTINUATION.pins[0].path, Buffer.from('changed'))
  expect(() => c.guard()).toThrow('source-changed')
  files.set(CONTINUATION.pins[0].path, original)
  files.set(CONTINUATION.pins[0].path + '-wal', Buffer.from('pending'))
  expect(() => c.guard()).toThrow('source-not-closed')
})

it('new unknown stops continuation after one injected request while the original 0.053 stays accounted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'r1-continuation-')),
    m = makeManifest('test')
  const { io, files } = memoryIO(),
    originals = [...files.entries()].map(([p, b]) => [p, Buffer.from(b)] as const)
  const c = createContinuation(digest(m), CONTINUATION.canonicalClaims, dir, io)
  c.preflight()
  c.claim()
  const session = await openCampaignSession(join(dir, 'account'), String(POLICY.batchMaxUsd))
  const batch = createBatch(session.ledger, m, dir, undefined, c.guard)
  let calls = 0
  const gateway = await startGateway(
    'fixture-key',
    dir,
    async () => {
      calls++
      return Response.json({ error: { code: 400 } }, { status: 400 })
    },
    {
      limitUsd: POLICY.batchMaxUsd,
      estimateCost: batch.estimate,
      ledger: batch.ledger,
      providers: { agent: 'Wafer', vision: 'disabled' },
    },
  )
  try {
    batch.activate(m.rows[0], 'run-test', 'http://fixture.invalid')
    gateway.begin('run-test', 8, 5000)
    await (
      await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: AGENT,
          messages: [{ role: 'user', content: 'fixture' }],
          stream: true,
        }),
      })
    ).text()
    await gateway.end()
    const current = await session.ledger.spending(),
      combined = combinedSpending(current)
    expect(current.unknownCount).toBe(1)
    expect(combined).toMatchObject({
      combinedUnknownCount: 2,
      combinedUnknownReservedUsd: 0.116,
      combinedAccountedUsd: 0.116,
      combinedLimitUsd: 4.607,
      actualTotalUsd: null,
    })
    expect(() => batch.guard()).toThrow('batch-stopped')
    await expect(
      batch.ledger.reserve({
        requestId: 'jev-must-not-send',
        runId: 'run-test',
        phase: 'test',
        model: POLICY.jev.model,
        provider: 'TypeSafe',
        reservedUsd: 0.003,
        priceSource: 'fixture',
      }),
    ).rejects.toThrow('batch-stopped')
    expect(calls).toBe(1)
    for (const [p, b] of originals) expect(files.get(p)).toEqual(b)
  } finally {
    await gateway.close()
    batch.dispose()
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

it('a changed original ledger is refused at atomic dispatch and releases the new unsent reservation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'r1-lineage-dispatch-')),
    m = makeManifest('test'),
    { io, files } = memoryIO()
  const c = createContinuation(digest(m), CONTINUATION.canonicalClaims, dir, io)
  c.preflight()
  c.claim()
  const session = await openCampaignSession(join(dir, 'account'), String(POLICY.batchMaxUsd)),
    batch = createBatch(session.ledger, m, dir, undefined, c.guard)
  try {
    batch.activate(m.rows[0], 'run-test', 'http://fixture.invalid')
    await batch.ledger.reserve({
      requestId: 'a',
      runId: 'run-test',
      phase: 'test',
      model: AGENT,
      provider: 'Wafer',
      reservedUsd: POLICY.agent.reserveUsd,
      priceSource: 'test',
      stopEpoch: 0,
    })
    files.set(CONTINUATION.pins[0].path, Buffer.from('changed-after-reserve'))
    const begin = vi.fn(() => true)
    await expect(batch.ledger.dispatch('a', 0, begin)).rejects.toThrow('source-changed')
    expect(begin).not.toHaveBeenCalled()
    await batch.ledger.release('a', 'not-sent')
    expect((await session.ledger.spending()).accountedUsd).toBe(0)
  } finally {
    batch.dispose()
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

it('changed lineage is checked before any credential access or claim', async () => {
  const m = makeManifest('test'),
    { io, files } = memoryIO()
  files.set(CONTINUATION.pins[0].path, Buffer.from('changed'))
  const c = createContinuation(digest(m), CONTINUATION.canonicalClaims, 'unused', io)
  const quote = JSON.parse(readFileSync('plans/r1-online-pilot/price-source.json', 'utf8'))
  const credential = vi.fn(() => 'fixture'),
    claim = vi.fn()
  await expect(
    preparePaidAccess(m, approved(m), 'test', {
      read: (async (url: any) =>
        Response.json({
          data: {
            endpoints: [String(url).includes('typesafe') ? quote.jev.endpoint : quote.endpoint],
          },
        })) as typeof fetch,
      lineagePreflight: c.preflight,
      credential,
      claim,
    }),
  ).rejects.toThrow('source-changed')
  expect(credential).not.toHaveBeenCalled()
  expect(claim).not.toHaveBeenCalled()
})
