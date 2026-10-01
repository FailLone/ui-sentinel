import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LedgerError, openCampaignLedger, resolveLimit } from './campaign-ledger.ts'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'campaign-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const base = (over: Partial<Parameters<typeof openCampaignLedger>[0]> = {}) => ({
  campaignId: 'campaign-1',
  directory: tempDir(),
  limitUsd: 2,
  ...over,
})
const reserve = (
  over: Partial<Parameters<Awaited<ReturnType<typeof openCampaignLedger>>['reserve']>[0]> = {},
) => ({
  requestId: 'req-1',
  runId: 'run-1',
  phase: 'diagnostic',
  model: 'm',
  provider: 'Alibaba',
  reservedUsd: 0.1,
  priceSource: 'openrouter-models',
  ...over,
})

describe('campaign limit (C05)', () => {
  it('resolves a valid limit and rejects invalid ones', () => {
    expect(resolveLimit(undefined).limitUsd).toBe(2)
    expect(resolveLimit('1.5').limitUsd).toBe(1.5)
    for (const bad of ['-1', '0', 'NaN', 'abc'])
      expect(() => resolveLimit(bad)).toThrow(LedgerError)
  })

  it('does not let a later process reset the campaign limit', async () => {
    const opts = base({ limitUsd: 2 })
    const first = await openCampaignLedger(opts)
    first.close()
    await expect(openCampaignLedger({ ...opts, limitUsd: 5 })).rejects.toThrow(
      /campaign-limit-immutable/,
    )
  })
})

describe('reservation and settlement (C01, C03, C04)', () => {
  it('refuses a reservation that would exceed the limit, so the last balance is not double-spent', async () => {
    const ledger = await openCampaignLedger(base({ limitUsd: 1 }))
    expect((await ledger.reserve(reserve({ requestId: 'a', reservedUsd: 0.6 }))).ok).toBe(true)
    const second = await ledger.reserve(reserve({ requestId: 'b', reservedUsd: 0.6 }))
    expect(second.ok).toBe(false)
    expect(second).toMatchObject({ reason: 'over-budget' })
    ledger.close()
  })

  it('keeps an unknown-usage request as its reservation, never zero', async () => {
    const ledger = await openCampaignLedger(base())
    await ledger.reserve(reserve({ requestId: 'a', reservedUsd: 0.2 }))
    await ledger.markUnknown('a', 'stream-interrupted')
    const spending = await ledger.spending()
    expect(spending.unknownReservedUsd).toBeCloseTo(0.2)
    expect(spending.knownCostUsd).toBe(0)
    expect(spending.unknownCount).toBe(1)
    ledger.close()
  })

  it('releases a request that was determined not to be sent', async () => {
    const ledger = await openCampaignLedger(base())
    await ledger.reserve(reserve({ requestId: 'a', reservedUsd: 0.2 }))
    await ledger.release('a', 'refused-before-send')
    expect((await ledger.spending()).accountedUsd).toBe(0)
    ledger.close()
  })

  it('does not double-charge on a repeated settle or duplicate reservation', async () => {
    const ledger = await openCampaignLedger(base())
    await ledger.reserve(reserve({ requestId: 'a', reservedUsd: 0.2 }))
    await ledger.settle('a', 0.15)
    await ledger.settle('a', 0.15)
    expect((await ledger.spending()).knownCostUsd).toBeCloseTo(0.15)
    expect(await ledger.reserve(reserve({ requestId: 'a' }))).toMatchObject({ reason: 'duplicate' })
    ledger.close()
  })

  it('rejects a non-finite or negative reservation', async () => {
    const ledger = await openCampaignLedger(base())
    expect(await ledger.reserve(reserve({ reservedUsd: Number.NaN }))).toMatchObject({
      reason: 'invalid-reservation',
    })
    expect(await ledger.reserve(reserve({ reservedUsd: -1 }))).toMatchObject({
      reason: 'invalid-reservation',
    })
    ledger.close()
  })
})

describe('cross-process accumulation (C02)', () => {
  it('counts earlier smoke, diagnostic and failure costs after reopening', async () => {
    const opts = base()
    const first = await openCampaignLedger(opts)
    await first.reserve(reserve({ requestId: 's', phase: 'smoke', reservedUsd: 0.1 }))
    await first.settle('s', 0.08)
    await first.reserve(reserve({ requestId: 'd', phase: 'diagnostic', reservedUsd: 0.3 }))
    await first.markUnknown('d', 'no-usage')
    first.close()

    const second = await openCampaignLedger(opts)
    const spending = await second.spending()
    expect(spending.knownCostUsd).toBeCloseTo(0.08)
    expect(spending.unknownReservedUsd).toBeCloseTo(0.3)
    // The unknown reservation is inside the cap, so a new request cannot ignore it.
    const next = await second.reserve(reserve({ requestId: 'f', reservedUsd: 1.7 }))
    expect(next.ok).toBe(false)
    second.close()
  })
})

describe('single-runner lease (C04)', () => {
  it('refuses a second runner and lets only the holder release', async () => {
    const ledger = await openCampaignLedger(base())
    expect((await ledger.acquireLease('runner-a')).ok).toBe(true)
    expect(await ledger.acquireLease('runner-b')).toEqual({ ok: false, holder: 'runner-a' })
    // A different process cannot steal a live lease.
    await ledger.releaseLease('runner-b')
    expect(await ledger.acquireLease('runner-b')).toEqual({ ok: false, holder: 'runner-a' })
    await ledger.releaseLease('runner-a')
    expect((await ledger.acquireLease('runner-b')).ok).toBe(true)
    ledger.close()
  })
})

describe('ledger export', () => {
  it('keeps a unique requestId tied to its run and phase', async () => {
    const ledger = await openCampaignLedger(base())
    await ledger.reserve(reserve({ requestId: 'a', runId: 'run-x', phase: 'formal' }))
    await ledger.settle('a', 0.05)
    const entries = await ledger.entries()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ runId: 'run-x', phase: 'formal', status: 'settled' })
    ledger.close()
  })
})
