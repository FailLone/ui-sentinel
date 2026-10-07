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

export type BudgetLedger = {
  /** Reserve one decision and its worst-case cost. Returns null when the budget cannot cover it. */
  reserve(estimatedCostUsd: number | null): { readonly decisionIndex: number } | null
  /** Release a reservation whose request never produced output. Keeps settled costs debited. */
  releaseCost(amount: number): void
  /** Debit the actual cost once a request settles with a known figure. */
  settle(actualCostUsd: number | null): void
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
      return { decisionIndex }
    },
    releaseCost(amount) {
      reservedCost = Math.max(0, reservedCost - amount)
    },
    settle(actualCostUsd) {
      reservedCost = 0
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
