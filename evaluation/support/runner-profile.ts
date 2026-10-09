import { FOCUS_WINDOW_MS, MAX_PROBE_CLICKS } from '../../src/execution/focus-constants.ts'
import { AGENT_MODEL, REVIEW_MODEL, VISION_MODEL } from './model-gateway.ts'
import type { FreezeProtocol } from './freeze-identity.ts'

/**
 * The frozen feature profile and budgets a paid visual phase runs under (plan P3.2).
 *
 * This lives outside the runner because the runner is a top-level script: it reads `process.env` and
 * spawns children at import time, so nothing about it can be asserted by a free test. The feature
 * flags were hand-written into its env block and drifted from the plan's configuration table for
 * exactly that reason - the table pinned the bounded Jev review at 1 while the runner set 0. Putting
 * the profile here gives it one testable home, and the runner derives its env from it rather than
 * restating it.
 */

export interface RunnerProfile {
  /** The environment overrides that put a run in the frozen condition. */
  readonly env: Readonly<Record<string, string>>
  /** What those overrides mean, for the freeze identity to pin. */
  readonly featureProfile: Readonly<Record<string, string>>
  readonly budgets: {
    readonly seconds: number
    readonly actions: number
    readonly modelCalls: number
  }
}

/** The one profile both the visual diagnostic and the visual formal run under. */
export const VISUAL_RUNNER_PROFILE: RunnerProfile = {
  env: {
    EXECUTION_VISUAL_DISCOVERY: '1',
    EXECUTION_ATOMIC_INVESTIGATION: '1',
    // Explicit, never inherited: the plan says the smoke's 0 cannot stand in for the diagnostic's 1,
    // and an inherited value would let a caller's environment silently define the experiment.
    EXECUTION_BLOCKER_REVIEW: '1',
  },
  featureProfile: {
    visualDiscovery: '1',
    atomicInvestigation: '1',
    blockerReview: '1',
  },
  budgets: { seconds: 300, actions: 40, modelCalls: 30 },
}

/**
 * The freeze protocol this build executes under.
 *
 * Every value is a knob that could change an answer, so all of them are pinned together and written
 * into the diagnostic's manifest; a formal run then refuses a source whose protocol moved.
 */
export function visualFreezeProtocol(providers: { agent: string; vision: string }): FreezeProtocol {
  return {
    algorithmVersion: 'visual-focus-3',
    focusWindowMs: FOCUS_WINDOW_MS,
    maxProbeClicks: MAX_PROBE_CLICKS,
    models: { agent: AGENT_MODEL, vision: VISION_MODEL, review: REVIEW_MODEL },
    providers,
    budgets: VISUAL_RUNNER_PROFILE.budgets,
  }
}
