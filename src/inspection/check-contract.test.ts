import { freezeExploration } from '../shared/r1-policy.ts'
import { expect, it } from 'vitest'
import { buildUiContractSnapshot, verifyUiContractSnapshot } from './contract.ts'
import {
  UI_SAMPLING_POLICY,
  UI_SAMPLING_POLICY_V2,
  UI_CHECK_POLICY,
} from '../shared/ui-sampling-policy.ts'
import { UI_DEFAULT_GOAL } from '../shared/ui-goal.ts'
import {
  checkHash,
  parsePublicRelation,
  reviewPublicSources,
  checksStatus,
  checksValid,
  type PublicCheckPage,
  type PublicNode,
} from './check-contract.ts'
import { createInspectionScope, projectInspectionScope } from './scope.ts'
import { decideInspectionCompletion, verifyInspectionProof } from './completion.ts'
import { inspectionHistoryIssues } from './proof-history.ts'
const node = (
  selector: string,
  tag: string,
  text: string,
  attributes: Record<string, string> = {},
): PublicNode => ({ selector, tag, text, name: text, visible: true, attributes, truncated: false })
const control = node('#reveal', 'button', 'Reveal')
const page: PublicCheckPage = {
  url: 'https://example.org/',
  documentVersion: 'd1',
  nodes: [control],
  total: 1,
  complete: true,
}
function contract(goal = UI_DEFAULT_GOAL) {
  return buildUiContractSnapshot({
    entryUrl: page.url,
    origin: 'https://example.org',
    goal,
    samplingPolicy: UI_SAMPLING_POLICY_V2,
    scope: { maxPages: 3, maxDepth: 1 },
    access: { resourceOrigins: [], dataOrigins: [] },
    budget: { totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 },
  })
}
const review = (goal = UI_DEFAULT_GOAL, p = page) =>
  reviewPublicSources({
    contract: contract(goal),
    page: p,
    control: p.nodes.find((n) => n.selector === '#reveal')!,
    refs: ['shot.png', 'source.json'],
    required: [],
  })
