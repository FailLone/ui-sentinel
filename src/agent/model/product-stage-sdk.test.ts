import { createOpenAI } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import { expect, it, vi } from 'vitest'
import { progressHarness } from '../../../scripts/validation/r2-progress-replay.ts'
import { productStageAllows } from '../../inspection/product-stage.ts'
vi.mock('../../shared/config.ts', () => ({
  config: { budget: { modelRequestTimeoutMs: 5000, modelRequestMaxRetries: 1 } },
}))
import { executeModelRequest } from './request.ts'

it('actual SDK receives only stage tools and cannot execute an invented out-of-stage read', async () => {
  const h = progressHarness(undefined, true)
  const replies = [
    { name: 'product_source_read', args: { offset: 0 } },
    { name: 'product_source_read', args: { offset: 0 } }, // provider violates activeTools
    {
      name: 'product_path_gap',
      args: {
        question: 'Which exact original passage defines the unavailable state?',
        tool: 'product_source_search',
      },
    },
    { name: 'product_source_search', args: { quote: '暂不可用', offset: 0 } },
  ]
  const wires: any[] = []
  const model = createOpenAI({
    apiKey: 'local-only',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      wires.push(body)
      const reply = replies[wires.length - 1]!
      return Response.json({
        id: 'fixed-local',
        created: 1,
        model: body.model,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-' + wires.length,
                  type: 'function',
                  function: { name: reply.name, arguments: JSON.stringify(reply.args) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      })
    },
  }).chat('fixed-local') as unknown as MastraModelConfig
  const agent = new Agent({
    id: 'stage-contract',
    name: 'Local stage contract',
    instructions: 'Fixed local test.',
    model,
    tools: h.tools,
  })
  const results = []
  for (const reply of replies) {
    const status = await h.runtime.status()
    const activeTools = Object.keys(h.tools).filter((name) =>
      productStageAllows(status.stage, name),
    )
    const result = await executeModelRequest(agent, JSON.stringify({ productPath: status }), {
      activeTools,
      requireTool: true,
      transport: 'generate',
      runSignal: new AbortController().signal,
      timeRemainingMs: 15000,
      attemptBudget: 1,
    })
    results.push(result)
    expect(
      wires
        .at(-1)
        .tools.map((t: any) => t.function.name)
        .sort(),
    ).toEqual([...activeTools].sort())
    expect(result.attempts).toBe(1)
  }
  expect(wires[1].tools.some((t: any) => t.function.name === 'product_source_read')).toBe(false)
  expect(JSON.stringify(results[1].toolResults)).not.toContain('轻阅目录')
  expect(wires[3].tools.some((t: any) => t.function.name === 'product_source_search')).toBe(true)
  expect((await h.runtime.status()).stage.retrieval).toBeUndefined()
  expect((await h.runtime.status()).plan).toBeUndefined()
  expect([...h.progress]).toEqual(['source-page:0'])
  expect(h.events).toEqual([])
})
