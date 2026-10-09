/**
 * R1 exploration decision contract (`r1-exploration-input-1` / `r1-exploration-result-1`).
 *
 * Pure data module: no model, network, browser, database or run configuration is touched here.
 * The caller owns every version in this document. This module never declares that the current
 * page is unchanged — it can only compare the versions it was handed.
 */
import { z } from 'zod'

/** Module hard ceilings. Caller limits may be lower, never higher. */
export const HARD_LIMITS = {
  maxCandidates: 32,
  maxInputBytes: 32768,
  maxHistory: 32,
} as const

/** First release enumerates only these public actions. `inspect` is advise-only and never executes. */
export const publicActions = ['click', 'inspect', 'fill', 'navigate'] as const

/** Refresh effects are not mutually exclusive; any combination may be observed for one action. */
export const actualEffects = ['expanded', 'content-changed', 'navigated'] as const

export const outcomes = ['observed', 'failed', 'unknown'] as const

/** Reasons a recommendation cannot be issued. Distinct causes are preserved, not collapsed. */
export const reasonCodes = [
  'ranked',
  'invalid-input',
  'no-eligible-candidates',
  'insufficient-information',
  'uncertain',
  'invalid-receipt',
  'stale-state',
  'budget-exhausted',
  'cancelled',
  'timeout',
  'transport-failed',
  'requires-agent-investigation',
  'unsupported',
] as const

export type ReasonCode = (typeof reasonCodes)[number]
export type PublicAction = (typeof publicActions)[number]
export type ActualEffect = (typeof actualEffects)[number]
export type Outcome = (typeof outcomes)[number]

const boundedString = (max: number) => z.string().max(max)
const finiteNonNegative = z.number().finite().nonnegative()

/** Tri-state public control state. `null` is "unknown", never "false". */
const publicStateSchema = z
  .object({
    visible: z.boolean().nullable(),
    enabled: z.boolean().nullable(),
    expanded: z.boolean().nullable(),
    selected: z.boolean().nullable(),
  })
  .strict()

const geometrySchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: finiteNonNegative,
    height: finiteNonNegative,
    inViewport: z.boolean(),
  })
  .strict()

const candidateSchema = z
  .object({
    id: boundedString(128).min(1),
    targetKey: boundedString(256).min(1).nullable(),
    observationVersion: boundedString(128).min(1),
    text: boundedString(2048),
    role: boundedString(64),
    publicState: publicStateSchema,
    geometry: geometrySchema.nullable(),
    context: boundedString(4096),
    allowedActions: z.array(z.enum(publicActions)).max(publicActions.length),
    estimatedCost: finiteNonNegative,
  })
  .strict()

const historySchema = z
  .object({
    targetKey: boundedString(256).min(1),
    candidateId: boundedString(128).min(1),
    action: z.enum(publicActions),
    beforeStateVersion: boundedString(128).min(1),
    afterStateVersion: boundedString(128).min(1),
    // Observed effects only. A prediction must never be written into history.
    actualEffects: z.array(z.enum(actualEffects)).max(actualEffects.length),
    outcome: z.enum(outcomes),
  })
  .strict()

