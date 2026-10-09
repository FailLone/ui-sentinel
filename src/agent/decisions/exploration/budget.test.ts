import { describe, expect, it } from 'vitest'
import { createBudgetLedger } from './budget.ts'

describe('budget ledger arithmetic', () => {
  it('refuses a reservation the remaining known cost cannot cover', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: 0.5,
      estimatedRequestCostUsd: 0.6,
    })
    expect(ledger.reserve(null)).toBeNull()
  })

  it('reserves against the ledger estimate when the caller supplies none', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: 1,
      estimatedRequestCostUsd: 0.4,
    })
    expect(ledger.reserve(null)).not.toBeNull()
    expect(ledger.snapshot().remainingDecisions).toBe(7)
  })

  it('does not let two outstanding reservations exceed the known budget together', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: 1,
      estimatedRequestCostUsd: 0.4,
    })
    const a = ledger.reserve(null)
    const b = ledger.reserve(null)
    const c = ledger.reserve(null)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    // 0.4 + 0.4 outstanding leaves only 0.2, which cannot cover a third 0.4 request.
    expect(c).toBeNull()
  })

  it('keeps the other in-flight reservation when one request settles', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: 1,
      estimatedRequestCostUsd: 0.4,
    })
    const a = ledger.reserve(null)!
    const b = ledger.reserve(null)!
    // A settles. B is STILL in flight, so B's reservation must remain held.
    ledger.settle(a, 0.4)
    const c = ledger.reserve(null)
    // Remaining known cost is 0.6, minus B's held 0.4 = 0.2, which cannot cover 0.4.
    expect(c).toBeNull()
    ledger.settle(b, 0.4)
  })

  it('never lets concurrent settlements debit more than the remaining known cost', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: 1,
      estimatedRequestCostUsd: 0.4,
    })
    const tickets = [ledger.reserve(null), ledger.reserve(null)].filter(Boolean)
    expect(tickets.length).toBe(2)
    // A third is refused, so the total that can ever settle is two 0.4 requests = 0.8 <= 1.
    expect(ledger.reserve(null)).toBeNull()
    for (const t of tickets) ledger.settle(t!, 0.4)
    expect(ledger.snapshot().remainingCostUsd).toBeCloseTo(0.2, 9)
  })

  it('releases only the reservation being abandoned', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: 1,
      estimatedRequestCostUsd: 0.4,
    })
    const a = ledger.reserve(null)!
    const b = ledger.reserve(null)!
    ledger.release(a)
    // A's 0.4 is freed; B's 0.4 is still held, leaving 0.6 available, so one more fits.
    expect(ledger.reserve(null)).not.toBeNull()
    ledger.release(b)
    expect(ledger.snapshot().remainingDecisions).toBe(5)
  })

  it('keeps a missing cost unknown through reservation and settlement', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: null,
    })
    const ticket = ledger.reserve(null)!
    ledger.settle(ticket, null)
    // An unknown budget stays unknown; it is never rewritten as a number.
    expect(ledger.snapshot().remainingCostUsd).toBeNull()
  })

  it('does not carry a reservation into a later, unrelated settlement', () => {
    const ledger = createBudgetLedger({
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: 1,
      estimatedRequestCostUsd: 0.3,
    })
    const a = ledger.reserve(null)!
    ledger.settle(a, 0.1)
    // 1 - 0.1 debited = 0.9 remaining, and no stale 0.3 reservation should still be held.
    const b = ledger.reserve(null)!
    const c = ledger.reserve(null)!
    const d = ledger.reserve(null)!
    expect(b).not.toBeNull()
    expect(c).not.toBeNull()
    // 0.3 + 0.3 outstanding = 0.6 <= 0.9; a third would be 0.9, still within 0.9.
    expect(d).not.toBeNull()
    expect(ledger.reserve(null)).toBeNull()
  })
})
