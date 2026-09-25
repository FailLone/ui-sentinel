import { it, expect } from 'vitest'
import { buildContractSnapshot, resolveProfile } from '../business/registry.ts'
import { createBusinessRuntime } from '../business/runtime.ts'
import type { BusinessFact } from '../business/adapters/types.ts'
import { isAllowedBusinessDownload } from './download-policy.ts'

const runtime = createBusinessRuntime(
  buildContractSnapshot(resolveProfile({ id: 'export', revision: '1' })!),
)
const origin = runtime.contract.environment.publicOrigin
const fact = { operationId: 'job-own', phase: 'succeeded' } as BusinessFact
const allowed = (path: string, method = 'GET', current = fact) =>
  isAllowedBusinessDownload(
    { url: new URL(path, origin).href, method, origin },
    runtime,
    (id) => id === 'job-own',
    () => current,
  )
it('permits only a declared download of the current successful owned operation', () => {
  expect(allowed('/api/exports/job-own/download')).toBe(true)
  expect(allowed('/api/exports/job-other/download')).toBe(false)
  expect(allowed('/api/exports/job-own/download', 'POST')).toBe(false)
  for (const phase of ['processing', 'failed', 'rejected'] as const)
    expect(allowed('/api/exports/job-own/download', 'GET', { ...fact, phase })).toBe(false)
  for (const path of [
    '/api/exports/job-own',
    '/api/exports/job-own/retry',
    '/__control/download',
    '/api/exports/%2e%2e/download',
    '/api/exports/job-own/download?redirect=/__control',
    'https://example.com/api/exports/job-own/download',
    '/api/exports/job-own/download/extra',
  ])
    expect(allowed(path), path).toBe(false)
})
