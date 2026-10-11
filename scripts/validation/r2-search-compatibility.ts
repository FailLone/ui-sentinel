/** Free SDK-boundary replay; no model/server/browser or credentials. */
import { createTool } from '@mastra/core/tools'
import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import { z } from 'zod'
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProductPath } from '../../src/execution/product-path.ts'
import {
  freezeProductSource,
  locateProductQuote,
  searchProductSource,
} from '../../src/inspection/product-source.ts'
import { productSource } from '../r2-product-acceptance/policy.ts'
export const searchFailures = JSON.parse(
  readFileSync('evaluation/private/r2-product-acceptance/search-empty-failures.json', 'utf8'),
)
export function searchHarness(legacy = false, input = productSource()) {
  const source = freezeProductSource(input),
    calls: unknown[] = [],
    progress = new Set<string>()
  const runtime = createProductPath({
    source,
    progress: (key) => {
      progress.add(key)
    },
    inspection: { scope: { createItem: () => ({ itemId: 'read-only-source' }) } } as any,
    page: () => ({ url: () => 'http://127.0.0.1' }) as any,
    guard: () => {},
    events: async () => [],
    emit: async () => {
      throw Error('unexpected-write')
    },
    save: async () => {
      throw Error('unexpected-save')
    },
    selector: async () => {
      throw Error('unexpected-binding')
    },
    remaining: () => ({ actions: 8, modelCalls: 20, timeMs: 180000 }),
    clean: () => true,
  })
  const current: any = runtime.tools(async (name, fn) => {
    calls.push(name)
    return fn()
  }).product_source_search
  // Exact pre-fix search schema/body: demonstrate that invalid empty string never reaches execute.
  const old: any = createTool({
    id: 'product_source_search',
    description: 'Historical search input boundary',
    inputSchema: z
      .object({
        keyword: z.string().min(1).max(200).optional(),
        quote: z.string().min(1).max(4000).optional(),
        offset: z.number().int().min(0).default(0),
      })
      .strict(),
    execute: async (i) => {
      calls.push(i)
      if ((i.keyword === undefined) === (i.quote === undefined))
        return { error: 'product-search-requires-exactly-one-keyword-or-quote' }
      return i.quote !== undefined
        ? locateProductQuote(source, i.quote, i.offset)
        : searchProductSource(source, i.keyword!, i.offset)
    },
  })
  const tool = legacy ? old : current
  return {
    source,
    calls,
    progress,
    run: (input: unknown) => tool.execute(input, {}),
    schema: () => standardSchemaToJSONSchema(tool.inputSchema, { io: 'input' }),
  }
}
export async function replaySearchCompatibility() {
  const rows = []
  for (const row of searchFailures.rows) {
    assert.deepEqual(JSON.parse(row.rawArgumentsString), row.originalInput)
    assert.deepEqual(row.originalInput, row.sdkReceiptArgs)
    const old = searchHarness(true),
      current = searchHarness()
    const before = await old.run(row.originalInput),
      after = await current.run(row.originalInput)
    assert.equal(Boolean(before.error), row.expectedOldError)
    assert.equal(old.calls.length, row.expectedOldError ? 0 : 1)
    assert.equal(current.calls.length, 1)
    assert.equal(after.matches.length, 1)
    assert.equal(after.matches[0].citation.quote, row.originalInput.quote)
    const citation = after.matches[0].citation
    assert.equal(current.source.markdown.slice(citation.start, citation.end), citation.quote)
    rows.push({
      row: row.row,
      requestId: row.requestId,
      toolCallId: row.toolCallId,
      originalInput: row.originalInput,
      before,
      after,
      legacyBodyEntered: old.calls.length > 0,
      currentBodyEntered: true,
    })
  }
  return {
    paidCalls: 0,
    sdk: '@mastra/core actual Tool.execute validation wrapper',
    rows,
    wireSchema: searchHarness().schema(),
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await replaySearchCompatibility(),
    root = resolve('data/r2-product-acceptance/search-compatibility-free-20261011')
  mkdirSync(root, { recursive: true })
  writeFileSync(resolve(root, 'replay.json'), JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
  })
  console.log(
    JSON.stringify({
      output: root,
      originalErrorsResolved: result.rows.filter((r) => !r.legacyBodyEntered).length,
      nullControls: result.rows.filter((r) => r.legacyBodyEntered).length,
      paidCalls: 0,
    }),
  )
}
