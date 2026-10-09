import { expect, it } from 'vitest'
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import { createOpenAI } from '@ai-sdk/openai'
import { explorationInput } from './tool-inputs.ts'

const inputFor = (sourceSpan: unknown) => ({
  sourceCandidates: [
    { itemId: 'item-public', sourceRef: 'source-public', sourceHash: 'a'.repeat(64), sourceSpan },
  ],
  state: 'observed',
  unexploredBranches: [],
})

it('preserves the original positional span contract, including SDK validation before execution', async () => {
  const original = z.tuple([z.number().int().min(0), z.number().int().min(1)])
  const values: unknown[] = [null, '0,1', {}, [], [0], [0, 1, 2], [NaN, 1], [0, Infinity]]
  for (const a of [-1, 0, 1, 4, 0.5, '1'])
    for (const b of [-1, 0, 1, 4, 0.5, '1']) values.push([a, b])
  for (const value of values) {
    const expected = original.safeParse(value).success
    expect(explorationInput.safeParse(inputFor(value)).success).toBe(expected)
    let executed = false
    const tool = createTool({
      id: 'exploration.update',
      description: 'span validation',
      inputSchema: explorationInput,
      execute: async (args) => {
        executed = true
        expect(args.sourceCandidates?.[0].sourceSpan).toEqual(value)
        return { accepted: true }
      },
    })
    await tool.execute!(inputFor(value) as any, {} as any)
    expect(executed).toBe(expected)
  }
})

it('real Mastra/OpenAI serialization emits one integer items schema and preserves source binding fields', async () => {
  let calls = 0
  const model = createOpenAI({
    apiKey: 'fixture',
    baseURL: 'https://fixture.invalid/v1',
    fetch: async (_url, init) => {
      calls++
      const body = JSON.parse(String(init?.body))
      const parameters = body.tools[0].function.parameters
      const source = parameters.properties.sourceCandidates.anyOf.find(
        (x: any) => x.type === 'array',
      ).items
      expect(source.required).toEqual(
        expect.arrayContaining(['itemId', 'sourceRef', 'sourceSpan', 'sourceHash']),
      )
      expect(source.additionalProperties).toBe(false)
      expect(source.properties.sourceSpan.type).toBe('array')
      expect(source.properties.sourceSpan.items.type).toBe('integer')
      expect(source.properties.sourceSpan).not.toHaveProperty('additionalItems')
      expect(source.properties.sourceSpan.description).toContain('exact length 2')
      expect(body.tool_choice).toBe('required')
      return Response.json({
        id: 'fixture',
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
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'exploration_update',
                    arguments: JSON.stringify(inputFor([0, 1])),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    },
  }).chat('deepseek/deepseek-v4.1-flash') as unknown as MastraModelConfig
  let received: unknown
  const agent = new Agent({
    id: 'span-compat',
    name: 'span compatibility',
    instructions: 'fixture',
    model,
    maxRetries: 0,
    tools: {
      exploration_update: createTool({
        id: 'exploration.update',
        description: 'span',
        inputSchema: explorationInput,
        execute: async (args) => {
          received = args
          return { recorded: true }
        },
      }),
    },
  })
  await agent.generate('fixture', { maxSteps: 1, toolChoice: 'required' })
  expect(calls).toBe(1)
  expect(received).toEqual(inputFor([0, 1]))
})
