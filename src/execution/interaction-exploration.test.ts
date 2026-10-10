import { expect, it, vi } from 'vitest'
import { programInput } from './investigation/program.ts'
import { createInteractionExploration } from './interaction-exploration.ts'
import { createInspectionScope, projectInspectionScope } from '../inspection/scope.ts'

const program = {
  version: 1,
  phenomenon: 'Collect public evidence',
  basis: 'Bounded selected UI operation',
  exploration: {},
  targets: [{ name: 'control', selector: '#known-control' }],
  steps: [
    { op: 'act', type: 'click', target: 'control' },
    { op: 'measure', name: 'after' },
  ],
  assertions: [],
}
it('explicit evidence collection needs no placeholder predicate; ordinary comparison still needs one', () => {
  expect(programInput.safeParse(program).success).toBe(true)
  expect(programInput.safeParse({ ...program, exploration: undefined }).success).toBe(false)
})
it('exploration cannot disguise an effect or focus/body placeholder assertion', () => {
  for (const metric of ['focused', 'exists', 'text'])
    expect(
      programInput.safeParse({
        ...program,
        assertions: [
          {
            expectation: 'Pretend an effect',
            left: { sample: 'after', target: 'control', metric },
            operator: 'eq',
            right: { value: true },
          },
        ],
      }).success,
    ).toBe(false)
})
it('exploration is one click of one declared control, not a broader plan', () => {
  expect(
    programInput.safeParse({
      ...program,
      steps: [...program.steps, { op: 'act', type: 'click', target: 'control' }],
    }).success,
  ).toBe(false)
  expect(
    programInput.safeParse({
      ...program,
      targets: [
        ...program.targets,
        { name: 'future', selector: '#guessed', binding: 'post-action' },
      ],
    }).success,
  ).toBe(false)
  expect(
    programInput.safeParse({
      ...program,
      steps: [
        { op: 'act', type: 'fill', target: 'control', value: 'x' },
        { op: 'measure', name: 'after' },
      ],
    }).success,
  ).toBe(false)
})
function host() {
  let version = 1,
    clean = true,
    cancelled = false
  const snapshot = { dispose: vi.fn(async () => {}), evaluate: vi.fn() }
  const page = { url: () => 'https://example.test/', evaluateHandle: vi.fn(async () => snapshot) }
  const registry = createInteractionExploration({
    page: () => page as any,
    actionVersion: () => version,
    clean: () => clean,
    guard: () => {
      if (cancelled) throw Error('cancelled')
    },
    hashEvidence: async () => ({ owned: 'hash' }),
  })
  return {
    registry,
    page,
    snapshot,
    setVersion: (v: number) => (version = v),
    setClean: (v: boolean) => (clean = v),
    cancel: () => (cancelled = true),
  }
}
it('a requirement absent from the original goal is rejected before browser work', async () => {
  const h = host()
  await expect(
    h.registry.capture('Collect facts only', {
      condition: 'text-equals',
      expected: 'Observed afterwards',
      basis: 'invented',
    }),
  ).rejects.toThrow('original-user-goal')
  expect(h.page.evaluateHandle).not.toHaveBeenCalled()
})
it('cancellation and intervened evidence refuse capture before browser work', async () => {
  const a = host()
  a.cancel()
  await expect(a.registry.capture('goal')).rejects.toThrow('cancelled')
  expect(a.page.evaluateHandle).not.toHaveBeenCalled()
  const b = host()
  b.setClean(false)
  await expect(b.registry.capture('goal')).rejects.toThrow('intervened')
  expect(b.page.evaluateHandle).not.toHaveBeenCalled()
})
it('freezes the independent expectation and prevents repeat operation even after another action', async () => {
  const h = host(),
    effect = { condition: 'text-equals' as const, expected: 'Independent text', basis: 'Goal' }
  const before = await h.registry.capture('Show Independent text', effect)
  effect.expected = 'Changed afterwards'
  const check = await h.registry.register(
    before,
    { actionId: 'original-action', itemId: 'original-item' },
    ['owned'],
  )
  expect(check.effect?.expected).toBe('Independent text')
  h.setVersion(2)
  expect(h.registry.available()).toEqual([])
  expect(() => h.registry.assertNotRepeated('original-item')).toThrow('already-recorded')
  await h.registry.dispose()
  expect(h.snapshot.dispose).toHaveBeenCalledOnce()
})
it('unknown expectations do not become correct because a result was observed', async () => {
  const h = host(),
    before = await h.registry.capture('No functional expectation supplied')
  const c = await h.registry.register(before, { actionId: 'a', itemId: 'i' }, ['owned'])
  await expect(
    h.registry.run(c.checkRef, '#observed', async () => ({ outcome: 'verified' })),
  ).rejects.toThrow('no-independent-expectation')
})
it('pending evidence preserves identity, denominator and durable projection; it cannot reopen a measured check', () => {
  const scope = createInspectionScope()
  const i = scope.createItem({
    category: 'local-interaction',
    pageId: 's',
    stateId: 's',
    url: 'https://example.test/',
    observationVersion: 'v',
    basis: 'selected public control',
    targetSource: 'executor',
  })
  scope.appendPendingEvidence(i.itemId, {
    reasonCode: 'effect-not-tested',
    detail: 'collected evidence',
    evidenceRefs: ['before', 'after'],
    eventIds: ['action'],
  })
  expect(scope.snapshot().items[0]).toMatchObject({
    itemId: i.itemId,
    status: 'pending',
    resolvedAt: null,
    evidenceRefs: ['before', 'after'],
  })
  const events = scope.events().map((e, n) => ({
    ...e,
    id: String(n),
    runId: 'r',
    seq: n,
    timestamp: new Date().toISOString(),
    evidenceRefs: [],
  }))
  expect(projectInspectionScope(events as any).snapshot()).toEqual(scope.snapshot())
  scope.resolveItem(i.itemId, {
    status: 'verified',
    evidenceRefs: ['measurement'],
    eventIds: ['measured'],
    detail: 'actual effect',
  })
  expect(() =>
    scope.appendPendingEvidence(i.itemId, {
      reasonCode: 'retry',
      detail: 'reopen',
      evidenceRefs: [],
      eventIds: [],
    }),
  ).toThrow('not-pending')
})
