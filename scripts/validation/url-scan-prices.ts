import { AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'

/** Freeze the pinned provider's quote, never a cheaper marketplace-wide minimum.
 * Reserve using the largest tier/time-window rate; do not assume a discount or cache hit.
 */
export function conservativeRates(pricing: Record<string, any>) {
  const tiers = [pricing, ...(pricing.overrides ?? [])]
  if (tiers.some((tier) => Number(tier.request ?? 0) !== 0 || Number(tier.image ?? 0) !== 0))
    throw Error('unsupported-non-token-price')
  const values = (key: string) => tiers.map((tier) => Number(tier[key] ?? pricing[key] ?? 0))
  const prompt = Math.max(...values('prompt')) + Math.max(...values('input_cache_write'))
  const completion = Math.max(...values('completion'))
  if (![prompt, completion].every((value) => Number.isFinite(value) && value > 0))
    throw Error('provider-price-unavailable')
  return { prompt, completion }
}

export async function readUrlScanPrices(
  providers: { agent: string; vision: string },
  read: typeof fetch = fetch,
) {
  const get = async (url: string) => {
    const response = await read(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw Error(`price-lookup-failed:${response.status}`)
    return response.json() as Promise<any>
  }
  const catalog = await get('https://openrouter.ai/api/v1/models')
  const result: Record<string, any> = {}
  for (const [model, provider] of [
    [AGENT_MODEL, providers.agent],
    [VISION_MODEL, providers.vision],
  ] as const) {
    const canonicalSlug = catalog.data?.find((entry: any) => entry.id === model)?.canonical_slug
    const source = `https://openrouter.ai/api/v1/models/${model}/endpoints`
    const endpoints = await get(source)
    const matches =
      endpoints.data?.endpoints?.filter(
        (entry: any) => entry.provider_name === provider && entry.status === 0,
      ) ?? []
    if (!canonicalSlug || matches.length !== 1)
      throw Error(`pinned-provider-unavailable-or-ambiguous:${model}`)
    const quote = matches[0].pricing
    result[model] = { ...conservativeRates(quote), provider, canonicalSlug, source, quote }
  }
  return result
}