const inputSchema = z
  .object({
    schemaVersion: z.literal('r1-exploration-input-1'),
    requestId: boundedString(128).min(1),
    task: z
      .object({
        goal: boundedString(2048),
        localTask: boundedString(2048),
        revision: boundedString(128).min(1),
      })
      .strict(),
    state: z
      .object({
        pageId: boundedString(128).min(1),
        url: boundedString(2048),
        documentVersion: boundedString(128).min(1),
        observationVersion: boundedString(128).min(1),
        relatedStateVersion: boundedString(128).min(1),
        cacheable: z.boolean(),
      })
      .strict(),
    candidates: z.array(candidateSchema).max(HARD_LIMITS.maxCandidates),
    history: z.array(historySchema).max(HARD_LIMITS.maxHistory),
    scope: z
      .object({
        revision: boundedString(128).min(1),
        executableCandidateIds: z.array(boundedString(128).min(1)).max(HARD_LIMITS.maxCandidates),
      })
      .strict(),
    budget: z
      .object({
        revision: boundedString(128).min(1),
        remainingDecisions: z.number().int().nonnegative(),
        remainingActions: z.number().int().nonnegative(),
        remainingMs: finiteNonNegative,
        maxRequestMs: finiteNonNegative,
        // `null` is unknown. It must never be coerced to 0 (free) or to a fabricated quote.
        remainingCostUsd: finiteNonNegative.nullable(),
      })
      .strict(),
    limits: z
      .object({
        maxCandidates: z.number().int().positive(),
        maxInputBytes: z.number().int().positive(),
        maxHistory: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()

export type ExplorationInput = z.infer<typeof inputSchema>
export type ExplorationCandidate = z.infer<typeof candidateSchema>
export type ExplorationHistoryEntry = z.infer<typeof historySchema>

export type InputRejection = {
  readonly ok: false
  readonly reasonCode: 'invalid-input'
  /** Stable, checkable cause. Never echoes untrusted candidate text back to a caller. */
  readonly detail: string
}

export type InputAcceptance = {
  readonly ok: true
  readonly value: ExplorationInput
}

/**
 * Structural referential checks that zod cannot express. Ordered so the most fundamental
 * shape problem is reported first; each cause is named rather than collapsed.
 */
function structuralFailure(input: ExplorationInput): string | undefined {
  const ids = input.candidates.map((c) => c.id)
  if (new Set(ids).size !== ids.length) return 'candidate-id-duplicate'

  for (const candidate of input.candidates) {
    if (candidate.observationVersion !== input.state.observationVersion)
      return 'candidate-observation-stale'
  }

  const versions = new Set(input.candidates.map((c) => c.observationVersion))
  if (versions.size > 1) return 'candidate-observation-conflict'

  const executable = input.scope.executableCandidateIds
  if (new Set(executable).size !== executable.length) return 'scope-duplicate-candidate'
  for (const id of executable) {
    if (!ids.includes(id)) return 'scope-unknown-candidate'
  }
  return undefined
}

/** Caller limits may tighten the module ceiling; they can never raise it. */
function limitFailure(input: ExplorationInput): string | undefined {
  for (const field of ['maxCandidates', 'maxInputBytes', 'maxHistory'] as const) {
    if (input.limits[field] > HARD_LIMITS[field]) return 'limit-exceeds-hard-limit'
  }
  if (input.candidates.length > input.limits.maxCandidates) return 'candidates-exceed-limit'
  if (input.history.length > input.limits.maxHistory) return 'history-exceed-limit'
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > input.limits.maxInputBytes)
    return 'input-exceeds-byte-limit'
  return undefined
}

/**
 * Validate an untrusted value into the contract. A rejection is a structured result, not a throw:
 * the caller must be able to record *why* no request was sent.
 */
export function parseExplorationInput(value: unknown): InputAcceptance | InputRejection {
  const parsed = inputSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path.join('.') || 'root'
    return {
      ok: false,
      reasonCode: 'invalid-input',
      detail: `schema:${path}:${issue?.code ?? '?'}`,
    }
  }
  const structural = structuralFailure(parsed.data)
  if (structural) return { ok: false, reasonCode: 'invalid-input', detail: structural }
  const limits = limitFailure(parsed.data)
  if (limits) return { ok: false, reasonCode: 'invalid-input', detail: limits }
  return { ok: true, value: parsed.data }
}

/** Result envelope. There is deliberately no finish/pass/defect/authorized field anywhere. */
export type ExplorationResult = {
  readonly schemaVersion: 'r1-exploration-result-1'
  readonly requestId: string
  readonly kind: 'ranked' | 'handoff'
  readonly reasonCode: ReasonCode
  readonly binding: ResultBinding | null
}

export type ResultBinding = {
  readonly taskRevision: string
  readonly pageId: string
  readonly documentVersion: string
  readonly observationVersion: string
  readonly relatedStateVersion: string
  readonly scopeRevision: string
  readonly budgetRevision: string
  readonly contractVersion: string
  readonly policyVersion: string
  readonly promptVersion: string | null
  readonly modelId: string | null
  readonly provider: string | null
  readonly adapterRevision: string
  readonly stateDigest: string
}

export const CONTRACT_VERSION = 'r1-exploration-contract-1'
export const POLICY_VERSION = 'r1-exploration-policy-2'
export const PROMPT_VERSION = 'r1-exploration-prompt-2'

/** Evaluation-side normalization only. The raw reasonCode is always preserved alongside it. */
export function normalizeOutcome(result: {
  kind: 'ranked' | 'handoff'
  reasonCode: ReasonCode
}): 'ranked' | 'handoff' | 'invalid-input' {
  if (result.kind === 'ranked') return 'ranked'
  return result.reasonCode === 'invalid-input' ? 'invalid-input' : 'handoff'
}
