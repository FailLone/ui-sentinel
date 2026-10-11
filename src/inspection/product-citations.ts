import { TARGET_CONTRACT } from './product-repair.ts'
import { z } from 'zod'
import { productStepReview } from './product-readiness.ts'
import { sourceCitation, type ProductCitation, type ProductSource } from './product-source.ts'
import { productPlanInput, validateProductPlan } from './product-path.ts'

const citationInput = z.union([
  productPlanInput.shape.steps.element.shape.citation,
  z.object({ citationId: z.string().min(1) }).strict(),
])
const stepInput = productPlanInput.shape.steps.element
export const productRegisterInput = productPlanInput.extend({
  assumptions: productPlanInput.shape.assumptions.describe(
    'Unsupported hypotheses, not facts or unmeasured current-state predicates. Any unresolved assumption prevents executable registration; do not clear without source-based reclassification.',
  ),
  steps: z
    .array(
      stepInput.extend({
        citation: citationInput,
        targetName: stepInput.shape.targetName.describe(TARGET_CONTRACT),
        review: productStepReview
          .optional()
          .describe(
            'Required before executable registration. Self-review of the source, not verification evidence. Missing/false fields return repair diagnostics without freezing.',
          ),
        preconditions: z
          .array(stepInput.shape.preconditions.element.extend({ citation: citationInput }))
          .max(5)
          .describe(
            'All source business state conditions with supported expected predicates; measured at bind and before action. Target existence/uniqueness is structural admission via targetName, not a text predicate. Model must justify reclassification from source; separate unsupported conditions cannot be silently dropped.',
          ),
      }),
    )
    .min(1)
    .max(3),
})
export class ProductRegistrationError extends Error {
  constructor(
    message: string,
    public field: string,
    public nextAction: string,
  ) {
    super(message)
  }
}
export function resolveProductPlan(
  source: ProductSource,
  raw: unknown,
  issued: ReadonlyMap<string, ProductCitation>,
) {
  const draft = productRegisterInput.parse(raw)
  if (draft.sourceId !== source.sourceId || draft.contentHash !== source.contentHash)
    throw new ProductRegistrationError(
      'product-source-version-mismatch',
      'sourceId/contentHash',
      'Use product_source_overview for the current frozen identity; locate citations again.',
    )
  const resolve = (citation: z.infer<typeof citationInput>, field: string) => {
    if (!('citationId' in citation)) return citation
    const ref = issued.get(citation.citationId)
    if (
      !ref ||
      sourceCitation(source, ref.start, ref.end).citationId !== ref.citationId ||
      source.markdown.slice(ref.start, ref.end) !== ref.quote
    )
      throw new ProductRegistrationError(
        'product-citation-not-issued-for-source',
        field,
        'Use product_source_search with the exact quote, or product_source_read; choose a returned citationId. Never construct IDs.',
      )
    return { start: ref.start, end: ref.end, quote: ref.quote }
  }
  return validateProductPlan(source, {
    ...draft,
    steps: draft.steps.map(({ review: _review, ...s }, i) => ({
      ...s,
      citation: resolve(s.citation, `steps[${i}].citation`),
      preconditions: s.preconditions.map((p, j) => ({
        ...p,
        citation: resolve(p.citation, `steps[${i}].preconditions[${j}].citation`),
      })),
    })),
  })
}
export function registrationDiagnostics(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues.map((i) => ({
      field: i.path.join('.'),
      reason: i.message,
      nextAction:
        'Correct this input field; for a citation pass either {citationId} alone or the unchanged legacy {start,end,quote}.',
    }))
  if (error instanceof ProductRegistrationError)
    return [{ field: error.field, reason: error.message, nextAction: error.nextAction }]
  const e = error as Error & { field?: string }
  return [
    {
      field: e.field ?? 'plan',
      reason: e.message ?? String(error),
      nextAction: e.field?.includes('citation')
        ? 'Use product_source_search with this exact quote to obtain program-computed citationIds. If repeated, inspect returned contexts and select one; do not guess offsets.'
        : 'Correct the indicated field using the original source; if unsupported, finish unverified-scope. Do not change the source or infer expected values from actual output.',
    },
  ]
}
