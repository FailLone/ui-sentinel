import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'

export const limitsSchema = z
  .object({
    maxAttempts: z.number().int().positive().max(128),
    maxCostUsd: z.number().finite().positive().max(5),
    maxWallMs: z.number().int().positive().max(2400000),
  })
  .strict()
export type Limits = z.infer<typeof limitsSchema>
type Event = {
  seq: number
  previous: string
  at: number
  kind: 'open' | 'reserve' | 'settle'
  id: string
  quote: number | null
  cost: number | null
  limits?: Limits
  hash: string
}
const hashRow = (r: Omit<Event, 'hash'>) =>
  sha256(JSON.stringify([r.seq, r.previous, r.at, r.kind, r.id, r.quote, r.cost, r.limits ?? null]))
const eventSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    previous: z.string(),
    at: z.number().finite(),
    kind: z.enum(['open', 'reserve', 'settle']),
    id: z.string(),
    quote: z.number().finite().nonnegative().nullable(),
    cost: z.number().finite().nonnegative().nullable(),
    limits: limitsSchema.optional(),
    hash: z.string(),
  })
  .strict()
export function openCampaignLedger(directory: string, rawLimits: Limits, now = Date.now) {
  const limits = limitsSchema.parse(rawLimits)
  mkdirSync(directory, { recursive: true })
  const lock = join(directory, 'ledger.lock')
  const lockFd = openSync(lock, 'wx', 0o600)
  let fd: number | undefined
  let closed = false
  let broken = false
  let rows: Event[] = []
  const tickets = new Map<string, { quote: number; cost: number | null }>()
  const replay = (row: Event) => {
    if (row.kind === 'open') {
      if (rows.length || JSON.stringify(row.limits) !== JSON.stringify(limits))
        throw new Error('ledger-limits')
    } else if (row.kind === 'reserve') {
      if (tickets.has(row.id) || row.quote === null) throw new Error('ledger-ticket')
      tickets.set(row.id, { quote: row.quote, cost: null })
    } else {
      const ticket = tickets.get(row.id)
      if (!ticket || ticket.cost !== null || row.cost === null) throw new Error('ledger-settlement')
      ticket.cost = row.cost
    }
    rows.push(row)
  }
  const append = (value: Omit<Event, 'seq' | 'previous' | 'at' | 'hash'>) => {
    if (closed || broken) throw new Error('ledger-closed')
    const data = { ...value, seq: rows.length, previous: rows.at(-1)?.hash ?? '', at: now() }
    const row = { ...data, hash: hashRow(data) }
    try {
      writeFileSync(fd!, JSON.stringify(row) + '\n')
      fsyncSync(fd!)
    } catch {
      broken = true
      throw new Error('ledger-write')
    }
    replay(row)
  }
  try {
    const path = join(directory, 'ledger.jsonl')
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8')
      if (content && !content.endsWith('\n')) throw new Error('ledger-truncated')
      for (const line of content.trim().split('\n').filter(Boolean)) {
        const row = eventSchema.parse(JSON.parse(line))
        const { hash, ...data } = row
        if (
          hash !== hashRow(data) ||
          row.seq !== rows.length ||
          row.previous !== (rows.at(-1)?.hash ?? '')
        )
          throw new Error('ledger-chain')
        if (!rows.length && row.kind !== 'open') throw new Error('ledger-root')
        replay(row)
      }
    }
    fd = openSync(path, 'a', 0o600)
    if (!rows.length) append({ kind: 'open', id: 'campaign', quote: null, cost: null, limits })
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    closeSync(lockFd)
    unlinkSync(lock)
    throw error
  }
  const startedMono = performance.now()
  const initialRemaining = Math.max(0, limits.maxWallMs - (now() - rows[0].at))
  const snapshot = () => ({
    attempts: tickets.size,
    knownCostUsd: [...tickets.values()].reduce((s, t) => s + (t.cost ?? 0), 0),
    pending: [...tickets.values()].filter((t) => t.cost === null).length,
    reservedUsd: [...tickets.values()]
      .filter((t) => t.cost === null)
      .reduce((s, t) => s + t.quote, 0),
    overrun: [...tickets.values()].some((t) => t.cost !== null && t.cost > t.quote),
    remainingMs:
      now() < rows.at(-1)!.at
        ? 0
        : Math.max(
            0,
            Math.min(
              limits.maxWallMs - (now() - rows[0].at),
              initialRemaining - (performance.now() - startedMono),
            ),
          ),
  })
  return {
    snapshot,
    reserve(id: string, quote: number) {
      const s = snapshot()
      if (!id || tickets.has(id) || !Number.isFinite(quote) || quote < 0)
        throw new Error('ledger-reservation')
      if (
        s.pending ||
        s.overrun ||
        s.remainingMs <= 0 ||
        s.attempts >= limits.maxAttempts ||
        s.knownCostUsd + quote > limits.maxCostUsd
      )
        throw new Error('campaign-stopped')
      append({ kind: 'reserve', id, quote, cost: null })
    },
    settle(id: string, cost: number | null) {
      const t = tickets.get(id)
      if (!t) throw new Error('unknown-ticket')
      if (cost === null) return // Keep the fsynced pre-dispatch reservation indefinitely.
      if (!Number.isFinite(cost) || cost < 0) throw new Error('invalid-cost')
      if (t.cost !== null) {
        if (t.cost !== cost) throw new Error('conflicting-cost')
        return
      }
      append({ kind: 'settle', id, quote: null, cost })
    },
    close() {
      if (closed) return
      closed = true
      closeSync(fd!)
      closeSync(lockFd)
      unlinkSync(lock)
    },
  }
}

