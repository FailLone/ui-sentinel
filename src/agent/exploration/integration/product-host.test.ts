import { expect, it } from 'vitest'
import { createProductHost } from './product-host.ts'
import { freezeExploration } from '../../../shared/r1-policy.ts'
import { digest } from './host.ts'
const policy = freezeExploration({ mode: 'program', jev: true })
function input() {
  return {
    goal: 'Inspect the page',
    observation: {
      url: 'https://example.org/',
      pageText: 'Public controls',
      elements: ['Alpha', 'Beta'].map((text, i) => ({
        ref: 'e' + i,
        selector: '#e' + i,
        tag: 'button',
        text,
        visible: true,
        enabled: true,
        attributes: {},
      })),
    },
    inspectionScope: {
      candidates: [0, 1].map((i) => ({
        itemId: 'i' + i,
        ref: 'e' + i,
        category: 'local-interaction',
      })),
      checks: [0, 1].map((i) => ({
        itemId: 'i' + i,
        checks: {
          sourceReview: { state: 'sealed' },
          generic: { state: 'pending', evidenceRefs: [] },
          effects: [],
        },
      })),
      outstanding: [],
      checkInteractions: [],
    },
    r1: { selectedIds: ['i0', 'i1'], selectableIds: ['i0', 'i1'], initialSelectionIds: [] },
    evidenceIntegrity: { status: 'clean' },
    evidenceRefs: ['public-source'],
    budgetRemaining: { actions: 6, modelCalls: 8, timeMs: 10000 },
  }
}
const context = () => ({
  signal: new AbortController().signal,
  version: {
    key: 'v1',
    reusable: true,
    reason: 'static',
    planning: {
      documentId: 'doc',
      relatedState: 'state',
      targetKeys: { '#e0': 't0', '#e1': 't1' },
    },
  },
})
it('an explicit public target and singleton do not score; ambiguous identical labels hand back without selecting the first', async () => {
  let scores = 0
  const score = async () => {
    scores++
    throw Error('unexpected')
  }
  const a = input()
  a.goal = 'Inspect "Beta"'
  expect(await createProductHost(policy, { score }).decide(a, context())).toMatchObject({
    kind: 'tool',
    tool: 'page_act',
    args: { ref: 'e1' },
  })
  const b = input()
  b.observation.elements[1].text = 'Alpha'
  expect(await createProductHost(policy, { score }).decide(b, context())).toMatchObject({
    kind: 'handoff',
    reason: 'ambiguous-public-target',
  })
  const c = input()
  c.inspectionScope.candidates.pop()
  c.inspectionScope.checks.pop()
  c.observation.elements.pop()
  expect((await createProductHost(policy, { score }).decide(c, context())).kind).toBe('tool')
  expect(scores).toBe(0)
})
it('a score cannot override frame binding, cancellation, or its per-run call cap', async () => {
  const stale = createProductHost(policy, {
    score: async (f) => ({
      binding: 'stale',
      packetHash: digest(f),
      kind: 'scores',
      orderedIds: ['i1', 'i0'],
    }),
  })
  expect(await stale.decide(input(), context())).toMatchObject({
    kind: 'handoff',
    reason: 'stale-score',
  })
  let n = 0
  const host = createProductHost(policy, {
    score: async (f) => {
      n++
      return { binding: f.binding, packetHash: digest(f), kind: 'scores', orderedIds: ['i1', 'i0'] }
    },
  })
  await host.decide(input(), context())
  await host.decide(input(), context())
  expect(await host.decide(input(), context())).toMatchObject({
    kind: 'handoff',
    reason: 'jev-call-limit',
  })
  expect(n).toBe(2)
  const controller = new AbortController()
  controller.abort()
  await expect(host.decide(input(), { ...context(), signal: controller.signal })).rejects.toThrow()
})
it('a proposed action is never visited or verified until the executor returns its original action receipt', async () => {
  const host = createProductHost({ ...policy, jev: false }),
    raw = input(),
    ctx = context(),
    decision = await host.decide(raw, ctx)
  expect((host.snapshot() as any).attempts).toEqual([])
  host.recordOutcome(
    {
      decision,
      result: { status: 'denied', error: 'permission-denied' },
      observation: raw.observation,
      checks: [],
      evidenceRefs: [],
    },
    ctx.version,
  )
  expect((host.snapshot() as any).attempts).toEqual([])
  expect(await host.decide(raw, ctx)).toMatchObject({
    kind: 'handoff',
    reason: 'action-not-measured-or-refused',
  })
})
