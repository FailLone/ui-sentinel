/**
 * Reservation-based action accounting for tools that perform several real browser actions.
 *
 * The run's action budget (`usage.actions`) increments once per `performAction` call, so a tool that
 * performs N clicks would otherwise cost one action. A probe must count every click it actually makes
 * against the same run budget, and must decide *before* it starts whether it can afford the whole
 * bounded procedure - a half-finished probe that stops mid-sampling is not a measurement.
 *
 * Reservation is required to happen before dispatch (the same rule the business write allowance
 * follows): `reserve()` claims the actions up front, each `consume()` turns one claim into a real
 * counted action, and `release()` returns whatever was never used.
 */
export interface ActionCounter {
  remaining(): number
  count(actions: number): void
}

export interface ActionReservation {
  readonly reserved: number
  /** Spend one of the reserved actions on a click that is really about to happen. */
  consume(): void
  /** Return the actions that were reserved but never consumed. */
  release(): void
  /** How many reserved actions are still spendable. */
  remaining(): number
}

export interface ActionBudget {
  /**
   * Claim `actions` against the run budget, or return null when they are not all available.
   * A null result means the caller must not start: it has performed nothing.
   */
  reserve(actions: number): ActionReservation | null
}

export function createActionBudget(counter: ActionCounter): ActionBudget {
  // Claims that are held but not yet turned into real actions. They reduce what a later
  // reservation can claim, so two reservations can never spend the same remaining actions.
  let outstanding = 0

  return {
    reserve(actions: number): ActionReservation | null {
      if (!Number.isSafeInteger(actions) || actions <= 0)
        throw new Error(`Invalid action reservation: ${actions}`)
      if (counter.remaining() - outstanding < actions) return null
      outstanding += actions
      let reserved = actions
      let spent = 0
      let closed = false
      return {
        get reserved() {
          return reserved
        },
        consume() {
          if (closed) throw new Error('reservation already released')
          if (spent >= reserved) throw new Error('reservation exhausted')
          counter.count(1)
          spent++
          outstanding--
        },
        release() {
          if (closed) throw new Error('reservation already released')
          closed = true
          outstanding -= reserved - spent
        },
        remaining: () => reserved - spent,
      }
    },
  }
}