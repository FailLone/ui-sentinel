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
  /** Gateway batch fence; reconciliation cannot reactivate an older epoch. */
  readonly stopEpoch?: number
}

export type ReserveResult =
  | { readonly ok: true; readonly requestId: string }
  | {
      readonly ok: false
      readonly reason:
        | 'duplicate'
        | 'over-budget'
        | 'invalid-reservation'
        | 'cost-unknown'
        | 'campaign-stopped'
    }

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
  stopState(): Promise<{ epoch: number; unknownCount: number }>
  watchStop(expectedEpoch: number, listener: (reason: string) => void): () => void
  dispatch(
    requestId: string,
    expectedEpoch: number,
    begin: () => boolean,
  ): Promise<{ ok: boolean; reason?: string }>
  settle(requestId: string, actualUsd: number): Promise<void>
  markUnknown(requestId: string, reason: string): Promise<void>
  release(requestId: string, reason: string): Promise<void>
  reconcile(input: {
    requestId: string
    generationId: string
    model: string
    provider: string
    actualUsd: number
    evidence: unknown
  }): Promise<void>
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

const stopListeners = new Map<string, Set<() => void>>()
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
CREATE TABLE IF NOT EXISTS ledger_reconciliations (
  request_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, generation_id TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL, provider TEXT NOT NULL, actual_usd REAL NOT NULL,
  evidence TEXT NOT NULL, reconciled_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_stop_events (
  request_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_admissions (
  request_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, stop_epoch INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_dispatches (
  request_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, dispatched_at TEXT NOT NULL
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
  resolveLimit(String(input.limitUsd))
  resolve(input.directory)
  mkdirSync(dirname(resolve(input.directory, 'campaign.db')), { recursive: true })
  const db: Client = createClient({ url: `file:${resolve(input.directory, 'campaign.db')}` })
  await db.executeMultiple(SCHEMA)
  const beginWrite = async () => {
    const deadline = Date.now() + 5000
    for (;;) {
      try {
        return await db.transaction('write')
      } catch (error) {
        if ((error as any).code !== 'SQLITE_BUSY' || Date.now() >= deadline) throw error
        await new Promise((r) => setTimeout(r, 10))
      }
    }
  }
  const busKey = resolve(input.directory, 'campaign.db') + ':' + input.campaignId
  const watches = new Set<() => void>()
  const readStop = async (client: { execute: Client['execute'] }) => {
    const row = (
      await client.execute({
        sql: "SELECT (SELECT COUNT(*) FROM ledger_stop_events WHERE campaign_id=?) AS epoch, (SELECT COUNT(*) FROM ledger_requests r LEFT JOIN ledger_reconciliations c ON c.request_id=r.request_id AND c.campaign_id=r.campaign_id WHERE r.campaign_id=? AND r.status='unknown' AND c.request_id IS NULL) AS unknown_count",
        args: [input.campaignId, input.campaignId],
      })
    ).rows[0]!
    return { epoch: Number(row.epoch), unknownCount: Number(row.unknown_count) }
  }
  const notifyStop = () => {
    for (const fn of stopListeners.get(busKey) ?? []) fn()
  }
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
    if (Math.abs(limit - input.limitUsd) > 1e-9) {
      db.close()
      throw new LedgerError('campaign-limit-immutable')
    }
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
        sql: "SELECT CASE WHEN c.request_id IS NOT NULL THEN 'settled' ELSE r.status END AS status, r.reserved_usd, COALESCE(c.actual_usd,r.actual_usd) AS actual_usd FROM ledger_requests r LEFT JOIN ledger_reconciliations c ON c.request_id=r.request_id AND c.campaign_id=r.campaign_id WHERE r.campaign_id=? AND r.status IN ('held','settled','unknown')",
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
    stopState: () => readStop(db),
    watchStop(expectedEpoch, listener) {
      // Independent read-only observation connection observes committed cross-process state. Same-process
      // notification is synchronous AFTER commit; the poll is cancellation, never dispatch authority.
      const observer = createClient({ url: `file:${resolve(input.directory, 'campaign.db')}` })
      let ended = false,
        busy = false
      const signal = () => {
        if (!ended) listener('campaign-stopped')
      }
      const check = async () => {
        if (ended || busy) return
        busy = true
        try {
          const state = await readStop(observer)
          if (state.unknownCount || state.epoch !== expectedEpoch) signal()
        } catch (error) {
          // A concurrent writer may briefly hold the read lock. Dispatch still checks under its
          // own write transaction; retry observation instead of treating contention as unknown cost.
          if (!ended && (error as { code?: string }).code !== 'SQLITE_BUSY')
            listener('ledger-unavailable')
        } finally {
          busy = false
        }
      }
      const set = stopListeners.get(busKey) ?? new Set<() => void>()
      set.add(signal)
      stopListeners.set(busKey, set)
      const timer = setInterval(() => void check(), 25)
      timer.unref()
      void check()
      const unsubscribe = () => {
        if (ended) return
        ended = true
        clearInterval(timer)
        set.delete(signal)
        if (!set.size) stopListeners.delete(busKey)
        observer.close()
        watches.delete(unsubscribe)
      }
      watches.add(unsubscribe)
      return unsubscribe
    },
    async dispatch(requestId, expectedEpoch, begin) {
      const tx = await beginWrite()
      try {
        const state = await readStop(tx)
        const row = (
          await tx.execute({
            sql: 'SELECT r.status,a.stop_epoch FROM ledger_requests r JOIN ledger_admissions a ON a.request_id=r.request_id AND a.campaign_id=r.campaign_id WHERE r.request_id=? AND r.campaign_id=?',
            args: [requestId, campaignId],
          })
        ).rows[0]
        if (
          state.unknownCount ||
          state.epoch !== expectedEpoch ||
          !row ||
          row.status !== 'held' ||
          Number(row.stop_epoch) !== expectedEpoch
        ) {
          await tx.rollback()
          return { ok: false, reason: state.unknownCount ? 'cost-unknown' : 'campaign-stopped' }
        }
        const duplicate = (
          await tx.execute({
            sql: 'SELECT request_id FROM ledger_dispatches WHERE request_id=?',
            args: [requestId],
          })
        ).rows.length
        if (duplicate) {
          await tx.rollback()
          return { ok: false, reason: 'already-dispatched' }
        }
        await tx.execute({
          sql: 'INSERT INTO ledger_dispatches (request_id,campaign_id,dispatched_at) VALUES (?,?,?)',
          args: [requestId, campaignId, now()],
        })
        // No await between the last cancellation check in begin() and transport initiation.
        // Unknown writes use this same SQLite write lock: exactly one ordering can win.
        if (!begin()) {
          await tx.rollback()
          return { ok: false, reason: 'not-sent-window-closed' }
        }
        await tx.commit()
        return { ok: true }
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
    async reserve(input) {
      if (!Number.isFinite(input.reservedUsd) || input.reservedUsd < 0)
        return { ok: false, reason: 'invalid-reservation' }
      const tx = await beginWrite()
      try {
        const stop = await readStop(tx)
        if (
          stop.unknownCount ||
          (input.stopEpoch !== undefined && input.stopEpoch !== stop.epoch)
        ) {
          await tx.rollback()
          return { ok: false, reason: stop.unknownCount ? 'cost-unknown' : 'campaign-stopped' }
        }
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
            sql: "SELECT CASE WHEN c.request_id IS NOT NULL THEN 'settled' ELSE r.status END AS status, r.reserved_usd, COALESCE(c.actual_usd,r.actual_usd) AS actual_usd FROM ledger_requests r LEFT JOIN ledger_reconciliations c ON c.request_id=r.request_id AND c.campaign_id=r.campaign_id WHERE r.campaign_id=? AND r.status IN ('held','settled','unknown')",
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
        await tx.execute({
          sql: 'INSERT INTO ledger_admissions (request_id,campaign_id,stop_epoch) VALUES (?,?,?)',
          args: [input.requestId, campaignId, stop.epoch],
        })
        await tx.commit()
        return { ok: true, requestId: input.requestId }
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
    async settle(requestId, actualUsd) {
      // A cost that cannot be believed is refused, never rounded to zero: the caller's recovery is
      // `markUnknown`, which keeps the reservation standing. Booking it at 0 would under-count the
      // campaign by the request's whole cost, which is the failure C05 names.
      if (!Number.isFinite(actualUsd) || actualUsd < 0)
        throw new LedgerError(`invalid-actual-cost: ${requestId}`)
      // Settling an already-settled or already-unknown request is a no-op: no double charge.
      await db.execute({
        sql: "UPDATE ledger_requests SET status='settled', actual_usd=?, settled_at=? WHERE request_id=? AND status='held'",
        args: [actualUsd, now(), requestId],
      })
    },
    async markUnknown(requestId, reason) {
      const tx = await beginWrite()
      let changed = false
      try {
        const row = (
          await tx.execute({
            sql: 'SELECT status FROM ledger_requests WHERE request_id=? AND campaign_id=?',
            args: [requestId, campaignId],
          })
        ).rows[0]
        if (row?.status === 'held') {
          await tx.execute({
            sql: "UPDATE ledger_requests SET status='unknown',reason=?,settled_at=? WHERE request_id=? AND campaign_id=? AND status='held'",
            args: [reason, now(), requestId, campaignId],
          })
          await tx.execute({
            sql: 'INSERT OR IGNORE INTO ledger_stop_events (request_id,campaign_id,reason,created_at) VALUES (?,?,?,?)',
            args: [requestId, campaignId, reason, now()],
          })
          changed = true
        }
        await tx.commit()
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
      if (changed) notifyStop()
    },
    async release(requestId, reason) {
      await db.execute({
        sql: "UPDATE ledger_requests SET status='released', reason=?, settled_at=? WHERE request_id=? AND status='held' AND NOT EXISTS (SELECT 1 FROM ledger_dispatches d WHERE d.request_id=ledger_requests.request_id)",
        args: [reason, now(), requestId],
      })
    },
    async reconcile(input) {
      if (
        !Number.isFinite(input.actualUsd) ||
        input.actualUsd < 0 ||
        !input.generationId ||
        !input.evidence
      )
        throw new LedgerError('invalid-reconciliation')
      const tx = await beginWrite()
      try {
        const row = (
          await tx.execute({
            sql: 'SELECT * FROM ledger_requests WHERE request_id=? AND campaign_id=?',
            args: [input.requestId, campaignId],
          })
        ).rows[0]
        if (
          !row ||
          row.status !== 'unknown' ||
          row.model !== input.model ||
          row.provider !== input.provider
        )
          throw new LedgerError('reconciliation-request-mismatch')
        const old = (
          await tx.execute({
            sql: 'SELECT * FROM ledger_reconciliations WHERE request_id=? OR generation_id=?',
            args: [input.requestId, input.generationId],
          })
        ).rows[0]
        const evidence = JSON.stringify(input.evidence)
        if (old) {
          if (
            old.request_id !== input.requestId ||
            old.campaign_id !== campaignId ||
            old.generation_id !== input.generationId ||
            Number(old.actual_usd) !== input.actualUsd ||
            old.model !== input.model ||
            old.provider !== input.provider ||
            old.evidence !== evidence
          )
            throw new LedgerError('reconciliation-conflict')
        } else
          await tx.execute({
            sql: 'INSERT INTO ledger_reconciliations (request_id,campaign_id,generation_id,model,provider,actual_usd,evidence,reconciled_at) VALUES (?,?,?,?,?,?,?,?)',
            args: [
              input.requestId,
              campaignId,
              input.generationId,
              input.model,
              input.provider,
              input.actualUsd,
              evidence,
              now(),
            ],
          })
        await tx.commit()
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
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
      const tx = await beginWrite()
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
      for (const unsubscribe of [...watches]) unsubscribe()
      db.close()
    },
  }
}
