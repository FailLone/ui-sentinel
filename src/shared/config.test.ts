import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('dotenv/config', () => ({}))
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('EXECUTION_ATOMIC_INVESTIGATION', undefined)
  vi.stubEnv('EXECUTION_BLOCKER_REVIEW', undefined)
  vi.stubEnv('COMPLETION_REVIEW_API_KEY', '')
  vi.stubEnv('OPENROUTER_API_KEY', '')
})
afterEach(() => vi.unstubAllEnvs())
describe('validated feature defaults and explicit review access', () => {
  it('enables bounded investigation without adding a review model dependency', async () => {
    const { config, checkModelConfig } = await import('./config.ts')
    expect(config.features.atomicInvestigation).toBe(true)
    expect(config.features.blockerReview).toBe(false)
    expect(checkModelConfig().missing).not.toContain(
      'COMPLETION_REVIEW_API_KEY or OPENROUTER_API_KEY',
    )
  })
  it('keeps the previous investigation path available by explicit opt-out', async () => {
    vi.stubEnv('EXECUTION_ATOMIC_INVESTIGATION', '0')
    expect((await import('./config.ts')).config.features.atomicInvestigation).toBe(false)
  })
  it('requires credentials when the finite review is explicitly enabled', async () => {
    vi.stubEnv('EXECUTION_BLOCKER_REVIEW', '1')
    const { config, checkModelConfig } = await import('./config.ts')
    expect(config.features.blockerReview).toBe(true)
    expect(checkModelConfig().missing).toContain('COMPLETION_REVIEW_API_KEY or OPENROUTER_API_KEY')
  })
})
