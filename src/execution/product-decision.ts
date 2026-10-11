import { z } from 'zod'
import { productRegisterInput } from '../inspection/product-citations.ts'
import { productSourceReadInput, productSearchInput } from '../inspection/product-source.ts'
import { historyReadInput, toolResultReadInput } from './tool-inputs.ts'

// A finite source-evidence request, never an arbitrary tool proxy. Original schemas own arguments.
export const productEvidenceQuery = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('product_source_read'), args: productSourceReadInput }).strict(),
  z.object({ tool: z.literal('product_source_search'), args: productSearchInput }).strict(),
  z.object({ tool: z.literal('history_read'), args: historyReadInput }).strict(),
  z.object({ tool: z.literal('tool_result_read'), args: toolResultReadInput }).strict(),
])
export const productDecisionInput = z
  .object({
    decision: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('draft'), plan: productRegisterInput }).strict(),
      z
        .object({
          kind: z.literal('retrieve'),
          missing: z
            .string()
            .trim()
            .min(1)
            .max(800)
            .describe(
              'Specific missing source fact, passage, citation or omitted receipt needed for the path. Naming a gap is not progress or proof of necessity.',
            ),
          queries: z.array(productEvidenceQuery).min(1).max(3),
        })
        .strict(),
      z
        .object({
          kind: z.literal('unsupported'),
          reason: z
            .string()
            .trim()
            .min(1)
            .max(1200)
            .describe(
              'Explain what the available source does not support or why the selected path cannot be validated. This is an Agent explanation, not verified blocker evidence.',
            ),
          unchecked: z.array(z.string().trim().min(1).max(400)).min(1).max(8),
        })
        .strict(),
    ]),
  })
  .strict()
export type ProductEvidenceQuery = z.infer<typeof productEvidenceQuery>
