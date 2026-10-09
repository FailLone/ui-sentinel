import { it, expect } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startGateway } from './model-gateway.ts'

const fixture = async (name: string) =>
  JSON.parse(await readFile(new URL(`./fixtures/r1-http400/${name}.json`, import.meta.url), 'utf8'))

it('replays the saved 400 with unchanged wire, bounded correlation headers, and unknown stop', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-r1-400-'))
  const body = await fixture('request')
  const error = await fixture('error')
  let calls = 0
  const gateway = await startGateway(
    'fixture-secret',
    dir,
    async (url, init) => {
      calls++
      expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(JSON.parse(String(init?.body))).toEqual(body)
      return Response.json(error, {
        status: 400,
        headers: {
          'x-request-id': 'req-fixture-400',
          'x-openrouter-request-id': 'fixture-secret',
          'cf-ray': '0123456789abcdef-SJC',
          'set-cookie': 'private-cookie',
          authorization: 'Bearer private-authorization',
          'x-account-id': 'private-account',
        },
      })
    },
    {
      limitUsd: 0.053,
      estimateCost: () => 0.053,
      providers: { agent: 'Wafer', vision: 'disabled' },
    },
  )
  try {
    gateway.begin('saved-failure-fixture', 1, 5000)
    const response = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(error)
    const [record] = await gateway.end()
    expect(record).toMatchObject({
      httpStatus: 400,
      status: 'error',
      usage: null,
      transportComplete: true,
      streamEventCount: 0,
      responseHeaders: { 'x-request-id': 'req-fixture-400', 'cf-ray': '0123456789abcdef-SJC' },
    })
    expect(record).not.toHaveProperty('responseId')
    expect(gateway.spending()).toMatchObject({
      knownCostUsd: 0,
      unknownCosts: 1,
      unknownReservedUsd: 0.053,
      reservedUsd: 0,
    })
    expect(() => gateway.begin('must-not-retry')).toThrow('cost-unknown')
    expect(calls).toBe(1)
    const saved = await readFile(join(dir, 'ledger.jsonl'), 'utf8')
    for (const secret of [
      'fixture-secret',
      gateway.token,
      'private-cookie',
      'private-authorization',
      'private-account',
    ])
      expect(saved).not.toContain(secret)
    expect(JSON.parse(saved).responseHeaders).toEqual(record.responseHeaders)
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('retains only valid bounded response headers even when the body fails before its first byte', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-r1-header-only-'))
  const gateway = await startGateway(
    'fixture-secret',
    dir,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(Error('fixture body failed'))
          },
        }),
        {
          headers: {
            'x-request-id': 'x'.repeat(129),
            'cf-ray': 'invalid value',
            'x-openrouter-request-id': 'req-header-only',
          },
        },
      ),
    {
      limitUsd: 0.053,
      estimateCost: () => 0.053,
      providers: { agent: 'Wafer', vision: 'disabled' },
    },
  )
  try {
    gateway.begin('header-only', 1, 5000)
    await (
      await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(await fixture('request')),
      })
    ).text()
    const [record] = await gateway.end()
    expect(record.responseHeaders).toEqual({ 'x-openrouter-request-id': 'req-header-only' })
    expect(record).toMatchObject({
      status: 'error',
      transportComplete: false,
      usage: null,
      receivedBytes: 0,
    })
    expect(gateway.spending().unknownReservedUsd).toBe(0.053)
  } finally {
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})
