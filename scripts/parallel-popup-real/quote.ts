import { POLICY, type BatchPolicy } from './policy.ts'
export async function publishedQuotes(policy: BatchPolicy = POLICY) {
  const result: Record<string, unknown> = {}
  for (const [kind, model] of Object.entries({ main: policy.main, jev: policy.jev })) {
    const url = `https://openrouter.ai/api/v1/models/${model.model}/endpoints`
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw Error('public-quote-unavailable')
    const body = (await response.json()) as any
    const matches = body.data?.endpoints?.filter(
      (e: any) => e.provider_name === model.provider && e.status === 0,
    )
    if (matches?.length !== 1) throw Error('provider-quote-identity-changed')
    const e = matches[0],
      p = e.pricing
    if (
      e.model_id !== model.model ||
      !Number.isFinite(Number(p?.prompt)) ||
      Number(p.prompt) < 0 ||
      Number(p.prompt) > model.promptPrice ||
      !Number.isFinite(Number(p?.completion)) ||
      Number(p.completion) < 0 ||
      Number(p.completion) > model.outputPrice ||
      Object.entries(p).some(
        ([k, v]) =>
          !['prompt', 'completion'].includes(k) &&
          (k === 'input_cache_read'
            ? !(Number(v) >= 0 && Number(v) <= model.promptPrice)
            : !['discount', 'request', 'image', 'input_cache_write'].includes(k) ||
              Number(v) !== 0),
      )
    )
      throw Error('public-quote-outside-ceiling')
    if (
      kind === 'main' &&
      (e.context_length !== policy.main.contextTokens ||
        !e.supported_parameters?.includes('tools') ||
        !e.supported_parameters?.includes('reasoning_effort'))
    )
      throw Error('main-capability-changed')
    if (
      kind === 'jev' &&
      (e.context_length !== 64000 ||
        e.max_prompt_tokens !== 32000 ||
        e.name !== 'TypeSafe | typesafe/jev-1.13-20260917')
    )
      throw Error('jev-capability-changed')
    result[kind] = { url, checkedAt: new Date().toISOString(), endpoint: e }
  }
  return result
}
