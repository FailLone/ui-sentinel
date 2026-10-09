import { expect, it } from 'vitest'
import { conservativeRates, readUrlScanPrices } from './url-scan-prices.ts'
import { AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'

it('freezes the pinned provider quote instead of the marketplace minimum', async () => {
  const read: typeof fetch = async (url) =>
    Response.json(
      String(url).endsWith('/models')
        ? {
            data: [AGENT_MODEL, VISION_MODEL].map((id) => ({
              id,
              canonical_slug: id + '-fixed',
              pricing: { prompt: '0.00000001' },
            })),
          }
        : {
            data: {
              endpoints: [
                {
                  provider_name: 'Alibaba',
                  status: 0,
                  pricing: {
                    prompt: '0.0000003',
                    completion: '0.0000012',
                    overrides: [{ prompt: '0.00000015', completion: '0.0000006' }],
                  },
                },
              ],
            },
          },
    )
  const prices = await readUrlScanPrices({ agent: 'Alibaba', vision: 'Alibaba' }, read)
  expect(prices[AGENT_MODEL].prompt).toBe(0.0000003)
  expect(prices[AGENT_MODEL].canonicalSlug).toBe(AGENT_MODEL + '-fixed')
  await expect(readUrlScanPrices({ agent: 'Missing', vision: 'Alibaba' }, read)).rejects.toThrow(
    'pinned-provider-unavailable',
  )
})

it('reserves the highest tier plus cache-write cost and refuses unknown non-token billing', () => {
  expect(
    conservativeRates({
      prompt: 1,
      completion: 2,
      overrides: [{ min_prompt_tokens: 100, prompt: 3, completion: 4, input_cache_write: 5 }],
    }),
  ).toEqual({ prompt: 8, completion: 4 })
  expect(() => conservativeRates({ prompt: 1, completion: 2, request: 0.1 })).toThrow(
    'unsupported-non-token-price',
  )
  expect(() => conservativeRates({ prompt: 'unknown', completion: 2 })).toThrow(
    'provider-price-unavailable',
  )
})
