import { it, expect } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  startGateway,
  AGENT_MODEL,
  REVIEW_MODEL,
} from '../../scripts/experiments/openrouter-gateway.ts'
import { assertColdDecisionInput } from '../../scripts/experiments/isolation.ts'

it('retains redacted non-SSE provider errors for streaming requests and keeps unknown cost reserved', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-http-error-'))
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async () =>
      Response.json(
        { error: { message: 'Unsupported parameter test-secret' } },
        { status: 404 },
      )) as typeof fetch,
    { limitUsd: 1, estimateCost: () => 0.1 },
  )
  try {
    gateway.begin('unsupported', 1, 5000)
    const response = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT_MODEL, stream: true }),
    })
    await response.text()
    const [record] = await gateway.end()
    expect(record).toMatchObject({
      status: 'error',
      httpStatus: 404,
      streamEventCount: 0,
      usage: null,
    })
    expect(record.error).toContain('Unsupported parameter [redacted]')
    expect(await readFile(join(dir, 'ledger.jsonl'), 'utf8')).not.toContain('test-secret')
    expect(gateway.spending()).toMatchObject({
      knownCostUsd: 0,
      unknownCosts: 1,
      unknownReservedUsd: 0.1,
      reservedUsd: 0,
    })
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('retains partial upstream reasoning and response identity after a streaming failure without inventing usage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-partial-'))
  let upstream!: ReadableStreamDefaultController<Uint8Array>
  const encoder = new TextEncoder()
  const event = {
    id: 'partial-response',
    provider: 'fixture-provider',
    choices: [{ delta: { reasoning: '检查 test-secret', content: '' } }],
  }
  const bytes = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            upstream = controller
            // Split in the middle of a UTF-8 character, as transport boundaries can do.
            const split = bytes.indexOf(0xe6) + 1
            controller.enqueue(bytes.slice(0, split))
            controller.enqueue(bytes.slice(split))
            controller.enqueue(encoder.encode('data: {"choices":['))
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )) as typeof fetch,
    { limitUsd: 1, estimateCost: () => 0.1 },
  )
  try {
    gateway.begin('partial', 1, 5000)
    const response = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT_MODEL, stream: true }),
    })
    const body = response.text()
    upstream.error(Error('fixture stream interrupted'))
    await body
    const [record] = await gateway.end()
    expect(record).toMatchObject({
      status: 'error',
      transportComplete: false,
      responseId: 'partial-response',
      provider: 'fixture-provider',
      usage: null,
      streamEventCount: 1,
      firstContentDeltaMs: null,
      firstToolDeltaMs: null,
    })
    expect(record.firstReasoningDeltaMs).toBeTypeOf('number')
    expect(record.receivedBytes).toBeGreaterThan(bytes.byteLength)
    const saved = await readFile(join(dir, 'responses.jsonl'), 'utf8')
    expect(saved).not.toContain('test-secret')
    expect(JSON.parse(saved).events[0].choices[0].delta.reasoning).toBe('检查 [redacted]')
    expect(gateway.spending()).toMatchObject({
      knownCostUsd: 0,
      unknownCosts: 1,
      unknownReservedUsd: 0.1,
    })
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('records complete fragmented SSE and final usage exactly once, including a final line without newline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-complete-stream-'))
  const encoder = new TextEncoder()
  const raw =
    'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\r\n\r\n' +
    'data: {"id":"complete-response","choices":[{"delta":{"tool_calls":[{"function":{"name":"observe","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n' +
    'data: {"choices":[],"usage":{"cost":0.02,"prompt_tokens":5,"completion_tokens":2}}'
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (let i = 0; i < raw.length; i += 7)
              controller.enqueue(encoder.encode(raw.slice(i, i + 7)))
            controller.close()
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )) as typeof fetch,
    { limitUsd: 1, estimateCost: () => 0.1 },
  )
  try {
    gateway.begin('complete', 1, 5000)
    const response = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT_MODEL, stream: true }),
    })
    expect(await response.text()).toBe(raw)
    const [record] = await gateway.end()
    expect(record).toMatchObject({
      status: 'success',
      transportComplete: true,
      streamEventCount: 3,
      firstReasoningDeltaMs: null,
      firstContentDeltaMs: null,
      usage: { cost: 0.02 },
    })
    expect(record.firstToolDeltaMs).toBeTypeOf('number')
    expect(JSON.parse(await readFile(join(dir, 'responses.jsonl'), 'utf8')).events).toHaveLength(3)
    expect(gateway.spending()).toMatchObject({
      knownCostUsd: 0.02,
      unknownCosts: 0,
      reservedUsd: 0,
    })
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('experiment gateway refuses new requests once estimated spending exceeds the cap (fake upstream)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-budget-'))
  let calls = 0
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async () => {
      calls++
      return new Response(
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 4, completion_tokens: 2, cost: 0.7 },
        }),
      )
    }) as typeof fetch,
    { limitUsd: 1, estimateCost: () => 0.5 },
  )
  const call = () =>
    fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT_MODEL }),
    })
  try {
    gateway.begin('test', 30, 5000)
    expect((await call()).status).toBe(200)
    await gateway.end()
    gateway.begin('next', 30, 5000)
    expect((await call()).status).toBe(429)
    expect(calls).toBe(1)
    expect(gateway.spending().accountedUsd).toBe(0.7)
  } finally {
    await gateway.end()
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('experiment gateway enforces actual request limits, model allowlist and credential isolation (fake upstream)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-test-'))
  let forwarded = 0
  const gateway = await startGateway('test-upstream-secret', dir, (async (_url, init) => {
    forwarded++
    expect((init!.headers as any).authorization).toBe('Bearer test-upstream-secret')
    const body = JSON.parse(String(init!.body))
    expect(body.max_tokens).toBe(4096)
    expect(body.reasoning).toEqual({ effort: 'low' })
    return new Response(
      JSON.stringify({
        id: 'test',
        choices: [],
        usage: { prompt_tokens: 4, completion_tokens: 2 },
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch)
  const call = (model = AGENT_MODEL, token = gateway.token) =>
    fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [] }),
    })
  try {
    gateway.begin('test', 1, 5000)
    expect((await call(AGENT_MODEL, 'wrong')).status).toBe(401)
    expect((await call('unexpected/model')).status).toBe(400)
    const good = await call()
    expect(good.status).toBe(200)
    await good.json()
    expect((await call()).status).toBe(429)
    const records = await gateway.end()
    expect(records).toHaveLength(1)
    expect(records[0].usage.prompt_tokens).toBe(4)
    expect(forwarded).toBe(1)
    expect(await readFile(join(dir, 'requests.jsonl'), 'utf8')).not.toContain(
      'test-upstream-secret',
    )
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('experiment gateway retains failed requests with unknown usage (fake upstream)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-fail-'))
  const gateway = await startGateway('test-secret', dir, (async () => {
    throw Error('transport failed test-secret')
  }) as typeof fetch)
  try {
    gateway.begin('test', 1, 5000)
    const response = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT_MODEL }),
    })
    expect(response.status).toBe(502)
    await response.json()
    const records = await gateway.end()
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('error')
    expect(records[0].usage).toBeNull()
    expect(records[0].error).not.toContain('test-secret')
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('cancels upstream on downstream disconnect and retains unknown spending (fake upstream)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-cancel-'))
  let started!: () => void, cancelled!: () => void
  const begun = new Promise<void>((r) => {
    started = r
  })
  const aborted = new Promise<void>((r) => {
    cancelled = r
  })
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async (_url, init) => {
      started()
      return new Promise((_resolve, reject) => {
        const abort = () => {
          cancelled()
          reject(init!.signal!.reason)
        }
        if (init!.signal!.aborted) abort()
        else init!.signal!.addEventListener('abort', abort, { once: true })
      })
    }) as typeof fetch,
    { limitUsd: 1, estimateCost: () => 0.1 },
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    gateway.begin('test', 2, 10000)
    const controller = new AbortController()
    const request = fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT_MODEL }),
    }).catch(() => undefined)
    await begun
    controller.abort()
    await request
    await Promise.race([
      aborted,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('upstream not cancelled')), 1000)
      }),
    ])
    const records = await gateway.end()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ status: 'error', usage: null })
    expect(gateway.spending()).toMatchObject({
      knownCostUsd: 0,
      unknownCosts: 1,
      unknownReservedUsd: 0.1,
      accountedUsd: 0.1,
      reservedUsd: 0,
    })
    expect(await readFile(join(dir, 'ledger.jsonl'), 'utf8')).toContain('downstream-disconnected')
  } finally {
    clearTimeout(timer)
    await gateway.end()
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('changes reasoning only for an explicit isolated experimental arm while keeping output and model budgets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-reasoning-'))
  let forwarded: any
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async (_url, init) => {
      forwarded = JSON.parse(String(init!.body))
      return new Response(
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 },
        }),
      )
    }) as typeof fetch,
    { limitUsd: 0.1, estimateCost: () => 0.01 },
    'disabled',
  )
  try {
    gateway.begin('disabled', 1, 5000)
    const response = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: AGENT_MODEL,
        reasoning: { effort: 'high' },
        max_tokens: 100000,
      }),
    })
    expect(response.ok).toBe(true)
    expect(forwarded.reasoning).toEqual({ enabled: false })
    expect(forwarded.max_tokens).toBe(4096)
    expect(forwarded.model).toBe(AGENT_MODEL)
  } finally {
    await gateway.end()
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('freezes reasoning per run and restores the gateway default for later runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-profile-'))
  const bodies: any[] = []
  const gateway = await startGateway('test-secret', dir, (async (_url, init) => {
    bodies.push(JSON.parse(String(init!.body)))
    return new Response(JSON.stringify({ choices: [], usage: { cost: 0 } }))
  }) as typeof fetch)
  try {
    for (const disabled of [true, false]) {
      gateway.begin(
        `profile-${disabled}`,
        1,
        5000,
        disabled ? { agentReasoning: 'disabled' } : undefined,
      )
      const response = await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: AGENT_MODEL, reasoning: { effort: 'high' } }),
      })
      expect(response.ok).toBe(true)
      await response.text()
      expect((await gateway.end()).length).toBe(1)
    }
    expect(bodies.map((b) => b.reasoning)).toEqual([{ enabled: false }, { effort: 'low' }])
    expect(bodies.every((b) => b.max_tokens === 4096)).toBe(true)
  } finally {
    await gateway.end()
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('rejects inherited trial memory before any paid request and permits an isolated decision', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-isolation-'))
  let forwarded = 0
  const gateway = await startGateway('test-secret', dir, (async () => {
    forwarded++
    return new Response(JSON.stringify({ choices: [], usage: { cost: 0 } }))
  }) as typeof fetch)
  try {
    gateway.begin('isolated', 2, 5000, {
      agentReasoning: 'low',
      guardInput: assertColdDecisionInput,
    })
    for (const inherited of [true, false]) {
      const response = await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: AGENT_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    activeTools: ['page_act'],
                    availableJourneys: inherited ? [{ id: 'from-previous-trial' }] : [],
                  }),
                },
              ],
            },
          ],
        }),
      })
      expect(response.status).toBe(inherited ? 409 : 200)
      await response.text()
      expect(forwarded).toBe(inherited ? 0 : 1)
    }
    expect((await gateway.end()).length).toBe(1)
    expect(gateway.integrityViolations()).toHaveLength(1)
    expect(await readFile(join(dir, 'integrity-violations.jsonl'), 'utf8')).toContain(
      'cross-run-history-detected',
    )
    expect(() => assertColdDecisionInput({ messages: [] })).toThrow('input-contract')
  } finally {
    await gateway.end()
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('accounts typed Decisions and explorer calls under the same gateway request and spending limits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-decisions-'))
  let forwarded = 0
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async (url, init) => {
      forwarded++
      expect(url).toBe('https://openrouter.ai/api/alpha/decisions')
      const body = JSON.parse(String(init?.body))
      expect(body).not.toHaveProperty('max_tokens')
      expect(body).not.toHaveProperty('provider')
      expect(body).not.toHaveProperty('reasoning')
      return Response.json({
        id: 'd1',
        model: 'typesafe/jev-1.13-20260917',
        provider: 'TypeSafe',
        answers: { completion: { choice: 'unknown' } },
        usage: { input_tokens: 100, output_tokens: 1, cost: 0.01 },
      })
    }) as typeof fetch,
    { limitUsd: 0.015, estimateCost: () => 0.01 },
  )
  try {
    gateway.begin('shared', 2, 5000)
    const send = (model: string, path: string) =>
      fetch(gateway.url + path, {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          state: { goal: 'inspect' },
          questions: { completion: { type: 'choice' } },
        }),
      })
    const result = await send(REVIEW_MODEL, '/decisions')
    expect(result.status).toBe(200)
    await result.text()
    const blocked = await send(AGENT_MODEL, '/chat/completions')
    expect(blocked.status).toBe(429)
    expect(forwarded).toBe(1)
    const records = await gateway.end()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      model: REVIEW_MODEL,
      actualModel: 'typesafe/jev-1.13-20260917',
      provider: 'TypeSafe',
      usage: { prompt_tokens: 100, completion_tokens: 1, cost: 0.01 },
    })
    expect(gateway.spending().knownCostUsd).toBe(0.01)
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})
