import { it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from './batch.ts'
import { POLICY } from './policy.ts'
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
