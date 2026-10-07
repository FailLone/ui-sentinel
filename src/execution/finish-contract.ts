import { z } from 'zod'
import type { BusinessResult } from '../shared/types.ts'
import { finishOutcomeDescription } from './tool-guidance.ts'

export const shortFinishInput = z.object({
  reason: z
    .enum(['scope-covered', 'observed-blocker', 'unverified-scope'])
    .describe(
      'scope-covered: intended inspection covered; observed-blocker: observed conditions prevent further progress; unverified-scope: applicable work remains and has been recorded. These describe the inspection, not whether the business operation succeeded. The server builds the factual report.',
    ),
})

export const legacyFinishInput = z.object({
  businessResult: z.enum(['success', 'rejected', 'unknown']).describe(finishOutcomeDescription()),
  blocked: z
    .boolean()
    .describe(
      'True for an observed blocker or incomplete applicable investigation. False when applicable inspection is complete, even with saved findings. Conditions that never triggered are not blockers.',
    ),
  summary: z.string(),
})

export const shortFinishInstructions =
  'Decision output protocol: call tools directly without introductory or concluding prose. ' +
  'When you decide the inspection scope is covered or a blocker prevents progress, call run_finish and select its reason code; generate no report text. ' +
  'The server verifies and reports the business outcome, saved findings, check results and coverage. Do not re-summarize them or reclassify the business outcome in your answer. ' +
  'An empty known-check queue does not prove exploration complete: investigate observed novel anomalies and record any unfinished scope before requesting finish. ' +
  'Use exploration_update only to record or clear actual unfinished applicable branches, never to restate a completed journey. ' +
  'Continue using all investigation tools when necessary. A pass or fail completes a known check; unknown does not.'

/** Invoked only after an explicit Agent finish request and fresh server-side observation. */
export function resolveShortFinish(
  input: z.infer<typeof shortFinishInput>,
  facts: { businessResult: BusinessResult; gaps: readonly string[] },
) {
  const parsed = shortFinishInput.parse(input)
  return {
    businessResult: facts.businessResult,
    blocked: facts.businessResult === 'unknown' || facts.gaps.length > 0,
    summary: `Inspection ended: ${parsed.reason}. Business outcome: ${facts.businessResult}. Applicable unresolved items: ${facts.gaps.length}. See saved checks and findings for evidence.`,
    reasonCode: parsed.reason,
  }
}
