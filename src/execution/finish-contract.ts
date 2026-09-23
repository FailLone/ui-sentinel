import { z } from 'zod'
import type { BusinessResult } from '../shared/types.ts'

export const shortFinishInput = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe(
      'One short reason for ending this inspection. Saved findings, checks, business outcome and coverage are already in the report; do not repeat them.',
    ),
})

export const legacyFinishInput = z.object({
  businessResult: z
    .enum(['success', 'rejected', 'unknown'])
    .describe(
      'success: confirmed paid order. rejected: explicit rejected/declined response with clear UI reason. A retryable processing failure (status failed) is unknown, not rejected; finish it as blocked when recovery cannot proceed.',
    ),
  blocked: z
    .boolean()
    .describe(
      'True for an observed blocker or incomplete applicable investigation. False when applicable inspection is complete, even with saved findings. Conditions that never triggered are not blockers.',
    ),
  summary: z.string(),
})

export const shortFinishInstructions =
  'Decision output protocol: call tools directly without introductory or concluding prose. ' +
  'When you decide the inspection scope is covered or a blocker prevents progress, call run_finish with only one short reason (at most 240 characters). ' +
  'The server verifies and reports the business outcome, saved findings, check results and coverage. Do not re-summarize them or reclassify the payment outcome in your answer. ' +
  'An empty known-check queue does not prove exploration complete: investigate observed novel anomalies and record any unfinished scope before requesting finish. ' +
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
    summary: parsed.reason,
  }
}
