import { describe, it, expect } from 'vitest'
import { searchHarness, searchFailures } from '../../scripts/validation/r2-search-compatibility.ts'
import { normalizeProductSearchInput, productSearchInput } from './product-source.ts'
describe('source search local compatibility before SDK validation', () => {
  it.each(searchFailures.rows as Record<string, any>[])(
    '$row request $requestSequence preserves original query and issued quote',
    async (row) => {
      const old = searchHarness(true),
        current = searchHarness()
      const before = await old.run(row.originalInput),
        after = await current.run(row.originalInput)
      expect(Boolean(before.error)).toBe(row.expectedOldError)
      expect(old.calls.length).toBe(row.expectedOldError ? 0 : 1)
      expect(current.calls).toHaveLength(1)
      expect(after.matches).toHaveLength(1)
      expect(after.matches[0].citation.quote).toBe(row.originalInput.quote)
      expect(
        current.source.markdown.slice(
          after.matches[0].citation.start,
          after.matches[0].citation.end,
        ),
      ).toBe(row.originalInput.quote)
    },
  )
  it.each([undefined, null, '', ' \t\n　'])(
    'ignores only the unused empty value %j, without trimming active text',
    async (empty) => {
      const quote = '  中文😀 原文\t\n',
        h = searchHarness(false, { title: '精确空白', version: '1', markdown: '#' + quote + '尾' })
      const raw = { keyword: empty, quote, offset: 0 }
      expect(normalizeProductSearchInput(raw)).toEqual({ keyword: undefined, quote, offset: 0 })
      expect((await h.run(raw)).matches[0].citation).toMatchObject({
        start: 1,
        end: 1 + quote.length,
        quote,
      })
      expect(normalizeProductSearchInput({ keyword: quote, quote: empty })).toEqual({
        keyword: quote,
        quote: undefined,
        offset: 0,
      })
      expect((await h.run({ keyword: quote, quote: empty })).hits).toHaveLength(1)
    },
  )
  it.each([
    {},
    { keyword: '', quote: null },
    { keyword: ' \n', quote: '\t　' },
    { keyword: '原文', quote: '原文' },
    { keyword: ' 原文 ', quote: '  原文  ' },
    { keyword: 0, quote: '原文' },
    { keyword: false, quote: '原文' },
    { keyword: [], quote: '原文' },
    { keyword: '原文', quote: {} },
    { keyword: '原文', quote: 7 },
    { keyword: '原文', offset: -1 },
    { quote: '原文', offset: 1.5 },
    { quote: '原文', offset: '0' },
    { quote: '原文', offset: true },
    { quote: '原文', extra: 'unused' },
    { keyword: 'x'.repeat(201), quote: '' },
    { quote: 'x'.repeat(4001), keyword: '' },
    { keyword: ' '.repeat(201), quote: '原文' },
  ])('rejects ambiguous/invalid input %j before body', async (input) => {
    const h = searchHarness()
    expect(productSearchInput.safeParse(input).success).toBe(false)
    expect(await h.run(input)).toHaveProperty('error')
    expect(h.calls).toHaveLength(0)
  })
  it('rejects cursor beyond actual source, retains no-match and duplicate selection semantics', async () => {
    const h = searchHarness(false, { title: '原文', version: '1', markdown: ' A中 A中 ' })
    await expect(h.run({ quote: 'A中', keyword: '', offset: 999 })).rejects.toThrow('input-invalid')
    const multiple = await h.run({ quote: 'A中', keyword: null })
    expect(multiple.matches).toHaveLength(2)
    expect(multiple.selectionRequired).toBe(true)
    expect((await h.run({ quote: ' A中  ', keyword: '' })).matches).toEqual([])
    expect((await h.run({ quote: 'absent', keyword: '' })).matches).toEqual([])
    expect(h.progress.size).toBe(1)
  })
  it('exports the SDK wire schema without a transform that hides input constraints', () => {
    const schema: any = searchHarness().schema()
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(JSON.stringify(schema.properties.keyword)).toContain('200')
    expect(JSON.stringify(schema.properties.quote)).toContain('4000')
    expect(JSON.stringify(schema.properties.keyword)).toContain('null')
  })
})
