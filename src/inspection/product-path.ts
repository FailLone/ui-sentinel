import { evaluateInteraction } from '../execution/interaction-verification.ts'
import { z } from 'zod'
import {
  checkHash,
  type EffectRequirement,
  type PublicCheckPage,
  type PublicNode,
} from './check-contract.ts'
import { validProductSource, type ProductSource } from './product-source.ts'
import { projectInspectionScope } from './scope.ts'
import type { RunEvent } from '../shared/types.ts'

export const PRODUCT_SKILL_REVISION = 'product-path-1'
const citation = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().positive(),
    quote: z.string().min(1).max(4000),
  })
  .strict()
const expectation = z
  .object({
    condition: z.enum([
      'text-equals',
      'text-contains',
      'value-equals',
      'selected-label-equals',
      'expanded-equals',
    ]),
    expected: z.string().min(1).max(1000),
  })
  .strict()
export const productPlanInput = z
  .object({
    sourceId: z.string(),
    contentHash: z.string(),
    title: z.string().min(1).max(200),
    rationale: z.string().min(1).max(1000),
    unchecked: z.array(z.string().min(1).max(500)).min(1).max(20),
    assumptions: z.array(z.string().min(1).max(500)).max(10),
    steps: z
      .array(
        z
          .object({
            title: z.string().min(1).max(300),
            citation,
            certainty: z.enum(['explicit', 'ambiguous', 'assumption']),
            action: z.enum(['click', 'fill']),
            value: z.string().max(1000).optional(),
            expectation: expectation.optional(),
            timing: z.enum(['action-complete', 'unspecified']),
            preconditions: z
              .array(
                z
                  .object({
                    description: z.string().min(1).max(500),
                    citation,
                    expectation: expectation.optional(),
                  })
                  .strict(),
              )
              .max(5),
            limitation: z.string().max(1000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict()
export type ProductPlan = z.infer<typeof productPlanInput>
export const productBindInput = z
  .object({
    step: z.number().int().min(0).max(2),
    ref: z.string().min(1),
    resultSelector: z.string().min(1).max(500),
    preconditionSelectors: z.array(z.string().min(1).max(500)).max(5),
  })
  .strict()
export function validateProductPlan(source: ProductSource, raw: unknown): ProductPlan {
  const plan = productPlanInput.parse(raw)
  if (
    !validProductSource(source) ||
    source.sourceId !== plan.sourceId ||
    source.contentHash !== plan.contentHash
  )
    throw Error('product-source-version-mismatch')
  for (const step of plan.steps) {
    for (const c of [step.citation, ...step.preconditions.map((p) => p.citation)])
      if (c.end <= c.start || source.markdown.slice(c.start, c.end) !== c.quote)
        throw Error('product-citation-mismatch')
    for (const p of [step, ...step.preconditions])
      if (p.expectation && !p.citation.quote.includes(p.expectation.expected))
        throw Error('product-expectation-not-in-frozen-quote')
    if (
      step.timing === 'action-complete' &&
      !/immediate|synchronous|同步|立即|即时/i.test(step.citation.quote)
    )
      throw Error('product-explicit-timing-required')
    if (step.action === 'fill' && step.value === undefined)
      throw Error('product-fill-value-required')
  }
  return plan
}
export function productPlan(events: readonly RunEvent[]): ProductPlan | undefined {
  return events.find((e) => e.type === 'product:planned')?.payload.plan as ProductPlan | undefined
}
/** Reconstructed at review and during artifact validation from the same pre-action records. */
export function productEffects(
  source: ProductSource | undefined,
  events: readonly RunEvent[],
  itemId: string,
  page: PublicCheckPage,
  control: PublicNode,
): EffectRequirement[] {
  if (!source) return []
  const raw = productPlan(events)
  if (!raw) return []
  const plan = validateProductPlan(source, raw)
  return events
    .filter((e) => e.type === 'product:bound' && e.payload.itemId === itemId)
    .flatMap((binding) => {
      const step = plan.steps[Number(binding.payload.step)]
      if (
        !step ||
        (binding.payload.selector !== control.selector &&
          binding.payload.selector !== control.path) ||
        !step.expectation ||
        step.certainty !== 'explicit' ||
        plan.assumptions.length
      )
        return []
      const body = {
        sourceKind: 'product-source' as const,
        sourceId: `${source.sourceId}:step:${binding.payload.step}`,
        sourceHash: source.contentHash,
        sourceText: step.citation.quote,
        sourceSpan: [step.citation.start, step.citation.end] as [number, number],
        sourceRefs: [...binding.evidenceRefs],
        documentVersion: page.documentVersion,
        controlBinding: { selector: control.selector, name: control.name, tag: control.tag },
        actionContract: {
          type: step.action,
          ...(step.value === undefined ? {} : { value: step.value }),
        },
        relationKind: 'document-explicit-expectation',
        predicate: { ...step.expectation, selector: String(binding.payload.resultSelector) },
        evaluationPoint:
          step.timing === 'action-complete'
            ? ('action-complete' as const)
            : ('positive-only' as const),
      }
      const requirementHash = checkHash(body)
      return [
        {
          ...body,
          requirementHash,
          requirementId: `requirement:${requirementHash.slice(0, 24)}`,
          late: false,
          state: 'pending' as const,
          measurementRefs: [],
          eventIds: [],
        },
      ]
    })
}
export function productPathReport(
  source: ProductSource,
  events: readonly RunEvent[],
  readable?: ReadonlySet<string>,
  additionalIssues: readonly string[] = [],
) {
  const issues = [...additionalIssues]
  let plan: ProductPlan | undefined
  const planned = events.find((e) => e.type === 'product:planned')
  try {
    if (planned) plan = validateProductPlan(source, planned.payload.plan)
  } catch {
    issues.push('product-source-or-plan-invalid')
  }
  if (!validProductSource(source)) issues.push('product-source-integrity-mismatch')
  if (planned && events.some((e) => e.type === 'action:executing' && e.seq < planned.seq))
    issues.push('product-plan-after-action')
  if (events.filter((e) => e.type === 'product:planned').length > 1)
    issues.push('product-plan-replaced')
  if (events.some((e) => e.type === 'execution:intervention'))
    issues.push('product-evidence-intervened')
  const items = projectInspectionScope(events).snapshot().items
  const steps = (plan?.steps ?? []).map((step, index) => {
    const bindings = events.filter((e) => e.type === 'product:bound' && e.payload.step === index)
    const binding = bindings[0]
    const prerequisiteEvent =
      binding ??
      events
        .filter((e) => e.type === 'product:precondition-missing' && e.payload.step === index)
        .at(-1)
    const item = items.find((i) => i.itemId === binding?.payload.itemId)
    const effect = item?.checks?.effects.find(
      (e) => e.sourceKind === 'product-source' && e.sourceId === `${source.sourceId}:step:${index}`,
    )
    const action = events.find(
      (e) => e.type === 'action:executing' && e.actionId === item?.checks?.generic.actionId,
    )
    const measured = events.find(
      (e) => e.id === effect?.eventIds[0] && e.type === 'interaction:effect-measured-v2',
    )
    let reason = step.limitation || 'product-step-not-measured'
    let state: 'verified' | 'failed' | 'unverified' = 'unverified'
    const refs = [
      ...new Set([
        ...(planned?.evidenceRefs ?? []),
        ...(prerequisiteEvent?.evidenceRefs ?? []),
        ...(effect?.measurementRefs ?? []),
        ...(item?.checks?.generic.evidenceRefs ?? []),
      ]),
    ]
    if (step.certainty !== 'explicit' || !step.expectation || plan!.assumptions.length)
      reason = 'product-requirement-ambiguous-or-assumed'
    else if (
      binding &&
      bindings.length === 1 &&
      action &&
      planned &&
      binding.seq > planned.seq &&
      binding.seq < action.seq &&
      binding.payload.sourceHash === source.contentHash &&
      Array.isArray(binding.payload.checks) &&
      binding.payload.checks.length === step.preconditions.length &&
      binding.payload.checks.every((c: any, j: number) => {
        const p = step.preconditions[j]
        return (
          p?.expectation &&
          c.input?.condition === p.expectation.condition &&
          c.input?.expected === p.expectation.expected &&
          c.measured &&
          evaluateInteraction(c.input, c.measured) === 'verified'
        )
      }) &&
      measured &&
      measured.seq > action.seq &&
      measured.actionId === action.actionId &&
      measured.payload.requirementHash === effect?.requirementHash &&
      measured.payload.outcome === effect?.state &&
      ['verified', 'failed'].includes(effect?.state ?? '') &&
      item?.checks?.sourceReview.state === 'sealed' &&
      item?.checks?.generic.state === 'collected' &&
      refs.length > 0 &&
      (!readable || refs.every((ref) => readable.has(ref))) &&
      !issues.length
    ) {
      state = effect!.state as 'verified' | 'failed'
      reason = 'original-action-and-effect-measured'
    } else if (
      events.some((e) => e.type === 'product:precondition-missing' && e.payload.step === index)
    )
      reason = 'product-precondition-missing'
    else if (issues.length) reason = issues.join('; ')
    return {
      ...step,
      index,
      state,
      reason,
      itemId: item?.itemId,
      actionId: action?.actionId,
      requirementId: effect?.requirementId,
      evidenceRefs: refs,
      preconditionMeasurements: (prerequisiteEvent?.payload.checks ?? []) as {
        measured?: { values?: (string | null)[] }
        outcome: string
      }[],
      actual:
        (measured?.payload.measurement as { measured?: { values?: unknown[] } } | undefined)
          ?.measured?.values ?? [],
      eventIds: [prerequisiteEvent?.id, action?.id, measured?.id].filter(
        (id): id is string => !!id,
      ),
    }
  })
  // A failed earlier step cannot establish the later path's prerequisites.
  let priorComplete = true
  for (const step of steps) {
    if (!priorComplete) {
      step.state = 'unverified'
      step.reason = 'product-prior-step-not-passed'
    }
    priorComplete &&= step.state === 'verified'
  }
  const complete =
    !!plan &&
    steps.length > 0 &&
    steps.every((s) => s.state === 'verified' || s.state === 'failed') &&
    !issues.length
  return {
    source,
    skillRevision: PRODUCT_SKILL_REVISION,
    plan,
    steps,
    issues,
    complete,
    state: complete
      ? steps.some((s) => s.state === 'failed')
        ? 'failed'
        : 'verified'
      : 'unverified',
    unchecked: plan?.unchecked ?? ['资料尚未登记关键路径；全文未验证'],
    limitation:
      'Only the selected short path is evaluated; omitted document content is unchecked. Extraction is an Agent interpretation of the cited original.',
  }
}
