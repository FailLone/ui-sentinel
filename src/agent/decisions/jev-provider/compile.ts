import { z } from 'zod'
import { parseExplorationInput, type ExplorationInput } from '../exploration/contracts.ts'
import { buildScoringRequest } from '../exploration/prompt.ts'
import { parseStrictJson } from './strict-json.ts'
import {
  profileSchema,
  sha256,
  SCORE_TEMPLATE,
  READINESS_TEMPLATE,
  READINESS,
  RUBRIC,
  type Profile,
} from './profile.ts'

const text = z.string()
const tri = z.boolean().nullable()
const dataSchema = z
  .object({
    task: z.object({ goal: text, localTask: text }).strict(),
    page: z
      .object({
        pageId: text,
        url: text,
        documentVersion: text,
        observationVersion: text,
        relatedStateVersion: text,
        cacheable: z.boolean(),
      })
      .strict(),
    candidates: z
      .array(
        z
          .object({
            id: text.min(1),
            targetKey: text.nullable(),
            observationVersion: text,
            text,
            role: text,
            geometry: z
              .object({
                x: z.number().finite(),
                y: z.number().finite(),
                width: z.number().nonnegative(),
                height: z.number().nonnegative(),
                inViewport: z.boolean(),
              })
              .strict()
              .nullable(),
            estimatedCost: z.number().finite().nonnegative(),
            context: text,
            publicState: z
              .object({ visible: tri, enabled: tri, expanded: tri, selected: tri })
              .strict(),
            allowedActions: z
              .array(z.enum(['click', 'inspect']))
              .min(1)
              .max(2),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    history: z
      .array(
        z
          .object({
            targetKey: text,
            beforeStateVersion: text,
            afterStateVersion: text,
            action: z.enum(['click', 'inspect']),
            actualEffects: z.array(z.enum(['expanded', 'content-changed', 'navigated'])),
            outcome: z.enum(['observed', 'failed', 'unknown']),
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
export type Question = {
  type: 'score' | 'choice'
  instructions: string
  criteria: readonly string[] | Record<string, string>
}
export type Compiled = {
  wire: string
  wireDigest: string
  requestDigest: string
  byteLength: number
  mapping: Record<string, { candidateId: string; dimension: 'relevance' | 'informationGain' }>
  questions: Record<string, Question>
}
export function compileRequest(
  request: { system: string; body: string },
  rawProfile: Profile,
  maxBytes = 32768,
): Compiled {
  const profile = profileSchema.parse(rawProfile)
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 32768)
    throw new Error('invalid-byte-limit')
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > maxBytes) throw new Error('request-size')
  const data = dataSchema.parse(parseStrictJson(request.body))
  if (new Set(data.candidates.map((c) => c.id)).size !== data.candidates.length)
    throw new Error('duplicate-candidate')
  if (
    data.candidates.some(
      (c) =>
        c.observationVersion !== data.page.observationVersion ||
        c.publicState.visible !== true ||
        c.publicState.enabled !== true,
    )
  )
    throw new Error('ineligible-candidate')
  const mapping: Compiled['mapping'] = {}
  const questions: Compiled['questions'] = {
    readiness: {
      type: 'choice',
      instructions: READINESS_TEMPLATE,
      criteria: { ...READINESS },
    },
  }
  data.candidates.forEach((c, index) => {
    for (const dimension of ['relevance', 'informationGain'] as const) {
      const key = `c${index}_${dimension}`
      mapping[key] = { candidateId: c.id, dimension }
      questions[key] = {
        type: 'score',
        instructions: SCORE_TEMPLATE.replace('{dimension}', dimension).replace(
          '{index}',
          String(index),
        ),
        criteria: [...RUBRIC[dimension]],
      }
    }
  })
  if (Object.keys(questions).length > profile.maxQuestions) throw new Error('question-limit')
  const wire = JSON.stringify({ model: profile.requestModel, state: data, questions })
  const byteLength = Buffer.byteLength(wire, 'utf8')
  if (byteLength > maxBytes) throw new Error('wire-size')
  return {
    wire,
    byteLength,
    questions,
    mapping,
    wireDigest: sha256(wire),
    requestDigest: sha256(JSON.stringify(request)),
  }
}
export function compileInput(
  raw: unknown,
  profile: Profile,
): { input: ExplorationInput; compiled: Compiled } {
  const result = parseExplorationInput(raw)
  if (!result.ok) throw new Error(result.detail)
  const request = buildScoringRequest(result.value)
  return {
    input: result.value,
    compiled: compileRequest(
      { system: request.system, body: request.body },
      profile,
      result.value.limits.maxInputBytes,
    ),
  }
}
