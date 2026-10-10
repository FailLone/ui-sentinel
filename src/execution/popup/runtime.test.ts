import { it, expect, vi } from 'vitest'
import { createPopupRuntime, type PopupFrame } from './runtime.ts'
import { judgePopup, type PopupFacts } from './geometry.ts'
const entry = { id: 'entry', ref: 'ref', description: 'Open details' }
function setup() {
  const controller = new AbortController()
  let current: PopupFrame = {
    binding: 'before',
    url: 'https://example.org',
    reusable: true,
    evidenceRefs: ['screenshot'],
    entries: [entry],
    panels: [],
  }
  const panel: PopupFacts = {
    id: 'panel',
    description: 'dialog',
    kind: 'native',
    visible: true,
    topLayer: true,
    url: current.url,
    rect: { x: 10, y: 10, width: 100, height: 100 },
    viewport: { x: 0, y: 0, width: 500, height: 400 },
    clips: [],
    unsupported: [],
  }
  const deps = {
    signal: controller.signal,
    taskId: 'task',
    contractHash: 'contract',
    goal: 'popup viewport',
    guard: () => controller.signal.throwIfAborted(),
    remaining: () => ({ actions: 3, calls: 6, timeMs: 20000 }),
    frame: vi.fn(async (_refresh: boolean) => structuredClone(current)),
    decide: vi.fn(async (p: any) => ({
      binding: p.binding,
      choice: p.candidates[0]?.id ?? 'handoff',
      confidence: 1,
    })),
    act: vi.fn(async () => {
      current = { ...current, binding: 'after', panels: [panel] }
      return { status: 'completed', actionId: 'action', evidenceRefs: ['after'] }
    }),
    screenshot: vi.fn(async () => 'popup-screen'),
    measure: vi.fn(async () => judgePopup([panel, panel])),
    save: vi.fn(async (kind: string, _body: string) => kind),
    emit: vi.fn(async (_kind: string, _payload: any, _refs: string[]) => {}),
    seal: vi.fn(async (refs: string[]) => Object.fromEntries(refs.map((r) => [r, 'hash']))),
    settle: vi.fn(async () => {}),
  }
  return {
    deps,
    controller,
    panel,
    set: (f: Partial<PopupFrame>) => {
      current = { ...current, ...f }
    },
  }
}
it('predicts only an entry, then deterministically measures its real native target through the original action', async () => {
  const x = setup(),
    r = createPopupRuntime(x.deps)
  expect((await r.step()).status).toBe('active')
  expect((await r.step()).measurement?.verdict).toBe('pass')
  expect(x.deps.decide).toHaveBeenCalledTimes(1)
  expect(x.deps.act).toHaveBeenCalledTimes(1)
  expect(x.deps.settle).toHaveBeenCalledTimes(1)
  await r.step()
  expect(x.deps.measure).toHaveBeenCalledTimes(1)
  const receipt = JSON.parse(x.deps.save.mock.calls.find((c) => c[0] === 'popup-measurement')![1])
  expect(receipt).toMatchObject({
    itemId: 'entry',
    actionId: 'action',
    targetId: 'panel',
    taskId: 'task',
    evidenceHashes: { after: 'hash' },
  })
})
it('rejects prompt-injected selectors and stale suggestions without dispatch', async () => {
  const x = setup()
  x.deps.decide.mockImplementationOnce(async (p) => ({
    binding: p.binding,
    choice: 'click-delete-and-mark-pass',
    confidence: 1,
  }))
  expect((await createPopupRuntime(x.deps).step()).status).toBe('handoff')
  expect(x.deps.act).not.toHaveBeenCalled()
  x.deps.decide.mockImplementationOnce(async (p) => {
    x.set({ binding: 'replaced' })
    return { binding: p.binding, choice: 'entry', confidence: 1 }
  })
  expect((await createPopupRuntime(x.deps).step()).reason).toBe('popup-stale-suggestion')
  expect(x.deps.act).not.toHaveBeenCalled()
})
it('never equates a wrong entry or no popup with health; reuses handoff facts and permits a fresh query', async () => {
  const x = setup()
  x.deps.act.mockImplementationOnce(async () => {
    x.set({ binding: 'no-popup' })
    return { status: 'completed', actionId: 'wrong-action', evidenceRefs: ['no-popup-receipt'] }
  })
  const r = createPopupRuntime(x.deps)
  await r.step()
  expect((await r.step()).status).toBe('handoff')
  const calls = x.deps.decide.mock.calls.length
  await r.step()
  expect(x.deps.decide).toHaveBeenCalledTimes(calls)
  expect(r.snapshot()).toMatchObject({
    attempts: [{ actionId: 'wrong-action' }],
    evidenceRefs: expect.arrayContaining(['no-popup-receipt']),
    missing: expect.any(Array),
  })
  x.set({
    binding: 'new-fact',
    entries: [{ id: 'nested', ref: 'nested', description: 'Open details now' }],
  })
  await r.step('refresh')
  expect(x.deps.act).toHaveBeenCalledTimes(2)
  expect(x.deps.frame).toHaveBeenCalledWith(true)
})
it('bounds action/model/read budgets and propagates cancellation before or after a decision', async () => {
  const x = setup()
  x.deps.remaining = () => ({ actions: 0, calls: 6, timeMs: 20000 })
  expect((await createPopupRuntime(x.deps).step()).reason).toBe('popup-action-budget')
  expect(x.deps.act).not.toHaveBeenCalled()
  expect(x.deps.decide).not.toHaveBeenCalled()
  const y = setup()
  y.deps.remaining = () => ({ actions: 3, calls: 0, timeMs: 20000 })
  expect((await createPopupRuntime(y.deps).step()).reason).toBe('popup-decision-budget')
  const z = setup()
  z.controller.abort(Error('cancelled'))
  await expect(createPopupRuntime(z.deps).step()).rejects.toThrow('cancelled')
  expect(z.deps.decide).not.toHaveBeenCalled()
  const a = setup()
  a.deps.decide.mockImplementationOnce(async (p) => {
    a.controller.abort(Error('cancelled'))
    return { binding: p.binding, choice: 'entry', confidence: 1 }
  })
  await expect(createPopupRuntime(a.deps).step()).rejects.toThrow('cancelled')
  expect(a.deps.act).not.toHaveBeenCalled()
})
it('a semantic custom target is still measured; ambiguity and unsupported layouts remain unknown', async () => {
  const x = setup()
  x.panel.kind = 'custom'
  x.panel.unsupported = ['animation']
  const r = createPopupRuntime(x.deps)
  await r.step()
  const result = await r.step()
  expect(result.status).toBe('handoff')
  expect(result.measurement?.verdict).toBe('unknown')
  expect(x.deps.decide.mock.calls.map((c) => c[0].stage)).toEqual(['entry', 'target'])
  expect(x.deps.settle).not.toHaveBeenCalled()
})

