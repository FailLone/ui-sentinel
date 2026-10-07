/** Session-local reservations. Unknown dispatched cost holds the budget until reconciled. */
export type BudgetLedgerInput = {
  readonly remainingDecisions: number
  readonly remainingActions: number
  readonly remainingMs: number
  readonly maxRequestMs: number
  readonly remainingCostUsd: number | null
  readonly estimatedRequestCostUsd?: number | null
  readonly now?: () => number
}
export type BudgetSnapshot = {
  readonly maxRequestMs: number
  readonly remainingDecisions: number
  readonly remainingActions: number
  readonly remainingMs: number
  readonly remainingCostUsd: number | null
  readonly unresolvedCosts: number
  readonly reservedCostUsd: number
  readonly overrun: boolean
}
export type ReservationTicket = { readonly decisionIndex: number; readonly reservedUsd: number }
export type BudgetLedger = {
  reserve(estimate: number | null, billable?: boolean): ReservationTicket | null
  tighten(
    input: Pick<
      BudgetLedgerInput,
      'remainingDecisions' | 'remainingActions' | 'remainingMs' | 'remainingCostUsd'
    >,
  ): void
  dispatch(ticket: ReservationTicket): void
  release(ticket: ReservationTicket): void
  settle(ticket: ReservationTicket, actual: number | null): void
  snapshot(): BudgetSnapshot
  readonly decisionIndex: number
}
const valid = (n: number) => Number.isFinite(n) && n >= 0
export function createBudgetLedger(input: BudgetLedgerInput): BudgetLedger {
  for (const n of [
    input.remainingDecisions,
    input.remainingActions,
    input.remainingMs,
    input.maxRequestMs,
  ]) {
    if (!valid(n)) throw new Error('invalid-budget')
  }
  if (
    !Number.isInteger(input.remainingDecisions) ||
    !Number.isInteger(input.remainingActions) ||
    (input.remainingCostUsd !== null && !valid(input.remainingCostUsd)) ||
    (input.estimatedRequestCostUsd != null && !valid(input.estimatedRequestCostUsd))
  )
    throw new Error('invalid-budget')
  const now = input.now ?? (() => performance.now())
  let deadline = now() + input.remainingMs
  let decisions = input.remainingDecisions
  let actions = input.remainingActions
  let balance = input.remainingCostUsd
  let index = 0
  let overrun = false
  const tickets = new Map<ReservationTicket, { state: 'reserved' | 'dispatched' | 'unknown' }>()
  const unresolved = () => [...tickets.values()].filter((t) => t.state === 'unknown').length
  const held = () => [...tickets.keys()].reduce((sum, t) => sum + t.reservedUsd, 0)
  return {
    get decisionIndex() {
      return index
    },
    reserve(quote, billable) {
      // Explicitly non-billable cache/stub requests never inherit a paid quote.
      const estimate = billable === false ? 0 : (quote ?? input.estimatedRequestCostUsd ?? null)
      if (
        decisions <= 0 ||
        actions <= 0 ||
        now() >= deadline ||
        input.maxRequestMs <= 0 ||
        overrun ||
        unresolved()
      )
        return null
      if (estimate !== null && !valid(estimate)) return null
      if (billable && (estimate === null || balance === null)) return null
      if (
        estimate !== null &&
        estimate > 0 &&
        (balance === null || balance - held() + 1e-12 < estimate)
      )
        return null
      const ticket = Object.freeze({ decisionIndex: ++index, reservedUsd: estimate ?? 0 })
      decisions--
      tickets.set(ticket, { state: 'reserved' })
      return ticket
    },
    tighten(current) {
      if (
        ![current.remainingDecisions, current.remainingActions, current.remainingMs].every(valid) ||
        (current.remainingCostUsd !== null && !valid(current.remainingCostUsd))
      )
        throw new Error('invalid-budget-limit')
      decisions = Math.min(decisions, current.remainingDecisions)
      actions = Math.min(actions, current.remainingActions)
      deadline = Math.min(deadline, now() + current.remainingMs)
      if (balance !== null && current.remainingCostUsd !== null)
        balance = Math.min(balance, current.remainingCostUsd)
    },
    dispatch(ticket) {
      const t = tickets.get(ticket)
      if (t?.state === 'reserved') t.state = 'dispatched'
    },
    release(ticket) {
      // Once dispatched, lack of a receipt is not proof that no bill was incurred.
      const t = tickets.get(ticket)
      if (t?.state === 'reserved') tickets.delete(ticket)
      else if (t) t.state = 'unknown'
    },
    settle(ticket, actual) {
      const t = tickets.get(ticket)
      if (!t) return // foreign / replayed ticket: cannot change arithmetic
      if (actual === null || !valid(actual)) {
        t.state = 'unknown'
        return
      }
      tickets.delete(ticket)
      if (actual > ticket.reservedUsd) overrun = true
      if (balance !== null) {
        if (actual > balance) overrun = true
        balance = Math.max(0, balance - actual)
      }
    },
    snapshot() {
      return {
        maxRequestMs: input.maxRequestMs,
        remainingDecisions: decisions,
        remainingActions: actions,
        remainingMs: Math.max(0, deadline - now()),
        remainingCostUsd: unresolved() ? null : balance,
        unresolvedCosts: unresolved(),
        reservedCostUsd: held(),
        overrun,
      }
    },
  }
}
