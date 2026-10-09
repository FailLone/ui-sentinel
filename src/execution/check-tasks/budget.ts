import type { BudgetLease, Quota } from './contract.ts'
const keys = ['actions', 'modelCalls', 'reads'] as const
const zero = (): Quota => ({ actions: 0, modelCalls: 0, reads: 0 })
/** Synchronous reservation/consumption: no await between checking and owning quota. */
export function createSharedCheckBudget(deps: {
  remaining: () => Quota
  charge: (kind: keyof Quota, amount: number) => void
}) {
  const held = zero()
  return {
    held: () => ({ ...held }),
    reserve(quota: Quota): BudgetLease {
      const remaining = deps.remaining()
      for (const key of keys)
        if (
          !Number.isSafeInteger(quota[key]) ||
          quota[key] < 0 ||
          quota[key] > remaining[key] - held[key]
        )
          throw Error('check-budget-unavailable')
      for (const key of keys) held[key] += quota[key]
      const used = zero()
      let released = false
      return {
        consume(key, amount = 1) {
          if (
            released ||
            !Number.isSafeInteger(amount) ||
            amount < 0 ||
            used[key] + amount > quota[key]
          )
            throw Error('check-budget-exhausted')
          // charge is synchronous and must not throw after mutating usage.
          deps.charge(key, amount)
          used[key] += amount
          held[key] -= amount
        },
        usage: () => ({ ...used }),
        release() {
          if (released) return
          released = true
          for (const key of keys) held[key] -= quota[key] - used[key]
        },
      }
    },
  }
}
