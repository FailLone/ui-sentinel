import { describe, it, expect, vi } from 'vitest'
import { createProductPath } from './product-path.ts'
import {
  originalReadinessInput,
  correctedReadinessPlan,
  readinessRows,
} from '../../scripts/validation/r2-readiness-replay.ts'
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
    const raw = r4WithReferences(refs)
    for (const step of raw.steps)
      step.review = { preconditionsComplete: true, predicatesDistinguishStates: true }
    return raw
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
  it('counts exact new coverage within a window without counting repeated keywords or misses', async () => {
    const h = harness()
    await h.call('product_source_search', { quote: '预览', offset: 0 })
    const partial = (await h.runtime.status()).registration.sourceCoverage
    expect(partial.returnedChars).toBeLessThan(partial.totalChars)
    const before = [...h.progress]
    await h.call('product_source_search', { quote: '预览', offset: 0 })
    expect([...h.progress]).toEqual(before)
    await h.call('product_source_read', { offset: 0 })
    const complete = (await h.runtime.status()).registration.sourceCoverage
    expect(complete.complete).toBe(true)
    expect(complete.semanticCompleteness).toBe('not-inferred')
    expect(h.progress.size).toBeGreaterThan(before.length)
    const after = [...h.progress]
    await h.draft()
    await h.call('product_source_search', { quote: 'not in source', offset: 0 })
    expect([...h.progress]).toEqual(after)
  })
})

describe('real v3 plans rejected before irreversible freeze', () => {
  it.each(readinessRows)(
    '$row original blockers are diagnosed; source-based correction freezes once',
    async ({ row, originalPersistedPlan }) => {
      const h = harness()
      // Reissue the exact original read IDs; no private answers are supplied to the product.
      await h.call('product_source_read', { offset: 0 })
      await h.call('product_source_read', { offset: 131 })
      if (row === 'R5')
        for (const s of originalPersistedPlan.steps)
          for (const p of [s, ...s.preconditions])
            await h.call('product_source_search', { quote: p.citation.quote, offset: 0 })
      const progressBefore = [...h.progress]
      const bad = await h.call('product_path_register', originalReadinessInput(row))
      expect(bad).toMatchObject({ frozen: false, error: 'product-registration-invalid' })
      expect(bad.diagnostics).toContainEqual(
        expect.objectContaining({
          field: 'assumptions[0]',
          reason: 'product-unresolved-assumption',
        }),
      )
      expect(bad.diagnostics).toContainEqual(
        expect.objectContaining({ field: 'steps[1].review.preconditionsComplete' }),
      )
      if (['R2', 'R5'].includes(row))
        expect(
          bad.diagnostics.some(
            (d: any) =>
              d.reason === 'product-substring-overlap-needs-review' &&
              d.alternatives.includes('暂不可用'),
          ),
        ).toBe(true)
      expect(h.events.some((e) => e.type === 'product:planned')).toBe(false)
      expect(h.save).not.toHaveBeenCalled()
      expect([...h.progress]).toEqual(progressBefore)
      await expect(h.runtime.assertAction(undefined)).rejects.toThrow('register-path-before')
      const justDelete = originalReadinessInput(row)
      justDelete.assumptions = []
      const stillBad = await h.call('product_path_register', justDelete)
      expect(stillBad.frozen).toBe(false)
      const corrected = correctedReadinessPlan(row)
      expect(corrected.steps[1].preconditions).toHaveLength(1)
      expect(corrected.steps[0].preconditions[0].expectation.condition).toBe('text-equals')
      const good = await h.call('product_path_register', corrected)
      expect(good.registration.phase).toBe('frozen')
      expect(good.registration.diagnostics).toEqual([])
      expect(good.complete).toBe(false)
      expect(h.events.filter((e) => e.type === 'product:planned')).toHaveLength(1)
      expect(good.plan.steps[0]).not.toHaveProperty('review')
      h.events.push({
        id: 'action',
        seq: 10,
        type: 'action:executing',
        payload: {},
        evidenceRefs: [],
      })
      await expect(h.call('product_path_register', corrected)).rejects.toThrow('already-frozen')
    },
  )
})
