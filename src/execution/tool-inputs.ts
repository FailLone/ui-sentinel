import { z } from 'zod'
import { hypothesisTriggers } from './task-state.ts'

export const actionInput = z.object({
  type: z.enum(['click', 'probe', 'fill', 'navigate', 'scroll']),
  role: z.string().optional(),
  name: z.string().optional(),
  nth: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('0-based index when multiple elements match the same role+name'),
  selector: z.string().optional(),
  visualDescription: z.string().optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  scrollY: z.number().min(-1000).max(1000).optional(),
})

export const journeyInput = z.object({ journeyId: z.string(), revision: z.literal('1') })

export const ruleSearchInput = z.object({
  query: z.string().max(200),
  offset: z.number().int().min(0),
})

export const ruleDetailsInput = z.object({ ruleId: z.string() })

export const historyReadInput = z.object({
  start: z.number().int().min(0),
  count: z.number().int().min(1).max(3).default(1),
})

export const toolResultReadInput = z.object({
  resultRef: z.string().max(40),
  offset: z.number().int().min(0).default(0),
})

export const observeInput = z.object({})

export const checksInput = z.object({})

export const elementDetailsInput = z.object({ refs: z.array(z.string()).min(1).max(5) })

export const hypothesisInput = z.object({
  phenomenon: z.string(),
  basis: z.string(),
  verificationPlan: z.string(),
  trigger: z
    .enum(hypothesisTriggers)
    .default('always')
    .describe(
      'Use a conditional trigger only for an investigation applicable when that event occurs. Requirements alone are not defects.',
    ),
})

export const transitionInput = z.object({
  hypothesisId: z.string(),
  eventType: z.string(),
  fromState: z.string().optional(),
  toState: z.string().optional(),
  target: z.string(),
  elementRef: z.string().optional(),
  selector: z.string().optional(),
  condition: z.enum(['element-visible', 'element-actionable']).default('element-actionable'),
  durationMs: z.number().int().min(250).max(12000),
})

export const findingInput = z.object({
  hypothesisId: z.string(),
  validationStatus: z.enum(['candidate', 'supported', 'inconclusive', 'refuted']),
  severity: z.enum(['error', 'warning', 'info']),
  title: z.string(),
  expected: z.string(),
  actual: z.string(),
  evidenceRefs: z.array(z.string()),
})

export const explorationInput = z.object({
  state: z.string(),
  unexploredBranches: z.array(
    z.object({ description: z.string(), trigger: z.enum(hypothesisTriggers) }),
  ),
})
