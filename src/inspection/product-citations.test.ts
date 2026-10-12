import { describe, it, expect } from 'vitest'
import {
  freezeProductSource,
  locateProductQuote,
  readProductSource,
  searchProductSource,
  sourceCitation,
} from './product-source.ts'
import { resolveProductPlan, registrationDiagnostics } from './product-citations.ts'
import { validateProductPlan, productPathReport } from './product-path.ts'
import { extractToolSummary } from '../agent/context/compact-history.ts'
import {
  citationSource,
  r4Draft,
  r4Quotes,
  r4WithReferences,
} from '../../evaluation/support/product-sources/citation.ts'
const source = freezeProductSource(citationSource)
function references() {
  const issued = new Map(),
    refs = new Map()
  for (const quote of r4Quotes) {
    const result = locateProductQuote(source, quote)
    expect(result.matches).toHaveLength(1)
    const c = result.matches[0]!.citation
    issued.set(c.citationId, c)
    refs.set(quote, c.citationId)
  }
  return { issued, raw: r4WithReferences(refs) }
}
describe('program-issued source citations', () => {
  it('replays R4 unchanged words and semantics through old strict validation; old offsets still fail', () => {
    expect(() => validateProductPlan(source, r4Draft())).toThrow('citation-mismatch')
    const { issued, raw } = references(),
      resolved = resolveProductPlan(source, raw, issued)
    expect(validateProductPlan(source, resolved)).toEqual(resolved)
    const original = r4Draft()
    for (const [i, step] of resolved.steps.entries()) {
      const old = original.steps[i]
      expect({ ...step, citation: old.citation, preconditions: old.preconditions }).toEqual(old)
      for (const [j, p] of [step, ...step.preconditions].entries())
        expect(p.citation.quote).toBe([old, ...old.preconditions][j].citation.quote)
    }
    expect(resolved.steps.map((s) => [s.citation.start, s.citation.end])).toEqual([
      [283, 323],
      [356, 406],
    ])
    expect(
      productPathReport(source, [
        { id: 'p', seq: 1, type: 'product:planned', payload: { plan: resolved }, evidenceRefs: [] },
      ] as any),
    ).toMatchObject({ state: 'unverified', complete: false })
  })
  it('rejects unissued, forged, tampered and cross-source/version references', () => {
    const { issued, raw } = references()
    expect(() => resolveProductPlan(source, raw, new Map())).toThrow('not-issued')
    const bad = structuredClone(raw)
    bad.steps[0].citation.citationId = 'pcite:forged'
    expect(() => resolveProductPlan(source, bad, issued)).toThrow('not-issued')
    bad.steps[0].citation = { ...raw.steps[0].citation, quote: 'edited' }
    expect(() => resolveProductPlan(source, bad, issued)).toThrow()
    const [id, c] = [...issued.entries()][0]!
    const corrupted = new Map(issued)
    corrupted.set(id, { ...c, quote: 'edited' })
    expect(() => resolveProductPlan(source, raw, corrupted)).toThrow('not-issued')
    for (const changed of [
      freezeProductSource({ ...citationSource, version: '2' }),
      freezeProductSource({ ...citationSource, title: 'Other' }),
    ]) {
      expect(() => resolveProductPlan(changed, raw, issued)).toThrow('version-mismatch')
      expect(() =>
        resolveProductPlan(
          changed,
          { ...raw, sourceId: changed.sourceId, contentHash: changed.contentHash },
          issued,
        ),
      ).toThrow('not-issued')
    }
  })
  it('exposes all repeated occurrences with cursors and requires explicit occurrence selection', () => {
    const repeated = freezeProductSource({ title: 'Repeated', markdown: 'same\n'.repeat(13) })
    const first = locateProductQuote(repeated, 'same'),
      second = locateProductQuote(repeated, 'same', first.nextOffset!)
    expect(first.matches).toHaveLength(10)
    expect(first.selectionRequired).toBe(true)
    expect(second.matches).toHaveLength(3)
    expect(second.nextOffset).toBeNull()
    expect(
      new Set([...first.matches, ...second.matches].map((m) => m.citation.citationId)).size,
    ).toBe(13)
    expect(locateProductQuote(repeated, 'Same').matches).toEqual([])
    expect(locateProductQuote(repeated, 'same same').matches).toEqual([])
  })
  it('locates Chinese/emoji across 4000-unit read boundaries without splitting pairs', () => {
    const long = freezeProductSource({
      title: 'Long',
      markdown: '甲'.repeat(3999) + '😀原文跨页' + '乙'.repeat(5000),
    })
    const first = readProductSource(long),
      second = readProductSource(long, first.nextOffset!)
    expect(first.endOffset).toBe(3999)
    expect(second.text?.startsWith('😀')).toBe(true)
    const match = locateProductQuote(long, '甲😀原文跨页').matches[0]!.citation
    expect(match.start).toBe(3998)
    expect(long.markdown.slice(match.start, match.end)).toBe(match.quote)
    expect(readProductSource(long, 4000)).toHaveProperty('error')
    expect(() => locateProductQuote(long, '\ude00')).toThrow('surrogate')
    expect(sourceCitation(long, match.start, match.end)).toEqual(match)
    expect(searchProductSource(long, '原文').hits[0]!.citation.quote).toContain('😀原文')
  })
  it('preserves citation choices and specific repair diagnostics in model summaries', () => {
    const fragment = readProductSource(source)
    expect(
      extractToolSummary({ payload: { toolName: 'product_source_read', result: fragment } }),
    ).toHaveProperty('citation', fragment.citation)
    const result = locateProductQuote(source, r4Quotes[0]!)
    expect(
      extractToolSummary({ payload: { toolName: 'product_source_search', result } }),
    ).toHaveProperty('matches', result.matches)
    const { issued, raw } = references()
    raw.steps[1].preconditions[0].citation = { citationId: 'bad' }
    try {
      resolveProductPlan(source, raw, issued)
      expect.fail('expected error')
    } catch (e) {
      const diagnostics = registrationDiagnostics(e)
      expect(diagnostics[0]).toMatchObject({
        field: 'steps[1].preconditions[0].citation',
        nextAction: expect.stringContaining('product_source_search'),
      })
      expect(
        extractToolSummary({
          payload: { toolName: 'product_path_register', result: { diagnostics } },
        }),
      ).toHaveProperty('diagnostics', diagnostics)
    }
  })
  it('names the failing legacy citation and expectation fields', () => {
    try {
      validateProductPlan(source, r4Draft())
      expect.fail()
    } catch (e) {
      expect(registrationDiagnostics(e)[0]?.field).toBe('steps[0].citation')
    }
    const { issued, raw } = references()
    const resolved = resolveProductPlan(source, raw, issued)
    resolved.steps[1]!.preconditions[0]!.expectation!.expected = 'invented'
    try {
      validateProductPlan(source, resolved)
      expect.fail()
    } catch (e) {
      expect(registrationDiagnostics(e)[0]?.field).toBe('steps[1].preconditions[0].expectation')
    }
  })
})