/** Read-only accounting audit; never acquires a writer lock or alters sealed evidence. */
export function inspectLedger(path: string, limits: Limits) {
  const body = readFileSync(path, 'utf8')
  if (!body.endsWith('\n')) throw new Error('ledger-truncated')
  const rows: Event[] = []
  const tickets = new Map<string, { quote: number; cost: number | null }>()
  for (const line of body.trim().split('\n')) {
    const row = eventSchema.parse(JSON.parse(line))
    const { hash, ...data } = row
    if (
      row.seq !== rows.length ||
      row.previous !== (rows.at(-1)?.hash ?? '') ||
      row.hash !== hashRow(data)
    )
      throw new Error('ledger-chain')
    if (!rows.length) {
      if (row.kind !== 'open' || JSON.stringify(row.limits) !== JSON.stringify(limits))
        throw new Error('ledger-root')
    } else if (row.kind === 'open') throw new Error('duplicate-ledger-root')
    else if (row.kind === 'reserve') {
      if (
        row.quote === null ||
        tickets.has(row.id) ||
        [...tickets.values()].some((t) => t.cost === null || t.cost > t.quote) ||
        tickets.size >= limits.maxAttempts ||
        [...tickets.values()].reduce((s, t) => s + (t.cost ?? t.quote), 0) + row.quote >
          limits.maxCostUsd
      )
        throw new Error('ledger-reservation')
      if (row.at < rows.at(-1)!.at || row.at - rows[0].at >= limits.maxWallMs)
        throw new Error('ledger-time')
      tickets.set(row.id, { quote: row.quote, cost: null })
    } else {
      const t = tickets.get(row.id)
      if (!t || t.cost !== null || row.cost === null) throw new Error('ledger-settlement')
      t.cost = row.cost
    }
    rows.push(row)
  }
  return {
    attempts: tickets.size,
    knownCostUsd: [...tickets.values()].reduce((s, t) => s + (t.cost ?? 0), 0),
    pending: [...tickets.values()].filter((t) => t.cost === null).length,
    overrun: [...tickets.values()].some((t) => t.cost !== null && t.cost > t.quote),
    tickets: Object.fromEntries(tickets),
  }
}
