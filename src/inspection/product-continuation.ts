import type { productPathReport, ProductPlan } from './product-path.ts'
import type { RunEvent } from '../shared/types.ts'

type Check = {
  input?: { selector?: string; condition?: string; expected?: string }
  measured?: { count?: number; values?: unknown[]; supported?: boolean } | null
  outcome: string
  reasonCode?: string
}

/** Array positions only: no inferred selector-to-requirement correspondence. */
export function productBindingInputDiagnostics(
  step: ProductPlan['steps'][number],
  selectors: readonly string[],
) {
  if (selectors.length === step.preconditions.length) return undefined
  return {
    field: 'preconditionSelectors',
    expectedCount: step.preconditions.length,
    receivedCount: selectors.length,
    requirements: step.preconditions.map((p, index) => ({
      index,
      field: `preconditionSelectors[${index}]`,
      description: p.description,
      expectation: p.expectation,
      citation: { start: p.citation.start, end: p.citation.end },
      suppliedSelector: selectors[index] ?? null,
    })),
    missingPositions: step.preconditions.flatMap((_, index) =>
      index >= selectors.length ? [index] : [],
    ),
    extraPositions: selectors.flatMap((_, index) =>
      index >= step.preconditions.length ? [index] : [],
    ),
    mapping:
      'Positional only; supplied selectors have not been measured or matched semantically. Recheck every index against its frozen requirement.',
  }
}

/** Feedback only: never chooses selectors, changes requirements, or authorizes an action. */
export function productBindingDiagnostics(checks: readonly Check[]) {
  return checks.flatMap((check, index) =>
    check.outcome === 'verified'
      ? []
      : [
          {
            field: `preconditionSelectors[${index}]`,
            selector: check.input?.selector,
            expectation: { condition: check.input?.condition, expected: check.input?.expected },
            measured: check.measured,
            outcome: check.outcome,
            reason: check.reasonCode,
            resolution:
              check.outcome === 'failed'
                ? 'prerequisite-not-satisfied'
                : check.measured?.supported === true &&
                    (check.measured.count === 0 || (check.measured.count ?? 0) > 1)
                  ? 'inspect-selector'
                  : 'measurement-unverified',
          },
        ],
  )
}

export function productContinuation(
  report: ReturnType<typeof productPathReport>,
  events: readonly RunEvent[],
) {
  const base = {
    advisoryOnly: true,
    completedSteps: report.steps.filter((s) => s.state === 'verified').map((s) => s.index),
  }
  const result = (phase: string, nextAction: string, extra = {}) => ({
    ...base,
    phase,
    nextAction,
    ...extra,
  })
  if (report.issues.length)
    return result(
      'unverified',
      'Evidence integrity is unresolved. Do not act or replace the frozen plan; report unverified scope.',
    )
  if (!report.plan)
    return result('registration-required', 'Follow registration diagnostics before any action.')
  const step = report.steps.find((s) => s.state !== 'verified')
  if (!step)
    return result(
      'path-evaluated',
      'Selected path evaluated. Finish remaining mandatory/default obligations; this is not permission to claim full coverage.',
    )
  const target = {
    step: step.index,
    targetName: step.targetName ?? step.title,
    action: step.action,
  }
  if (step.state === 'failed')
    return result(
      'effect-failed',
      'Preserve the original failed effect. Do not replay this action or continue dependent steps; report the failure and remaining scope.',
      target,
    )
  if (step.certainty !== 'explicit' || !step.expectation || report.plan.assumptions.length)
    return result(
      'unverified',
      'Frozen requirements are not executable. Do not replace the plan or act on assumptions; report unverified scope.',
      target,
    )
  const binding = events.find((e) => e.type === 'product:bound' && e.payload.step === step.index)
  const unmet = events
    .filter((e) => e.type === 'product:precondition-missing' && e.payload.step === step.index)
    .at(-1)
  if (step.actionId)
    return result(
      'verify-original-action',
      'The original action already occurred. Use read-only interaction_verify where valid or report unverified; never bind/click again.',
      { ...target, actionId: step.actionId, requirementId: step.requirementId },
    )
  if (unmet && (!binding || unmet.seq > binding.seq)) {
    const diagnostics = productBindingDiagnostics((unmet.payload.checks ?? []) as Check[])
    if (diagnostics.some((d) => d.resolution === 'prerequisite-not-satisfied'))
      return result(
        'prerequisite-not-satisfied',
        'A measured prerequisite is not satisfied. Stop this path and report the observed condition; do not change selectors to obtain a passing value or force an action.',
        { ...target, diagnostics },
      )
    if (diagnostics.length && diagnostics.every((d) => d.resolution === 'inspect-selector'))
      return result(
        'inspect-binding',
        'The prerequisite selector matched zero or multiple nodes; this does not establish the actual prerequisite state. Inspect the intended node with page_inspect/element_details, reuse its observed CSS selector, then retry bind for this same unexecuted step within existing budgets. Never weaken the expectation or substitute a different state area. Accessibility roles are not CSS tag names.',
        { ...target, diagnostics },
      )
    return result(
      'unverified',
      'Prerequisite measurement is unresolved. Use read-only evidence if supported or finish unverified; do not force an action.',
      { ...target, diagnostics },
    )
  }
  if (binding) {
    if (events.some((e) => e.type === 'action:executing' && e.seq > binding.seq))
      return result(
        'unverified',
        'Another action made this binding stale. Do not replay or bypass the binding gate; report unverified scope.',
        target,
      )
    return result(
      'act-bound-step',
      'Bind succeeded but performed no action. Use ordinary page_act for this bound control and frozen action/value; the executor still rechecks identity, prerequisites and permissions.',
      { ...target, ref: binding.payload.ref },
    )
  }
  const rejected = events
    .filter((e) => e.type === 'product:binding-rejected' && e.payload.step === step.index)
    .at(-1)
  if (rejected)
    return result(
      'repair-binding-input',
      'Supply exactly one observed DOM selector per frozen prerequisite in the listed order, then retry product_path_bind for this same unexecuted step. Reuse available DOM evidence; inspect only missing nodes. Missing positions do not identify which semantic condition was omitted. Do not remove requirements, guess selectors or act before successful binding.',
      { ...target, diagnostics: rejected.payload.diagnostics },
    )
  return result(
    'bind-next-step',
    'Bind this next frozen step using its current observed control ref and the original result/prerequisite nodes. Reuse available page_inspect/element_details evidence; if missing, inspect only the missing target/node. Do not reread unchanged source, re-register the plan, or replay completed steps.',
    target,
  )
}
