import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { authorize, policy, validateQuote } from './policy.ts'
import { digest } from '../../src/agent/exploration/integration/host.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { startGateway } from '../../evaluation/support/model-gateway.ts'
import { createBatch } from '../r1-online-pilot/batch.ts'
it('uses an explicit conservative quote and never accepts stale R2 approval', () => {
  const raw = JSON.parse(readFileSync('evaluation/r3-path-reuse/price-source.json', 'utf8')).payload
  const endpoint = validateQuote(raw)
  expect(
    policy.contextTokens * policy.promptPrice + policy.maxOutputTokens * policy.outputPrice,
  ).toBeLessThan(policy.reserveUsd)
  expect(policy.maxRequests * policy.reserveUsd).toBe(policy.maxCostUsd)
  endpoint.pricing.completion = '0.000000990001'
  expect(() => validateQuote(raw)).toThrow('quote-outside-policy')
  const frozen = { policy },
    approval = {
      approvedBy: 'test',
      approvalReference: 'not-real',
      manifestHash: digest(frozen),
      maxRuns: 4,
      maxRequests: 32,
      maxCostUsd: 2.56,
      expiresAt: '2099-01-01T00:00:00Z',
    }
  expect(() => authorize(frozen, approval, frozen)).not.toThrow()
  for (const change of [
    { maxRuns: 6, maxRequests: 120, maxCostUsd: 7.56 },
    { manifestHash: 'other' },
    { approvedBy: '' },
    { expiresAt: '2000-01-01T00:00:00Z' },
  ])
    expect(() => authorize(frozen, { ...approval, ...change }, frozen)).toThrow()
  expect(() => authorize(frozen, approval, { policy: { ...policy, retries: 1 } })).toThrow(
    'frozen-input-or-build-changed',
  )
})
it.each(['zero', 'known', 'unknown'])(
  'R3 ledger/gateway %s mode has no fallback or unreserved request',
  async (mode) => {
    const dir = await mkdtemp(join(tmpdir(), 'r3-ledger-')),
      session = await openCampaignSession(join(dir, 'account'), '2.56')
    const batch = createBatch(
      session.ledger,
      { priceSourceSha: 'free-test' },
      dir,
      undefined,
      undefined,
      { mainRequests: 32, jevRequests: 0, windowMs: 10000, mainReserveUsd: 0.08 },
    )
    let sent = 0
    const gateway = await startGateway(
      'local-only',
      dir,
      async () => {
        sent++
        return new Response(
          'data: ' +
            JSON.stringify({
              model: policy.model,
              provider: policy.provider,
              choices: [],
              ...(mode === 'known' ? { usage: { cost: 0.001 } } : {}),
            }) +
            '\n\ndata: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        )
      },
      {
        limitUsd: 2.56,
        estimateCost: batch.estimate,
        ledger: batch.ledger,
        providers: { agent: policy.provider, vision: 'disabled' },
      },
    )
    try {
      batch.activate(
        {
          id: 'test',
          scenario: 'test',
          mode: 'program',
          maxAgentRequests: mode === 'zero' ? 0 : 1,
          maxJevRequests: 0,
        },
        'r3-test',
        'http://127.0.0.1:1',
      )
      gateway.begin('r3-test', mode === 'zero' ? 0 : 1, 10000)
      const response = await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + gateway.token, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: policy.model,
          stream: true,
          messages: [{ role: 'user', content: 'local test' }],
        }),
      })
      await response.text()
      await gateway.end()
      expect(sent).toBe(mode === 'zero' ? 0 : 1)
      const entries = await session.ledger.entries()
      expect(entries).toHaveLength(mode === 'zero' ? 0 : 1)
      if (mode !== 'zero') expect(Number(entries[0]!.reservedUsd)).toBe(0.08)
      if (mode === 'unknown') {
        expect(entries[0]!.status).toBe('unknown')
        expect(batch.status().stopped).not.toBe('')
        expect(() => batch.guard()).toThrow('online-batch-stopped')
      }
    } finally {
      await gateway.close()
      batch.dispose()
      await session.close()
    }
  },
)
