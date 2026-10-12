/** R1's independent data interpretation of item-checks-2. No R0 runtime imports. */
import { z } from 'zod'
export const checksSchema = z
  .object({
    revision: z.literal('item-checks-2'),
    sourceReview: z
      .object({
        state: z.enum(['pending', 'sealed', 'unresolved']),
        revision: z.literal('public-effect-sources-1'),
        refs: z.array(z.string()),
        hash: z.string(),
        reasons: z.array(z.string()),
      })
      .passthrough(),
    generic: z
      .object({
        state: z.enum(['pending', 'collected', 'failed', 'unverified']),
        actionId: z.string().optional(),
        checkRef: z.string().optional(),
        receiptRef: z.string().optional(),
        feedback: z.enum(['change-observed', 'no-change-observed', 'indeterminate']).optional(),
        evidenceRefs: z.array(z.string()),
        eventIds: z.array(z.string()),
      })
      .passthrough(),
    effects: z
      .array(
        z
          .object({
            requirementId: z.string(),
            state: z.enum(['pending', 'verified', 'failed', 'unverified']),
            late: z.boolean(),
            measurementRefs: z.array(z.string()),
            eventIds: z.array(z.string()),
          })
          .passthrough(),
      )
      .max(12),
  })
  .passthrough()
export function pendingFacets(raw: unknown) {
  const checks = checksSchema.parse(raw)
  if (new Set(checks.effects.map((e) => e.requirementId)).size !== checks.effects.length)
    throw new Error('duplicate-effect-identity')
  const reasons: string[] = []
  if (checks.sourceReview.state !== 'sealed') reasons.push('resolve-public-source')
  if (['pending', 'unverified'].includes(checks.generic.state)) reasons.push('generic-evidence')
  for (const e of checks.effects)
    if (['pending', 'unverified'].includes(e.state)) reasons.push(`effect:${e.requirementId}`)
  return {
    checks,
    pending: reasons,
    genericSettled: ['collected', 'failed'].includes(checks.generic.state),
    functionalSemantics:
      checks.effects.length === 0
        ? checks.sourceReview.state === 'sealed'
          ? 'unspecified'
          : 'source-unresolved'
        : checks.effects.some((e) => e.state === 'pending' || e.state === 'unverified')
          ? 'required-effect-unverified'
          : 'measured-per-registered-effects',
    hasMeasuredFailure:
      checks.generic.state === 'failed' || checks.effects.some((e) => e.state === 'failed'),
    mayReplayOriginalAction: false,
    executionAuthorization: 'unknown',
    declaresTaskComplete: false,
  }
}
