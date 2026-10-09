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
