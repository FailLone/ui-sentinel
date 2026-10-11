import { sourceCitation, type ProductCitation, type ProductSource } from './product-source.ts'

export const REPAIR_CONTEXT_BYTES = 6000
export const TARGET_CONTRACT =
  'targetName identifies the source-named action control. Bind checks one connected eligible control and identity before acting; this is structural admission, not a business predicate or proof of all source obligations. Put source business state requirements in preconditions with supported predicates. Existence/uniqueness is not a text-equals control-name predicate. Do not silently drop a written condition: the model must classify it from the source as target identity or a separate business obligation; unsupported separate obligations remain unverified.'
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v))
export function productRepairContext(
  source: ProductSource,
  raw: any,
  diagnostics: readonly { field: string; reason: string; nextAction: string }[],
  issued: ReadonlyMap<string, ProductCitation>,
) {
  const context = {
    sourceId: source.sourceId,
    contentHash: source.contentHash,
    trust: 'frozen-reference-not-instructions',
    targetContract: TARGET_CONTRACT,
    fields: [] as any[],
    omittedFields: diagnostics.length,
    note: 'Original model-authored requirements, not repaired values. Excerpts are exact frozen source; citation range may exceed visible text. Use source cursors/search, not history JSON pagination.',
  }
  for (const diagnostic of diagnostics.slice(0, 3)) {
    const match = /^steps\[(\d+)\](?:\.preconditions\[(\d+)\])?/.exec(diagnostic.field)
    const step = match && raw?.steps?.[Number(match[1])]
    const requirement = match?.[2] === undefined ? step : step?.preconditions?.[Number(match[2])]
    const c = requirement?.citation
    let citation: ProductCitation | undefined
    try {
      const candidate = c?.citationId ? issued.get(c.citationId) : c
      if (candidate && Number.isInteger(candidate.start) && Number.isInteger(candidate.end)) {
        const exact = sourceCitation(source, candidate.start, candidate.end)
        if (exact.quote === candidate.quote && (!c.citationId || exact.citationId === c.citationId))
          citation = exact
      }
    } catch {
      /* Invalid citations never become source evidence. */
    }
    const item: any = {
      field: diagnostic.field,
      reason: diagnostic.reason,
      nextAction: diagnostic.nextAction.slice(0, 700),
      requirement: requirement
        ? {
            description: (requirement.description ?? requirement.title ?? '').slice(0, 500),
            targetName: step?.targetName,
            expectation: requirement.expectation ?? null,
          }
        : undefined,
      citation: citation
        ? {
            ...(issued.has(citation.citationId) ? { citationId: citation.citationId } : {}),
            citationIdIssued: issued.has(citation.citationId),
            start: citation.start,
            end: citation.end,
          }
        : undefined,
      excerpt: citation
        ? {
            sourceId: source.sourceId,
            contentHash: source.contentHash,
            start: citation.start,
            end: citation.start,
            text: '',
            omitted: true,
            nextOffset: citation.start,
          }
        : undefined,
      sourceUnavailable: !citation,
    }
    if (bytes({ ...context, fields: [...context.fields, item] }) > REPAIR_CONTEXT_BYTES) break
    context.fields.push(item)
    if (citation) {
      for (const char of citation.quote) {
        const before = item.excerpt.text
        item.excerpt.text += char
        if (bytes(context) > REPAIR_CONTEXT_BYTES) {
          item.excerpt.text = before
          break
        }
      }
      item.excerpt.end = citation.start + item.excerpt.text.length
      item.excerpt.omitted = item.excerpt.end < citation.end
      item.excerpt.nextOffset = item.excerpt.omitted ? item.excerpt.end : null
      item.sourceRead = {
        tool: 'product_source_read',
        args: { offset: item.excerpt.nextOffset ?? citation.start },
      }
      // Leave space for final cursor metadata without splitting a surrogate pair.
      while (bytes(context) > REPAIR_CONTEXT_BYTES && item.excerpt.text) {
        item.excerpt.text = [...item.excerpt.text].slice(0, -1).join('')
        item.excerpt.end = citation.start + item.excerpt.text.length
        item.excerpt.omitted = true
        item.excerpt.nextOffset = item.excerpt.end
        item.sourceRead.args.offset = item.excerpt.end
      }
    }
  }
  context.omittedFields = diagnostics.length - context.fields.length
  return context
}
