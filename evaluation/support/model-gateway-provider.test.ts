import { it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startGateway, AGENT_MODEL } from './model-gateway.ts'

/**
 * The gateway is the only place a provider name becomes a routing constraint.
 *
 * The acceptance plan's 8.4 fixes this baseline to Wafer (agent) and Alibaba (vision); the gateway
 * turns those names into OpenRouter's `provider.only`. With the variables unset it sends no
 * constraint at all, which is not a neutral default: it lets OpenRouter pick any endpoint of the
 * model, and that is how the first paid diagnostic on this machine came to be served by DeepInfra
 * and Sail Research at 20-54s per call instead of the baseline's Wafer at 4-11s, exhausting the
 * plan's fixed 300s ceiling mid-inspection.
 *
 * This asserts the request bodies that actually leave for the upstream, so it fails if the pin stops
 * being applied rather than only if the resolving helper changes.
 */
it('sends the pinned provider as provider.only, and no constraint at all when unpinned', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-provider-pin-'))
  const bodies: Record<string, unknown>[] = []
  const gateway = await startGateway(
    'test-secret',
    dir,
    (async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return Response.json({
        id: 'fixture',
        model: AGENT_MODEL,
        provider: 'Wafer',
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
    }) as typeof fetch,
    { limitUsd: 1, estimateCost: () => 0.001 },
  )
  const send = () =>
    fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT_MODEL, messages: [{ role: 'user', content: 'go' }] }),
    })
  try {
    process.env.VALIDATION_AGENT_PROVIDER = 'Wafer'
    gateway.begin('pinned', 1, 5000)
    await (await send()).text()
    await gateway.end()
    expect(bodies[0].provider).toEqual({
      allow_fallbacks: false,
      require_parameters: true,
      only: ['Wafer'],
    })

    delete process.env.VALIDATION_AGENT_PROVIDER
    gateway.begin('unpinned', 1, 5000)
    await (await send()).text()
    await gateway.end()
    // No `only` key: the request is unconstrained, which is the state the pin exists to prevent.
    expect(bodies[1].provider).toEqual({ allow_fallbacks: false, require_parameters: true })
    expect(bodies[1].provider).not.toHaveProperty('only')
  } finally {
    delete process.env.VALIDATION_AGENT_PROVIDER
    await gateway.close()
    await rm(dir, { recursive: true, force: true })
  }
})
