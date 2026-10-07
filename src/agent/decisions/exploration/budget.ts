/**
 * Per-session budget ledger.
 *
 * One session owns one ledger object; concurrent requests reserve against it before dispatch so
 * the module can never exceed the caller's budget. A missing cost stays `null` (unknown) and is
 * never treated as free - with an unknown remaining cost a billable transport must not dispatch.
 */
export type BudgetLedgerInput = {
  readonly remainingDecisions: number
  readonly remainingActions: number
  readonly remainingMs: number
  readonly maxRequestMs: number
  readonly remainingCostUsd: number | null
  /** Worst-case cost of one request, when the caller can quote it. */
  readonly estimatedRequestCostUsd?: number | null
}

export type BudgetSnapshot = {
  readonly remainingDecisions: number
  readonly remainingActions: number
  readonly remainingMs: number
  readonly remainingCostUsd: number | null
}

/** One outstanding reservation. It must be handed back on settle or release. */
export type ReservationTicket = {
  readonly decisionIndex: number
  readonly reservedUsd: number
}

export type BudgetLedger = {
  /** Reserve one decision and its worst-case cost. Returns null when the budget cannot cover it. */
  reserve(estimatedCostUsd: number | null): ReservationTicket | null
  /**
   * Release ONE reservation whose request produced no output. Only that ticket's hold is freed;
   * every other in-flight reservation stays held.
   */
  release(ticket: ReservationTicket): void
  /**
   * Debit the actual cost once a request settles. Releases only this ticket's hold, so a
   * concurrent request still in flight keeps its reservation.
   */
  settle(ticket: ReservationTicket, actualCostUsd: number | null): void
  snapshot(): BudgetSnapshot
  readonly decisionIndex: number
}

export function createBudgetLedger(input: BudgetLedgerInput): BudgetLedger {
  let remainingDecisions = input.remainingDecisions
  let remainingActions = input.remainingActions
  let remainingCostUsd = input.remainingCostUsd
  let decisionIndex = 0
  let reservedCost = 0

  return {
    get decisionIndex() {
      return decisionIndex
    },
    reserve(estimatedCostUsd) {
      if (remainingDecisions <= 0) return null
      // Fall back to the ledger's own worst-case quote when the caller supplies none.
      const estimate = estimatedCostUsd ?? input.estimatedRequestCostUsd ?? null
      if (estimate !== null) {
        if (remainingCostUsd === null) return null
        if (remainingCostUsd - reservedCost < estimate) return null
      }
      remainingDecisions -= 1
      decisionIndex += 1
      if (estimate !== null) reservedCost += estimate
      return { decisionIndex, reservedUsd: estimate ?? 0 }
    },
    release(ticket) {
      // Free only THIS ticket's hold; other in-flight reservations remain held.
      reservedCost = Math.max(0, reservedCost - ticket.reservedUsd)
    },
    settle(ticket, actualCostUsd) {
      reservedCost = Math.max(0, reservedCost - ticket.reservedUsd)
      if (actualCostUsd !== null && remainingCostUsd !== null)
        remainingCostUsd = Math.max(0, remainingCostUsd - actualCostUsd)
    },
    snapshot() {
      return {
        remainingDecisions,
        remainingActions,
        remainingMs: input.remainingMs,
        remainingCostUsd,
      }
    },
  }
}
