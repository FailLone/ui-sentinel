import { it, expect } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startGateway, AGENT_MODEL } from '../../scripts/experiments/openrouter-gateway.ts'

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
