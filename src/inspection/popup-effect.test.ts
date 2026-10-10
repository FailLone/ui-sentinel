import { it, expect } from 'vitest'
import { evaluatePopupEffect } from './popup-effect.ts'
import { reviewPublicSources, type PublicNode, type PublicCheckPage } from './check-contract.ts'
import { resolveUiScanContract } from './contract.ts'
const node: PublicNode = {
  selector: '#panel',
  identity: 'node-1',
  tag: 'div',
  name: 'Details overview',
  text: 'Details overview',
  visible: true,
  truncated: false,
  attributes: {},
  popupSurface: { kind: 'custom', position: 'fixed', border: true, shadow: false, opaque: true },
}
const page = (nodes: PublicNode[]): PublicCheckPage => ({
  url: 'https://example.org/',
  documentVersion: 'observation',
  documentIdentity: 'doc',
  nodes,
  complete: true,
  total: nodes.length,
})
it('requires an explicit pre-action source, freezes exact popup matching, and never infers an expectation from a button name', () => {
  const control = { ...node, selector: '#button', tag: 'button', name: 'Details', text: 'Details' }
  for (const goal of [
    'After clicking "Details", show popup "Details overview".',
    'After clicking "Details", show any popup.',
    '检查弹窗是否超出视口。',
  ]) {
    const c = resolveUiScanContract(
      { kind: 'ui-scan', entryUrl: page([]).url, goal, popupCheck: { mode: 'popup-viewport' } },
      { reachableOrigins: [] },
    )
    if (c.kind !== 'resolved') throw Error('contract')
    const checks = reviewPublicSources({
      contract: c.contract,
      control,
      page: page([control, { ...node, visible: false }]),
      refs: ['before'],
      required: [],
    })
    expect(checks.effects).toHaveLength(goal.startsWith('After') ? 1 : 0)
    if (checks.effects[0])
      expect(checks.effects[0]).toMatchObject({
        sourceKind: 'original-goal',
        sourceText: goal,
        late: false,
        predicate: {
          condition: 'popup-visible',
          expected: goal.includes('any') ? '*' : 'Details overview',
        },
      })
  }
})
it('replays shared generic samples for direct, delayed, and explicitly any-popup expectations', () => {
  const before = page([{ ...node, visible: false }]),
    after = page([node])
  expect(evaluatePopupEffect(before, [before, after], 'Details overview').outcome).toBe('verified')
  expect(evaluatePopupEffect(before, [after, after], '*').outcome).toBe('verified')
})
it.each(['existing', 'error', 'multiple', 'unrelated', 'div', 'replaced', 'incomplete'] as const)(
  'keeps %s observations from satisfying the declared detail-popup effect',
  (mode) => {
    let before = page([{ ...node, visible: false }]),
      after = page([node]),
      other = after
    if (mode === 'existing') before = after
    if (mode === 'error' || mode === 'unrelated')
      after = other = page([
        { ...node, text: mode === 'error' ? 'Error' : 'Notification', name: 'Other' },
      ])
    if (mode === 'multiple')
      after = other = page([node, { ...node, selector: '#other', identity: 'node-2' }])
    if (mode === 'div') after = other = page([{ ...node, popupSurface: undefined }])
    if (mode === 'replaced') other = page([{ ...node, identity: 'replacement' }])
    if (mode === 'incomplete') after = { ...after, complete: false }
    expect(evaluatePopupEffect(before, [after, other], 'Details overview').outcome).toBe(
      'unverified',
    )
  },
)

it('allows multiple surfaces only for an explicit any-popup expectation and rejects a new document', () => {
  const before = page([]),
    after = page([node, { ...node, selector: '#two', identity: 'node-2' }])
  expect(evaluatePopupEffect(before, [after, after], '*').outcome).toBe('verified')
  expect(
    evaluatePopupEffect(before, [after, { ...after, documentIdentity: 'new-document' }], '*')
      .outcome,
  ).toBe('unverified')
})
