import { createHash } from 'node:crypto'
import { checkHash } from '../../../src/inspection/check-contract.ts'

/** Operator-only packet review. Never included in the model request or page.
 * Intentionally narrow: unsupported predicates/selectors or incomplete evidence need human review.
 * Step indexes join the frozen records; they do NOT identify which step is the details action.
 */
export function detailVerdict(report: any, events: any[], artifacts: ReadonlyMap<string, Buffer>) {
  const manual = (reason: string) => ({
    hardStop: false,
    classification: 'unverified-or-missed-detail',
    reason,
    semanticAcceptance: 'pending-human-review',
    evidenceRefs: [] as string[],
  })
  const product = report.uiScan?.productSource
  if (
    report.persistence?.status !== 'verified' ||
    report.persistence?.issues?.length !== 0 ||
    product?.issues?.length !== 0 ||
    !Array.isArray(product?.steps) ||
    events.some((e) => e.runId !== report.runId)
  )
    return manual('packet-integrity-unverified')
  const one = (values: any[]) => {
    if (values.length !== 1) throw Error('missing-or-ambiguous-link')
    return values[0]
  }
  const event = (id: string, type: string) =>
    one(events.filter((e) => e.id === id && e.type === type))
  const artifact = (e: any, id: string) => {
    const bytes = artifacts.get(id)
    if (
      !bytes ||
      !e.evidenceRefs?.includes(id) ||
      e.payload.artifactHashes?.[id] !== createHash('sha256').update(bytes).digest('hex')
    )
      throw Error('artifact-missing-or-hash-mismatch')
    return JSON.parse(bytes.toString())
  }
  const node = (page: any, selector: string) => {
    if (!page?.complete || !page.documentIdentity) throw Error('incomplete-observation')
    const n = one(page.nodes.filter((n: any) => n.selector === selector || n.path === selector))
    if (!n.identity || !n.visible || n.truncated) throw Error('node-identity-unverified')
    return n
  }
  const results: any[] = []
  for (const step of product.steps) {
    try {
      const item = one(
        (report.uiScan.inspection.items ?? []).filter((i: any) => i.itemId === step.itemId),
      )
      const checks = item.checks
      if (checks?.generic?.state !== 'collected' || checks.sourceReview?.state !== 'sealed')
        throw Error('original-action-not-collected')
      const action = one(
        events.filter((e) => e.type === 'action:executing' && e.actionId === step.actionId),
      )
      const bindingEvent = one(
        events.filter(
          (e) =>
            e.type === 'product:bound' &&
            e.payload.itemId === item.itemId &&
            e.payload.step === step.index,
        ),
      )
      const binding = bindingEvent.payload
      const plan = event(binding.planEventId, 'product:planned')
      if (
        !(plan.seq < bindingEvent.seq && bindingEvent.seq < action.seq) ||
        action.payload.type !== 'click' ||
        checks.generic.actionId !== step.actionId ||
        !step.eventIds?.includes(bindingEvent.id) ||
        !step.eventIds?.includes(action.id)
      )
        throw Error('action-binding-order-mismatch')
      // Product binding receipt has the original payload before event artifactHashes were appended.
      const bindingReceipt = one(
        bindingEvent.evidenceRefs
          .filter((id: string) =>
            report.artifacts?.some((a: any) => a.id === id && a.type === 'product-binding'),
          )
          .map((id: string) => ({ id, body: artifact(bindingEvent, id) }))
          .filter(
            (a: any) =>
              a.body?.planEventId === binding.planEventId && a.body?.itemId === item.itemId,
          ),
      )
      const { artifactHashes: _hashes, ...boundPayload } = binding
      if (checkHash(bindingReceipt.body) !== checkHash(boundPayload))
        throw Error('binding-receipt-mismatch')
      const genericEvent = event(one(checks.generic.eventIds), 'interaction:generic-collected-v2')
      const generic = artifact(genericEvent, checks.generic.receiptRef)
      if (
        genericEvent.actionId !== step.actionId ||
        genericEvent.payload.receiptHash !== checkHash(generic) ||
        generic.actionId !== step.actionId ||
        generic.itemId !== item.itemId ||
        generic.action.type !== 'click' ||
        generic.integrity !== 'clean' ||
        !generic.sameDocument ||
        genericEvent.seq <= action.seq
      )
        throw Error('generic-action-mismatch')
      const control = node(generic.before.page, generic.controlSelector)
      const boundControl = node(generic.before.page, binding.selector)
      if (control.identity !== boundControl.identity) throw Error('control-binding-mismatch')
      // Private facts of this page family, resolved against the original observed node, not prose.
      if (control.attributes?.id === 'preview') {
        results.push({ kind: 'preview' })
        continue
      }
      if (
        control.tag !== 'button' ||
        control.parentSelector !== '#next' ||
        control.name !== '查看详情'
      )
        throw Error('detail-control-not-established')
      const effect = one(checks.effects.filter((e: any) => e.requirementId === step.requirementId))
      if (
        effect.sourceKind !== 'product-source' ||
        effect.sourceId !== `${product.source.sourceId}:step:${binding.step}` ||
        effect.sourceHash !== product.source.contentHash ||
        binding.sourceHash !== effect.sourceHash ||
        effect.actionContract?.type !== 'click' ||
        effect.evaluationPoint !== 'action-complete' ||
        effect.predicate?.expected !== '详情已就绪' ||
        !['text-equals', 'text-contains'].includes(effect.predicate?.condition) ||
        checkHash(step.expectation) !==
          checkHash({ condition: effect.predicate.condition, expected: effect.predicate.expected })
      )
        throw Error('detail-requirement-ambiguous')
      const citation = step.citation
      if (
        product.source.markdown.slice(citation.start, citation.end) !== citation.quote ||
        checkHash(effect.sourceSpan) !== checkHash([citation.start, citation.end]) ||
        checkHash(plan.payload.plan.steps[binding.step]?.citation) !== checkHash(citation) ||
        checkHash(plan.payload.plan.steps[binding.step]?.expectation) !==
          checkHash(step.expectation) ||
        checkHash(plan.payload.plan.steps[binding.step]) !==
          checkHash(product.plan.steps[step.index])
      )
        throw Error('frozen-source-link-mismatch')
      const {
        requirementHash,
        requirementId,
        late,
        state,
        measurementRefs,
        eventIds,
        ...requirementBody
      } = effect
      if (
        checkHash({ ...requirementBody, sourceText: citation.quote }) !== requirementHash ||
        !effect.sourceRefs?.includes(bindingReceipt.id)
      )
        throw Error('frozen-requirement-hash-mismatch')
      if (node(generic.before.page, effect.controlBinding.selector).identity !== control.identity)
        throw Error('effect-control-mismatch')
      const before = node(generic.before.page, effect.predicate.selector)
      if (
        before.attributes?.id !== 'details-state' ||
        node(generic.before.page, binding.resultSelector).identity !== before.identity
      )
        throw Error('detail-result-not-established')
      const afterPage = generic.after[0]?.page
      const after = node(afterPage, effect.predicate.selector)
      if (
        afterPage.documentIdentity !== generic.before.page.documentIdentity ||
        after.identity !== before.identity ||
        after.attributes?.id !== 'details-state'
      )
        throw Error('result-node-replaced')
      const measuredEvent = event(one(effect.eventIds), 'interaction:effect-measured-v2')
      const measured = artifact(measuredEvent, measuredEvent.payload.measurementRef)
      const m = measured.measurement
      if (
        measuredEvent.actionId !== step.actionId ||
        measuredEvent.seq <= action.seq ||
        measuredEvent.payload.sha256 !== checkHash(measured) ||
        measuredEvent.payload.requirementId !== effect.requirementId ||
        measuredEvent.payload.requirementHash !== effect.requirementHash ||
        measuredEvent.payload.itemId !== item.itemId ||
        measured.actionId !== step.actionId ||
        measured.itemId !== item.itemId ||
        measured.requirementId !== effect.requirementId ||
        measured.requirementHash !== effect.requirementHash ||
        measured.point !== 'action-complete' ||
        !step.eventIds.includes(measuredEvent.id) ||
        !effect.measurementRefs.includes(measuredEvent.payload.measurementRef) ||
        m?.input?.condition !== effect.predicate.condition ||
        m.input.expected !== effect.predicate.expected ||
        node(afterPage, m.input.selector).identity !== after.identity ||
        m.measured?.supported !== true ||
        m.measured.count !== 1 ||
        checkHash(m.measured.values) !== checkHash([after.text]) ||
        checkHash(step.actual) !== checkHash(m.measured.values) ||
        measured.outcome !== effect.state ||
        measuredEvent.payload.outcome !== measured.outcome ||
        m.outcome !== measured.outcome ||
        step.state !== measured.outcome
      )
        throw Error('measurement-link-incomplete')
      if (after.text !== '详情未能展示') throw Error('private-defect-observation-unconfirmed')
      results.push({
        kind: 'detail',
        state: step.state,
        actionId: step.actionId,
        requirementId: effect.requirementId,
        evidenceRefs: [
          bindingReceipt.id,
          checks.generic.receiptRef,
          measuredEvent.payload.measurementRef,
        ],
      })
    } catch (error) {
      results.push({ kind: 'unverified', reason: String(error) })
    }
  }
  const falsePass = results.find((r) => r.kind === 'detail' && r.state === 'verified')
  if (falsePass)
    return {
      hardStop: true,
      classification: 'false-verified-detail',
      reason: 'linked-detail-effect-credited-despite-original-wrong-result',
      semanticAcceptance: 'pending-human-review',
      ...falsePass,
    }
  if (results.some((r) => r.kind === 'unverified'))
    return { ...manual('incomplete-or-ambiguous-detail-link'), checks: results }
  if (results.some((r) => r.kind === 'detail' && r.state === 'failed'))
    return {
      ...manual('linked-detail-defect-correctly-failed'),
      classification: 'detail-defect-observed',
      checks: results,
    }
  return {
    ...manual('detail-not-measured'),
    classification: 'partial-detail-unchecked',
    checks: results,
  }
}
