import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { checkHash } from '../../src/inspection/check-contract.ts'
import { detailVerdict } from './detail-verdict.ts'

const markdown = readFileSync('evaluation/fixtures/r2-product-acceptance/product-spec.md', 'utf8')
const previewQuote = markdown.split('\n').find((l) => l.startsWith('访客点击“预览目录”'))!
const detailQuote = markdown.split('\n').find((l) => l.startsWith('只有预览状态'))!
/** Minimal synthetic packets using the real source and persisted v2 receipt/event shapes.
 * They are evaluator counterexamples, not new browser runs or evidence of model competence.
 */
function packet(
  options: {
    detail?: 'failed' | 'verified' | 'omit'
    broad?: boolean
    shortQuote?: boolean
    swapped?: boolean
  } = {},
) {
  const events: any[] = [],
    artifacts = new Map<string, Buffer>()
  const report: any = {
    runId: 'synthetic-r2-fix',
    persistence: { status: 'verified', issues: [] },
    artifacts: [],
    uiScan: {
      productSource: {
        source: { sourceId: 'source-r2', contentHash: 'source-hash', markdown },
        issues: [],
        steps: [],
        plan: { steps: [] },
      },
      inspection: { items: [] },
    },
  }
  let seq = 0
  const emit = (type: string, payload: any, actionId: string | null = null) => {
    const e = {
      id: 'event-' + ++seq,
      seq,
      type,
      payload,
      actionId,
      runId: report.runId,
      evidenceRefs: [] as string[],
    }
    events.push(e)
    return e
  }
  const attach = (e: any, type: string, body: any) => {
    const id = `${type}-${artifacts.size}.json`,
      bytes = Buffer.from(JSON.stringify(body))
    artifacts.set(id, bytes)
    e.evidenceRefs.push(id)
    e.payload.artifactHashes ??= {}
    e.payload.artifactHashes[id] = createHash('sha256').update(bytes).digest('hex')
    report.artifacts.push({ id, type })
    return id
  }
  const plan = emit('product:planned', { plan: report.uiScan.productSource.plan })
  const add = (kind: 'preview' | 'detail', index: number, state: string) => {
    const quote =
      kind === 'preview'
        ? previewQuote
        : options.shortQuote
          ? '访客点击“查看详情”后，详情状态应立即变为“详情已就绪”。'
          : detailQuote
    const expectation = {
      condition: options.broad && kind === 'detail' ? 'text-contains' : 'text-equals',
      expected: kind === 'preview' ? '预览就绪' : options.broad ? '详情' : '详情已就绪',
    }
    const step: any = {
      index,
      title: '任意合法标题 ' + index,
      action: 'click',
      citation: {
        start: markdown.indexOf(quote),
        end: markdown.indexOf(quote) + quote.length,
        quote,
      },
      expectation,
      timing: 'action-complete',
      preconditions: [],
    }
    report.uiScan.productSource.plan.steps[index] = structuredClone(step)
    const itemId = 'item-' + kind,
      actionId = 'action-' + kind,
      controlSelector = kind === 'preview' ? '#preview' : 'html > body > main > div > button',
      resultSelector = kind === 'preview' ? '#preview-state' : '#details-state'
    const binding = emit('product:bound', {
      step: index,
      itemId,
      selector: controlSelector,
      resultSelector,
      sourceHash: 'source-hash',
      planEventId: plan.id,
      targetWasSelected: kind === 'preview',
    })
    const bindingRef = attach(binding, 'product-binding', structuredClone(binding.payload))
    const action = emit('action:executing', { type: 'click' }, actionId)
    const control = {
      selector: controlSelector,
      path: controlSelector,
      identity: 'node-' + kind,
      visible: true,
      truncated: false,
      tag: 'button',
      name: kind === 'preview' ? '预览目录' : '查看详情',
      parentSelector: kind === 'preview' ? 'main' : '#next',
      attributes: kind === 'preview' ? { id: 'preview' } : {},
    }
    const result = {
      selector: resultSelector,
      path: 'html > body > main > section > p',
      identity: 'slot-' + kind,
      visible: true,
      truncated: false,
      tag: 'p',
      attributes: { id: resultSelector.slice(1) },
      text: kind === 'preview' ? '尚未预览' : '尚未查看',
    }
    const page: any = { documentIdentity: 'doc', complete: true, nodes: [control, result] }
    const after = structuredClone(page)
    after.nodes[1]!.text = kind === 'preview' ? '预览就绪' : '详情未能展示'
    const generic = {
      revision: 'generic-interaction-2',
      itemId,
      actionId,
      action: { type: 'click' },
      controlSelector,
      integrity: 'clean',
      sameDocument: true,
      before: { page },
      after: [{ page: after }],
    }
    const g = emit(
      'interaction:generic-collected-v2',
      { itemId, actionId, receiptHash: checkHash(generic) },
      actionId,
    )
    const receiptRef = attach(g, 'generic-interaction', generic)
    const effect: any = {
      requirementId: 'req-' + kind,
      sourceRefs: [bindingRef],
      sourceKind: 'product-source',
      sourceId: `source-r2:step:${index}`,
      sourceHash: 'source-hash',
      sourceSpan: [step.citation.start, step.citation.end],
      controlBinding: { selector: controlSelector },
      actionContract: { type: 'click' },
      evaluationPoint: 'action-complete',
      predicate: { ...expectation, selector: resultSelector },
      state,
    }
    const { requirementId: _id, state: _state, ...requirementBody } = effect
    effect.requirementHash = checkHash({ ...requirementBody, sourceText: quote })
    const measurement = {
      revision: 'effect-measurement-2',
      itemId,
      actionId,
      requirementId: effect.requirementId,
      requirementHash: effect.requirementHash,
      point: 'action-complete',
      outcome: state,
      measurement: {
        input: { ...effect.predicate },
        measured: { supported: true, count: 1, values: [after.nodes[1]!.text] },
        outcome: state,
      },
    }
    const m = emit(
      'interaction:effect-measured-v2',
      { ...structuredClone(measurement), sha256: checkHash(measurement) },
      actionId,
    )
    const measurementRef = attach(m, 'measurement', measurement)
    m.payload.measurementRef = measurementRef
    effect.eventIds = [m.id]
    effect.measurementRefs = [measurementRef]
    Object.assign(step, {
      state,
      itemId,
      actionId,
      requirementId: effect.requirementId,
      eventIds: [binding.id, action.id, m.id],
      actual: measurement.measurement.measured.values,
      evidenceRefs: [bindingRef, receiptRef, measurementRef],
    })
    report.uiScan.productSource.steps.push(step)
    report.uiScan.inspection.items.push({
      itemId,
      checks: {
        sourceReview: { state: 'sealed' },
        generic: { state: 'collected', actionId, receiptRef, eventIds: [g.id] },
        effects: [effect],
      },
    })
  }
  add('preview', options.swapped ? 1 : 0, 'verified')
  if (options.detail !== 'omit') add('detail', options.swapped ? 0 : 1, options.detail ?? 'failed')
  return { report, events, artifacts, run: () => detailVerdict(report, events, artifacts) }
}

