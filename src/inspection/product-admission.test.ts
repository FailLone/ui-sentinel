import { describe, expect, it } from 'vitest'
import { freezeProductSource } from './product-source.ts'
import {
  productTarget,
  validateProductAdmission,
  validateProductPlan,
  productPathReport,
} from './product-path.ts'
import type { PublicCheckPage } from './check-contract.ts'
import type { RunEvent } from '../shared/types.ts'
const markdown = 'Click Details: immediately show Details ready.'
const source = freezeProductSource({ title: 'Dynamic details', markdown })
const plan = validateProductPlan(source, {
  sourceId: source.sourceId,
  contentHash: source.contentHash,
  title: 'Details',
  rationale: 'One frozen next step',
  unchecked: ['Saving'],
  assumptions: [],
  steps: [
    {
      title: 'Read details',
      targetName: 'Details',
      citation: { start: 0, end: markdown.length, quote: markdown },
      certainty: 'explicit',
      action: 'click',
      timing: 'action-complete',
      preconditions: [],
      expectation: { condition: 'text-equals', expected: 'Details ready' },
    },
  ],
})
const page = {
  url: 'http://localhost/catalog',
  documentVersion: 'v1',
  total: 1,
  complete: true,
  nodes: [
    {
      selector: '#details',
      path: 'button',
      identity: 'original-node',
      name: 'Details',
      tag: 'button',
      visible: true,
      attributes: {},
    },
  ],
} as PublicCheckPage
const admission = {
  page,
  identity: 'original-node',
  remaining: { actions: 1, modelCalls: 1, timeMs: 1000 },
}
describe('bounded source path target admission', () => {
  it('binds only the exact source name frozen before actions', () => {
    expect(validateProductAdmission(plan, 0, '#details', admission).identity).toBe('original-node')
    expect(() =>
      validateProductPlan(source, { ...plan, steps: [{ ...plan.steps[0], targetName: 'Extra' }] }),
    ).toThrow('name-not-in-frozen-quote')
    expect(() =>
      productTarget(
        plan.steps[0]!,
        { ...page, nodes: [{ ...page.nodes[0]!, name: 'Extra' }] },
        '#details',
      ),
    ).toThrow('not-unique-source-match')
  })
  it('refuses missing, hidden, duplicate or incompletely observed targets even with an exact selector', () => {
    for (const p of [
      { ...page, nodes: [] },
      { ...page, nodes: [{ ...page.nodes[0]!, visible: false }] },
      {
        ...page,
        nodes: [...page.nodes, { ...page.nodes[0]!, selector: '#other', identity: 'other' }],
      },
      { ...page, complete: false },
    ])
      expect(() => productTarget(plan.steps[0]!, p, '#details')).toThrow('not-unique-source-match')
  })
  it('refuses substituted identity and exhausted action, call or time budgets', () => {
    expect(() =>
      validateProductAdmission(plan, 0, '#details', { ...admission, identity: 'replacement' }),
    ).toThrow('identity-or-budget-invalid')
    for (const key of ['actions', 'modelCalls', 'timeMs']) {
      expect(() =>
        validateProductAdmission(plan, 0, '#details', {
          ...admission,
          remaining: { ...admission.remaining, [key]: 0 },
        }),
      ).toThrow('identity-or-budget-invalid')
    }
    const twoSteps = { ...plan, steps: [...plan.steps, ...plan.steps] }
    expect(() => validateProductAdmission(twoSteps, 0, '#details', admission)).toThrow(
      'identity-or-budget-invalid',
    )
  })
  it('keeps the stored skill revision when replaying old evidence', () => {
    const events = [
      {
        id: 'p',
        seq: 1,
        type: 'product:planned',
        payload: { plan, revision: 'product-path-1' },
        evidenceRefs: [],
      },
    ] as unknown as RunEvent[]
    expect(productPathReport(source, events).skillRevision).toBe('product-path-1')
  })
})
