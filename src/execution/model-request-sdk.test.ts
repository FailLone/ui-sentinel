import { createOpenAI } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { expect, it, vi } from 'vitest'
import { decisionMemory } from './decision-memory.ts'
import { classifyResponse } from './progress-classifier.ts'

vi.mock('../shared/config.ts', () => ({
  config: { budget: { modelRequestTimeoutMs: 5000, modelRequestMaxRetries: 1 } },
}))
import { beginAttemptTool, executeModelRequest } from './model-request.ts'

it.each(['stream', 'generate'] as const)(
  '%s delivers a real SDK tool failure to the next decision without retrying the tool',
  async (transport) => {
    let requests = 0
    let executions = 0
    let observations = 0
    const inputs: any[] = []
    const model = createOpenAI({
      apiKey: 'local-fixture-only',
      baseURL: 'http://local-fixture.invalid/v1',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body))
        inputs.push(body)
        requests++
        const call = {
          id: `call-${requests}`,
          type: 'function',
          function:
            requests === 1
              ? { name: 'investigation_check', arguments: JSON.stringify({ elementRef: 'old' }) }
              : { name: 'page_observe', arguments: '{}' },
        }
        const base = { id: 'fixture', created: 1, model: body.model }
        const usage = { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
        if (!body.stream)
          return Response.json({
            ...base,
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: null, tool_calls: [call] },
                finish_reason: 'tool_calls',
              },
            ],
            usage,
          })
        const chunks = [
          {
            ...base,
            object: 'chat.completion.chunk',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', tool_calls: [{ index: 0, ...call }] },
                finish_reason: null,
              },
            ],
          },
          {
            ...base,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
            usage,
          },
        ]
        return new Response(
          chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n',
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        )
      },
    }).chat('local-fixture') as unknown as MastraModelConfig
    const agent = new Agent({
      id: `failure-feedback-${transport}`,
      name: 'Local SDK contract fixture',
      instructions: 'Local deterministic fixture.',
      model,
      tools: {
        investigation_check: createTool({
          id: 'investigation.check',
          description: 'Local fixture',
          inputSchema: z.object({ elementRef: z.string() }),
          execute: async () => {
            beginAttemptTool()
            executions++
            throw new Error('stale-or-unknown-element-ref; observe and rebind')
          },
        }),
        page_observe: createTool({
          id: 'page.observe',
          description: 'Rebind after stale reference',
          inputSchema: z.object({}),
          execute: async () => {
            beginAttemptTool()
            observations++
            return { elementRef: 'fresh' }
          },
        }),
      },
    })
    const options = {
      transport,
      runSignal: new AbortController().signal,
      timeRemainingMs: 15000,
      attemptBudget: 2,
    }
    const result = await executeModelRequest(agent, '{}', options)
    expect(requests).toBe(1)
    expect(executions).toBe(1)
    expect(result.attempts).toBe(1)
    expect(result.usage).toMatchObject({ inputTokens: 20, outputTokens: 10 })
    expect(result.toolResults[0]).toMatchObject({
      type: 'tool-error',
      payload: { toolCallId: 'call-1' },
    })
    const memory = decisionMemory([
      { text: result.text, toolResults: JSON.stringify(result.toolResults) },
    ])
    expect(memory.latestToolResults?.tools).toEqual([
      expect.objectContaining({
        tool: 'investigation_check',
        args: { elementRef: 'old' },
        status: 'error',
        error: 'stale-or-unknown-element-ref; observe and rebind',
      }),
    ])
    expect(classifyResponse(result).category).toBe('no-progress')
    const next = await executeModelRequest(agent, JSON.stringify(memory), options)
    expect(JSON.stringify(inputs[1].messages)).toContain(
      'stale-or-unknown-element-ref; observe and rebind',
    )
    expect(requests).toBe(2)
    expect(executions).toBe(1)
    expect(observations).toBe(1)
    expect(next.toolResults).toHaveLength(1)
    expect(next.toolResults[0]).toMatchObject({
      payload: { toolName: 'page_observe', result: { elementRef: 'fresh' } },
    })
  },
)