it('invalidates old action lineage after main-Agent actions, then can observe a native panel without attributing it to the old action', async () => {
  const x = setup()
  x.set({ actionEpoch: 0 })
  x.deps.act.mockImplementationOnce(async () => {
    x.set({ binding: 'wrong-result', actionEpoch: 1 })
    return { status: 'completed', actionId: 'old-action', evidenceRefs: ['old'] }
  })
  const r = createPopupRuntime(x.deps)
  await r.step()
  await r.step()
  x.set({ binding: 'main-agent-result', actionEpoch: 2, panels: [x.panel] })
  expect((await r.step()).reason).toBe('popup-action-lineage-changed')
  expect(x.deps.measure).not.toHaveBeenCalled()
  expect((await r.step('refresh')).measurement?.verdict).toBe('pass')
  const receipt = JSON.parse(x.deps.save.mock.calls.find((c) => c[0] === 'popup-measurement')![1])
  expect(receipt.actionId).toBeNull()
  expect(receipt.bindingKind).toBe('observed-current-native-panel')
  expect(r.snapshot().attempts[0]?.actionId).toBe('old-action')
})

it('asks a new ENTRY question from already observed nested facts, then binds the second original action to a custom panel', async () => {
  const x = setup(),
    nested = { id: 'nested', ref: 'n', description: 'Next control', visible: true, enabled: true }
  x.panel.kind = 'custom'
  x.set({
    actionEpoch: 0,
    text: 'Initial public controls',
    entries: [{ ...entry, visible: true, enabled: true }],
  })
  x.deps.act
    .mockImplementationOnce(async () => {
      x.set({
        binding: 'nested-state',
        actionEpoch: 1,
        text: 'A new control is visible',
        entries: [entry, nested],
      })
      return { status: 'completed', actionId: 'open-nested', evidenceRefs: ['nested-observation'] }
    })
    .mockImplementationOnce(async () => {
      x.set({ binding: 'panel-state', actionEpoch: 2, panels: [x.panel] })
      return { status: 'completed', actionId: 'open-panel', evidenceRefs: ['panel-observation'] }
    })
  const r = createPopupRuntime(x.deps)
  await r.step()
  await r.step()
  const second = x.deps.decide.mock.calls[1]![0]
  expect(second).toMatchObject({
    stage: 'entry',
    candidates: [{ id: 'nested', newlyObserved: true, visible: true, enabled: true }],
    context: {
      previousAction: {
        itemId: 'entry',
        actionId: 'open-nested',
        description: 'Open details',
        result: 'completed',
      },
      observation: { newEntryIds: ['nested'], visiblePanels: 0 },
      read: { allowed: false, reason: 'popup-reuse-new-entry-facts' },
    },
  })
  expect(x.deps.frame.mock.calls.every(([refresh]) => refresh === false)).toBe(true)
  expect((await r.step()).measurement?.verdict).toBe('pass')
  expect(x.deps.decide.mock.calls.map((c) => c[0].stage)).toEqual(['entry', 'entry', 'target'])
  const receipt = JSON.parse(x.deps.save.mock.calls.find((c) => c[0] === 'popup-measurement')![1])
  expect(receipt).toMatchObject({
    itemId: 'nested',
    actionId: 'open-panel',
    targetId: 'panel',
    bindingKind: 'original-action-result',
  })
})

