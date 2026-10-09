import { it, expect } from 'vitest'
import { createSharedNetworkBudget } from './shared-budget.ts'
it('shares request and decoded/wire byte reservations across parent and child streams', () => {
  const budget = createSharedNetworkBudget({
    maxRequests: 2,
    maxResponseBytes: 10,
    maxTotalBytes: 12,
  })
  expect(budget.reserveRequest()).toBe(true)
  expect(budget.reserveRequest()).toBe(true)
  expect(budget.reserveRequest()).toBe(false)
  const parent = budget.body.stream(),
    child = budget.body.stream()
  parent(8, 'decoded')
  expect(() => child(5, 'decoded')).toThrow('response-budget-exhausted')
  child(4, 'decoded')
  expect(budget.body.exhausted()).toBe(true)
  expect(budget.requests()).toBe(2)
})
