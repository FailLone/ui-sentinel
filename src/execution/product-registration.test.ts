import { describe, it, expect, vi } from 'vitest'
import { createProductPath } from './product-path.ts'
import { freezeProductSource } from '../inspection/product-source.ts'
import {
  citationSource,
  r4Draft,
  r4Quotes,
  r4WithReferences,
} from '../../scripts/validation/r2-citation-replay.ts'
function harness() {
  const events: any[] = [],
    progress = new Set<string>(),
    save = vi.fn(async () => 'artifact'),
    flush = vi.fn(async () => {})
  const runtime = createProductPath({
    source: freezeProductSource(citationSource),
    progress: (k) => {
      progress.add(k)
    },
    inspection: {
      scope: { createItem: () => ({ itemId: 'required' }), snapshot: () => ({ items: [] }) },
      flush,
    } as any,
    page: () => ({ url: () => 'http://localhost' }) as any,
    guard: () => {},
    events: async () => events,
    emit: async (type, payload, refs = []) => {
      const e = {
        id: 'e' + events.length,
        seq: events.length + 1,
        type,
        payload,
        evidenceRefs: refs,
      }
      events.push(e)
      return e as any
    },
    save,
    selector: async () => '',
    remaining: () => ({ actions: 8, modelCalls: 20, timeMs: 1000 }),
    clean: () => true,
  })
  const tools: any = runtime.tools(async (_name, fn) => fn())
  const call = (name: string, args: any = {}) => tools[name].execute(args, {})
  const draft = async () => {
    const refs = new Map<string, string>()
    for (const q of r4Quotes) {
      const r = await call('product_source_search', { quote: q, offset: 0 })
      refs.set(q, r.matches[0].citation.citationId)
    }
    return r4WithReferences(refs)
  }
  return { events, progress, save, runtime, call, draft }
}
describe('registration repair and bounded source progress', () => {
  it('rejects wrong offsets without a plan/action/evidence, then accepts referenced repair exactly once', async () => {
    const h = harness()
    const bad = await h.call('product_path_register', r4Draft())
    expect(bad.diagnostics[0].field).toBe('steps[0].citation')
    expect(bad.registration.phase).toBe('repair-needed')
    expect(h.save).not.toHaveBeenCalled()
    expect(h.events.map((e) => e.type)).toEqual(['product:registration-rejected'])
    await expect(h.runtime.assertAction(undefined)).rejects.toThrow('register-path-before')
    const raw = await h.draft(),
      good = await h.call('product_path_register', raw)
    expect(good.registration.phase).toBe('frozen')
    expect(good.complete).toBe(false)
    expect(h.save).toHaveBeenCalledTimes(1)
    await expect(h.call('product_path_register', raw)).rejects.toThrow('already-frozen')
    expect(h.events.filter((e) => e.type === 'product:planned')).toHaveLength(1)
  })
  it('ends registration repair after three rejected attempts and cannot reset it with reads', async () => {
    const h = harness()
    for (let i = 0; i < 3; i++) await h.call('product_path_register', r4Draft())
    const raw = await h.draft()
    const result = await h.call('product_path_register', raw)
    expect(result.error).toBe('product-registration-repair-limit')
    expect(result.registration.phase).toBe('exhausted')
    expect(h.save).not.toHaveBeenCalled()
    expect(h.events).toHaveLength(3)
  })
  it('rejects even first registration after an action started', async () => {
    const h = harness()
    const raw = await h.draft()
    h.events.push({ id: 'action', seq: 1, type: 'action:executing', payload: {}, evidenceRefs: [] })
    await expect(h.call('product_path_register', raw)).rejects.toThrow(
      'already-frozen-or-action-started',
    )
    expect(h.save).not.toHaveBeenCalled()
  })
  it('counts newly located source windows, never refreshed keywords or missing results', async () => {
    const h = harness()
    await h.call('product_source_search', { keyword: '预览', offset: 0 })
    expect([...h.progress]).toEqual(['source-page:0'])
    await h.call('product_source_search', { keyword: '详情', offset: 0 })
    await h.call('product_source_read', { offset: 0 })
    await h.draft()
    expect(h.progress.size).toBe(1)
    expect(
      await h.call('product_source_search', { keyword: '预览', quote: '预览', offset: 0 }),
    ).toHaveProperty('error')
    await h.call('product_source_search', { quote: 'not in source', offset: 0 })
    expect(h.progress.size).toBe(1)
  })
})
