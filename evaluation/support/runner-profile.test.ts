import { describe, expect, it } from 'vitest'
import { VISUAL_RUNNER_PROFILE, visualFreezeProtocol } from './runner-profile.ts'
import { protocolHash } from './freeze-identity.ts'

/**
 * The paid visual phase's frozen condition (plan P3.2).
 *
 * These assert the *plan's configuration table*, not the runner's current output: the table is the
 * authority, and a runner that disagrees with it is running a different experiment than the freeze
 * identity claims. They exist because the flags were previously hand-written in an unimportable
 * top-level script, where the bounded Jev review sat at 0 against the table's explicit 1 and no free
 * test could see it.
 */

const providers = { agent: 'Alibaba', vision: 'Alibaba' }

describe('the paid visual runner profile', () => {
  it('turns the bounded review on, as the configuration table pins it', () => {
    expect(VISUAL_RUNNER_PROFILE.env.EXECUTION_BLOCKER_REVIEW).toBe('1')
  })

  it('turns visual discovery and atomic investigation on, explicitly', () => {
    expect(VISUAL_RUNNER_PROFILE.env.EXECUTION_VISUAL_DISCOVERY).toBe('1')
    expect(VISUAL_RUNNER_PROFILE.env.EXECUTION_ATOMIC_INVESTIGATION).toBe('1')
  })

  it("runs under the table's budgets", () => {
    expect(VISUAL_RUNNER_PROFILE.budgets).toEqual({ seconds: 300, actions: 40, modelCalls: 30 })
  })

  it('states its own condition rather than inheriting one', () => {
    // Every flag is present with a value. An absent flag falls back to the product's default, which
    // is how a caller's environment ends up defining the experiment.
    for (const [name, value] of Object.entries(VISUAL_RUNNER_PROFILE.env)) {
      expect(value, `${name} must be set explicitly`).toMatch(/^[01]$/)
    }
  })

  it('pins the profile the runner really runs into the protocol it freezes', () => {
    // The protocol is what a formal run compares against. If it were built from constants rather than
    // this profile, the frozen condition and the executed condition could differ with nothing noticing.
    const protocol = visualFreezeProtocol(providers)
    expect(protocol.budgets).toEqual(VISUAL_RUNNER_PROFILE.budgets)
    expect(protocol.models.review).toBe('typesafe/jev-1.13')
  })

  it('gives a moved feature flag a new protocol hash', () => {
    // The profile is carried in the identity, so a change to the frozen condition is a new experiment
    // rather than a reuse of the old approval.
    const base = protocolHash(visualFreezeProtocol(providers))
    const moved = protocolHash({
      ...visualFreezeProtocol(providers),
      models: { ...visualFreezeProtocol(providers).models, review: 'other-model' },
    })
    expect(moved).not.toBe(base)
  })
})
