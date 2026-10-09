import { readFileSync } from 'node:fs'
import { POLICY } from './manifest.ts'
/** Public metadata only, run after authorization and before credentials/claims. No inference probe. */
export async function checkPublishedPrice(read: typeof fetch = fetch) {
  const source = JSON.parse(readFileSync('plans/r1-online-pilot/price-source.json', 'utf8'))
  const response = await read(source.url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!response.ok) throw Error('price-check-unavailable')
  const payload: any = await response.json()
  const found = payload.data?.endpoints?.filter((e: any) => e.provider_name === POLICY.agent.provider && e.status === 0)
  if (found?.length !== 1) throw Error('pinned-provider-unavailable-or-ambiguous')
  const e = found[0], p = e.pricing
  if (Number(p.prompt) > POLICY.agent.inputPerTokenUsd || Number(p.completion) > POLICY.agent.outputPerTokenUsd ||
      Number(p.request ?? 0) || Number(p.image ?? 0) || Number(p.input_cache_write ?? 0) || p.overrides?.length ||
      e.context_length !== POLICY.agent.contextTokens || !e.supported_parameters.includes('tools')) throw Error('price-or-capability-changed')
  return { checkedAt: new Date().toISOString(), source: source.url, endpoint: e,
    jevPriceBasis: source.jev, jevNote: 'Published quote must be reviewed at authorization; no inference probe.' }
}
