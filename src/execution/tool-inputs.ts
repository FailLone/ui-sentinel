import { z } from 'zod'
import { hypothesisTriggers } from './task-state.ts'

export { actionInput } from './action-input.ts'

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
  sourceCandidates: z
    .array(
      z
        .object({
          itemId: z.string(),
          sourceRef: z.string().max(120),
          // A span is a homogeneous integer array. Avoid positional `items: [...]` in
          // the model-facing schema while preserving the original two-index contract
          // in runtime validation. This does not establish the cause of a provider 400.
          sourceSpan: z
            .array(z.number().int().min(0))
            .length(2)
            .refine((span) => span[1] >= 1, { message: 'sourceSpan[1] must be at least 1' })
            .describe('Exactly [start, end]: start is an integer >= 0; end is an integer >= 1.'),
          sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    )
    .max(12)
    .optional(),
  state: z.string(),
  unexploredBranches: z.array(
    z.object({ description: z.string(), trigger: z.enum(hypothesisTriggers) }),
  ),
  /**
   * The UI ledger's agent-side inputs (plan 5.2).
   *
   * `selectItems` chooses among targets the *current observation actually offered*, and `recordGap`
   * states an unfinished item with its own reason. Deliberately absent, and absent by design rather
   * than by omission: any field that would let the caller submit `verified`, set a status, or drop an
   * item. Those conclusions belong to the executor, which resolves an item from the receipt of a real
   * measurement - otherwise "checked" would mean "said so".
   */
  selectItems: z
    .array(z.object({ itemId: z.string(), basis: z.string() }))
    .max(12)
    .optional(),
  recordGap: z
    .object({
      url: z.string().optional(),
      reasonCode: z.string().min(1),
      detail: z.string().min(1),
    })
    .optional(),
})
