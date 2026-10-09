import { readFileSync } from 'node:fs'
import { POLICY, authorize, type Manifest } from './manifest.ts'

/** Do not let JS coercion turn absent, null, blank or compound values into a free quote. */
function price(value: unknown, cap: number, label: string): number {
  if (
    (typeof value !== 'number' &&
      !(typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0 ||
    Number(value) > cap
  )
    throw Error(label + '-invalid-price')
  return Number(value)
}
function pricing(raw: unknown, promptCap: number, completionCap: number, label: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(label + '-invalid-price')
  const p = raw as Record<string, unknown>
  price(p.prompt, promptCap, label)
  price(p.completion, completionCap, label)
  // Absent optional components remain absent. Present unsupported fees must be explicit zero;
  // unknown components/tiers cannot silently inherit zero or the current reservation.
  for (const [key, value] of Object.entries(p)) {
    if (key === 'prompt' || key === 'completion') continue
    if (key === 'input_cache_read') price(value, promptCap, label)
    else if (['request', 'image', 'input_cache_write', 'discount'].includes(key))
      price(value, 0, label)
    else if (key === 'overrides' && Array.isArray(value) && value.length === 0) continue
    else throw Error(label + '-unsupported-pricing-component')
  }
}
function endpoint(payload: any, provider: string, model: string, name: string, label: string) {
  const endpoints = payload?.data?.endpoints
  if (!Array.isArray(endpoints)) throw Error(label + '-endpoints-missing')
  const found = endpoints.filter((e: any) => e?.provider_name === provider && e?.status === 0)
  if (found.length !== 1 || found[0].model_id !== model || found[0].name !== name)
    throw Error(label + '-provider-model-unavailable-or-ambiguous')
  return found[0]
}
/** Public metadata only. Called before credential access, claim creation or inference. */
export async function checkPublishedPrice(read: typeof fetch = fetch) {
  const source = JSON.parse(readFileSync('plans/r1-online-pilot/price-source.json', 'utf8'))
  const response = await read(source.url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!response.ok) throw Error('price-check-unavailable')
  const e = endpoint(
    await response.json(),
    POLICY.agent.provider,
    POLICY.agent.model,
    'Wafer | deepseek/deepseek-v4.1-flash-20260910',
    'agent-price',
  )
  pricing(e.pricing, POLICY.agent.inputPerTokenUsd, POLICY.agent.outputPerTokenUsd, 'agent-price')
  if (
    e.context_length !== POLICY.agent.contextTokens ||
    !Array.isArray(e.supported_parameters) ||
    !['tools', 'tool_choice', 'reasoning', 'max_tokens'].every((p) =>
      e.supported_parameters.includes(p),
    ) ||
    e.supports_tool_choice?.required !== true ||
    typeof e.max_completion_tokens !== 'number' ||
    e.max_completion_tokens < POLICY.agent.maxOutputTokens
  )
    throw Error('agent-price-capability-changed')
  const jevResponse = await read(source.jev.url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  if (!jevResponse.ok) throw Error('jev-price-check-unavailable')
  const j = endpoint(
    await jevResponse.json(),
    POLICY.jev.provider,
    POLICY.jev.model,
    'TypeSafe | ' + POLICY.jev.expectedModel,
    'jev-price',
  )
  pricing(j.pricing, 0.000000042, 0, 'jev-price')
  if (j.context_length !== 64000 || j.max_prompt_tokens !== 32000)
    throw Error('jev-price-or-version-changed')
  return {
    checkedAt: new Date().toISOString(),
    source: source.url,
    endpoint: e,
    jevSource: source.jev.url,
    jevEndpoint: j,
  }
}

/** Actual runner startup ordering, injectable solely to test that invalid quotes cannot spend. */
export async function preparePaidAccess(
  manifest: Manifest,
  approval: unknown,
  sourceSha: string,
  access: {
    read?: typeof fetch
    credential(): string | undefined
    claim(): void
    lineagePreflight?(): void
  },
) {
  authorize(manifest, approval, sourceSha)
  const priceCheck = await checkPublishedPrice(access.read)
  access.lineagePreflight?.()
  const key = access.credential()
  if (!key || /[\r\n]/.test(key)) throw Error('online-credential-missing')
  access.claim()
  return { priceCheck, key }
}
