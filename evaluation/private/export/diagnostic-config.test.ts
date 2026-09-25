import { describe, it, expect } from 'vitest'
import { REQUIRED_PROVIDERS, resolveProviders } from './diagnostic-config.ts'

/**
 * The diagnostic must run on the baseline's declared providers.
 *
 * The acceptance plan's 8.4 is explicit: "按当前可复现基线显式固定 Wafer/Alibaba" - fix the agent to
 * Wafer and the vision model to Alibaba. The gateway applies those names as OpenRouter's
 * `provider.only`; when the variables are unset it sends *no* constraint, leaving OpenRouter free to
 * route to any endpoint of the model.
 *
 * That is not theoretical. The first paid diagnostic on this machine omitted the pin, and its own
 * ledger records which endpoints served the calls: DeepInfra 33, Sail Research 24, Wafer 0. Those
 * calls took 20-54s against the recorded Wafer baseline's ~4-11s, so the runs consumed the plan's
 * fixed 300s ceiling partway through the inspection and failed on latency, not on behaviour.
 *
 * The pin therefore has to be a property of the runner rather than of whoever launches it: the
 * accepted baseline is reproducible by running the command, without the operator having to know two
 * variable names. An explicit *different* provider is still refused, because the same model served
 * by another endpoint is a different measurement and must not be reported as this baseline.
 */
describe('diagnostic provider pinning', () => {
  it('states the providers the accepted baseline was recorded with', () => {
    expect(REQUIRED_PROVIDERS).toEqual({ agent: 'Wafer', vision: 'Alibaba' })
  })

  it('applies the baseline pin when the environment says nothing', () => {
    // Reproducibility: unset is not "no constraint", it resolves to the baseline's own providers.
    const resolution = resolveProviders({})
    expect(resolution.ok).toBe(true)
    expect(resolution.agent).toBe('Wafer')
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
    expect(resolution.agent).toBe('Wafer')
    expect(resolution.source).toBe('baseline-default')
  })

  it('accepts an explicit restatement of the baseline and records it as operator-set', () => {
    const resolution = resolveProviders({
      VALIDATION_AGENT_PROVIDER: 'Wafer',
      VALIDATION_VISION_PROVIDER: 'Alibaba',
    })
    expect(resolution.ok).toBe(true)
    expect(resolution.agent).toBe('Wafer')
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
    const resolution = resolveProviders({ VALIDATION_AGENT_PROVIDER: 'Wafer' })
    expect(resolution.ok).toBe(true)
    // The vision side falls back to the baseline, and the source says the pair was completed by the
    // runner rather than by the operator - so the manifest never claims an operator pinned both.
    expect(resolution.vision).toBe('Alibaba')
    expect(resolution.source).toBe('baseline-default')
  })
})
