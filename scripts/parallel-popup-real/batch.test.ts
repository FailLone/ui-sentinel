import { it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from './batch.ts'
import { POLICY, P02_POLICY } from './policy.ts'
it('uses one authoritative fee balance for concurrent parent/children and fences unknown dispatch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'parallel-popup-batch-'))
  const session = await openCampaignSession(dir, String(POLICY.maxCostUsd))
  const batch = createBatch(
    session.ledger,
    dir,
    async (child, parent) => child.startsWith('child-') && parent === 'parent',
  )
  try {
    batch.begin('P01')
    batch.bind('parent')
    const mk = (id: string, jev: boolean) => ({
      requestId: id,
      runId: jev ? 'child-' + id : 'P01',
      phase: 'test',
      model: jev ? POLICY.jev.model : POLICY.main.model,
      provider: jev ? 'TypeSafe' : 'Wafer',
      reservedUsd: jev ? 0.003 : 0.06,
      priceSource: 'synthetic',
      stopEpoch: 0,
    })
    await session.ledger.reserve({ ...mk('held-fixture', false), reservedUsd: 1.797 })
    const results = await Promise.all([
      batch.ledger.reserve(mk('main', false)),
      batch.ledger.reserve(mk('jev-a', true)),
      batch.ledger.reserve(mk('jev-b', true)),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(2)
    expect((await session.ledger.spending()).accountedUsd).toBeLessThanOrEqual(POLICY.maxCostUsd)
    expect(batch.signal.aborted).toBe(true)
    expect(() => batch.ledger.dispatch('main', 0, () => true)).toThrow('stopped')
  } finally {
    batch.close()
    await session.close()
    await rm(dir, { recursive: true, force: true })
  }
})
it('a child unknown stops the main gateway and sibling while retaining the original reservation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'parallel-popup-unknown-'))
  const session = await openCampaignSession(dir, String(POLICY.maxCostUsd))
  const batch = createBatch(session.ledger, dir, async () => true)
  try {
    batch.begin('P01')
    batch.bind('parent')
    await batch.ledger.reserve({
      requestId: 'child',
      runId: 'child-1',
      phase: 'test',
      model: POLICY.jev.model,
      provider: 'TypeSafe',
      reservedUsd: 0.003,
      priceSource: 'test',
      stopEpoch: 0,
    })
    expect((await batch.ledger.dispatch('child', 0, () => true)).ok).toBe(true)
    let mainStopped = false,
      siblingStopped = false
    const a = batch.ledger.watchStop(0, () => {
      mainStopped = true
    })
    const b = batch.ledger.watchStop(0, () => {
      siblingStopped = true
    })
    await batch.ledger.markUnknown('child', 'synthetic-missing-usage')
    expect(mainStopped && siblingStopped).toBe(true)
    expect((await session.ledger.spending()).unknownReservedUsd).toBe(0.003)
    expect(() => batch.ledger.dispatch('child', 0, () => true)).toThrow('stopped')
    a()
    b()
  } finally {
    batch.close()
    await session.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('keeps first request identity on competing failures and propagates stop even if stop logging fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'parallel-popup-first-failure-'))
  const session = await openCampaignSession(dir, String(POLICY.maxCostUsd))
  const batch = createBatch(session.ledger, dir, async () => true)
  try {
    batch.stop('jev-http-error', { requestId: 'first', failureSequence: 7 })
    batch.stop('jev-cancelled', { requestId: 'second', failureSequence: 8 })
    const { readFile, mkdir } = await import('node:fs/promises')
    expect(JSON.parse(await readFile(join(dir, 'stop.json'), 'utf8'))).toMatchObject({
      reason: 'jev-http-error',
      evidence: { requestId: 'first', failureSequence: 7 },
    })
    const bad = join(dir, 'bad')
    await mkdir(bad)
    await mkdir(join(bad, 'stop.json'))
    const other = createBatch(session.ledger, bad, async () => true)
    try {
      expect(() => other.stop('original-http-error')).not.toThrow()
      expect(other.signal.aborted).toBe(true)
      expect(other.signal.reason.message).toBe('original-http-error')
    } finally {
      other.close()
    }
  } finally {
    batch.close()
    await session.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it.each([
  ['main', 10],
  ['jev', 6],
] as const)(
  'enforces the focused P02 %s cap in the original shared ledger',
  async (channel, cap) => {
    const dir = await mkdtemp(join(tmpdir(), 'parallel-popup-p02-cap-'))
    const session = await openCampaignSession(dir, String(P02_POLICY.maxCostUsd))
    const batch = createBatch(session.ledger, dir, async () => true, P02_POLICY)
    const config = P02_POLICY[channel]
    try {
      batch.begin('P02')
      batch.bind('parent')
      const reserve = (i: number) =>
        batch.ledger.reserve({
          requestId: channel + i,
          runId: channel === 'main' ? 'P02' : 'child',
          phase: 'synthetic-cap-test',
          model: config.model,
          provider: config.provider,
          reservedUsd: config.reserveUsd,
          priceSource: 'synthetic',
          stopEpoch: 0,
        })
      for (let i = 0; i < cap; i++) expect((await reserve(i)).ok).toBe(true)
      expect((await reserve(cap)).ok).toBe(false)
      expect(batch.status().stopped).toBe('request-cap')
      expect(batch.status().requests).toHaveLength(cap)
      expect((await session.ledger.spending()).accountedUsd).toBeLessThanOrEqual(0.62)
    } finally {
      batch.close()
      await session.close()
      await rm(dir, { recursive: true, force: true })
    }
  },
)
