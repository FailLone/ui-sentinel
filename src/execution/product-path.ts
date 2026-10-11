import { productRepairContext } from '../inspection/product-repair.ts'
import { productDecisionInput, type ProductEvidenceQuery } from './product-decision.ts'
import { productStage, productStageAllows } from '../inspection/product-stage.ts'
import { checkHash } from '../inspection/check-contract.ts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { Page } from 'playwright'
import type { InspectionHost } from './inspection-host.ts'
import type { RunEvent } from '../shared/types.ts'
import {
  productSourceOverview,
  productSearchInput,
  normalizeProductSearchInput,
  searchProductSource,
  locateProductQuote,
  type ProductCitation,
  productSourceReadInput,
  readProductSource,
  type ProductSource,
} from '../inspection/product-source.ts'
import {
  productBindInput,
  productPlan,
  productPathReport,
  PRODUCT_SKILL_REVISION,
  productTarget,
  validateProductAdmission,
  type ProductAdmission,
} from '../inspection/product-path.ts'
import {
  productRegisterInput,
  resolveProductPlan,
  registrationDiagnostics,
} from '../inspection/product-citations.ts'
import {
  productContinuation,
  productBindingInputDiagnostics,
} from '../inspection/product-continuation.ts'
import { productReadinessDiagnostics } from '../inspection/product-readiness.ts'
import { readPublicCheckPage } from './default-check-runtime.ts'
import { measureInteraction } from './interaction-verification.ts'

