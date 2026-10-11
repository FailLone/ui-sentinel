import { createOpenAI } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import { expect, it, vi } from 'vitest'
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { progressHarness } from '../../../scripts/validation/r2-progress-replay.ts'
import { productSource } from '../../../scripts/r2-product-acceptance/policy.ts'
import { productStageAllows } from '../../inspection/product-stage.ts'
import { decisionMemory } from '../context/decision-memory.ts'
vi.mock('../../shared/config.ts', () => ({
  config: { budget: { modelRequestTimeoutMs: 5000, modelRequestMaxRetries: 1 } },
}))
import { executeModelRequest } from './request.ts'

it('actual SDK retrieves truncated source directly, preserves legal same-response reads, and registers original requirements', async () => {
  const source = productSource()
  const h = progressHarness(
    { ...source, markdown: '# Background\n' + '背景说明。'.repeat(850) + '\n' + source.markdown },
    true,
  )
  const wires: any[] = [],
    outputs: any[] = [],
    history: any[] = []
  let nextOffset: number, citationId: string
  const original = JSON.parse(
    readFileSync('evaluation/private/r2-product-acceptance/stage-decision-failures.json', 'utf8'),
  )
    .rows.find((r: any) => r.row === 'R1')
    .receipts.find((r: any) => r.toolName === 'product_path_register').originalArguments
  const model = createOpenAI({
    apiKey: 'local-only',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      wires.push(body)
      const packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
      let calls: any[]
      if (wires.length === 1) calls = [{ name: 'product_source_read', args: { offset: 0 } }]
      else if (wires.length === 2) {
        nextOffset = packet.latestToolResults.tools[0].nextOffset
        expect(nextOffset).toBe(4000)
        expect(packet.productPath.plan).toBeUndefined()
        // An already known read plus the required returned cursor in the SAME response.
        calls = [0, nextOffset].map((offset) => ({ name: 'product_source_read', args: { offset } }))
      } else if (wires.length === 3) {
        const page = packet.latestToolResults.tools.find(
          (t: any) => t.citation?.start === nextOffset,
        )
        expect(page.text).toContain(source.markdown)
        expect(page.nextOffset).toBeNull()
        citationId = page.citation.citationId
        calls = [{ name: 'product_source_search', args: { quote: '暂不可用', offset: 0 } }]
      } else {
        const plan = structuredClone(original)
        plan.sourceId = h.source.sourceId
        plan.contentHash = h.source.contentHash
        for (const step of plan.steps) {
          step.citation = { citationId }
          for (const p of step.preconditions) p.citation = { citationId }
        }
        calls = [{ name: 'product_path_register', args: plan }]
      }
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
              tool_calls: calls.map((c, i) => ({
                id: `call-${wires.length}-${i}`,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      })
    },
  }).chat('fixed-local') as unknown as MastraModelConfig
  const agent = new Agent({
    id: 'stage-retrieval',
    name: 'Local retrieval contract',
    instructions: 'Fixed local test.',
    model,
    tools: h.tools,
  })
  for (let i = 0; i < 4; i++) {
    const status = await h.runtime.status()
    const activeTools = Object.keys(h.tools).filter((name) =>
      productStageAllows(status.stage, name),
    )
    const result = await executeModelRequest(
      agent,
      JSON.stringify({ productPath: status, ...decisionMemory(history) }),
      {
        activeTools,
        requireTool: true,
        transport: 'generate',
        runSignal: new AbortController().signal,
        timeRemainingMs: 15000,
        attemptBudget: 1,
      },
    )
    outputs.push(result)
    history.push({ text: result.text, toolResults: JSON.stringify(result.toolResults) })
    expect(
      wires
        .at(-1)
        .tools.map((t: any) => t.function.name)
        .sort(),
    ).toEqual([...activeTools].sort())
    expect(result.attempts).toBe(1)
    expect(activeTools).not.toContain('product_path_gap')
    if (i < 3) expect((await h.runtime.status()).plan).toBeUndefined()
  }
  expect((await h.runtime.status()).stage.phase).toBe('bind-next-step')
  expect([...h.progress].sort()).toEqual(['plan-frozen', 'source-page:0', 'source-page:1'])
  expect(h.events.some((e) => e.type === 'action:executing')).toBe(false)
  const dest = process.env.R2_STAGE_RETRIEVAL_EVIDENCE_DIR
  if (dest)
    writeFileSync(
      resolve(dest, 'sdk-source-retrieval.json'),
      JSON.stringify(
        {
          paidCalls: 0,
          authorChosenReplies: true,
          wires,
          outputs,
          finalStatus: await h.runtime.status(),
        },
        null,
        2,
      ) + '\n',
    )
})
