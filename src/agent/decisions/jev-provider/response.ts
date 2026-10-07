import { z } from 'zod'
import type { NormalizedReceipt, Usage } from '../exploration/receipt.ts'
import type { Compiled } from './compile.ts'
import { READINESS, PROBABILITY_TOLERANCE, SCORE_TOLERANCE, type Profile } from './profile.ts'
const unit = z.number().finite().min(0).max(1)
const scoreSchema = z
  .object({
    type: z.literal('score'),
    score: z.number().finite().min(0).max(3),
    confidence: unit,
    legend: z.record(z.string(), z.string()),
    probabilities: z.record(z.string(), unit),
  })
  .strict()
const choiceSchema = z
  .object({
    type: z.literal('choice'),
    choice: z.enum(['scoreable', 'insufficient-information', 'requires-agent-investigation']),
    confidence: unit,
    probabilities: z.record(z.string(), unit),
  })
  .strict()
const envelope = z
  .object({
    id: z.string().min(1).max(256),
    model: z.string(),
    provider: z.string(),
    answers: z.record(z.string(), z.unknown()),
    usage: z.unknown().optional(),
  })
  .strict()
export const unknownUsage: Usage = {
  status: 'unknown',
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  source: 'provider',
}
export function readUsage(raw: unknown): Usage {
  if (!raw || typeof raw !== 'object' || !('usage' in raw)) return { ...unknownUsage }
  const parsed = z
    .object({
      input_tokens: z.number().int().nonnegative().nullable().optional(),
      output_tokens: z.number().int().nonnegative().nullable().optional(),
      cost: z.number().finite().nonnegative().nullable().optional(),
    })
    .strict()
    .safeParse(raw.usage)
  if (!parsed.success) return { ...unknownUsage }
  const d = parsed.data
  return {
    status: d.cost == null ? 'unknown' : 'known',
    inputTokens: d.input_tokens ?? null,
    outputTokens: d.output_tokens ?? null,
    costUsd: d.cost ?? null,
    source: 'provider',
  } as Usage
}
export class ProviderError extends Error {
  constructor(
    readonly code: string,
    readonly usage: Usage = { ...unknownUsage },
  ) {
    super(code)
  }
}
function exact(actual: string[], expected: string[]) {
  if (actual.length !== expected.length || actual.some((x) => !expected.includes(x)))
    throw new Error('answer-key-set')
}
function distribution(raw: Record<string, number>, keys: string[]) {
  exact(Object.keys(raw), keys)
  const sum = Object.values(raw).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > PROBABILITY_TOLERANCE + 1e-12) throw new Error('probability-sum')
  return keys.map((k) => raw[k] / sum)
}
export function normalizeResponse(
  raw: unknown,
  compiled: Compiled,
  profile: Profile,
): NormalizedReceipt {
  const usage = readUsage(raw)
  try {
    const response = envelope.parse(raw)
    if (response.model !== profile.expectedModel || response.provider !== profile.provider)
      throw new Error('provider-identity')
    exact(Object.keys(response.answers), Object.keys(compiled.questions))
    const readiness = choiceSchema.parse(response.answers.readiness)
    const keys = Object.keys(READINESS)
    const p = distribution(readiness.probabilities, keys)
    if (p[keys.indexOf(readiness.choice)] + 1e-12 < Math.max(...p))
      throw new Error('choice-not-maximum')
    const scores = new Map<
      string,
      { candidateId: string; relevance: number; informationGain: number; uncertainty: number }
    >()
    for (const [key, mapping] of Object.entries(compiled.mapping)) {
      const score = scoreSchema.parse(response.answers[key])
      const levels = ['0', '1', '2', '3']
      exact(Object.keys(score.legend), levels)
      const criteria = compiled.questions[key].criteria as readonly string[]
      if (levels.some((k, i) => score.legend[k] !== criteria[i])) throw new Error('legend-mismatch')
      const p = distribution(score.probabilities, levels)
      const mean = p.reduce((s, x, i) => s + x * i, 0)
      // At most 3 * sum rounding tolerance plus displayed-score rounding.
      if (Math.abs(score.score - mean) > SCORE_TOLERANCE + 1e-12)
        throw new Error('score-inconsistent')
      const entropy = Math.min(
        1,
        Math.max(0, -p.reduce((s, x) => s + (x === 0 ? 0 : x * Math.log(x)), 0) / Math.log(4)),
      )
      const row = scores.get(mapping.candidateId) ?? {
        candidateId: mapping.candidateId,
        relevance: 0,
        informationGain: 0,
        uncertainty: 0,
      }
      row[mapping.dimension] = mean / 3
      row.uncertainty = Math.max(row.uncertainty, entropy)
      scores.set(mapping.candidateId, row)
    }
    const base = { modelId: response.model, provider: response.provider, usage }
    if (readiness.choice !== 'scoreable')
      return { ...base, kind: 'handoff', reasonCode: readiness.choice }
    if (readiness.confidence < profile.readinessConfidence)
      return { ...base, kind: 'handoff', reasonCode: 'uncertain' }
    // Unknown paid cost stops an experiment; never offer a suggestion while settlement is unknown.
    if (usage.status === 'unknown')
      return { ...base, kind: 'handoff', reasonCode: 'budget-exhausted' }
    return { ...base, kind: 'scores', scores: [...scores.values()] }
  } catch (error) {
    throw new ProviderError(
      error instanceof z.ZodError
        ? 'response-schema'
        : error instanceof Error
          ? error.message
          : 'response-invalid',
      usage,
    )
  }
}
