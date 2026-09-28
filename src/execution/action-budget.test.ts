import { describe, expect, it } from 'vitest'
import { createActionBudget } from './action-budget.ts'

/** A stand-in for the run's single action counter (executor usage.actions). */
function counter(maxActions: number) {
  const state = { used: 0 }
  return {
    state,
    remaining: () => maxActions - state.used,
    count: (n: number) => {
      state.used += n
    },
  }
}

describe('action budget reservation', () => {
  it('refuses a reservation larger than what remains, without consuming anything', () => {
    const c = counter(40)
    c.state.used = 33
    const budget = createActionBudget(c)

    expect(budget.reserve(8)).toBeNull()
    expect(c.state.used).toBe(33)
  })

  it('allows a reservation that exactly fits what remains', () => {
    const c = counter(40)
    c.state.used = 32
    const budget = createActionBudget(c)

    const reservation = budget.reserve(8)

    expect(reservation).not.toBeNull()
    expect(reservation?.reserved).toBe(8)
  })

  it('consumes one action per click so a probe is not counted as a single action', () => {
    const c = counter(40)
    const budget = createActionBudget(c)
    const reservation = budget.reserve(8)!

    for (let click = 0; click < 5; click++) reservation.consume()

    expect(c.state.used).toBe(5)
    expect(reservation.remaining()).toBe(3)
  })

  it('releases unused reserved actions back to the run', () => {
    const c = counter(40)
    const budget = createActionBudget(c)
    const reservation = budget.reserve(8)!

    reservation.consume()
    reservation.consume()
    reservation.release()

    expect(c.state.used).toBe(2)
    expect(budget.reserve(38)).not.toBeNull()
  })

  it('refuses to consume more than was reserved', () => {
    const c = counter(40)
    const budget = createActionBudget(c)
    const reservation = budget.reserve(2)!

    reservation.consume()
    reservation.consume()

    expect(() => reservation.consume()).toThrow(/reservation exhausted/)
  })

  it('does not let two reservations spend the same actions', () => {
    const c = counter(40)
    c.state.used = 36
    const budget = createActionBudget(c)

    const first = budget.reserve(4)
    const second = budget.reserve(1)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
  })
})
