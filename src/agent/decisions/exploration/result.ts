/** Runtime output contract, also usable by consumers before storing a result. */
import { z } from 'zod'
import { reasonCodes } from './contracts.ts'
import { usageSchema } from './receipt.ts'
const nonnegative = z.number().finite().nonnegative()
const unit = nonnegative.max(1)
const binding = z
  .object({
    taskRevision: z.string(),
    pageId: z.string(),
    documentVersion: z.string(),
    observationVersion: z.string(),
    relatedStateVersion: z.string(),
    scopeRevision: z.string(),
    budgetRevision: z.string(),
    contractVersion: z.literal('r1-exploration-contract-1'),
    policyVersion: z.literal('r1-exploration-policy-2'),
    promptVersion: z.literal('r1-exploration-prompt-2').nullable(),
    modelId: z.string().nullable(),
    provider: z.string().nullable(),
    adapterRevision: z.string(),
    stateDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export const scoreResultSchema = z
  .object({
    schemaVersion: z.literal('r1-exploration-result-1'),
    requestId: z.string(),
    kind: z.enum(['ranked', 'handoff']),
    reasonCode: z.enum(reasonCodes),
    binding: binding.nullable(),
    outcome: z.enum(['ranked', 'handoff', 'invalid-input']),
    orderedCandidateIds: z.array(z.string()).max(32).optional(),
    scores: z
      .array(
        z
          .object({
            candidateId: z.string(),
            relevance: unit,
            informationGain: unit,
            uncertainty: unit.nullable(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    rejected: z
      .array(z.object({ candidateId: z.string(), reason: z.string() }).strict())
      .max(32)
      .optional(),
    policyVersion: z.literal('r1-exploration-policy-2').optional(),
    trace: z
      .object({
        attempted: z.boolean(),
        attemptId: z.string(),
        requestDigest: z.string().nullable(),
        durationMs: nonnegative,
        transportMs: nonnegative,
        usage: usageSchema,
        deadLetter: z.array(z.string()),
        cache: z.enum(['hit', 'miss', 'disabled']).optional(),
        originCostUsd: nonnegative.nullable().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = r.orderedCandidateIds ?? []
    if (
      r.kind === 'ranked' &&
      (r.reasonCode !== 'ranked' ||
        r.outcome !== 'ranked' ||
        !r.binding ||
        !ids.length ||
        new Set(ids).size !== ids.length ||
        !r.scores ||
        r.scores.length !== ids.length ||
        new Set(r.scores.map((s) => s.candidateId)).size !== ids.length ||
        r.scores.some((s) => !ids.includes(s.candidateId)))
    )
      ctx.addIssue({ code: 'custom', message: 'invalid-ranked-result' })
    if (
      r.kind === 'handoff' &&
      (r.reasonCode === 'ranked' ||
        r.orderedCandidateIds ||
        r.scores ||
        r.outcome !== (r.reasonCode === 'invalid-input' ? 'invalid-input' : 'handoff'))
    )
      ctx.addIssue({ code: 'custom', message: 'invalid-handoff-result' })
    if (r.binding === null && r.reasonCode !== 'invalid-input')
      ctx.addIssue({ code: 'custom', message: 'missing-binding' })
  })
export const parseScoreResult = (value: unknown) => scoreResultSchema.safeParse(value)
