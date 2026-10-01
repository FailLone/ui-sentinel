import { createClient, type Client } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * The shared campaign cost ledger (plan P3.3).
 *
 * One authoritative record per campaign, on the existing libSQL/SQLite footprint - no service, queue or
 * new framework. Every runner's `ledger.jsonl`/`summary.json` is an export of this, so two runners
 * cannot disagree about how much was spent.
 *
 * The rules that matter:
 *  - A request reserves against the limit *before* it is sent, inside a write transaction, so two
 *    concurrent requests cannot both spend the last of the balance.
 *  - A completed request settles at its actual cost and releases the reservation. A request whose usage
 *    is unknown keeps its conservative reservation as unknown cost - it is never settled at zero, which
 *    would silently under-count a provider call that really happened.
 *  - Reopening the campaign counts every earlier smoke, diagnostic and failure cost; re-importing or
 *    re-completing the same requestId does not charge twice.
 *  - The limit is fixed when the campaign is created and is not re-read from a later process's env.
 *  - A campaign is driven by one runner at a time; a second process is refused.
 */

export interface LedgerLimits {
  readonly limitUsd: number
}

export interface ReserveInput {
  readonly requestId: string
  readonly runId: string
  readonly phase: string
  readonly model: string
  readonly provider: string
  readonly reservedUsd: number
  readonly priceSource: string
}

export type ReserveResult =
  | { readonly ok: true; readonly requestId: string }
  | { readonly ok: false; readonly reason: 'duplicate' | 'over-budget' | 'invalid-reservation' }

export interface CampaignSpending {
  readonly limitUsd: number
  readonly knownCostUsd: number
  readonly unknownReservedUsd: number
  readonly heldReservedUsd: number
  readonly accountedUsd: number
  readonly unknownCount: number
  readonly exceeded: boolean
}

export interface LedgerEntry {
  readonly requestId: string
  readonly runId: string
  readonly phase: string
  readonly model: string
  readonly provider: string
  readonly status: 'held' | 'settled' | 'unknown' | 'released'
  readonly reservedUsd: number
  readonly actualUsd: number | null
  readonly priceSource: string
  readonly createdAt: string
}

export interface CampaignLedger {
  readonly campaignId: string
  reserve(input: ReserveInput): Promise<ReserveResult>
  settle(requestId: string, actualUsd: number): Promise<void>
  markUnknown(requestId: string, reason: string): Promise<void>
  release(requestId: string, reason: string): Promise<void>
  spending(): Promise<CampaignSpending>
  entries(): Promise<LedgerEntry[]>
  acquireLease(holder: string): Promise<{ ok: boolean; holder: string | null }>
  releaseLease(holder: string): Promise<void>
  close(): void
}

export class LedgerError extends Error {}

