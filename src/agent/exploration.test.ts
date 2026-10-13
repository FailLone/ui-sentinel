import { expect, it } from 'vitest'
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock'
import { createExplorationDecider } from './exploration.ts'

const input = {
  heading: 'Guide',
  text: 'Excerpt',
  candidates: [{ ref: 'a0', name: 'Continue', description: 'Consult full text', enabled: true }],
  checkedHere: 0,
  pendingElsewhere: 0,
}
const call = (name: string, args: unknown) => ({
  content: [
    {
      type: 'tool-call' as const,
      toolCallId: 'tool-call',
      toolName: name,
      input: JSON.stringify(args),
    },
  ],
  finishReason: 'tool-calls' as const,
  usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
  warnings: [],
})

it('feeds a requested text page through the real SDK before recording the next action', async () => {
  let generation = 0
  const inputs: unknown[] = []
  const model = new MastraLanguageModelV2Mock({
    doGenerate: async () =>
      ++generation === 1
        ? call('read_page', { kind: 'text', offset: 2000 })
        : call('inspect_transition', {
            ref: 'a0',
            expectedHeading: 'Receipt',
            expectedText: 'Accepted',
          }),
  })
  const decide = createExplorationDecider({
    model,
    onCall: (message) => {
      inputs.push(message)
    },
  })
  const requests: unknown[] = []
  const decision = await decide(input, (request) => {
    requests.push(request)
    return { text: 'Expected Receipt, Accepted' }
  })
  expect(requests).toEqual([{ kind: 'text', offset: 2000 }])
  expect(inputs[1]).toMatchObject({ detail: { text: 'Expected Receipt, Accepted' } })
  expect(decision).toEqual({ ref: 'a0', expectedHeading: 'Receipt', expectedText: 'Accepted' })
  expect(generation).toBe(2)
})

it('serves cached repeated reads and requires an action or explicit gap next', async () => {
  let generation = 0
  const inputs: unknown[] = []
  const model = new MastraLanguageModelV2Mock({
    doGenerate: async () =>
      ++generation < 3
        ? call('read_page', { kind: 'text', offset: 0 })
        : call('inspect_transition', { ref: 'a0', expectedHeading: 'Receipt' }),
  })
  let reads = 0
  const decide = createExplorationDecider({
    model,
    onCall: (message) => {
      inputs.push(message)
    },
  })
  expect(
    await decide(input, () => {
      reads++
      return { text: 'Receipt' }
    }),
  ).toEqual({ ref: 'a0', expectedHeading: 'Receipt' })
  expect(reads).toBe(1)
  expect(inputs[2]).toMatchObject({
    detail: { text: 'Receipt' },
    feedback: expect.stringContaining('already provided'),
  })
})

it('allows an honest evidence gap instead of forcing an unsupported expectation', async () => {
  const model = new MastraLanguageModelV2Mock({
    doGenerate: call('report_gap', { ref: 'a0', reason: 'No public destination is specified' }),
  })
  await expect(createExplorationDecider({ model })(input, () => ({}))).rejects.toThrow(
    'agent-gap:No public destination is specified',
  )
})

it('accepts a bounded batch of read-only tools without losing either requested page', async () => {
  let generation = 0
  const read16 = call('read_page', { kind: 'controls', offset: 16 })
  const read24 = call('read_page', { kind: 'controls', offset: 24 })
  const inputs: unknown[] = []
  const model = new MastraLanguageModelV2Mock({
    doGenerate: async () =>
      ++generation === 1
        ? {
            ...read16,
            content: [read16.content[0]!, { ...read24.content[0]!, toolCallId: 'second' }],
          }
        : call('inspect_transition', { ref: 'a27', expectedHeading: 'Shared library' }),
  })
  const decision = await createExplorationDecider({
    model,
    onCall: (message) => {
      inputs.push(message)
    },
  })(input, (request) => ({ offset: request.offset }))
  expect(inputs[1]).toMatchObject({ detail: [{ offset: 16 }, { offset: 24 }] })
  expect(decision.ref).toBe('a27')
})

it('rejects multiple actions before any browser dispatch can occur', async () => {
  const action = call('inspect_transition', { ref: 'a0', expectedHeading: 'Receipt' })
  const model = new MastraLanguageModelV2Mock({
    doGenerate: {
      ...action,
      content: [action.content[0]!, { ...action.content[0]!, toolCallId: 'second' }],
    },
  })
  await expect(createExplorationDecider({ model })(input, () => ({}))).rejects.toThrow(
    'invalid-agent-tool-execution',
  )
})

it('recognition uses actual exploration with grounded meaning, without a predicted heading', async () => {
  const model = new MastraLanguageModelV2Mock({
    doGenerate: call('explore_control', {
      ref: 'a0',
      understanding: { purpose: 'Continue through guide', quote: 'Continue' },
    }),
  })
  expect(await createExplorationDecider({ model, mode: 'recognition' })(input, () => ({}))).toEqual(
    {
      ref: 'a0',
      understanding: { purpose: 'Continue through guide', quote: 'Continue' },
    },
  )
})
