/**
 * Adapts an untrusted provider reply into the internal scoring receipt.
 *
 * The stub schema (`r1-stub-reply-1`) is a TEST DOUBLE description, not a claim about the real
 * provider's wire protocol. The real adapter is `wire.ts`; this module is the internal contract
 * both of them must satisfy.
 *
 * A receipt is all-or-nothing: any missing, duplicated, ambiguous or out-of-range id invalidates
 * the whole batch, so a partially mis-bound reply can never look like a partial success.
 */
import { z } from 'zod'

export type Usage =
  | {
      status: 'known'
      inputTokens: number | null
      outputTokens: number | null
      costUsd: number
      source: 'stub'
    }
  | {
      status: 'known'
      inputTokens: number | null
      outputTokens: number | null
      costUsd: number
      source: 'provider'
    }
  | {
      status: 'unknown'
      inputTokens: number | null
      outputTokens: number | null
      costUsd: null
      source: 'provider' | 'stub'
    }

export type Score = {
  readonly candidateId: string
  readonly relevance: number
  readonly informationGain: number
  readonly uncertainty: number | null
}

export type NormalizedReceipt =
  | {
      readonly kind: 'scores'
      readonly scores: readonly Score[]
      readonly usage: Usage
      readonly modelId: string | null
    }
  | {
      readonly kind: 'handoff'
      readonly reasonCode: string
      readonly usage: Usage
      readonly modelId: string | null
    }

export type ReceiptRejection = { readonly ok: false; readonly detail: string }
export type ReceiptAcceptance<T> = { readonly ok: true; readonly value: T }

const unitInterval = z.number().finite().min(0).max(1)

const stubSchema = z
  .object({
    schemaVersion: z.literal('r1-stub-reply-1'),
    kind: z.enum(['scores', 'handoff', 'scenario']),
    model: z.string().optional(),
    provider: z.string().optional(),
    binding: z.string().optional(),
    reasonCode: z.string().optional(),
    operation: z.string().optional(),
    change: z.record(z.string(), z.unknown()).optional(),
    scores: z
      .array(
        z
          .object({
            candidateId: z.string().min(1),
            relevance: unitInterval,
            informationGain: unitInterval,
            uncertainty: unitInterval.nullable(),
          })
          .strict(),
      )
      .max(64)
      .optional(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
        costUsd: z.number().finite().nonnegative().nullable().optional(),
        costSource: z.string().optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()

function normalizeUsage(usage: z.infer<typeof stubSchema>['usage']): Usage {
  if (!usage)
    return {
      status: 'unknown',
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      source: 'provider',
    }
  const inputTokens = usage.inputTokens ?? null
  const outputTokens = usage.outputTokens ?? null
  // A missing cost is unknown. It is never coerced to zero and never fabricated from tokens.
  if (usage.costUsd === null || usage.costUsd === undefined)
    return { status: 'unknown', inputTokens, outputTokens, costUsd: null, source: 'provider' }
  const source = usage.costSource === 'non-billable-stub' ? 'stub' : 'provider'
  return { status: 'known', inputTokens, outputTokens, costUsd: usage.costUsd, source }
}

/** Parse a stub/real reply envelope. A malformed envelope is a structured rejection, not a throw. */
export function parseStubReply(
  value: unknown,
): ReceiptAcceptance<NormalizedReceipt> | ReceiptRejection {
  const parsed = stubSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      detail: `receipt-schema:${issue?.path.join('.') || 'root'}:${issue?.code ?? '?'}`,
    }
  }
  const reply = parsed.data
  const usage = normalizeUsage(reply.usage)
  if (reply.kind === 'handoff')
    return {
      ok: true,
      value: {
        kind: 'handoff',
        reasonCode: reply.reasonCode ?? 'uncertain',
        usage,
        modelId: reply.model ?? null,
      },
    }
  if (reply.kind === 'scenario')
    return { ok: false, detail: 'receipt-scenario-is-a-test-driver-directive-not-a-model-reply' }
  if (reply.kind === 'scores')
    return {
      ok: true,
      value: { kind: 'scores', scores: reply.scores ?? [], usage, modelId: reply.model ?? null },
    }
  return { ok: false, detail: 'receipt-kind-unsupported' }
}

/**
 * Cross-check a receipt against the candidate set actually sent. Anything other than a complete
 * one-to-one match invalidates the batch.
 */
export function validateReceipt(
  receipt: NormalizedReceipt | null,
  candidateIds: readonly string[],
): ReceiptAcceptance<NormalizedReceipt> | ReceiptRejection {
  if (!receipt) return { ok: false, detail: 'receipt-invalid-envelope' }
  if (receipt.kind === 'handoff') return { ok: true, value: receipt }

  // Re-check numeric ranges here as well as in the envelope parse: this is the gate, and a
  // receipt built by the wire adapter (or any other path) must not slip past it.
  for (const score of receipt.scores) {
    for (const [field, value] of [
      ['relevance', score.relevance],
      ['informationGain', score.informationGain],
      ['uncertainty', score.uncertainty],
    ] as const) {
      if (value === null && field === 'uncertainty') continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
        return { ok: false, detail: `receipt-score-out-of-range:${score.candidateId}:${field}` }
    }
  }

  const ids = receipt.scores.map((s) => s.candidateId)
  const unique = new Set(ids)
  if (unique.size !== ids.length) return { ok: false, detail: 'receipt-duplicate-candidate' }
  for (const id of ids) {
    if (!candidateIds.includes(id)) return { ok: false, detail: `receipt-unknown-candidate:${id}` }
  }
  for (const id of candidateIds) {
    if (!unique.has(id)) return { ok: false, detail: `receipt-missing-candidate:${id}` }
  }
  return { ok: true, value: receipt }
}
