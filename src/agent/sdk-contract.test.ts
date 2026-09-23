import { it, expect } from 'vitest'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock'
import { z } from 'zod'

it('real Mastra runtime dispatches schema tools with maxSteps=1 (deterministic provider, no remote model)', async () => {
  let calls = 0
  const model = new MastraLanguageModelV2Mock({
    doGenerate: {
      content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'page_observe', input: '{}' }],
      finishReason: 'tool-calls',
      usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
      warnings: [],
    },
  })
  const agent = new Agent({
    id: 'sdk-contract',
    name: 'SDK contract',
    instructions: 'Observe using the tool.',
    model,
    maxRetries: 0,
    tools: {
      page_observe: createTool({
        id: 'page.observe',
        description: 'Observe',
        inputSchema: z.object({}),
        execute: async () => {
          calls++
          return { observed: true }
        },
      }),
    },
  })
  const result = await agent.generate('Observe.', { maxSteps: 1 })
  expect(calls).toBe(1)
  expect(result.toolResults.length).toBe(1)
  expect(result.usage.inputTokens).toBe(12)
})

it('real Mastra tools inherit the model attempt context', async () => {
  const { executeModelRequest, beginAttemptTool, guardModelAttempt } = await import(
    '../execution/model-request.ts'
  )
  let attemptId: string | undefined
  const model = new MastraLanguageModelV2Mock({
    doGenerate: {
      content: [
        { type: 'tool-call', toolCallId: 'call-context', toolName: 'observe', input: '{}' },
      ],
      finishReason: 'tool-calls',
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      warnings: [],
    },
  })
  const agent = new Agent({
    id: 'attempt-contract',
    name: 'attempt contract',
    instructions: 'Observe using the tool.',
    model,
    maxRetries: 0,
    tools: {
      observe: createTool({
        id: 'observe',
        description: 'observe',
        inputSchema: z.object({}),
        execute: async () => {
          attemptId = beginAttemptTool()
          await Promise.resolve()
          guardModelAttempt()
          return { ok: true }
        },
      }),
    },
  })
  const result = await executeModelRequest(agent, 'Observe', {
    runSignal: new AbortController().signal,
    timeRemainingMs: 5000,
    attemptBudget: 1,
  })
  expect(attemptId).toBe(result.attemptId)
})
