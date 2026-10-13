export interface Endpoint {
  tag: string
  provider_name: string
  status: number
  supported_parameters: string[]
  supports_tool_choice?: { required?: boolean; function?: boolean }
  pricing: Record<string, string | number>
}

/** Pin one endpoint, validate capabilities, and reserve at its price rather than the cheapest model price. */
export function selectEndpoint(endpoints: Endpoint[], tag: string) {
  const endpoint = endpoints.find((entry) => entry.tag === tag)
  if (!endpoint || endpoint.status !== 0) throw Error('provider-endpoint-unavailable')
  if (
    !['tools', 'tool_choice', 'reasoning', 'max_tokens'].every((name) =>
      endpoint.supported_parameters.includes(name),
    ) ||
    !endpoint.supports_tool_choice?.required
  )
    throw Error('provider-tool-contract-unsupported')
  const prompt = Number(endpoint.pricing.prompt)
  const completion = Number(endpoint.pricing.completion)
  if (!Number.isFinite(prompt) || prompt <= 0 || !Number.isFinite(completion) || completion <= 0)
    throw Error('provider-pricing-invalid')
  const request = Number(endpoint.pricing.request ?? 0)
  if (!Number.isFinite(request) || request !== 0) throw Error('unsupported-request-pricing')
  return { endpoint, prompt, completion }
}