it('D1/F13 freezes v2 semantics while legacy default and required snapshots retain original fields/hash', () => {
  const old = buildUiContractSnapshot({ ...contract(), samplingPolicy: UI_SAMPLING_POLICY })
  expect(old.policyRevision).toBe('url-scan-default-3')
  expect(old.checkPolicy).toBeUndefined()
  expect(verifyUiContractSnapshot(old)).toBe(true)
  const current = contract()
  expect(current.checkPolicy).toEqual(UI_CHECK_POLICY)
  expect(current.policyRevision).toBe('url-scan-default-4')
  expect(verifyUiContractSnapshot(current)).toBe(true)
  const { checkPolicy, ...missing } = current
  expect(
    verifyUiContractSnapshot({
      ...missing,
      hash: checkHash({ ...missing, hash: undefined }),
    } as any),
  ).toBe(false)
})
it('F01/F03 a neutral/default goal seals genuine unspecified semantics, not a literal token waiver', () => {
  const c = review()
  expect(c.effects).toEqual([])
  expect(c.sourceReview.state).toBe('sealed')
  expect(checksStatus(c)).toBe('pending')
  expect(
    parsePublicRelation(
      'Inspect the catalog UI and its controls within the allowed scope. Report evidence-backed issues and anything left unverified.',
    )?.focus,
  ).toBe(true)
  expect(review('Ready appears in this goal; do whatever.').sourceReview.state).toBe('unresolved')
})
it('F02/F03 only an entire explicit control/action/expectation relation produces a required effect with immutable identity', () => {
  const c = review('Synchronously after clicking "Reveal", show text "Ready".')
  expect(c.effects).toHaveLength(1)
  expect(c.effects[0]?.predicate.condition).toBe('text-contains')
  expect(c.effects[0]?.evaluationPoint).toBe('action-complete')
  expect(checksValid(c)).toBe(true)
  const changed = structuredClone(c)
  changed.effects[0]!.predicate.expected = 'Different'
  expect(checksValid(changed)).toBe(false)
  expect(
    review('After clicking "Reveal", show text exactly "Ready".').effects[0]?.predicate.condition,
  ).toBe('text-equals')
  expect(review('After clicking "Reveal", show text "Ready".').effects[0]?.evaluationPoint).toBe(
    'positive-only',
  )
})
it('F03 page declarations require actual described/control/list association; names or aria-controls alone are insufficient', () => {
  const p: PublicCheckPage = {
    ...page,
    nodes: [
      { ...control, attributes: { 'aria-describedby': 'spec', 'aria-controls': 'list' } },
      node(
        '#spec',
        'p',
        'Synchronously after clicking this button, numbers in its controlled list must be ascending.',
        { id: 'spec' },
      ),
      node('#list', 'ul', '8 3', { id: 'list' }),
      { ...node('#a', 'li', '8'), parentSelector: '#list' },
      { ...node('#b', 'li', '3'), parentSelector: '#list' },
    ],
    total: 5,
  }
  expect(review(UI_DEFAULT_GOAL, p).effects[0]?.predicate).toEqual({
    condition: 'numeric-ascending',
    expected: undefined,
    selector: '#list > *',
  })
  const empty = { ...p, nodes: p.nodes.filter((n) => n.selector !== '#spec'), total: 4 }
  expect(review(UI_DEFAULT_GOAL, empty).sourceReview.state).toBe('unresolved')
  const unlabeled = {
    ...page,
    nodes: [
      { ...control, attributes: { 'aria-controls': 'list' } },
      node('#list', 'section', 'Some content', { id: 'list' }),
    ],
    total: 2,
  }
  expect(review(UI_DEFAULT_GOAL, unlabeled).effects).toHaveLength(0)
})
it('F03/F04 missing descriptions, incomplete reads, ambiguous target and unsupported goals cannot become unspecified exemptions', () => {
  expect(review(UI_DEFAULT_GOAL, { ...page, complete: false }).sourceReview.state).toBe(
    'unresolved',
  )
  expect(
    review('After clicking "Reveal", show text "Ready".', {
      ...page,
      nodes: [control, { ...control, selector: '#second' }],
      total: 2,
    }).sourceReview.state,
  ).toBe('unresolved')
  expect(review('Make every mobile layout accessible.').sourceReview.reasons).toContain(
    'goal-unresolved',
  )
})
it('F02/F04 advanced requirements are unioned, conflict/overflow are mandatory gaps, generic collection cannot pay effects', () => {
  const checks = Array.from({ length: 13 }, (_, i) => ({
    id: 'c' + i,
    description: 'Declared effect',
    selector: '#reveal',
    action: 'click' as const,
    verify: {
      selector: '#out',
      condition: 'text-equals' as const,
      expected: String(i),
      basis: 'caller',
    },
  }))
  const c = reviewPublicSources({
    contract: contract(),
    page,
    control,
    refs: ['source.json'],
    required: checks,
  })
  expect(c.sourceReview.reasons).toContain('source-overflow')
  expect(c.sourceReview.reasons).toContain('source-conflict')
  expect(checksStatus(c)).toBe('unverified')
  const required = review('After clicking "Reveal", show text "Ready".')
  required.generic = {
    state: 'collected',
    actionId: 'a',
    receiptRef: 'r',
    checkRef: 'c',
    feedback: 'no-change-observed',
    evidenceRefs: ['before', 'after1', 'after2'],
    eventIds: ['e'],
  }
  expect(checksStatus(required)).toBe('pending')
})
it('F04/F05/F06 same-item reducer rejects effect deletion, action substitution and top-level resolution; late obligations retain facts and reopen aggregate only', () => {
  const scope = createInspectionScope()
  const i = scope.createItem({
    category: 'local-interaction',
    pageId: 's1',
    stateId: 's1',
    url: page.url,
    observationVersion: 'v',
    basis: 'public candidate',
    targetSource: 'executor',
    checks: review(),
  })
  const c = review()
  c.generic = {
    state: 'collected',
    actionId: 'a',
    checkRef: 'c',
    receiptRef: 'r',
    feedback: 'change-observed',
    evidenceRefs: ['before', 'after0', 'after1000'],
    eventIds: ['e'],
  }
  scope.updateChecks(i.itemId, c, 'generic collected')
  expect(scope.snapshot().items[0]?.status).toBe('verified')
  expect(() =>
    scope.resolveItem(i.itemId, {
      status: 'verified',
      evidenceRefs: ['unrelated'],
      eventIds: [],
      detail: 'bypass',
    }),
  ).toThrow('facet-reducer')
  const late = structuredClone(c)
  late.effects = review('After clicking "Reveal", show text "Ready".').effects.map((e) => ({
    ...e,
    late: true,
    state: 'unverified',
  }))
  late.sourceReview.state = 'unresolved'
  late.sourceReview.reasons = ['late-source-unverified']
  scope.updateChecks(i.itemId, late, 'late source')
  expect(scope.snapshot().items[0]?.status).toBe('unverified')
  expect(scope.snapshot().items[0]?.resolvedAt).toBeNull()
  expect(() => scope.updateChecks(i.itemId, c, 'delete requirement')).toThrow('cannot-be-removed')
})
it('F11/F12 proof4 refuses missing facets or incomplete collection and retains proof3 cancellation veto', () => {
  const spec = {
    kind: 'ui-scan' as const,
    goal: UI_DEFAULT_GOAL,
    entryUrl: page.url,
    environmentId: 'url-scan',
    uiContract: contract(),
    budget: contract().budget,
    viewport: { width: 1280, height: 768 },
  }
  const scope = createInspectionScope()
  const entry = scope.createItem({
    category: 'entry-observation',
    pageId: 's',
    stateId: 's',
    url: page.url,
    observationVersion: 'v',
    basis: 'observed',
    targetSource: 'executor',
  })
  scope.resolveItem(entry.itemId, {
    status: 'verified',
    evidenceRefs: ['source.json'],
    eventIds: [],
    detail: 'observed',
  })
  const local = scope.createItem({
    category: 'local-interaction',
    pageId: 's',
    stateId: 's',
    url: page.url,
    observationVersion: 'v',
    basis: 'candidate',
    targetSource: 'executor',
  })
  scope.resolveItem(local.itemId, {
    status: 'verified',
    evidenceRefs: ['source.json'],
    eventIds: [],
    detail: 'forged',
  })
  const facts = {
    kind: 'ui-scan' as const,
    featureEnabled: true,
    contractValid: true,
    contractHash: spec.uiContract.hash,
    spec,
    entryObserved: true,
    entryEvidenceRefs: ['source.json'],
    integrityEpoch: 0,
    scope,
    scopeEventIds: ['e'],
    pendingRules: 0,
    openHypotheses: 0,
    unsupportedRecorded: [],
  }
  expect(decideInspectionCompletion({ reason: 'scope-covered', facts }).accepted).toBe(false)
  const partial = decideInspectionCompletion({
    reason: 'unverified-scope',
    facts: { ...facts, unsupportedRecorded: ['missing-facets'] },
  })
  expect(partial.proof?.version).toBe('inspection-proof-4')
  expect(verifyInspectionProof(partial.proof)).toBe(true)
  const run = {
    id: 'run-test',
    spec,
    status: 'blocked' as const,
    businessResult: 'not-applicable' as const,
    stopReason: 'blocked' as const,
    usage: { actions: 0, modelCalls: 0, elapsedMs: 0, modelInputTokens: 0, modelOutputTokens: 0 },
    createdAt: 't',
    updatedAt: 't',
  }
  const events = [
    {
      id: 'f',
      runId: run.id,
      seq: 0,
      type: 'finish:accepted',
      timestamp: 't',
      stepId: null,
      actionId: null,
      evidenceRefs: [],
      payload: { reasonCode: 'unverified-scope', inspectionProof: partial.proof },
    },
    {
      id: 'c',
      runId: run.id,
      seq: 1,
      type: 'run:cancel-requested',
      timestamp: 't',
      stepId: null,
      actionId: null,
      evidenceRefs: [],
      payload: {},
    },
  ]
  expect(inspectionHistoryIssues(run, events)).toContain('inspection-cancelled')
})

it('R1 exact revisit intent is a focus only when opted in; mixed effect text stays unresolved', () => {
  const goal = '检查公开控件后刷新页面'
  const r1 = buildUiContractSnapshot({
    ...contract(goal),
    exploration: freezeExploration({ mode: 'program', jev: false }),
  })
  const examine = (c: typeof r1) =>
    reviewPublicSources({ contract: c, page, control, refs: ['source'], required: [] })
  expect(examine(r1).sourceReview.state).toBe('sealed')
  expect(examine(r1).effects).toEqual([])
  expect(review(goal).sourceReview.state).toBe('unresolved')
  expect(
    examine(
      buildUiContractSnapshot({
        ...r1,
        goal: goal + '，并确保付款成功',
        requestedGoal: goal + '，并确保付款成功',
      }),
    ).sourceReview.state,
  ).toBe('unresolved')
})