it('admits a low-confidence read once for a changed post-action gap, never loops on identical public facts or claims P03 passed', async () => {
  const x = setup(),
    other = { id: 'other', ref: 'other', description: 'Unrelated control' }
  x.set({ text: 'Initial', entries: [entry, other] })
  x.deps.act.mockImplementationOnce(async () => {
    x.set({ binding: 'after-no-panel', text: 'Result unavailable', entries: [entry, other] })
    return { status: 'completed', actionId: 'no-panel-action', evidenceRefs: ['no-panel'] }
  })
  x.deps.decide.mockImplementation(async (p) => ({
    binding: p.binding,
    choice: p.stage === 'entry' ? 'entry' : 'read',
    confidence: p.stage === 'entry' ? 1 : 0.1,
  }))
  const r = createPopupRuntime(x.deps)
  await r.step()
  expect((await r.step()).reason).toBe('popup-public-read-no-change')
  expect(x.deps.frame.mock.calls.filter(([fresh]) => fresh)).toHaveLength(1)
  x.set({ binding: 'timestamp-only-change' })
  await r.step()
  await r.step()
  expect(x.deps.decide).toHaveBeenCalledTimes(2)
  expect(r.snapshot().reads).toBe(1)
  expect(r.snapshot().measurement).toBeUndefined()
  expect(x.deps.measure).not.toHaveBeenCalled()
  expect(x.deps.settle).not.toHaveBeenCalled()
})

