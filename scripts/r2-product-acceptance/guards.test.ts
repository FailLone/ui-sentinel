import { it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startGateway } from '../../evaluation/support/model-gateway.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from '../r1-online-pilot/batch.ts'
import { createValidatedUpstream } from '../r1-product/upstream.ts'
import { authorize, policy, validateQuote } from './policy.ts'
import { rows } from '../../evaluation/private/r2-product-acceptance/truth.ts'
import { digest } from '../../src/agent/exploration/integration/host.ts'

it('has a conservative quote, refuses changed/absent prices and requires a fresh approval', () => {
  const quote = JSON.parse(
    readFileSync('evaluation/private/r2-product-acceptance/price-source.json', 'utf8'),
  )
  const e = validateQuote(quote)
  expect(
    policy.contextTokens * Number(e.pricing.prompt) +
      policy.maxOutputTokens * Number(e.pricing.completion),
  ).toBeLessThan(policy.reserveUsd)
  expect(policy.maxRequests * policy.reserveUsd).toBeCloseTo(policy.maxCostUsd)
  e.pricing.completion = null
  expect(() => validateQuote(quote)).toThrow()
  const frozen = { policy },
    approval = {
      approvedBy: 'test',
      approvalReference: 'test-only',
      manifestHash: digest(frozen),
      maxRuns: 6,
      maxRequests: 120,
      maxCostUsd: 7.56,
      expiresAt: '2099-01-01T00:00:00Z',
    }
  expect(() => authorize(frozen, approval, frozen)).not.toThrow()
  expect(() => authorize(frozen, undefined, frozen)).toThrow()
  expect(() => authorize(frozen, approval, { policy: { ...policy, retries: 1 } })).toThrow()
  expect(() => authorize(frozen, { ...approval, maxCostUsd: 7.55 }, frozen)).toThrow()
})

it('accepts the newly authorized input cap while rejecting any higher price', () => {
  const quote = JSON.parse(
    readFileSync('evaluation/private/r2-product-acceptance/price-source.json', 'utf8'),
  )
  const endpoint = quote.data.endpoints.find(
    (e: any) => e.provider_name === policy.provider && e.status === 0,
  )
  endpoint.pricing.prompt = '0.000000065'
  endpoint.pricing.completion = '0.0000016'
  expect(validateQuote(quote)).toBe(endpoint)
  expect(policy.reserveUsd).toBe(0.063)
  expect(policy.maxCostUsd).toBe(7.56)
  expect(policy.maxWireBytes).toBe(131072)
  endpoint.pricing.prompt = '0.000000065001'
  expect(() => validateQuote(quote)).toThrow('quote-outside-policy')
  endpoint.pricing.prompt = '0.000000065'
  endpoint.pricing.completion = '0.00000160001'
  expect(() => validateQuote(quote)).toThrow('quote-outside-policy')
})

for (const outcome of ['known', 'unknown', 'overrun', 'wrong-provider', 'vision'] as const) {
  it(`covers R2 gateway → shared request ledger with ${outcome}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'r2-fee-gate-'))
    const session = await openCampaignSession(join(dir, 'account'), String(policy.maxCostUsd))
    const batch = createBatch(
      session.ledger,
      { priceSourceSha: 'synthetic' },
      dir,
      undefined,
      undefined,
      { mainRequests: 120, jevRequests: 0, windowMs: 30000 },
    )
    let sent = 0
    const fake: typeof fetch = async () => {
      sent++
      return new Response(
        'data: ' +
          JSON.stringify({
            model: policy.model,
            provider: outcome === 'wrong-provider' ? 'Other' : 'Wafer',
            choices: [],
            ...(outcome === 'unknown'
              ? {}
              : { usage: { cost: outcome === 'overrun' ? 0.064 : 0.001 } }),
          }) +
          '\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const upstream = createValidatedUpstream(fake, {
      context: () => ({ row: 'R1', sequence: 1 }),
      auditWire: batch.auditWire,
      stop: batch.stop,
      record: () => {},
    })
    const gateway = await startGateway('fake', dir, upstream, {
      limitUsd: policy.maxCostUsd,
      estimateCost: batch.estimate,
      ledger: batch.ledger,
      providers: { agent: 'Wafer', vision: 'disabled' },
    })
    const send = () =>
      fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + gateway.token, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: outcome === 'vision' ? 'qwen/qwen3.7-plus' : policy.model,
          stream: true,
          messages: [{ role: 'user', content: 'synthetic guard test' }],
        }),
      })
    try {
      batch.activate(rows[0]!, 'test-row', 'http://127.0.0.1:1')
      gateway.begin('test-row', 20, 30000)
      await (await send()).text()
      await gateway.end()
      const entries = await session.ledger.entries()
      expect(sent).toBe(outcome === 'vision' ? 0 : 1)
      if (outcome === 'known') {
        expect(entries[0]?.status).toBe('settled')
        expect(batch.status().stopped).toBe('')
        batch.end()
        batch.activate(rows[1]!, 'second', 'http://127.0.0.1:1')
        gateway.begin('second', 20, 30000)
      } else {
        expect(batch.status().stopped).not.toBe('')
        expect(() => gateway.begin('next')).toThrow()
        expect((await send()).status).toBe(429)
        expect(sent).toBe(outcome === 'vision' ? 0 : 1)
        if (outcome === 'unknown' || outcome === 'wrong-provider')
          expect((await session.ledger.spending()).unknownReservedUsd).toBe(0.063)
      }
    } finally {
      await gateway.close()
      batch.dispose()
      await session.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
}

it('counts 20 request reservations rather than one task and blocks the 21st dispatch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'r2-request-cap-'))
  const session = await openCampaignSession(dir, String(policy.maxCostUsd))
  const batch = createBatch(
    session.ledger,
    { priceSourceSha: 'synthetic' },
    dir,
    undefined,
    undefined,
    { mainRequests: 120, jevRequests: 0, windowMs: 30000 },
  )
  try {
    batch.activate(rows[0]!, 'row', 'http://127.0.0.1:1')
    for (let i = 0; i < 20; i++) {
      const id = String(i)
      expect(
        (
          await batch.ledger.reserve({
            requestId: id,
            runId: 'row',
            phase: 'test',
            model: policy.model,
            provider: 'Wafer',
            reservedUsd: 0.063,
            priceSource: 'synthetic',
          })
        ).ok,
      ).toBe(true)
      expect((await batch.ledger.dispatch(id, 0, () => true)).ok).toBe(true)
      await batch.ledger.settle(id, 0.001)
    }
    expect(
      (
        await batch.ledger.reserve({
          requestId: '21',
          runId: 'row',
          phase: 'test',
          model: policy.model,
          provider: 'Wafer',
          reservedUsd: 0.063,
          priceSource: 'synthetic',
        })
      ).ok,
    ).toBe(false)
    expect(batch.status().stopped).toBe('request-limit')
  } finally {
    batch.dispose()
    await session.close()
    await rm(dir, { recursive: true, force: true })
  }
})
