import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { assembleToolCalls, extractVisionExchanges, rowRunId } from './gateway-evidence.ts'

/**
 * The gateway is the only independent record of what the model was really asked and what it really
 * did. These tests pin the two facts the scorer needs from it: the semantic binding call it made, and
 * the raw vision response paired with the image that produced it.
 */

const IMAGE = Buffer.from('a real png would go here')
const imageUrl = `data:image/png;base64,${IMAGE.toString('base64')}`
const imageSha = createHash('sha256').update(IMAGE).digest('hex')

function request(over: Record<string, unknown> = {}) {
  return {
    run: 'D0-1',
    seq: 1,
    model: 'qwen/qwen3.7-plus',
    body: {
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageUrl } }] }],
    },
    ...over,
  }
}

function response(events: unknown[], over: Record<string, unknown> = {}) {
  return { run: 'D0-1', seq: 1, events, ...over }
}

/** A complete, non-streaming response that called a tool. */
function completeCall(name: string, args: unknown) {
  return {
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { index: 0, id: 'call_1', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  }
}

/** A streamed call, fragmented the way OpenRouter really sends it. */
function streamedCall(name: string, args: string) {
  const half = Math.floor(args.length / 2)
  return [
    {
      choices: [
        { index: 0, delta: { tool_calls: [{ index: 0, function: { name, arguments: '' } }] } },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(0, half) } }] },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(half) } }] },
        },
      ],
    },
  ]
}

describe('rowRunId', () => {
  it('names the gateway run exactly as the runner began it', () => {
    expect(rowRunId({ group: 'formal', case: 'D0', repeat: 2 })).toBe('D0-2')
  })

  it('never lets one repeat be matched by another repeat of the same case', () => {
    // A prefix match would make D0-1's rows appear in D0-3's evidence, inflating every count and
    // pushing the vision-request count past its own bound.
    expect(rowRunId({ group: 'formal', case: 'D0', repeat: 1 })).not.toBe(
      rowRunId({ group: 'formal', case: 'D0', repeat: 3 }),
    )
  })
})

