import { z } from 'zod'

/** Request-level opt-in. It never grants action, network or provider permissions. */
export const explorationRequestSchema = z
  .object({
    mode: z.literal('program'),
    jev: z.boolean().default(false),
  })
  .strict()
export const R1_PRODUCT_POLICY = Object.freeze({
  revision: 'r1-product-1',
  maxLocalChecksPerPage: 3,
  maxProgramSteps: 24,
  maxRevisits: 2,
  maxJevCalls: 2,
} as const)
export type ExplorationPolicy = typeof R1_PRODUCT_POLICY & {
  readonly mode: 'program'
  readonly jev: boolean
}
export function freezeExploration(
  input: z.infer<typeof explorationRequestSchema>,
): ExplorationPolicy {
  return { ...R1_PRODUCT_POLICY, ...explorationRequestSchema.parse(input) }
}
export function validExploration(input: unknown): input is ExplorationPolicy {
  if (!input || typeof input !== 'object') return false
  const value = input as ExplorationPolicy
  const parsed = explorationRequestSchema.safeParse({ mode: value.mode, jev: value.jev })
  return (
    parsed.success &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify(Object.keys(freezeExploration(parsed.data)).sort()) &&
    Object.entries(freezeExploration(parsed.data)).every(([k, v]) => (value as any)[k] === v)
  )
}

/** Exact exploration intents, not effect assertions or history/session restoration promises. */
export function explorationRevisitIntent(goal: string): 'refresh' | 'back' | undefined {
  const text = goal.trim().replace(/[.!。]$/, '')
  if (
    ['Refresh the page after inspecting its public controls', '检查公开控件后刷新页面'].includes(
      text,
    )
  )
    return 'refresh'
  if (
    ['Return to the previous page after visiting details', '访问详情后返回上一页面'].includes(text)
  )
    return 'back'
  return undefined
}
