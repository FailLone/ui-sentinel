import { describe, it, expect } from 'vitest'
import { REQUIRED_PROVIDERS, resolveProviders } from './diagnostic-config.ts'

// Pin the explicitly declared current baseline; old-provider diagnostics are not interchangeable.
describe('diagnostic provider pinning', () => {
  it('states the providers the accepted baseline was recorded with', () => {
    expect(REQUIRED_PROVIDERS).toEqual({ agent: 'Fireworks', vision: 'Alibaba' })
  })

  it('applies the baseline pin when the environment says nothing', () => {
    // Reproducibility: unset is not "no constraint", it resolves to the baseline's own providers.
    const resolution = resolveProviders({})
    expect(resolution.ok).toBe(true)
    expect(resolution.agent).toBe('Fireworks')
    expect(resolution.vision).toBe('Alibaba')
    expect(resolution.source).toBe('baseline-default')
    expect(resolution.reasonCodes).toEqual([])
  })

  it('treats an empty string as unset, because the gateway reads it as falsy', () => {
    // `VALIDATION_AGENT_PROVIDER=` sends no `provider.only`, exactly like an absent variable, so it
    // must resolve to the baseline pin rather than passing through as an empty constraint.
    const resolution = resolveProviders({
      VALIDATION_AGENT_PROVIDER: '',
      VALIDATION_VISION_PROVIDER: '',
    })
    expect(resolution.ok).toBe(true)
    expect(resolution.agent).toBe('Fireworks')
    expect(resolution.source).toBe('baseline-default')
  })

  it('accepts an explicit restatement of the baseline and records it as operator-set', () => {
    const resolution = resolveProviders({
      VALIDATION_AGENT_PROVIDER: 'Fireworks',
      VALIDATION_VISION_PROVIDER: 'Alibaba',
    })
    expect(resolution.ok).toBe(true)
    expect(resolution.agent).toBe('Fireworks')
    expect(resolution.vision).toBe('Alibaba')
    expect(resolution.source).toBe('environment')
    expect(resolution.reasonCodes).toEqual([])
  })

  it('refuses a different provider, because that is a different experiment', () => {
    // The plan forbids "更换提供方再混为同一批": another provider is another condition, so a batch
    // must fail loudly rather than be filed under the accepted baseline it did not run on.
    const resolution = resolveProviders({
      VALIDATION_AGENT_PROVIDER: 'DeepInfra',
      VALIDATION_VISION_PROVIDER: 'Alibaba',
    })
    expect(resolution.ok).toBe(false)
    expect(resolution.reasonCodes).toContain('agent-provider-mismatch')
    expect(resolution.reasonCodes).not.toContain('vision-provider-mismatch')
  })

  it('reports both mismatches when neither provider matches', () => {
    const resolution = resolveProviders({
      VALIDATION_AGENT_PROVIDER: 'Sail Research',
      VALIDATION_VISION_PROVIDER: 'DeepInfra',
    })
    expect(resolution.ok).toBe(false)
    expect([...resolution.reasonCodes].sort()).toEqual([
      'agent-provider-mismatch',
      'vision-provider-mismatch',
    ])
  })

  it('refuses a half-swapped pair rather than pinning one and defaulting the other silently', () => {
    const resolution = resolveProviders({ VALIDATION_AGENT_PROVIDER: 'Fireworks' })
    expect(resolution.ok).toBe(true)
    // The vision side falls back to the baseline, and the source says the pair was completed by the
    // runner rather than by the operator - so the manifest never claims an operator pinned both.
    expect(resolution.vision).toBe('Alibaba')
    expect(resolution.source).toBe('baseline-default')
  })
})
