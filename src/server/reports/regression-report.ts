import type { RunEvent } from '../../shared/types.ts'
import type { compareIdentity, compareStep } from '../../execution/path-reuse/changes.ts'
import type { productPathReport } from '../../inspection/product-path.ts'

/** Comparison is explanatory. Verification always comes from the original evidence projection. */
export function regressionReport(
  events: readonly RunEvent[],
  product: ReturnType<typeof productPathReport>,
) {
  const identityEvent = events.find((e) => e.type === 'path-regression:identity')
  if (!identityEvent) return undefined
  const identity = identityEvent.payload as ReturnType<typeof compareIdentity>
  const finished = events.find((e) => e.type === 'path-reuse:finished')?.payload
  return {
    identity,
    identityEventId: identityEvent.id,
    decision: finished?.status ?? 'interrupted-or-running',
    reason: finished?.reason ?? 'No completion result; never replay automatically.',
    history: 'reference-only',
    steps: identity.historicalSteps.map((title, index) => {
      const observed = events.find(
        (e) => e.type === 'path-regression:observed' && e.payload.index === index,
      )
      // A new source may produce a different plan: its step numbers do not identify old steps.
      const current =
        identity.sourceMatches && identity.entryMatches ? product.steps[index] : undefined
      const state =
        current?.state === 'verified'
          ? 'newly-verified'
          : current?.state === 'failed'
            ? 'newly-failed'
            : 'unchecked'
      const invalidation = events.find(
        (e) => e.type === 'path-regression:invalidated' && e.payload.index === index,
      )
      const change = (invalidation?.payload.comparison ?? observed?.payload) as
        | ReturnType<typeof compareStep>
        | undefined
      return {
        index,
        title,
        state,
        change,
        observationEventId: invalidation?.id ?? observed?.id,
        invalidationReason: invalidation?.payload.reason,
        comparisonStage: invalidation
          ? 'before-dispatch'
          : observed
            ? 'before-step'
            : 'not-reached',
        actionId: current?.actionId,
        evidenceRefs: current?.evidenceRefs ?? [],
        actual: current?.actual,
        preconditionMeasurements: current?.preconditionMeasurements,
        invalidated:
          !!invalidation ||
          !identity.entryMatches ||
          !identity.sourceMatches ||
          change?.recommendation === 'new-investigation' ||
          current?.reason === 'product-precondition-missing',
        recommendation:
          state === 'newly-verified'
            ? 'remeasured'
            : state === 'newly-failed'
              ? 'investigate-new-failure'
              : !identity.sourceMatches || !identity.entryMatches
                ? 'new-investigation'
                : observed
                  ? 'review-current-facts'
                  : 'not-reached',
      }
    }),
    limits:
      'Only the selected historical path is compared. Other pages, scripts, styles and unobserved dependencies remain unchecked. New-source investigations are reported separately in the current product report.',
  }
}
