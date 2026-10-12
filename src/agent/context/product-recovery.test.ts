import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { freezeProductSource, readProductSource } from '../../inspection/product-source.ts'
import { productRepairContext, REPAIR_CONTEXT_BYTES } from '../../inspection/product-repair.ts'
import { productRecoveryDelivery } from './product-recovery.ts'
import { readToolResult, decisionMemory } from './decision-memory.ts'
const original = JSON.parse(
  readFileSync('evaluation/private/product-sources/registration-recovery-failure.json', 'utf8'),
)
const source = freezeProductSource(original.source)
const response = original.events.find(
  (e: any) => e.type === 'agent:response' && e.payload.requestSeq === 1,
)
const history = [{ text: '', toolResults: JSON.stringify(response.payload.toolResults) }]
const pageMemory = (page: any) =>
  decisionMemory([
    {
      text: '',
      toolResults: JSON.stringify([
        {
          toolName: 'product_path_decide',
          result: {
            decision: 'retrieve',
            queryResults: [
              {
                toolName: 'tool_result_read',
                args: { resultRef: page.resultRef, offset: page.offset },
                result: page,
              },
            ],
          },
        },
      ]),
    },
  ])
it('restores exact source characters from original distinct R6 JSON pages, with a finite delivery opportunity', () => {
  const first = readToolResult(history, '0.1', 0, source),
    second = readToolResult(history, '0.1', 717, source)
  expect(first.nextOffset).toBe(717)
  expect(second.nextOffset).toBe(1062)
  const delivery = productRecoveryDelivery(source)
  delivery.delivered(
    JSON.parse(original.requests[1].body.messages.find((m: any) => m.role === 'user').content),
  )
  expect(delivery.preview(pageMemory(second))).toBeUndefined() // initially shown in full
  delivery.delivered(
    JSON.parse(original.requests[2].body.messages.find((m: any) => m.role === 'user').content),
  )
  delivery.delivered(pageMemory(first)) // after compaction, first recovered page shown before streak=3
  const allowance = delivery.preview(pageMemory(second))!
  expect(allowance.factualProgress).toBe(false)
  expect(delivery.delivered(pageMemory(second), allowance).consumed).toBe(true)
  expect(delivery.preview(pageMemory(second))).toBeUndefined()
  // Same source through another receipt/parent does not earn a new opportunity.
  const duplicate = { ...second, resultRef: '9.7' }
  expect(delivery.preview(pageMemory(duplicate))).toBeUndefined()
  expect(delivery.preview(pageMemory({ ...second, sourceRecovery: undefined }))).toBeUndefined()
})
it('does not credit wrappers, bad cursors, omitted results or source already delivered directly', () => {
  const delivery = productRecoveryDelivery(source),
    second = readToolResult(history, '0.1', 717, source)
  expect(readToolResult(history, '0.1', 999999, source).error).toBeTruthy()
  expect(readToolResult(history, '0.0', 0, source).sourceRecovery).toBeUndefined()
  const allowance = delivery.preview(pageMemory(second))!
  expect(
    delivery.delivered(
      { latestToolResults: { tools: [{ tool: 'tool_result_read', omitted: true }] } },
      allowance,
    ).consumed,
  ).toBe(false)
  delivery.delivered({
    repair: {
      sourceId: source.sourceId,
      contentHash: source.contentHash,
      start: 0,
      end: source.markdown.length,
      text: source.markdown,
    },
  })
  expect(delivery.preview(pageMemory(second))).toBeUndefined()
})
it('caps delivery uses and deduplicates identical content at other source offsets', () => {
  const s = freezeProductSource({
    title: 'long',
    markdown: '相同正文。相同正文。第二片。第三片。第四片。',
  })
  const delivery = productRecoveryDelivery(s)
  const mem = (start: number, end: number) =>
    pageMemory({
      resultRef: '0.0',
      chunk: 'x',
      sourceRecovery: {
        sourceId: s.sourceId,
        contentHash: s.contentHash,
        start,
        end,
        text: s.markdown.slice(start, end),
      },
    })
  delivery.delivered(mem(0, 5))
  expect(delivery.preview(mem(5, 10))).toBeUndefined()
  for (const [a, b] of [
    [10, 14],
    [14, 18],
  ]) {
    const m = mem(a!, b!),
      grant = delivery.preview(m)!
    expect(grant).toBeTruthy()
    delivery.delivered(m, grant)
  }
  expect(delivery.preview(mem(18, 22))).toBeUndefined()
})
it('delivers exact faulty-field source without the history wrapper; long citations are bounded and honestly omitted', () => {
  const bad = original.events.find((e: any) => e.type === 'product:decision').payload.decision.plan
  const c = readProductSource(source)
  if ('error' in c || !c.citation) throw Error('source')
  const diagnostics = original.events.find((e: any) => e.type === 'product:registration-rejected')
    .payload.diagnostics
  const repair = productRepairContext(
    source,
    bad,
    diagnostics,
    new Map([[c.citation.citationId, c.citation]]),
  )
  expect(repair.fields[0].field).toBe('steps[1].preconditions[1].expectation')
  expect(repair.fields[0].requirement.expectation).toBeNull()
  expect(repair.fields[0].excerpt.text).toBe(source.markdown)
  const long = freezeProductSource({ title: 'long', markdown: '段落正文与状态。'.repeat(2000) }),
    r = readProductSource(long)
  if ('error' in r || !r.citation) throw Error('source')
  const raw = { steps: [{ title: 'long', citation: { citationId: r.citation.citationId } }] }
  const bounded = productRepairContext(
    long,
    raw,
    [{ field: 'steps[0].expectation', reason: 'missing', nextAction: 'review' }],
    new Map([[r.citation.citationId, r.citation]]),
  )
  expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(REPAIR_CONTEXT_BYTES)
  expect(bounded.fields[0].excerpt.omitted).toBe(true)
  expect(bounded.fields[0].excerpt.text).toBe(long.markdown.slice(0, bounded.fields[0].excerpt.end))
  expect(bounded.fields[0].sourceRead.args.offset).toBe(bounded.fields[0].excerpt.end)
  raw.steps[0]!.citation.citationId = 'invented'
  expect(
    productRepairContext(
      long,
      raw,
      [{ field: 'steps[0].expectation', reason: 'missing', nextAction: 'review' }],
      new Map(),
    ).fields[0].sourceUnavailable,
  ).toBe(true)
})
it('bounds decoded bytes independently of wrapper size and cannot consume a delivered allowance twice', () => {
  const s = freezeProductSource({ title: 'bytes', markdown: '界'.repeat(1200) + '新'.repeat(1200) })
  const delivery = productRecoveryDelivery(s)
  const e = {
    sourceId: s.sourceId,
    contentHash: s.contentHash,
    start: 0,
    end: 999,
    text: s.markdown.slice(0, 999),
  }
  const m = pageMemory({ resultRef: '0.0', chunk: 'irrelevant', sourceRecovery: e }),
    allowance = delivery.preview(m)!
  expect(delivery.delivered(m, allowance).consumed).toBe(true)
  expect(delivery.delivered(m, allowance).consumed).toBe(false)
  expect(
    delivery.preview(
      pageMemory({ sourceRecovery: { ...e, start: 1200, end: 1202, text: '新新' } }),
    ),
  ).toBeUndefined()
  const item = {
    toolName: 'product_source_read',
    metadata: 'wrapper'.repeat(10000),
    result: readProductSource(s),
  }
  const wrapped = [{ text: '', toolResults: JSON.stringify([item]) }]
  expect(readToolResult(wrapped, '0.0', 0, s).sourceRecovery).toBeUndefined()
})
it('counts displayed search citations and adjacent fragments across aliases, but not an omitted body', () => {
  const delivery = productRecoveryDelivery(source),
    page = readToolResult(history, '0.1', 717, source)
  delivery.delivered({
    latestToolResults: {
      tools: [
        {
          tool: 'product_source_search',
          sourceId: source.sourceId,
          contentHash: source.contentHash,
          hits: [
            { citation: { start: 0, end: 300, quote: source.markdown.slice(0, 300) } },
            { citation: { start: 300, end: 609, quote: source.markdown.slice(300, 609) } },
          ],
        },
      ],
    },
  })
  expect(delivery.preview(pageMemory(page))).toBeUndefined()
  const omitted = productRecoveryDelivery(source)
  omitted.delivered({
    latestToolResults: {
      tools: [{ tool: 'product_source_read', omitted: true, sourceRecovery: page.sourceRecovery }],
    },
  })
  expect(omitted.preview(pageMemory(page))).toBeTruthy()
})
it('three actual query payloads fit the original memory cap and recovery never changes closing reserves', async () => {
  const { createPhaseTracker } = await import('../../execution/run-phase.ts')
  const budget = { maxModelCalls: 20, maxActions: 8, totalTimeoutMs: 180000 }
  const tracker = createPhaseTracker(budget)
  expect(
    tracker.shouldFinalize({ elapsedMs: 1000, modelCallsUsed: 18, noProgressStreak: 0 }).reason,
  ).toBe('model-budget-reserve')
  expect(
    tracker.shouldFinalize({ elapsedMs: 145000, modelCallsUsed: 4, noProgressStreak: 0 }).reason,
  ).toBe('time-budget-reserve')
  const pages = [0, 717, 1062].map((offset) => readToolResult(history, '0.1', offset, source))
  const memory = decisionMemory([
    {
      text: '',
      toolResults: JSON.stringify([
        {
          toolName: 'product_path_decide',
          args: { decision: { kind: 'retrieve', missing: '缺口'.repeat(400) } },
          result: {
            decision: 'retrieve',
            missing: '缺口'.repeat(400),
            queryResults: pages.map((result) => ({
              toolName: 'tool_result_read',
              args: { resultRef: '0.1', offset: result.offset },
              result,
            })),
          },
        },
      ]),
    },
  ])
  expect(Buffer.byteLength(JSON.stringify(memory))).toBeLessThanOrEqual(8000)
  expect(
    memory
      .latestToolResults!.tools.filter((t: any) => t.tool === 'tool_result_read')
      .every((t: any) => t.chunk && t.sourceRecovery),
  ).toBe(true)
})