describe('assembleToolCalls', () => {
  it('recovers a focus_probe call from a complete response', () => {
    const calls = assembleToolCalls({
      requests: [request({ model: 'deepseek/deepseek-v4.1-flash' })],
      responses: [
        response([completeCall('focus_probe', { elementRef: 'e17', candidateId: 'c1' })]),
      ],
      rowRunId: 'D0-1',
      runId: 'run-product-1',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      tool: 'focus_probe',
      model: 'deepseek/deepseek-v4.1-flash',
      runId: 'run-product-1',
      body: { elementRef: 'e17', candidateId: 'c1' },
    })
  })

  it('reassembles a streamed call from its argument fragments', () => {
    const calls = assembleToolCalls({
      requests: [request({ model: 'deepseek/deepseek-v4.1-flash' })],
      responses: [
        response(
          streamedCall('focus_probe', JSON.stringify({ elementRef: 'e3', candidateId: 'c9' })),
        ),
      ],
      rowRunId: 'D0-1',
      runId: 'run-product-1',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toEqual({ elementRef: 'e3', candidateId: 'c9' })
  })

  it('counts a truncated call as a call, with no invented arguments', () => {
    const calls = assembleToolCalls({
      requests: [request({ model: 'deepseek/deepseek-v4.1-flash' })],
      responses: [response(streamedCall('focus_probe', '{"elementRef":"e3","candi'))],
      rowRunId: 'D0-1',
      runId: 'run-product-1',
    })
    expect(calls).toHaveLength(1)
    // The call happened; its arguments did not survive. An empty body is honest, a guessed one is not.
    expect(calls[0]!.tool).toBe('focus_probe')
    expect(calls[0]!.body).toEqual({})
  })

  it('does not mistake a tool definition in the request for a call that was made', () => {
    const calls = assembleToolCalls({
      requests: [
        request({
          model: 'deepseek/deepseek-v4.1-flash',
          body: {
            tools: [{ type: 'function', function: { name: 'focus_probe' } }],
            messages: [{ role: 'user', content: 'plan the inspection' }],
          },
        }),
      ],
      responses: [
        response([
          { choices: [{ index: 0, message: { role: 'assistant', content: 'thinking' } }] },
        ]),
      ],
      rowRunId: 'D0-1',
      runId: 'run-product-1',
    })
    expect(calls).toEqual([])
  })

  it("never attributes another repeat's call to this row", () => {
    // `<case>-<repeat>` is a prefix relationship, so an unscoped scan would let D0-3's probe satisfy
    // D0-1's binding check - a pass bought with a different experiment's evidence.
    const calls = assembleToolCalls({
      requests: [request({ model: 'deepseek/deepseek-v4.1-flash', run: 'D0-3', seq: 1 })],
      responses: [response([completeCall('focus_probe', { elementRef: 'e17' })], { run: 'D0-3' })],
      rowRunId: 'D0-1',
      runId: 'run-product-1',
    })
    expect(calls).toEqual([])
  })

  it('keeps calls to other tools, so a reader can see what really happened', () => {
    const calls = assembleToolCalls({
      requests: [request({ model: 'deepseek/deepseek-v4.1-flash' })],
      responses: [response([completeCall('page_act', { type: 'click' })])],
      rowRunId: 'D0-1',
      runId: 'run-product-1',
    })
    expect(calls.map((c) => c.tool)).toEqual(['page_act'])
  })
})

describe('extractVisionExchanges', () => {
  it('pairs the sent image hash with the raw response that came back', () => {
    const exchanges = extractVisionExchanges({
      requests: [request()],
      responses: [
        response([
          {
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: '{"coordinateSpace":"normalized-1000","candidates":[]}',
                },
              },
            ],
          },
        ]),
      ],
      runId: 'D0-1',
      visionModel: 'qwen/qwen3.7-plus',
    })
    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]!.sha256).toBe(imageSha)
    expect(exchanges[0]!.raw).toMatchObject({ coordinateSpace: 'normalized-1000' })
  })

  it('reports an unrecorded response as unknown rather than an empty object', () => {
    // `{}` would read as "the model returned nothing", which passes a coordinateSpace check by
    // accident in the wrong direction and hides a lost response. Unknown is not empty.
    const exchanges = extractVisionExchanges({
      requests: [request()],
      responses: [],
      runId: 'D0-1',
      visionModel: 'qwen/qwen3.7-plus',
    })
    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]!.raw).toBeNull()
  })

  it('reports an unparsable response as unknown, never as a parsed object', () => {
    const exchanges = extractVisionExchanges({
      requests: [request()],
      responses: [response([{ choices: [{ index: 0, message: { content: 'not json at all' } }] }])],
      runId: 'D0-1',
      visionModel: 'qwen/qwen3.7-plus',
    })
    expect(exchanges[0]!.raw).toBeNull()
  })

  it('matches the run exactly, so another repeat cannot leak into this one', () => {
    const exchanges = extractVisionExchanges({
      requests: [request(), request({ run: 'D0-2', seq: 1 })],
      responses: [
        response([
          {
            choices: [{ index: 0, message: { content: '{"coordinateSpace":"normalized-1000"}' } }],
          },
        ]),
        response(
          [
            {
              choices: [
                { index: 0, message: { content: '{"coordinateSpace":"normalized-1000"}' } },
              ],
            },
          ],
          {
            run: 'D0-2',
          },
        ),
      ],
      runId: 'D0-1',
      visionModel: 'qwen/qwen3.7-plus',
    })
    expect(exchanges).toHaveLength(1)
  })

  it('ignores requests to models that are not the vision model', () => {
    const exchanges = extractVisionExchanges({
      requests: [request({ model: 'deepseek/deepseek-v4.1-flash' })],
      responses: [response([])],
      runId: 'D0-1',
      visionModel: 'qwen/qwen3.7-plus',
    })
    expect(exchanges).toEqual([])
  })
})
