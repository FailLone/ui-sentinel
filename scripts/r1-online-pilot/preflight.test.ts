import { it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkPublishedPrice, preparePaidAccess } from './preflight.ts'
import { makeManifest, POLICY } from './manifest.ts'
import { digest } from '../../src/agent/exploration/integration/host.ts'
const snapshot = JSON.parse(
  readFileSync('evaluation/fixtures/legacy-runs/r1-online-pilot/price-source.json', 'utf8'),
)
function reader(change: (a: any, j: any) => void = () => {}) {
  const a = structuredClone(snapshot.endpoint),
    j = structuredClone(snapshot.jev.endpoint)
  change(a, j)
  // Preserve invalid numeric/type values at the decoder boundary (no coercion by JSON.stringify).
  return vi.fn(
    async (url: any) =>
      ({
        ok: true,
        json: async () => ({
          data: {
            endpoints: [String(url).includes('typesafe') ? j : a],
          },
        }),
      }) as Response,
  ) as unknown as typeof fetch
}
const invalid: unknown[] = [
  undefined,
  null,
  '',
  ' ',
  '\t\n',
  true,
  false,
  {},
  [],
  ['0'],
  'nope',
  'NaN',
  'Infinity',
  NaN,
  Infinity,
  -Infinity,
  -1,
  '-0.1',
  '0x0',
]
const fields = ['agent.prompt', 'agent.completion', 'jev.prompt', 'jev.completion']
for (const field of fields)
  it.each(invalid.map((value, i) => [i, value] as const))(
    `${field} rejects invalid quote #%i before credential, claim, or dispatch`,
    async (_i, value) => {
      const [arm, name] = field.split('.')
      const m = makeManifest('test')
      const credential = vi.fn(() => 'fake-key'),
        claim = vi.fn(),
        dispatch = vi.fn()
      const start = async () => {
        await preparePaidAccess(
          m,
          {
            approvedBy: 'test',
            approvalReference: 'test-only',
            riskAcceptance: m.continuation.acceptance,
            manifestHash: digest(m),
            maxRuns: 9,
            maxCostUsd: POLICY.batchMaxUsd,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
          'test',
          {
            read: reader((a, j) => {
              const p = (arm === 'agent' ? a : j).pricing
              if (value === undefined) delete p[name]
              else p[name] = value
            }),
            credential,
            claim,
          },
        )
        dispatch()
      }
      await expect(start()).rejects.toThrow('price')
      expect(credential).not.toHaveBeenCalled()
      expect(claim).not.toHaveBeenCalled()
      expect(dispatch).not.toHaveBeenCalled()
    },
  )
it('accepts frozen quote and valid zero quotes, preserves credential/claim ordering', async () => {
  await expect(checkPublishedPrice(reader())).resolves.toHaveProperty(
    'jevEndpoint.provider_name',
    'TypeSafe',
  )
  const order: string[] = [],
    m = makeManifest('test')
  const read = reader((a, j) => {
    a.pricing.prompt = 0
    a.pricing.completion = '0'
    a.pricing.request = '0'
    j.pricing.prompt = '0.0'
    j.pricing.completion = 0
  })
  await preparePaidAccess(
    m,
    {
      approvedBy: 'test',
      approvalReference: 'test-only',
      riskAcceptance: m.continuation.acceptance,
      manifestHash: digest(m),
      maxRuns: 9,
      maxCostUsd: POLICY.batchMaxUsd,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
    'test',
    {
      read: (async (...args: Parameters<typeof fetch>) => {
        order.push('quote')
        return read(...args)
      }) as typeof fetch,
      credential: () => {
        order.push('credential')
        return 'fake-key'
      },
      claim: () => {
        order.push('claim')
      },
    },
  )
  expect(order).toEqual(['quote', 'quote', 'credential', 'claim'])
})
it.each(fields)('%s rejects increases without raising frozen caps', async (field) => {
  const [arm, name] = field.split('.')
  await expect(
    checkPublishedPrice(
      reader((a, j) => {
        ;(arm === 'agent' ? a : j).pricing[name] = 1
      }),
    ),
  ).rejects.toThrow('price')
})
it.each(['request', 'image', 'input_cache_write', 'input_cache_read', 'discount'])(
  'rejects invalid present optional %s on either provider',
  async (key) => {
    for (const arm of ['agent', 'jev'])
      for (const value of [null, '', -1, 'NaN', {}]) {
        await expect(
          checkPublishedPrice(
            reader((a, j) => {
              ;(arm === 'agent' ? a : j).pricing[key] = value
            }),
          ),
        ).rejects.toThrow('price')
      }
  },
)
it('rejects unsupported components/tiers and changed model/provider/capability', async () => {
  const changes = [
    (e: any) => {
      e.pricing.extra_fee = '0'
    },
    (e: any) => {
      e.pricing.request = '0.001'
    },
    (e: any) => {
      e.pricing.overrides = [{}]
    },
    (e: any) => {
      delete e.pricing
    },
    (e: any) => {
      delete e.model_id
    },
    (e: any) => {
      e.model_id = 'different'
    },
    (e: any) => {
      e.provider_name = 'different'
    },
    (e: any) => {
      e.status = '0'
    },
    (e: any) => {
      e.context_length = null
    },
  ]
  for (const change of changes)
    for (const arm of ['agent', 'jev'])
      await expect(
        checkPublishedPrice(reader((a, j) => change(arm === 'agent' ? a : j))),
      ).rejects.toThrow()
  await expect(
    checkPublishedPrice(
      reader((a) => {
        a.supported_parameters = []
      }),
    ),
  ).rejects.toThrow()
  await expect(
    checkPublishedPrice(
      reader((_a, j) => {
        j.max_prompt_tokens = null
      }),
    ),
  ).rejects.toThrow()
})

it('refuses withdrawn required/reasoning support and output limits before paid access', async () => {
  for (const change of [
    (e: any) => {
      e.supports_tool_choice.required = false
    },
    (e: any) => {
      e.supported_parameters = e.supported_parameters.filter((p: string) => p !== 'reasoning')
    },
    (e: any) => {
      e.max_completion_tokens = 4095
    },
  ])
    await expect(checkPublishedPrice(reader(change))).rejects.toThrow('capability-changed')
})
