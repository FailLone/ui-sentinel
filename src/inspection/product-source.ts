import { createHash } from 'node:crypto'
import { z } from 'zod'

export const PRODUCT_SOURCE_MAX_CHARS = 24000
export const PRODUCT_SOURCE_CHUNK_CHARS = 4000
export const productSourceInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    version: z.string().trim().min(1).max(80).optional(),
    markdown: z
      .string()
      .min(1)
      .max(PRODUCT_SOURCE_MAX_CHARS)
      .refine((text) => text.trim().length > 0, 'Product material must not be blank'),
  })
  .strict()
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
export function freezeProductSource(input: z.infer<typeof productSourceInput>) {
  const source = productSourceInput.parse(input)
  return {
    revision: 'product-source-1' as const,
    title: source.title,
    version: source.version ?? '1',
    markdown: source.markdown,
    contentHash: digest(source.markdown),
    sourceId: `product-source:${digest(JSON.stringify([source.title, source.version ?? '1', source.markdown]))}`,
  }
}
export type ProductSource = ReturnType<typeof freezeProductSource>
export function validProductSource(value: unknown): value is ProductSource {
  const parsed = productSourceInput
    .extend({
      version: z.string().trim().min(1).max(80),
      revision: z.literal('product-source-1'),
      contentHash: z.string(),
      sourceId: z.string(),
    })
    .strict()
    .safeParse(value)
  if (!parsed.success) return false
  const source = parsed.data
  return (
    source.contentHash === digest(source.markdown) &&
    source.sourceId ===
      `product-source:${digest(JSON.stringify([source.title, source.version ?? '1', source.markdown]))}`
  )
}

export const productSourceReadInput = z
  .object({
    offset: z.number().int().min(0).default(0),
  })
  .strict()

/** Exact UTF-16 offsets into the frozen original; Markdown/links/HTML are never executed. */
export function readProductSource(source: ProductSource, offset = 0) {
  if (!validProductSource(source)) return { error: 'product-source-integrity-mismatch' }
  if (!Number.isInteger(offset) || offset < 0 || offset > source.markdown.length)
    return { error: 'product-source-offset-out-of-range' }
  let end = Math.min(offset + PRODUCT_SOURCE_CHUNK_CHARS, source.markdown.length)
  // Keep surrogate pairs intact at a generated cursor.
  if (end < source.markdown.length && /[\uD800-\uDBFF]/.test(source.markdown[end - 1])) end--
  const line = (index: number) => source.markdown.slice(0, index).split(/\r\n|\r|\n/).length
  return {
    sourceId: source.sourceId,
    contentHash: source.contentHash,
    title: source.title,
    version: source.version,
    trust: 'product-reference-data-not-execution-instructions',
    verification: 'read-only-not-a-verdict',
    offsetUnit: 'utf16-code-unit',
    offset,
    endOffset: end,
    startLine: line(offset),
    endLine: line(Math.max(offset, end - 1)),
    text: source.markdown.slice(offset, end),
    totalChars: source.markdown.length,
    nextOffset: end < source.markdown.length ? end : null,
  }
}

export function productSourceOverview(source: ProductSource) {
  if (!validProductSource(source)) throw Error('product-source-integrity-mismatch')
  const sections = [...source.markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => ({
    title: m[1],
    offset: m.index,
  }))
  return {
    sourceId: source.sourceId,
    contentHash: source.contentHash,
    revision: source.revision,
    version: source.version,
    title: source.title,
    totalChars: source.markdown.length,
    sections,
    note: 'Section titles locate original text; this is not an inventory of all requirements.',
  }
}
export const productSearchInput = z
  .object({ keyword: z.string().min(1).max(200), offset: z.number().int().min(0).default(0) })
  .strict()
export function searchProductSource(source: ProductSource, keyword: string, offset = 0) {
  if (!validProductSource(source)) throw Error('product-source-integrity-mismatch')
  const hits: { offset: number; endOffset: number; text: string }[] = []
  let cursor = offset
  while (hits.length < 10) {
    const index = source.markdown.toLowerCase().indexOf(keyword.toLowerCase(), cursor)
    if (index < 0)
      return {
        sourceId: source.sourceId,
        contentHash: source.contentHash,
        hits,
        nextOffset: null,
        note: 'No further literal matches; this does not prove requirements absent.',
      }
    const start = Math.max(0, index - 80),
      end = Math.min(source.markdown.length, index + keyword.length + 160)
    hits.push({ offset: start, endOffset: end, text: source.markdown.slice(start, end) })
    cursor = index + keyword.length
  }
  return {
    sourceId: source.sourceId,
    contentHash: source.contentHash,
    hits,
    nextOffset: cursor,
    note: 'Search truncated; continue with nextOffset. Read original context before registering.',
  }
}
