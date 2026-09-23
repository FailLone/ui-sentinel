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
    transport: 'generate',
  })
  expect(attemptId).toBe(result.attemptId)
})

it('streams through the real SDK, executes only a complete validated tool, and retains final usage', async () => {
  const { executeModelRequest, beginAttemptTool } = await import('../execution/model-request.ts')
  let calls = 0
  const records: any[] = []
  const model = new MastraLanguageModelV2Mock({
    doStream: async (options) => {
      expect(options.tools?.map((t) => t.name)).toEqual(['observe'])
      return {
        stream: new ReadableStream({
          async start(c) {
            c.enqueue({ type: 'stream-start', warnings: [] })
            c.enqueue({ type: 'tool-input-start', id: 'stream-call', toolName: 'observe' })
            c.enqueue({ type: 'tool-input-delta', id: 'stream-call', delta: '{"required":' })
            await new Promise((resolve) => setTimeout(resolve, 20))
            expect(calls).toBe(0)
            c.enqueue({ type: 'tool-input-delta', id: 'stream-call', delta: 'true}' })
            c.enqueue({ type: 'tool-input-end', id: 'stream-call' })
            c.enqueue({
              type: 'tool-call',
              toolCallId: 'stream-call',
              toolName: 'observe',
              input: '{"required":true}',
            })
            c.enqueue({
              type: 'finish',
              finishReason: 'tool-calls',
              usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
            })
            c.close()
          },
        }),
      }
    },
  })
  const agent = new Agent({
    id: 'stream-contract',
    name: 'stream contract',
    instructions: 'Use observe.',
    model,
    maxRetries: 0,
    tools: {
      unavailable_measurement: createTool({
        id: 'unavailable',
        description: 'Not available without a hypothesis',
        inputSchema: z.object({}),
        execute: async () => {
          throw Error('must not execute')
        },
      }),
      observe: createTool({
        id: 'observe',
        description: 'Observe',
        inputSchema: z.object({ required: z.literal(true) }),
        execute: async () => {
          beginAttemptTool()
          calls++
          return { observed: true }
        },
      }),
    },
  })
  const result = await executeModelRequest(
    agent,
    'Observe',
    {
      transport: 'stream',
      activeTools: ['observe'],
      runSignal: new AbortController().signal,
      timeRemainingMs: 5000,
      attemptBudget: 1,
    },
    {
      onFinish: (r) => {
        records.push(r)
      },
    },
  )
  expect(calls).toBe(1)
  expect(result.toolResults).toHaveLength(1)
  expect(result.usage).toMatchObject({ inputTokens: 11, outputTokens: 7 })
  expect(records[0].timing.transport).toBe('stream')
  expect(records[0].timing.firstModelDeltaMs).not.toBeNull()
  expect(records[0].timing.firstToolExecutionMs).toBeGreaterThanOrEqual(
    records[0].timing.firstModelDeltaMs,
  )
})

it('dispatches an empty hypothesis association through the real SDK rule-check schema', async () => {
  const { ruleCheckInput } = await import('../execution/rule-binding.ts')
  const args = {
    ruleId: 'learned',
    elementRef: 'e1',
    triggerEvidenceRefs: ['event-1'],
    bindingReason: 'same failed operation',
    hypothesisIds: [],
  }
  let received: unknown
  const model = new MastraLanguageModelV2Mock({
    doGenerate: {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'bound-1',
          toolName: 'rule_check',
          input: JSON.stringify(args),
        },
      ],
      finishReason: 'tool-calls',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    },
  })
  const agent = new Agent({
    id: 'bound-rule-schema',
    name: 'Bound rule schema',
    instructions: 'Use tool',
    model,
    maxRetries: 0,
    tools: {
      rule_check: createTool({
        id: 'rule.check',
        description: 'Bound check',
        inputSchema: ruleCheckInput,
        execute: async (input) => {
          received = ruleCheckInput.parse(input)
          return { verdict: 'pass' }
        },
      }),
    },
  })
  await agent.generate('Check', { maxSteps: 1 })
  expect(received).toEqual(args)
  expect(ruleCheckInput.safeParse({ ...args, hypothesisIds: ['null'] }).success).toBe(false)
})
