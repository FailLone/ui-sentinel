import { z } from 'zod'
import { profileSchema } from '../../src/agent/decisions/jev-provider/profile.ts'
import { limitsSchema } from './ledger.ts'
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const configSchema = z
  .object({
    version: z.literal('r1-jev-campaign-1'),
    phase: z.enum(['smoke', 'development', 'holdout', 'decision-pilot']),
    profile: profileSchema,
    dataset: z.string().min(1),
    datasetSha256: digest,
    repetitions: z.number().int().min(1).max(2),
    limits: limitsSchema,
    requestTimeoutMs: z.number().int().positive().max(15000),
    protocol: z
      .object({
        questionsVerified: z.boolean(),
        billingBoundVerified: z.boolean(),
        source: z.string(),
        checkedAt: z.string(),
        quoteUsd: z.number().finite().nonnegative().nullable(),
        basis: z.string(),
      })
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const cap = {
      smoke: [6, 0.25, 300000],
      'decision-pilot': [8, 0.125, 150000],
      development: [24, 0.75, 600000],
      holdout: [128, 4, 2400000],
    }[c.phase]
    if (
      c.limits.maxAttempts > cap[0] ||
      c.limits.maxCostUsd > cap[1] ||
      c.limits.maxWallMs > cap[2]
    )
      ctx.addIssue({ code: 'custom', message: 'phase-cap' })
    if (c.repetitions !== (c.phase === 'holdout' ? 2 : 1))
      ctx.addIssue({ code: 'custom', message: 'phase-repetitions' })
  })
export type CampaignConfig = z.infer<typeof configSchema>
export const freezeSchema = z
  .object({
    version: z.literal('r1-jev-freeze-1'),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    lockSha256: digest,
    config: configSchema,
    configSha256: digest,
    requestsSha256: digest,
    labelsSha256: digest.nullable(),
    labelsReviewed: z.boolean(),
  })
  .strict()
export const authorizationSchema = z
  .object({
    version: z.literal('r1-jev-authorization-1'),
    authorized: z.literal(true),
    freezeSha256: digest,
    approvedBy: z.string().min(1),
    approvalReference: z.string().min(1),
    expiresAt: z.string().datetime(),
  })
  .strict()
export function blockers(config: CampaignConfig) {
  const r: string[] = []
  if (!config.protocol.questionsVerified) r.push('question-limit-unverified')
  if (
    !config.protocol.billingBoundVerified ||
    config.protocol.quoteUsd === null ||
    !config.protocol.basis.trim() ||
    !config.protocol.source.startsWith('https://') ||
    !config.protocol.checkedAt
  )
    r.push('billing-bound-unverified')
  if (config.protocol.quoteUsd !== null && config.protocol.quoteUsd > config.limits.maxCostUsd)
    r.push('quote-exceeds-batch-budget')
  return r
}