/** `VALIDATION_MAX_COST_USD`, default 2. Rejects NaN, negatives and zero before any spend. */
export function resolveLimit(raw: string | undefined): LedgerLimits {
  const value = raw === undefined || raw === '' ? 2 : Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new LedgerError('invalid-validation-max-cost')
  return { limitUsd: value }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id TEXT PRIMARY KEY,
  limit_usd REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_requests (
  request_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  reserved_usd REAL NOT NULL,
  actual_usd REAL,
  price_source TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT
);
CREATE TABLE IF NOT EXISTS campaign_lease (
  campaign_id TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  acquired_at TEXT NOT NULL
);
`

export async function openCampaignLedger(input: {
  campaignId: string
  directory: string
  limitUsd: number
}): Promise<CampaignLedger> {
  resolve(input.directory)
  mkdirSync(dirname(resolve(input.directory, 'campaign.db')), { recursive: true })
  const db: Client = createClient({ url: `file:${resolve(input.directory, 'campaign.db')}` })
  await db.executeMultiple(SCHEMA)
  const now = () => new Date().toISOString()
  // Captured because the `reserve` method's own parameter is also named `input`.
  const campaignId = input.campaignId

  const existing = (
    await db.execute({
      sql: 'SELECT limit_usd FROM campaigns WHERE campaign_id=?',
      args: [campaignId],
    })
  ).rows[0]
  if (existing) {
    // The campaign keeps the limit it was created with; a later process's env cannot reset it.
    const limit = Number(existing.limit_usd)
    if (Math.abs(limit - input.limitUsd) > 1e-9) throw new LedgerError('campaign-limit-immutable')
  } else {
    await db.execute({
      sql: 'INSERT INTO campaigns (campaign_id, limit_usd, created_at) VALUES (?,?,?)',
      args: [campaignId, input.limitUsd, now()],
    })
  }

  const limit = Number(
    (
      await db.execute({
        sql: 'SELECT limit_usd FROM campaigns WHERE campaign_id=?',
        args: [campaignId],
      })
    ).rows[0]!.limit_usd,
  )

  const spendingOf = async (): Promise<CampaignSpending> => {
    const rows = (
      await db.execute({
        sql: "SELECT status, reserved_usd, actual_usd FROM ledger_requests WHERE campaign_id=? AND status IN ('held','settled','unknown')",
        args: [campaignId],
      })
    ).rows
    let knownCostUsd = 0
    let unknownReservedUsd = 0
    let heldReservedUsd = 0
    let unknownCount = 0
    for (const row of rows) {
      const status = String(row.status)
      const reserved = Number(row.reserved_usd)
      if (status === 'held') heldReservedUsd += reserved
      else if (status === 'unknown') {
        unknownReservedUsd += reserved
        unknownCount++
      } else if (status === 'settled') knownCostUsd += Number(row.actual_usd ?? 0)
    }
    const accountedUsd = knownCostUsd + unknownReservedUsd + heldReservedUsd
    return {
      limitUsd: limit,
      knownCostUsd,
      unknownReservedUsd,
      heldReservedUsd,
      accountedUsd,
      unknownCount,
      exceeded: accountedUsd > limit + 1e-9,
    }
  }

  return {
    campaignId: input.campaignId,
    async reserve(input) {
      if (!Number.isFinite(input.reservedUsd) || input.reservedUsd < 0)
        return { ok: false, reason: 'invalid-reservation' }
      const tx = await db.transaction('write')
      try {
        const existing = (
          await tx.execute({
            sql: 'SELECT status FROM ledger_requests WHERE request_id=?',
            args: [input.requestId],
          })
        ).rows[0]
        if (existing) {
          await tx.rollback()
          return { ok: false, reason: 'duplicate' }
        }
        const rows = (
          await tx.execute({
            sql: "SELECT status, reserved_usd, actual_usd FROM ledger_requests WHERE campaign_id=? AND status IN ('held','settled','unknown')",
            args: [campaignId],
          })
        ).rows
        let accounted = 0
        for (const row of rows) {
          const status = String(row.status)
          if (status === 'settled') accounted += Number(row.actual_usd ?? 0)
          else accounted += Number(row.reserved_usd)
        }
        if (accounted + input.reservedUsd > limit + 1e-9) {
          await tx.rollback()
          return { ok: false, reason: 'over-budget' }
        }
        await tx.execute({
          sql: 'INSERT INTO ledger_requests (request_id, campaign_id, run_id, phase, model, provider, status, reserved_usd, price_source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          args: [
            input.requestId,
            campaignId,
            input.runId,
            input.phase,
            input.model,
            input.provider,
            'held',
            input.reservedUsd,
            input.priceSource,
            now(),
          ],
        })
        await tx.commit()
        return { ok: true, requestId: input.requestId }
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
    async settle(requestId, actualUsd) {
      // Settling an already-settled or already-unknown request is a no-op: no double charge.
      await db.execute({
        sql: "UPDATE ledger_requests SET status='settled', actual_usd=?, settled_at=? WHERE request_id=? AND status='held'",
        args: [Number.isFinite(actualUsd) && actualUsd >= 0 ? actualUsd : 0, now(), requestId],
      })
    },
    async markUnknown(requestId, reason) {
      await db.execute({
        sql: "UPDATE ledger_requests SET status='unknown', reason=?, settled_at=? WHERE request_id=? AND status='held'",
        args: [reason, now(), requestId],
      })
    },
    async release(requestId, reason) {
      await db.execute({
        sql: "UPDATE ledger_requests SET status='released', reason=?, settled_at=? WHERE request_id=? AND status='held'",
        args: [reason, now(), requestId],
      })
    },
    spending: spendingOf,
    async entries() {
      const rows = (
        await db.execute({
          sql: 'SELECT * FROM ledger_requests WHERE campaign_id=? ORDER BY created_at, request_id',
          args: [campaignId],
        })
      ).rows
      return rows.map((r) => ({
        requestId: String(r.request_id),
        runId: String(r.run_id),
        phase: String(r.phase),
        model: String(r.model),
        provider: String(r.provider),
        status: r.status as LedgerEntry['status'],
        reservedUsd: Number(r.reserved_usd),
        actualUsd: r.actual_usd === null ? null : Number(r.actual_usd),
        priceSource: String(r.price_source),
        createdAt: String(r.created_at),
      }))
    },
    async acquireLease(holder) {
      const tx = await db.transaction('write')
      try {
        const row = (
          await tx.execute({
            sql: 'SELECT holder FROM campaign_lease WHERE campaign_id=?',
            args: [campaignId],
          })
        ).rows[0]
        if (row) {
          await tx.rollback()
          return { ok: false, holder: String(row.holder) }
        }
        await tx.execute({
          sql: 'INSERT INTO campaign_lease (campaign_id, holder, acquired_at) VALUES (?,?,?)',
          args: [campaignId, holder, now()],
        })
        await tx.commit()
        return { ok: true, holder }
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
    async releaseLease(holder) {
      // Only the holder may release; a stale process cannot be displaced by a timeout.
      await db.execute({
        sql: 'DELETE FROM campaign_lease WHERE campaign_id=? AND holder=?',
        args: [campaignId, holder],
      })
    },
    close() {
      db.close()
    },
  }
}
