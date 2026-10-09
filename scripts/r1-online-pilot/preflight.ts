import { readFileSync } from 'node:fs'
import { POLICY } from './manifest.ts'
/** Public metadata only, run after authorization and before credentials/claims. No inference probe. */
export async function checkPublishedPrice(read: typeof fetch = fetch) {
  const source = JSON.parse(readFileSync('plans/r1-online-pilot/price-source.json', 'utf8'))
  const response = await read(source.url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!response.ok) throw Error('price-check-unavailable')
  const payload: any = await response.json()
  const found = payload.data?.endpoints?.filter(
    (e: any) => e.provider_name === POLICY.agent.provider && e.status === 0,
  )
  if (found?.length !== 1) throw Error('pinned-provider-unavailable-or-ambiguous')
  const e = found[0],
    p = e.pricing
  if (
    Number(p.prompt) > POLICY.agent.inputPerTokenUsd ||
    Number(p.completion) > POLICY.agent.outputPerTokenUsd ||
    Number(p.request ?? 0) ||
    Number(p.image ?? 0) ||
    Number(p.input_cache_write ?? 0) ||
    p.overrides?.length ||
    e.context_length !== POLICY.agent.contextTokens ||
    !e.supported_parameters.includes('tools')
  )
    throw Error('price-or-capability-changed')
  const jevResponse = await read(source.jev.url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  if (!jevResponse.ok) throw Error('jev-price-check-unavailable')
  const jev: any = await jevResponse.json()
  const endpoints = jev.data?.endpoints?.filter(
    (e: any) => e.provider_name === 'TypeSafe' && e.status === 0,
  )
  if (endpoints?.length !== 1) throw Error('jev-provider-unavailable')
  const jp = endpoints[0].pricing
  if (
    Number(jp.prompt) > 0.000000042 ||
    Number(jp.completion) !== 0 ||
    Number(jp.request ?? 0) ||
    Number(jp.input_cache_write ?? 0) ||
    jp.overrides?.length ||
    endpoints[0].context_length !== 64000 ||
    endpoints[0].name !== 'TypeSafe | typesafe/jev-1.13-20260917'
  )
    throw Error('jev-price-or-version-changed')
  return {
    checkedAt: new Date().toISOString(),
    source: source.url,
    endpoint: e,
    jevSource: source.jev.url,
    jevEndpoint: endpoints[0],
  }
}
