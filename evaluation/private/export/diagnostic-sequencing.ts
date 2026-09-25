/**
 * What a diagnostic must do to a variant, in order, before running the agent against it.
 *
 * Two of these are easy to omit and both fail quietly:
 *
 * - `fixture-verified` plus `truth-asserted`: the export arena's verification drives a real browser
 *   through the whole flow to prove the variant behaves as declared. Skipping the assertion means an
 *   unusable fixture is graded as a product result rather than reported as a broken fixture.
 *
 * - `arena-reset-after-verification`: that same verification *uses* the arena's one permitted
 *   create. Running the agent next leaves it clicking into `409 export-already-created`, so it can
 *   never decode a business fact, ends `blocked` with no findings, and looks like a product defect.
 *   The second paid diagnostic did exactly this on all five variants before the reset was added.
 *
 * Stated as data and checked as a set, so a runner can record which it performed and be told what it
 * left out - rather than relying on the order being remembered correctly in each call site.
 */
export const REQUIRED_RUN_PRECONDITIONS = Object.freeze([
  'fixture-verified',
  'arena-reset-after-verification',
  'truth-asserted',
] as const)

export type RunPrecondition = (typeof REQUIRED_RUN_PRECONDITIONS)[number]

/**
 * Which required preconditions a run did not perform.
 *
 * Empty means the run was prepared correctly. Non-empty is a reason not to treat its result as
 * evidence about the product.
 */
export function sequencingGaps(performed: readonly RunPrecondition[]): readonly RunPrecondition[] {
  const done = new Set(performed)
  return REQUIRED_RUN_PRECONDITIONS.filter((precondition) => !done.has(precondition))
}