it('reproduces the old false stop with the actual full preview quote; correct detail failure does not stop', () => {
  const p = packet()
  expect(previewQuote).toContain('查看详情')
  expect(
    p.report.uiScan.productSource.steps.some(
      (s: any) => s.citation.quote.includes('查看详情') && s.state === 'verified',
    ),
  ).toBe(true)
  expect(p.run()).toMatchObject({ hardStop: false, classification: 'detail-defect-observed' })
})
it('preview only is partial detail coverage, never false detail success', () => {
  expect(packet({ detail: 'omit' }).run()).toMatchObject({
    hardStop: false,
    classification: 'partial-detail-unchecked',
  })
})
it('stops only the exactly linked detail effect incorrectly credited against its original wrong result', () => {
  const v = packet({ detail: 'verified' }).run()
  expect(v).toMatchObject({
    hardStop: true,
    classification: 'false-verified-detail',
    actionId: 'action-detail',
    requirementId: 'req-detail',
  })
  expect(v.evidenceRefs).toHaveLength(3)
})
it.each(['failed', 'verified'] as const)(
  'legal citation boundaries, arbitrary titles and joined index changes preserve %s verdict',
  (state) => {
    const p = packet({ detail: state, shortQuote: true, swapped: true })
    expect(p.run().hardStop).toBe(state === 'verified')
    p.report.uiScan.productSource.steps.forEach((s: any) => (s.title = '另一个标题'))
    expect(p.run().hardStop).toBe(state === 'verified')
  },
)
it('a broad contains predicate goes to human review even when credited', () => {
  expect(packet({ detail: 'verified', broad: true }).run()).toMatchObject({
    hardStop: false,
    classification: 'unverified-or-missed-detail',
  })
})
it.each([
  'missing-binding',
  'wrong-action',
  'missing-measurement',
  'tampered-artifact',
  'duplicate-effect',
  'wrong-result-node',
] as const)('%s is unverified, never sufficient for a hard stop', (kind) => {
  const p = packet({ detail: 'verified' })
  const step = p.report.uiScan.productSource.steps[1]
  if (kind === 'missing-binding')
    p.events.splice(
      p.events.findIndex((e) => e.type === 'product:bound' && e.payload.itemId === step.itemId),
      1,
    )
  if (kind === 'wrong-action') step.actionId = 'other-action'
  if (kind === 'missing-measurement') p.artifacts.delete(step.evidenceRefs[2])
  if (kind === 'tampered-artifact') p.artifacts.set(step.evidenceRefs[2], Buffer.from('{}'))
  if (kind === 'duplicate-effect') {
    const effects = p.report.uiScan.inspection.items[1].checks.effects
    effects.push(structuredClone(effects[0]))
  }
  if (kind === 'wrong-result-node')
    p.report.uiScan.inspection.items[1].checks.effects[0].predicate.selector = '#preview-state'
  expect(p.run()).toMatchObject({ hardStop: false, classification: 'unverified-or-missed-detail' })
})