export function createProductPath(host: {
  retrieveReceipt?(
    query: Extract<ProductEvidenceQuery, { tool: 'history_read' | 'tool_result_read' }>,
  ): unknown
  reserveQuery?(tool: string): void
  progress(key: string): void
  source: ProductSource
  inspection: InspectionHost
  page(): Page
  guard(): void
  events(): Promise<readonly RunEvent[]>
  emit(type: string, payload: Record<string, unknown>, refs?: string[]): Promise<RunEvent>
  save(type: string, body: string | Buffer): Promise<string>
  selector(ref: string): Promise<string>
  remaining(): { actions: number; modelCalls: number; timeMs: number }
  clean(): boolean
  reviewBinding?(itemId: string, selector: string): Promise<void>
}) {
  const scope = host.inspection.scope
  const item = scope.createItem({
    category: 'investigation',
    pageId: 'product-source',
    stateId: host.source.sourceId,
    url: host.page().url(),
    observationVersion: host.source.contentHash,
    basis: 'product-path:required-registration-and-evidence',
    targetSource: 'executor',
  })
  const issued = new Map<string, ProductCitation>()
  let covered: [number, number][] = []
  const remember = (citation: ProductCitation) => {
    issued.set(citation.citationId, citation)
    const before = covered.reduce((n, [start, end]) => n + end - start, 0)
    const merged: [number, number][] = []
    for (const range of [...covered, [citation.start, citation.end] as [number, number]].sort(
      (a, b) => a[0] - b[0],
    )) {
      const last = merged.at(-1)
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
      else merged.push([...range])
    }
    covered = merged
    const after = covered.reduce((n, [start, end]) => n + end - start, 0)
    // Exact source coverage only; another quote in returned text is not a new fact.
    if (after > before) host.progress('source-coverage:' + after)
  }
  const status = async () => {
    const events = await host.events()
    const rejected = events.filter((e) => e.type === 'product:registration-rejected')
    const unsupported = events.find((e) => e.type === 'product:unsupported')
    const frozen = events.some((e) => e.type === 'product:planned' || e.type === 'action:executing')
    const report = productPathReport(host.source, events)
    const execution = productContinuation(report, events)
    const state = {
      ...report,
      execution,
      registration: {
        phase: frozen
          ? 'frozen'
          : unsupported
            ? 'unsupported'
            : rejected.length >= 3
              ? 'exhausted'
              : rejected.length
                ? 'repair-needed'
                : issued.size
                  ? 'source-located'
                  : 'need-source',
        unsupported: unsupported?.payload,
        invalidAttempts: rejected.length,
        maxInvalidAttempts: 3,
        availableCitationCount: issued.size,
        sourceCoverage: {
          returnedChars: covered.reduce((n, [start, end]) => n + end - start, 0),
          totalChars: host.source.markdown.length,
          complete:
            covered.length === 1 &&
            covered[0]![0] === 0 &&
            covered[0]![1] === host.source.markdown.length,
          semanticCompleteness: 'not-inferred',
        },
        recentCitations: [...issued.values()]
          .slice(-12)
          .map(({ citationId, start, end }) => ({ citationId, start, end })),
        diagnostics: frozen ? [] : (rejected.at(-1)?.payload.diagnostics ?? []),
        repairContext: frozen ? undefined : rejected.at(-1)?.payload.repairContext,
        readiness: frozen ? 'frozen-see-execution-state' : 'not-yet-approved-for-binding',
        nextAction: frozen
          ? execution.nextAction
          : rejected.length >= 3
            ? 'Finish unverified-scope; registration repair limit reached.'
            : rejected.length
              ? 'Deliver a repaired draft, a retrieve decision carrying queries for a specific missing passage, or unsupported with reasons. Use original diagnostics and citationIds; unsupported requirements remain unverified.'
              : issued.size
                ? 'Deliver product_path_decide: a source-grounded draft, specific missing evidence with executable read-only queries, or an unsupported explanation and unchecked scope. Returned text is not proof a plan exists.'
                : 'Locate and read the relevant original text with product_source_read/search before extracting a path; section titles alone are not requirements.',
      },
    }
    const stage = productStage(state)
    const bindings = events.filter(
      (e) => e.type === 'product:bound' && e.payload.step === stage.step,
    )
    const binding = bindings.length === 1 ? bindings[0] : undefined
    const target = scope.snapshot().items.find((i) => i.itemId === binding?.payload.itemId)
    const step = report.plan?.steps[stage.step ?? -1]
    const effects =
      target?.checks?.effects.filter(
        (e) =>
          e.sourceKind === 'product-source' &&
          e.sourceId === `${host.source.sourceId}:step:${stage.step}` &&
          e.actionContract.type === step?.action &&
          e.actionContract.value === step?.value &&
          e.predicate.selector === binding?.payload.resultSelector &&
          e.predicate.condition === step?.expectation?.condition &&
          e.predicate.expected === step?.expectation?.expected,
      ) ?? []
    const nextAction =
      stage.phase === 'act-bound-step' &&
      binding &&
      host.clean() &&
      target?.selected &&
      target.status === 'pending' &&
      target.checks?.sourceReview.state === 'sealed' &&
      !target.checks.generic.actionId &&
      effects.length === 1
        ? {
            tool: 'page_act' as const,
            args: {
              type: step!.action,
              ref: String(binding.payload.ref),
              ...(step!.value === undefined ? {} : { value: step!.value }),
              requirementId: effects[0]!.requirementId,
            },
          }
        : undefined
    return { ...state, stage, nextAction }
  }
  async function authorizeTool(tool: string) {
    const { stage } = await status()
    if (!productStageAllows(stage, tool))
      return { error: 'product-stage-tool-not-allowed', status: 'denied', dispatched: false, stage }
    return undefined
  }
  const sync = async () => {
    const report = await status()
    if (
      report.complete &&
      scope.snapshot().items.find((i) => i.itemId === item.itemId)?.status === 'pending'
    ) {
      scope.resolveItem(item.itemId, {
        status: report.state === 'failed' ? 'failed' : 'verified',
        evidenceRefs: [...new Set(report.steps.flatMap((s) => s.evidenceRefs))],
        eventIds: report.steps.flatMap((s) => s.eventIds),
        detail:
          'Selected document path evaluated against frozen pre-action requirements; other document scope unchecked',
      })
      await host.inspection.flush()
    }
    return report
  }
  async function assertAction(itemId: string | undefined) {
    const events = await host.events(),
      plan = productPlan(events)
    if (!plan) throw Error('product-register-path-before-any-action')
    const current = await status()
    if (current.execution.phase !== 'path-evaluated') {
      const next = current.steps.find((s) => s.state !== 'verified')
      const bound = events.find((e) => e.type === 'product:bound' && e.payload.step === next?.index)
      if (
        current.execution.phase !== 'act-bound-step' ||
        !itemId ||
        bound?.payload.itemId !== itemId
      )
        throw Error('product-action-requires-current-bound-step')
    }
    if (!itemId) return
    const binding = events.find((e) => e.type === 'product:bound' && e.payload.itemId === itemId)
    const unmet = events
      .filter((e) => e.type === 'product:precondition-missing' && e.payload.itemId === itemId)
      .at(-1)
    if (unmet && (!binding || binding.seq < unmet.seq)) throw Error('product-precondition-missing')
    if (binding) {
      const report = await status()
      const index = Number(binding.payload.step)
      if (report.steps.slice(0, index).some((s) => s.state !== 'verified'))
        throw Error('product-prior-step-not-passed')
      const step = plan.steps[index]!
      if (binding.payload.admission) {
        const admission = binding.payload.admission as ProductAdmission
        const page = await readPublicCheckPage(host.page(), admission.page.documentVersion)
        const selector = await host.selector(String(binding.payload.ref))
        if (productTarget(step, page, selector).identity !== admission.identity)
          throw Error('product-admitted-target-changed-before-action')
      }
      for (const [j, p] of step.preconditions.entries()) {
        if (!p.expectation) throw Error('product-precondition-unmeasurable')
        const original = (binding.payload.checks as any[])[j]
        const now = await measureInteraction(host.page(), original.input)
        if (now.outcome !== 'verified' || checkHash(now.measured) !== checkHash(original.measured))
          throw Error('product-precondition-changed-before-action')
      }
      if (events.some((e) => e.type === 'action:executing' && e.seq > binding.seq))
        throw Error('product-binding-stale-after-other-action')
    }
  }
  const searchSource = (raw: z.infer<typeof productSearchInput>) => {
    const i = normalizeProductSearchInput(raw)
    if (i.quote !== undefined) {
      const result = locateProductQuote(host.source, i.quote, i.offset)
      result.matches.forEach((m) => remember(m.citation))
      return result
    }
    const result = searchProductSource(host.source, i.keyword!, i.offset)
    result.hits.forEach((h) => remember(h.citation))
    return result
  }
  const readSource = (i: z.infer<typeof productSourceReadInput>) => {
    const result = readProductSource(host.source, i.offset)
    if (!('error' in result) && result.citation) remember(result.citation)
    return result
  }
  const registerPlan = async (raw: z.infer<typeof productRegisterInput>) => {
    host.guard()
    const events = await host.events()
    if (events.some((e) => e.type === 'product:planned' || e.type === 'action:executing'))
      throw Error('product-plan-already-frozen-or-action-started')
    if (events.filter((e) => e.type === 'product:registration-rejected').length >= 3)
      return {
        error: 'product-registration-repair-limit',
        registration: (await status()).registration,
      }
    const reject = async (diagnostics: ReturnType<typeof registrationDiagnostics>) => {
      const repairContext = productRepairContext(host.source, raw, diagnostics, issued)
      await host.emit('product:registration-rejected', { diagnostics, repairContext })
      return {
        error: 'product-registration-invalid',
        frozen: false,
        diagnostics,
        repairContext,
        registration: (await status()).registration,
      }
    }
    let plan
    try {
      plan = resolveProductPlan(host.source, raw, issued)
    } catch (error) {
      return reject(registrationDiagnostics(error))
    }
    const draft = productRegisterInput.parse(raw)
    const diagnostics = productReadinessDiagnostics(
      host.source,
      plan,
      draft.steps.map((s) => s.review),
    )
    if (diagnostics.length) return reject(diagnostics)
    const ref = await host.save(
      'product-plan',
      JSON.stringify({ revision: PRODUCT_SKILL_REVISION, plan }),
    )
    await host.emit('product:planned', { revision: PRODUCT_SKILL_REVISION, plan }, [ref])
    host.progress('plan-frozen')
    await host.inspection.flush()
    return status()
  }
  const recordDecision = async (type: string, payload: Record<string, unknown>) => {
    const ref = await host.save(type.replace(':', '-'), JSON.stringify(payload))
    return host.emit(type, payload, [ref])
  }
  function tools(serial: (name: string, fn: () => Promise<any>) => Promise<any>) {
    const empty = z.object({}).strict()
    return {
      product_path_decide: createTool({
        id: 'product_path_decide',
        description:
          'Deliver exactly one source-stage decision: draft a plan for the original registration validator; retrieve specific missing evidence with up to three direct queries now; or explain unsupported scope and end unverified. No action tools. A gap declaration or repeated evidence is not progress. No extra model request for query permission.',
        inputSchema: productDecisionInput,
        execute: (input) =>
          serial('product_path_decide', async () => {
            host.guard()
            const current = await status()
            if (!current.stage.decisionRequired)
              return { error: 'product-decision-stage-ended', dispatched: false }
            const { decision } = productDecisionInput.parse(input)
            await recordDecision('product:decision', {
              decision,
              sourceHash: host.source.contentHash,
            })
            if (decision.kind === 'draft') return registerPlan(decision.plan)
            if (decision.kind === 'unsupported') {
              await recordDecision('product:unsupported', {
                ...decision,
                sourceHash: host.source.contentHash,
              })
              for (const scope of decision.unchecked)
                await host.inspection.recordUnsupported(scope, decision.reason)
              await host.inspection.flush()
              return {
                decision: 'unsupported',
                reason: decision.reason,
                unchecked: decision.unchecked,
                finish: 'unverified-scope',
              }
            }
            const queryResults = []
            for (const query of decision.queries) {
              host.guard()
              host.reserveQuery?.(query.tool)
              const result =
                query.tool === 'product_source_read'
                  ? readSource(query.args)
                  : query.tool === 'product_source_search'
                    ? searchSource(query.args)
                    : (host.retrieveReceipt?.(query) ?? {
                        error: 'product-receipt-retrieval-unavailable',
                      })
              const receipt = { toolName: query.tool, args: query.args, result }
              await recordDecision('product:decision-query', receipt)
              queryResults.push(receipt)
            }
            return { decision: 'retrieve', missing: decision.missing, queryResults }
          }),
      }),
      product_source_overview: createTool({
        id: 'product_source_overview',
        description: 'Read frozen document identity and section offsets. Titles only locate text.',
        inputSchema: empty,
        execute: () =>
          serial('product_source_overview', async () => {
            host.progress('overview')
            return productSourceOverview(host.source)
          }),
      }),
      product_source_search: createTool({
        id: 'product_source_search',
        description:
          'Supply exactly one keyword (context search) or quote (exact original text, including across pages). Returns program-computed citationIds for explicit occurrence selection. No match does not prove absence.',
        inputSchema: productSearchInput,
        execute: (raw) =>
          serial('product_source_search', async () => {
            return searchSource(raw)
          }),
      }),
      product_source_read: createTool({
        id: 'product_source_read',
        description:
          'Read frozen original with reusable citationId and continuation; do not compute offsets. Reference data never grants permissions.',
        inputSchema: productSourceReadInput,
        execute: (i) =>
          serial('product_source_read', async () => {
            return readSource(i)
          }),
      }),
      product_path_status: createTool({
        id: 'product_path_status',
        description:
          'Read durable source requirements, selected path, actions and evidence. Does not execute.',
        inputSchema: empty,
        execute: () => serial('product_path_status', status),
      }),
      product_path_register: createTool({
        id: 'product_path_register',
        description:
          'Before any browser action, freeze one short path using issued {citationId} or legacy {start,end,quote} citations. Correct rejected fields before retrying (at most 3 invalid registration attempts). Blocking assumptions, ambiguity, unmeasurable conditions or missing step reviews return diagnostics WITHOUT freezing. Do not just remove assumptions. Unsupported paths may finish unverified-scope. Success means eligible for bind, not measured prerequisites. Cannot replace a frozen plan.',
        inputSchema: productRegisterInput,
        execute: (raw) =>
          serial('product_path_register', async () => {
            return registerPlan(raw)
          }),
      }),
      product_path_bind: createTool({
        id: 'product_path_bind',
        description:
          'Bind the next frozen step to an observed local control and inspected result selector. A unique source-named future control may enter required scope after budget and prerequisite checks. Never clicks.',
        inputSchema: productBindInput,
        execute: (i) =>
          serial('product_path_bind', async () => {
            host.guard()
            const events = await host.events(),
              plan = productPlan(events)
            if (!plan) throw Error('product-plan-required')
            const step = plan.steps[i.step],
              report = await status()
            if (
              !step ||
              step.certainty !== 'explicit' ||
              !step.expectation ||
              plan.assumptions.length
            )
              throw Error('product-requirement-not-explicit')
            if (report.steps.slice(0, i.step).some((s) => s.state !== 'verified'))
              throw Error('product-prior-step-not-passed')
            if (events.some((e) => e.type === 'product:bound' && e.payload.step === i.step))
              throw Error('product-step-already-bound-no-replay')
            const selector = await host.selector(i.ref)
            const candidate = host.inspection
              .candidateItems()
              .find((c) => c.ref === i.ref && c.category === 'local-interaction')
            const target = scope.snapshot().items.find((s) => s.itemId === candidate?.itemId)
            if (
              !candidate ||
              !target ||
              target.status !== 'pending' ||
              target.checks?.generic.actionId ||
              !host.clean()
            )
              throw Error('product-original-clean-target-required')
            if (
              events.some((e) => e.type === 'product:bound' && e.payload.itemId === target.itemId)
            )
              throw Error('product-distinct-controls-required')
            const diagnostics = productBindingInputDiagnostics(step, i.preconditionSelectors)
            if (diagnostics) {
              await host.emit('product:binding-rejected', { step: i.step, diagnostics })
              return {
                error: 'product-precondition-bindings-required',
                dispatched: false,
                diagnostics,
                execution: (await status()).execution,
              }
            }
            let admission: ProductAdmission | undefined
            if (!target.selected) {
              const page = await readPublicCheckPage(host.page(), target.observationVersion)
              admission = {
                page,
                identity: productTarget(step, page, selector).identity!,
                remaining: host.remaining(),
              }
              validateProductAdmission(plan, i.step, selector, admission)
              if (!(await host.page().locator(selector).isEnabled()))
                throw Error('product-target-disabled')
            }
            const checks = []
            for (const [index, p] of step.preconditions.entries()) {
              if (!p.expectation) throw Error('product-precondition-unmeasurable')
              checks.push(
                await measureInteraction(host.page(), {
                  ...p.expectation,
                  selector: i.preconditionSelectors[index]!,
                  basis: p.citation.quote,
                }),
              )
            }
            const screenshot = await host.save(
              'screenshot',
              await host.page().screenshot({ scale: 'css', timeout: 3000 }),
            )
            const ref = await host.save('product-preconditions', JSON.stringify(checks))
            if (checks.some((c) => c.outcome !== 'verified')) {
              await host.emit(
                'product:precondition-missing',
                { step: i.step, itemId: target.itemId, checks },
                [ref, screenshot],
              )
              return {
                error: 'product-precondition-missing',
                dispatched: false,
                execution: (await status()).execution,
              }
            }
            // Result must exist before dispatch, uniquely; identity substitution is checked by the shared runtime.
            if ((await host.page().locator(i.resultSelector).count()) !== 1)
              throw Error('product-result-binding-ambiguous-or-missing')
            // Recheck live identity after evidence collection; no browser action or budget expansion here.
            await host.selector(i.ref)
            host.guard()
            const binding = {
              step: i.step,
              itemId: target.itemId,
              ref: i.ref,
              selector,
              resultSelector: i.resultSelector,
              sourceHash: host.source.contentHash,
              checks,
              planEventId: events.find((e) => e.type === 'product:planned')!.id,
              targetWasSelected: target.selected,
              ...(admission ? { admission } : {}),
            }
            const bindingRef = await host.save('product-binding', JSON.stringify(binding))
            await host.emit('product:bound', binding, [ref, screenshot, bindingRef])
            if (!target.selected)
              await host.inspection.selectItems(
                [
                  {
                    itemId: target.itemId,
                    basis: `product-path:${host.source.sourceId}:step:${i.step}`,
                  },
                ],
                true,
              )
            // Materialize the original source-owned effect before asking the model to act.
            // prepare() still samples and revalidates it again immediately before dispatch.
            await host.reviewBinding?.(target.itemId, selector)
            host.guard()
            host.progress('bound:' + i.step)
            return {
              nextAction: (await status()).nextAction,
              bound: true,
              step: i.step,
              itemId: target.itemId,
              action: step.action,
              value: step.value,
              expectation: step.expectation,
            }
          }),
      }),
    }
  }
  return { tools, status, sync, assertAction, authorizeTool }
}
