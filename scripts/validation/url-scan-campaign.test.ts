import { expect, it } from 'vitest'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  assertUrlCampaignApproval,
  runUrlCampaign,
  urlScanIdentity,
  urlScanConfiguration,
  assertFrozenConfiguration,
} from './url-scan-campaign.ts'
import { buildUrlScanManifest, redactConfiguration } from './url-scan-freeze.ts'
import { urlScanTruth } from '../../evaluation/private/url-scan/truth.ts'
import { AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'

it('refuses absent approval before opening any provider connection', () => {
  const manifest = buildUrlScanManifest({
    commit: 'a'.repeat(40),
    buildHash: 'b',
    fixtureHash: 'c',
    scorerHash: 'd',
    configuration: {},
    policyRevision: '1',
    promptRevision: '1',
    samples: ['healthy-catalog'],
    repetitions: 1,
    costCeilingUsd: 2,
  })
  expect(() => assertUrlCampaignApproval(manifest, 'test', 'diagnostic', null)).toThrow(
    'explicit-paid-approval-required',
  )
})

// Opt-in integration because it starts six compiled services. The default suite tests the gate;
// validate:url-scan remains the always-free workbench preflight. This env flag never reaches a real provider.
it.runIf(process.env.URL_SCAN_FREE_CAMPAIGN_TEST === '1')(
  'executes every frozen campaign row with a fake upstream and labels results B, retaining failures',
  async () => {
    const identity = await urlScanIdentity()
    const prices = Object.fromEntries(
      [AGENT_MODEL, VISION_MODEL].map((model) => [
        model,
        {
          prompt: 0.0000001,
          completion: 0.0000001,
          provider: 'fixture',
          canonicalSlug: model + '-pinned',
          source: 'https://openrouter.ai/api/v1/models/' + model + '/endpoints',
          quote: { prompt: 0.0000001, completion: 0.0000001 },
        },
      ]),
    )
    const manifest = buildUrlScanManifest({
      ...identity,
      configuration: urlScanConfiguration({
        providers: { agent: 'fixture', vision: 'fixture' },
        prices,
        stage: 'diagnostic',
      }),
      policyRevision: 'test',
      promptRevision: 'test',
      samples: [...urlScanTruth().samples.map((s) => s.sampleId), 'boundary-diagnostic'],
      repetitions: 1,
      costCeilingUsd: 2,
    })
    const batch = 'free-' + randomUUID()
    await mkdir(resolve('data/r0-url-campaign'), { recursive: true })
    let requests = 0
    const upstreamFetch: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/models'))
        return Response.json({
          data: Object.entries(prices).map(([id, pricing]) => ({
            id,
            canonical_slug: pricing.canonicalSlug,
            pricing,
          })),
        })
      if (String(input).endsWith('/endpoints')) {
        const model = String(input).split('/models/')[1]!.replace('/endpoints', '')
        return Response.json({
          data: {
            endpoints: [{ provider_name: 'fixture', status: 0, pricing: prices[model]!.quote }],
          },
        })
      }
      requests++
      const body = JSON.parse(String(init?.body))
      if (!body.stream)
        return Response.json({
          id: 'smoke',
          object: 'chat.completion',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0 },
        })
      const state = String(body.messages?.find((m: any) => m.role === 'user')?.content ?? '')
      const turn = state.split('"index"').length - 1
      const packet = JSON.parse(state)
      const entry = packet.inspectionScope?.scope?.entryUrl ?? packet.inspectionScope?.entryUrl
      // Only public input is used. No private variant, answer key or scoring instructions enter messages.
      const origin = entry ? new URL(entry).origin : undefined
      const fromState = state.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
      const action =
        turn === 0
          ? {
              name: 'page_act',
              args: {
                type: 'click',
                selector: '#apply',
                verify: {
                  selector: '#rows .price',
                  condition: 'numeric-ascending',
                  basis: 'The public sort choice is Price',
                },
              },
            }
          : turn === 1
            ? { name: 'page_act', args: { type: 'navigate', url: (origin ?? fromState) + '/info' } }
            : {
                name: 'run_finish',
                args: { reason: turn > 2 ? 'unverified-scope' : 'scope-covered' },
              }
      const base = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model: body.model }
      return new Response(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: randomUUID(), type: 'function', function: { name: action.name, arguments: JSON.stringify(action.args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, cost: 0 } })}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const approval = {
      manifestHash: manifest.hash,
      batch,
      mode: 'diagnostic',
      paid: true,
      maxRuns: 6,
      ceilingUsd: 2,
      campaignDirectory: resolve('data/r0-url-campaign', batch + '-ledger'),
      smokeRequests: 1,
    }
    // The fixed model does not investigate the defect: that row must stay failed, not become a C pass.
    await expect(
      runUrlCampaign(manifest, batch, 'diagnostic', { approval, upstreamFetch }),
    ).rejects.toThrow('url-campaign-not-passed')
    const summary = JSON.parse(
      await readFile(resolve('data/r0-url-campaign', batch, 'summary.json'), 'utf8'),
    )
    expect(summary.evidenceClass).toBe('B')
    expect(summary.r0Accepted).toBe(false)
    expect(summary.rows).toHaveLength(6)
    expect(summary.rows.every((r: any) => r.status !== 'not-run')).toBe(true)
    expect(summary.rows.some((r: any) => !r.passed)).toBe(true)
    expect(requests).toBeGreaterThan(6)
  },
  150_000,
)

it('refuses changed runtime budgets and flags in the frozen configuration', () => {
  const config = urlScanConfiguration({
    providers: { agent: 'fixture', vision: 'fixture' },
    prices: {},
    stage: 'diagnostic',
  })
  expect(() => assertFrozenConfiguration(config)).not.toThrow()
  expect(() =>
    assertFrozenConfiguration({ ...config, budget: { ...config.budget, maxActions: 21 } }),
  ).toThrow('frozen-configuration-mismatch')
  expect(() =>
    assertFrozenConfiguration({ ...config, lengthRecoveryWithoutReasoning: true }),
  ).toThrow('frozen-configuration-mismatch')
})

it('keeps public token limits and price tiers through the actual freeze serialization', () => {
  const prices = { model: { quote: { overrides: [{ min_prompt_tokens: 256000 }] } } }
  const configuration = urlScanConfiguration({
    providers: { agent: 'Alibaba', vision: 'Alibaba' },
    prices,
    stage: 'diagnostic',
  })
  const redacted = redactConfiguration(configuration)
  expect(redacted).toEqual(configuration)
  expect(() => assertFrozenConfiguration(redacted)).not.toThrow()
  expect(
    redactConfiguration({
      apiKey: 'secret',
      authToken: 123,
      maxOutputTokens: 'secret',
      cookie: 'secret',
    }),
  ).toEqual({
    apiKey: '<redacted>',
    authToken: '<redacted>',
    maxOutputTokens: '<redacted>',
    cookie: '<redacted>',
  })
})
