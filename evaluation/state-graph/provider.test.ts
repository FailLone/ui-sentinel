import { expect, it } from 'vitest'
import { selectEndpoint, type Endpoint } from './provider.ts'

const endpoint: Endpoint = {
  tag: 'wafer',
  provider_name: 'Wafer',
  status: 0,
  supported_parameters: ['tools', 'tool_choice', 'reasoning', 'max_tokens'],
  supports_tool_choice: { required: true },
  pricing: { prompt: '0.00000007', completion: '0.00000099' },
}
it('uses the pinned endpoint price, ignoring cheaper providers', () => {
  const cheaper = {
    ...endpoint,
    tag: 'other',
    pricing: { prompt: '0.00000001', completion: '0.00000001' },
  }
  expect(selectEndpoint([cheaper, endpoint], 'wafer')).toMatchObject({
    prompt: 0.00000007,
    completion: 0.00000099,
    endpoint: { tag: 'wafer' },
  })
})
it('never silently substitutes an unavailable or incompatible provider', () => {
  expect(() => selectEndpoint([endpoint], 'missing')).toThrow('provider-endpoint-unavailable')
  expect(() => selectEndpoint([{ ...endpoint, status: 1 }], 'wafer')).toThrow(
    'provider-endpoint-unavailable',
  )
  expect(() =>
    selectEndpoint([{ ...endpoint, supports_tool_choice: { required: false } }], 'wafer'),
  ).toThrow('provider-tool-contract-unsupported')
})
it('refuses missing prices and unsupported request charges before inference', () => {
  expect(() => selectEndpoint([{ ...endpoint, pricing: {} }], 'wafer')).toThrow(
    'provider-pricing-invalid',
  )
  expect(() =>
    selectEndpoint([{ ...endpoint, pricing: { ...endpoint.pricing, request: '0.5' } }], 'wafer'),
  ).toThrow('unsupported-request-pricing')
})
