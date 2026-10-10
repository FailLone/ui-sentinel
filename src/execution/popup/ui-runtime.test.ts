import { it, expect, vi } from 'vitest'
import { createPopupRuntime, type PopupFrame } from './runtime.ts'
import { judgePopup, type PopupFacts } from './geometry.ts'
import { choices } from '../../agent/popup/contract.ts'
function setup() {
  const controller = new AbortController()
  const panel: PopupFacts = {
    id: 'panel',
    kind: 'custom',
    description: 'Details overview',
    visible: true,
    url: 'https://example.org',
    rect: { x: 20, y: 120, width: 400, height: 150 },
    viewport: { x: 0, y: 0, width: 320, height: 480 },
    clips: [],
    unsupported: [],
    topLayer: false,
    surface: { position: 'fixed', border: true, shadow: false, opaque: true },
  }
  let frame: PopupFrame = {
    binding: 'before',
    url: panel.url,
    reusable: true,
    evidenceRefs: ['source'],
    entries: [{ id: 'entry', ref: 'entry', description: 'Open details' }],
    panels: [],
  }
  const deps = {
    signal: controller.signal,
    taskId: 'task',
    contractHash: 'contract',
    goal: 'UI floating geometry',
    guard: () => controller.signal.throwIfAborted(),
    remaining: () => ({ actions: 3, calls: 3, reads: 2, timeMs: 20000 }),
    frame: vi.fn(async () => structuredClone(frame)),
    decide: vi.fn(async (p: any) => ({
      binding: p.binding,
      choice: p.candidates[0].id,
      confidence: 1,
      probabilities: Object.fromEntries(
        Object.keys(choices(p)).map((id) => [id, id === p.candidates[0].id ? 1 : 0]),
      ),
    })),
    act: vi.fn(async () => {
      frame = { ...frame, binding: 'after', panels: [panel] }
      return { status: 'completed', actionId: 'action', evidenceRefs: ['action'] }
    }),
    consumeRead: vi.fn(),
    measure: vi.fn(async (_id: string, p: PopupFacts) => judgePopup([p, p])),
    screenshot: vi.fn(async () => 'screen'),
    save: vi.fn(async (kind: string, _body: string) => kind + '-' + Math.random()),
    seal: vi.fn(async (refs: string[]) => Object.fromEntries(refs.map((r) => [r, 'sha']))),
    emit: vi.fn(async (_kind: string, _payload: any, _refs: string[]) => {}),
    settle: vi.fn(async () => {}),
    recordUi: vi.fn(async () => {}),
    completeUi: vi.fn(async () => {}),
  }
  return {
    panel,
    deps,
    controller,
    set: (f: Partial<PopupFrame>) => {
      frame = { ...frame, ...f }
    },
  }
}
it('uses one real action and one measurement for UI, without asking TARGET or claiming a functional effect', async () => {
  const x = setup(),
    r = createPopupRuntime(x.deps)
  await r.step()
  expect((await r.step()).measurement?.verdict).toBe('fail')
  expect(x.deps.decide.mock.calls.map(([p]) => p.stage)).toEqual(['entry'])
  expect(x.deps.measure).toHaveBeenCalledTimes(1)
  expect(x.deps.settle).not.toHaveBeenCalled()
  expect(x.deps.recordUi).toHaveBeenCalledTimes(1)
  expect(x.deps.completeUi).toHaveBeenCalledTimes(1)
  const receipt = JSON.parse(x.deps.save.mock.calls.find(([k]) => k === 'popup-ui-measurement')![1])
  expect(receipt).toMatchObject({
    revision: 'popup-ui-measurement-2',
    relation: 'observed-visible-surface',
    actionId: null,
    itemId: null,
    reproduction: { actionId: 'action' },
  })
  await r.step()
  expect(x.deps.measure).toHaveBeenCalledTimes(1)
})
it('explores two nested entries without a redundant semantic target question', async () => {
  const x = setup()
  x.deps.act.mockImplementationOnce(async () => {
    x.set({ binding: 'nested', entries: [{ id: 'nested', ref: 'nested', description: 'Details' }] })
    return { status: 'completed', actionId: 'outer', evidenceRefs: ['nested'] }
  })
  const r = createPopupRuntime(x.deps)
  await r.step()
  await r.step()
  expect((await r.step()).status).toBe('measured')
  expect(x.deps.decide.mock.calls.map(([p]) => p.stage)).toEqual(['entry', 'entry'])
})
it('checks an already visible or asynchronously appearing surface without any original action association', async () => {
  const x = setup()
  x.set({ panels: [x.panel] })
  const r = createPopupRuntime(x.deps)
  expect((await r.step()).measurement?.verdict).toBe('fail')
  expect(x.deps.act).not.toHaveBeenCalled()
  expect(x.deps.decide).not.toHaveBeenCalled()
  const body = JSON.parse(x.deps.save.mock.calls.find(([k]) => k === 'popup-ui-measurement')![1])
  expect(body.reproduction).toBeNull()
})
it('checks multiple panels independently, sharing a screenshot; a failed panel is not hidden by a passing one', async () => {
  const x = setup()
  x.set({ panels: [x.panel, { ...x.panel, id: 'second', rect: { ...x.panel.rect, width: 100 } }] })
  const r = createPopupRuntime(x.deps),
    state = await r.step()
  expect(state.measurement?.verdict).toBe('fail')
  expect(x.deps.measure).toHaveBeenCalledTimes(2)
  expect(x.deps.screenshot).toHaveBeenCalledTimes(1)
  expect(x.deps.recordUi).toHaveBeenCalledTimes(2)
})
it.each(['type', 'paint', 'quota'] as const)(
  'keeps %s limits unknown without a button-causality gap',
  async (mode) => {
    const x = setup()
    if (mode === 'type') delete x.panel.surface
    if (mode === 'paint') x.panel.unsupported = ['animation']
    if (mode === 'quota')
      x.deps.remaining = () => ({ actions: 3, calls: 3, reads: 0, timeMs: 20000 })
    x.set({ panels: [x.panel] })
    const s = await createPopupRuntime(x.deps).step()
    expect(s.status).toBe('handoff')
    expect(s.measurement?.verdict).toBe('unknown')
    expect(s.missing.join()).not.toMatch(/action|causal|association/)
    expect(x.deps.completeUi).not.toHaveBeenCalled()
  },
)
it('retains incomplete coverage after the original two-read limit even when a measured panel fails', async () => {
  const x = setup()
  x.set({ panels: [x.panel, { ...x.panel, id: 'b' }, { ...x.panel, id: 'c' }] })
  const s = await createPopupRuntime(x.deps).step()
  expect(s.measurement?.verdict).toBe('unknown')
  expect(x.deps.measure).toHaveBeenCalledTimes(2)
  expect(x.deps.recordUi).toHaveBeenCalledTimes(2)
  expect(x.deps.completeUi).not.toHaveBeenCalled()
})
it.each(['cancel', 'replace', 'budget'] as const)(
  'does not publish late UI results after %s',
  async (mode) => {
    const x = setup()
    x.set({ panels: [x.panel] })
    x.deps.measure.mockImplementation(async (_id, p) => {
      if (mode === 'cancel') x.controller.abort(Error('cancelled'))
      if (mode === 'replace') x.set({ binding: 'replacement' })
      if (mode === 'budget')
        x.deps.remaining = () => ({ actions: 3, calls: 3, reads: 2, timeMs: 0 })
      return judgePopup([p, p])
    })
    const r = createPopupRuntime(x.deps)
    if (mode === 'cancel') await expect(r.step()).rejects.toThrow('cancelled')
    else expect((await r.step()).status).toBe('handoff')
    expect(x.deps.recordUi).not.toHaveBeenCalled()
    expect(x.deps.completeUi).not.toHaveBeenCalled()
  },
)
