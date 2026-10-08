import { it, expect, vi } from 'vitest'
const resolve = vi.hoisted(() => vi.fn())
vi.mock('../../execution/network/resolver.ts', () => ({
  createResolver: vi.fn(() => ({ resolve })),
}))
vi.mock('../../shared/config.ts', () => ({
  config: { urlScan: { dns: { mode: 'doh', endpoint: 'deployment-only' } } },
}))
import { createResolver } from '../../execution/network/resolver.ts'
import { resolveHostAddress } from './ui-scan-address.ts'
it('admission uses deployment resolver and does not hide a restricted second answer', async () => {
  resolve.mockResolvedValueOnce(['93.184.216.34', '::1'])
  expect(await resolveHostAddress('entry.invalid')).toBe('::1')
  expect(createResolver).toHaveBeenCalledWith({ mode: 'doh', endpoint: 'deployment-only' })
  resolve.mockRejectedValueOnce(Error('unavailable'))
  expect(await resolveHostAddress('entry.invalid')).toBeNull()
})
