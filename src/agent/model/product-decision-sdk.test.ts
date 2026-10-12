import { createOpenAI } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import { expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { progressHarness } from '../../../evaluation/support/product-sources/progress.ts'
import { decisionMemory } from '../context/decision-memory.ts'
import { productPathSkill } from '../skills/product-path.ts'
vi.mock('../../shared/config.ts', () => ({
  config: { budget: { modelRequestTimeoutMs: 5000, modelRequestMaxRetries: 0 } },
}))
import { executeModelRequest } from './request.ts'
const fixture = JSON.parse(
  readFileSync('evaluation/private/product-sources/stage-decision-failures.json', 'utf8'),
)
const originalPlan = () =>
  structuredClone(
    fixture.rows
      .find((r: any) => r.row === 'R1')
      .receipts.find((r: any) => r.toolName === 'product_path_register').originalArguments,
  )

async function run(h: ReturnType<typeof progressHarness>, inputs: unknown[], label: string) {
  const wires: any[] = [],
    results: any[] = []
  const model = createOpenAI({
    apiKey: 'local-only',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      wires.push(body)
      expect(body.tools.map((t: any) => t.function.name)).toEqual(['product_path_decide'])
      expect(body.tool_choice).toEqual({
        type: 'function',
        function: { name: 'product_path_decide' },
      })
      const input = inputs[wires.length - 1]
      return Response.json({
        id: 'local',
        created: 1,
        model: body.model,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message:
              input === 'text-only'
                ? { role: 'assistant', content: 'Read the same text again' }
                : {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call-' + wires.length,
                        type: 'function',
                        function: { name: 'product_path_decide', arguments: JSON.stringify(input) },
                      },
                    ],
                  },
            finish_reason: input === 'text-only' ? 'stop' : 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      })
    },
  }).chat('fixed-local') as unknown as MastraModelConfig
  const agent = new Agent({
    id: 'decision-contract',
    name: 'Decision contract',
    instructions: productPathSkill,
    model,
    tools: h.tools,
  })
  for (const _ of inputs) {
    const result = await executeModelRequest(
      agent,
      JSON.stringify({ productPath: await h.runtime.status(), ...decisionMemory(h.history) }),
      {
        activeTools: ['product_path_decide'],
        requiredTool: 'product_path_decide',
        requireTool: true,
        transport: 'generate',
        runSignal: new AbortController().signal,
        timeRemainingMs: 10000,
        attemptBudget: 1,
      },
    )
    results.push(result)
    h.history.push({ text: result.text, toolResults: JSON.stringify(result.toolResults) })
    expect(wires.length).toBe(results.length) // maxSteps=1; no hidden follow-up or query permission generation
  }
  const dest = process.env.R2_DECISION_EVIDENCE_DIR
  if (dest)
    writeFileSync(
      resolve(dest, `sdk-decision-${label}.json`),
      JSON.stringify(
        {
          paidCalls: 0,
          authorChosenReplies: true,
          wires,
          results,
          events: h.events,
          finalStatus: await h.runtime.status(),
        },
        null,
        2,
      ) + '\n',
    )
  return results
}

it.each(['wrong-citation', 'assumption', 'missing-field', 'action-query', 'text-only'])(
  'actual SDK %s cannot freeze or dispatch and uses one original counted request',
  async (label) => {
    const h = progressHarness(undefined, true)
    await h.call('product_source_read', { offset: 0 })
    const before = [...h.progress],
      plan = originalPlan()
    let input: any = { decision: { kind: 'draft', plan } }
    if (label === 'wrong-citation') plan.steps[0].citation = { citationId: 'never-issued' }
    if (label === 'assumption') plan.assumptions = ['Assume anonymous visitor is logged in']
    if (label === 'missing-field') delete plan.steps[0].action
    if (label === 'action-query')
      input = {
        decision: {
          kind: 'retrieve',
          missing: 'need an action',
          queries: [{ tool: 'page_act', args: { type: 'click', ref: 'e5' } }],
        },
      }
    if (label === 'text-only') input = 'text-only'
    const result = await run(h, [input], label)
    expect((await h.runtime.status()).plan).toBeUndefined()
    expect([...h.progress]).toEqual(before)
    expect(h.events.some((e) => e.type === 'action:executing')).toBe(false)
    if (label !== 'text-only') expect(JSON.stringify(result)).toMatch(/error|invalid|validation/i)
  },
)
it('original three invalid registration attempts exhaust repair; a fourth decision cannot freeze', async () => {
  const h = progressHarness(undefined, true)
  await h.call('product_source_read', { offset: 0 })
  const plan = originalPlan()
  plan.steps[0].citation = { citationId: 'never-issued' }
  await run(
    h,
    [1, 2, 3].map(() => ({ decision: { kind: 'draft', plan } })),
    'repair-exhausted',
  )
  expect((await h.runtime.status()).registration.phase).toBe('exhausted')
  expect(h.events.filter((e) => e.type === 'product:registration-rejected')).toHaveLength(3)
  expect(
    await h.call('product_path_decide', { decision: { kind: 'draft', plan: originalPlan() } }),
  ).toMatchObject({ dispatched: false })
})
it('concrete gap queries reuse original source and receipt pagination without granting progress for new wording', async () => {
  const h = progressHarness(undefined, true)
  const first = await h.call('product_source_read', { offset: 0 })
  h.history.push({
    text: '',
    toolResults: JSON.stringify([{ toolName: 'product_source_read', result: first }]),
  })
  const before = [...h.progress]
  const results = await run(
    h,
    [
      {
        decision: {
          kind: 'retrieve',
          missing: 'Exact precondition quote and omitted original result',
          queries: [
            {
              tool: 'product_source_search',
              args: { quote: '预览的前置条件是目录可用状态为“可用”。', offset: 0 },
            },
            { tool: 'tool_result_read', args: { resultRef: '0.0', offset: 0 } },
          ],
        },
      },
      {
        decision: {
          kind: 'retrieve',
          missing: 'Different wording for the already returned requirement',
          queries: [{ tool: 'product_source_read', args: { offset: 0 } }],
        },
      },
    ],
    'gap-receipts',
  )
  expect([...h.progress]).toEqual(before)
  expect(h.events.filter((e) => e.type === 'product:decision-query')).toHaveLength(3)
  const memory = decisionMemory(h.history.slice(0, 2))
  const receipt: any = memory.latestToolResults?.tools.find((t) => t.tool === 'tool_result_read')
  expect(receipt.resultRef).toBe('0.0')
  expect(receipt.chunk.length).toBeGreaterThan(0)
  expect(receipt.nextOffset).toBeGreaterThan(0)
  expect(JSON.stringify(results)).toContain('citationId')
  expect((await h.runtime.status()).plan).toBeUndefined()
})
it('unsupported decision retains nonempty reason and unchecked scope, never a verified plan', async () => {
  const h = progressHarness(undefined, true)
  await h.call('product_source_read', { offset: 0 })
  const decision = {
    kind: 'unsupported',
    reason: 'Cannot establish this interpretation from the available evidence',
    unchecked: ['Preview to details not tested'],
  }
  await run(h, [{ decision }], 'unsupported')
  expect(await h.runtime.status()).toMatchObject({
    registration: { phase: 'unsupported' },
    complete: false,
    state: 'unverified',
    unchecked: decision.unchecked,
    unsupported: { reason: decision.reason },
  })
  expect(
    await h.call('product_path_decide', { decision: { kind: 'draft', plan: originalPlan() } }),
  ).toMatchObject({ dispatched: false })
})
