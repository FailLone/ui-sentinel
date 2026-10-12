/** Operator-authored free replay only; never imported by the product or real provider. */
import { readFileSync } from 'node:fs'
import { freezeProductSource, sourceCitation } from '../../../src/inspection/product-source.ts'
import { citationSource, r4Quotes } from './citation.ts'
const fixtures = JSON.parse(
  readFileSync(
    new URL('../../private/product-sources/readiness-failures.json', import.meta.url),
    'utf8',
  ),
)
export const readinessRows = fixtures.rows as {
  row: string
  runId: string
  requestId: string
  requestSequence: number
  originalInput: any
  originalPersistedPlan: any
}[]
export function originalReadinessInput(row: string) {
  const raw = structuredClone(readinessRows.find((r) => r.row === row)!.originalInput)
  for (const s of raw.steps) for (const k of ['value', 'limitation']) if (s[k] === null) delete s[k]
  return raw
}
export const confirmedReview = { preconditionsComplete: true, predicatesDistinguishStates: true }
export function correctedReadinessPlan(row: string, refs?: ReadonlyMap<string, string>) {
  const raw = originalReadinessInput(row),
    source = freezeProductSource(citationSource)
  const cite = (quote: string) =>
    refs
      ? { citationId: refs.get(quote)! }
      : sourceCitation(
          source,
          source.markdown.indexOf(quote),
          source.markdown.indexOf(quote) + quote.length,
        )
  // Deliberate test-author correction after inspecting the original source, NOT inference in runtime.
  raw.assumptions = []
  raw.rationale =
    '免费回放人工修正：资料明确规定两步效果及分别展示的状态区域；当前是否可用和前一步是否就绪是待实测前置，不假设满足。分别绑定原结果槽；原文其余范围保持未验证。'
  raw.steps[0].citation = cite(r4Quotes[0]!)
  raw.steps[1].citation = cite(r4Quotes[2]!)
  raw.steps[0].expectation = { condition: 'text-equals', expected: '预览就绪' }
  raw.steps[1].expectation = { condition: 'text-equals', expected: '详情已就绪' }
  raw.steps[0].preconditions = [
    {
      description: '原文要求目录可用；当前值由绑定前测量判断',
      citation: cite(r4Quotes[1]!),
      expectation: { condition: 'text-equals', expected: '可用' },
    },
  ]
  raw.steps[1].preconditions = [
    {
      description: '原文要求预览就绪后才能查看详情；必须登记并实测',
      citation: cite(r4Quotes[2]!),
      expectation: { condition: 'text-equals', expected: '预览就绪' },
    },
  ]
  for (const step of raw.steps) {
    step.review = { ...confirmedReview }
    delete step.limitation
  }
  // Legacy citation shape must remain exact; IDs are submitted alone in the browser replay.
  if (!refs)
    for (const step of raw.steps)
      for (const p of [step, ...step.preconditions]) delete p.citation.citationId
  return raw
}
