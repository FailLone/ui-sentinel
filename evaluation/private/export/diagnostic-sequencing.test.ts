import { describe, it, expect } from 'vitest'
import { REQUIRED_RUN_PRECONDITIONS, sequencingGaps } from './diagnostic-sequencing.ts'

/**
 * The order in which a diagnostic prepares a variant, and what it must check before running it.
 *
 * `resetAndVerifyExport` proves a variant's public behaviour by driving its own browser through the
 * whole flow - which *uses* the arena's one permitted create. Running the agent straight afterwards
 * therefore starts it against a spent arena: the agent's own click is answered
 * `409 export-already-created`, no business fact can be decoded, and the run ends `blocked` with
 * zero findings. That is what the second paid diagnostic produced on all five variants, and it cost
 * real money and real time to look like a product failure.
 *
 * The same helper is also the only thing that checks the fixture matches its declared truth, so a
 * diagnostic that skips that check can grade an unusable fixture as if it were the product. Both are
 * preconditions of a run meaning anything, so they are stated together and checked together.
 */
describe('diagnostic run preconditions', () => {
  it('names the reset and the truth check as required before a run', () => {
    expect(REQUIRED_RUN_PRECONDITIONS).toEqual([
      'fixture-verified',
      'arena-reset-after-verification',
      'truth-asserted',
    ])
  })

  it('accepts the sequence the preflight runner uses', () => {
    // scripts/validation/business.ts resets immediately before each run, and verify-export-fixtures
    // asserts the observed truth. This is the ordering that is known to work.
    expect(
      sequencingGaps(['fixture-verified', 'truth-asserted', 'arena-reset-after-verification']),
    ).toEqual([])
  })

  it('reports the spent-arena gap when the arena is not reset after verification', () => {
    // The exact defect: verify, then run, with no reset in between.
    expect(sequencingGaps(['fixture-verified', 'truth-asserted'])).toEqual([
      'arena-reset-after-verification',
    ])
  })

  it('reports the ungraded-fixture gap when the truth is never asserted', () => {
    expect(sequencingGaps(['fixture-verified', 'arena-reset-after-verification'])).toEqual([
      'truth-asserted',
    ])
  })

  it('reports both gaps for a run that verifies and then goes straight to the agent', () => {
    expect(sequencingGaps(['fixture-verified'])).toEqual([
      'arena-reset-after-verification',
      'truth-asserted',
    ])
  })

  it('reports everything missing for a run that does no preparation at all', () => {
    // A diagnostic that runs the agent against whatever the arena already held.
    expect(sequencingGaps([])).toEqual([
      'fixture-verified',
      'arena-reset-after-verification',
      'truth-asserted',
    ])
  })

  it('is not satisfied by a check that happens out of order', () => {
    // Asserting the truth *after* the run cannot say the fixture the run used was usable.
    expect(sequencingGaps(['arena-reset-after-verification'])).toContain('fixture-verified')
  })
})
