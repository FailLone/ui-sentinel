import { z } from 'zod'
import type { ProductPlan } from './product-path.ts'
import type { ProductSource } from './product-source.ts'

/** Model attestation of a source review, not program evidence that language was understood. */
export const productStepReview = z
  .object({
    preconditionsComplete: z
      .boolean()
      .describe(
        'Using the relevant original text already returned, confirm every condition for this step is in preconditions, including dependencies on earlier results. limitation/unchecked do not register conditions. Read/search only a specific missing or truncated passage. False if uncertain.',
      ),
    predicatesDistinguishStates: z
      .boolean()
      .describe(
        'Confirm each effect and prerequisite predicate distinguishes its required state from alternative states in the source. Prefer equality for exact status labels; false if uncertain.',
      ),
    substringJustification: z
      .string()
      .trim()
      .min(1)
      .max(600)
      .optional()
      .describe(
        'Only when keeping text-contains despite overlapping quoted source literals: explain from source context why these alternatives do not make the selected predicate ambiguous. This explanation is not automatically verified.',
      ),
  })
  .strict()
export type ProductReadinessDiagnostic = {
  field: string
  reason: string
  nextAction: string
  alternatives?: string[]
}
export function productReadinessDiagnostics(
  source: ProductSource,
  plan: ProductPlan,
  reviews: readonly (z.infer<typeof productStepReview> | undefined)[],
) {
  const diagnostics: ProductReadinessDiagnostic[] = []
  const add = (field: string, reason: string, nextAction: string, alternatives?: string[]) =>
    diagnostics.push({ field, reason, nextAction, ...(alternatives ? { alternatives } : {}) })
  for (const [i] of plan.assumptions.entries())
    add(
      `assumptions[${i}]`,
      'product-unresolved-assumption',
      'Do not merely delete this assumption. Reclassify a source-explicit rule as a cited requirement, or an observable current-state condition as a cited measurable precondition checked by bind. If unsupported or not measurable, keep it unverified and run_finish(unverified-scope); do not invent a plan.',
    )
  // These are quoted text candidates, NOT inferred state labels or an extracted requirement list.
  const literals = [
    ...new Set(
      [...source.markdown.matchAll(/“([^”\n]{1,1000})”|"([^"\n]{1,1000})"/g)].map(
        (m) => m[1] ?? m[2]!,
      ),
    ),
  ]
  for (const [i, step] of plan.steps.entries()) {
    if (step.certainty !== 'explicit')
      add(
        `steps[${i}].certainty`,
        'product-requirement-not-explicit',
        'Register only source-explicit executable requirements. Ambiguous requirements remain unverified; a source citation alone is not semantic proof.',
      )
    for (const [j, p] of [step, ...step.preconditions].entries()) {
      const field = j === 0 ? `steps[${i}]` : `steps[${i}].preconditions[${j - 1}]`
      if (!p.expectation)
        add(
          field + '.expectation',
          'product-requirement-unmeasurable',
          'Provide a source-grounded supported predicate for this requirement before freezing; otherwise finish unverified-scope.',
        )
      if (p.expectation?.condition === 'text-contains') {
        const alternatives = literals
          .filter((v) => v !== p.expectation!.expected && v.includes(p.expectation!.expected))
          .slice(0, 8)
        if (alternatives.length && !reviews[i]?.substringJustification)
          add(
            field + '.expectation.condition',
            'product-substring-overlap-needs-review',
            'The predicate also accepts these quoted literals. They may describe different contexts; this is not a semantic classifier. For an exact status use text-equals. Keep text-contains only with a source-grounded step review.substringJustification explaining why the alternatives cannot confuse this check.',
            alternatives,
          )
      }
    }
    if (reviews[i]?.preconditionsComplete !== true)
      add(
        `steps[${i}].review.preconditionsComplete`,
        'product-preconditions-review-required',
        'Review the available original text for all conditions, including prior-step results; retrieve only a specific missing or truncated passage. Register each in preconditions with citation and predicate, not in limitation/unchecked. Confirm true only after this review; the program cannot detect every omitted natural-language condition.',
      )
    if (reviews[i]?.predicatesDistinguishStates !== true)
      add(
        `steps[${i}].review.predicatesDistinguishStates`,
        'product-predicate-review-required',
        'Check effects and prerequisites against alternative source states. Exact status labels normally require equality; substring matching must not accept a failure/unready label. Confirm true only after source review, not from actual page output.',
      )
  }
  return diagnostics
}