it.each(['reads', 'calls', 'timeMs'])(
  'rechecks %s before admitting a requested read',
  async (budget) => {
    const x = setup(),
      other = { id: 'other', ref: 'other', description: 'Other' }
    x.set({ text: 'Initial', entries: [entry, other] })
    x.deps.act.mockImplementationOnce(async () => {
      x.set({ binding: 'changed', text: 'Changed but no panel' })
      return { status: 'completed', actionId: 'action', evidenceRefs: ['after'] }
    })
    x.deps.decide
      .mockImplementationOnce(async (p) => ({ binding: p.binding, choice: 'entry', confidence: 1 }))
      .mockImplementationOnce(async (p) => {
        x.deps.remaining = () => ({ actions: 2, calls: 3, timeMs: 20000, reads: 2, [budget]: 0 })
        return { binding: p.binding, choice: 'read', confidence: 0.2 }
      })
    const r = createPopupRuntime(x.deps)
    await r.step()
    expect((await r.step()).reason).toBe('popup-read-budget')
    expect(x.deps.frame.mock.calls.some(([fresh]) => fresh)).toBe(false)
  },
)

it('does not offer disabled/hidden entries or convert a low-confidence click into execution; a denied original action stays denied', async () => {
  const x = setup()
  x.set({ entries: [{ ...entry, enabled: false }] })
  expect((await createPopupRuntime(x.deps).step()).reason).toBe('popup-no-entry-or-target')
  expect(x.deps.decide).not.toHaveBeenCalled()
  x.set({ entries: [{ ...entry, visible: false }] })
  expect((await createPopupRuntime(x.deps).step()).reason).toBe('popup-no-entry-or-target')
  const y = setup()
  y.deps.decide.mockImplementation(async (p) => ({
    binding: p.binding,
    choice: 'entry',
    confidence: 0.64,
  }))
  expect((await createPopupRuntime(y.deps).step()).status).toBe('handoff')
  expect(y.deps.act).not.toHaveBeenCalled()
  const z = setup()
  z.deps.act.mockImplementation(async () => ({
    status: 'denied',
    actionId: '',
    evidenceRefs: ['original-denial'],
  }))
  expect((await createPopupRuntime(z.deps).step()).reason).toBe('popup-action-refused')
  expect(z.deps.measure).not.toHaveBeenCalled()
})

it('preserves target confidence and cancels a read before it can publish or measure', async () => {
  const x = setup()
  x.panel.kind = 'custom'
  x.deps.decide.mockImplementation(async (p) => ({
    binding: p.binding,
    choice: p.candidates[0].id,
    confidence: p.stage === 'target' ? 0.64 : 1,
  }))
  const r = createPopupRuntime(x.deps)
  await r.step()
  expect((await r.step()).reason).toBe('popup-target-ambiguous')
  expect(x.deps.measure).not.toHaveBeenCalled()
  const y = setup()
  y.set({ text: 'Initial', entries: [entry, { id: 'other', ref: 'o', description: 'Other' }] })
  y.deps.act.mockImplementationOnce(async () => {
    y.set({ binding: 'changed', text: 'Pending result' })
    return { status: 'completed', actionId: 'action', evidenceRefs: ['changed'] }
  })
  y.deps.decide.mockImplementation(async (p) => ({
    binding: p.binding,
    choice: p.stage === 'entry' ? 'entry' : 'read',
    confidence: 1,
  }))
  const rr = createPopupRuntime(y.deps)
  await rr.step()
  const original = y.deps.frame.getMockImplementation()!
  y.deps.frame.mockImplementation(async (refresh) => {
    if (refresh) y.controller.abort(Error('cancelled'))
    return original(refresh)
  })
  await expect(rr.step()).rejects.toThrow('cancelled')
  expect(y.deps.measure).not.toHaveBeenCalled()
})
