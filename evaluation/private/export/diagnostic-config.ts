/**
 * Freeze one provider pair for the complete diagnostic and formal campaign. Wafer was the original
 * baseline; repeated upstream 429s and request timeouts during the 2026-09-28 acceptance run led
 * to a separately identified Fireworks baseline, using the same DeepSeek model. Its diagnostic
 * must be rerun and cannot borrow the old provider's results. See acceptance plan section 8.4.
 * Never silently fall back or mix providers inside a campaign.
 */
export const REQUIRED_PROVIDERS = Object.freeze({ agent: 'Fireworks', vision: 'Alibaba' })

export type ProviderSource = 'environment' | 'baseline-default'

export interface ProviderResolution {
  readonly ok: boolean
  /** The provider the agent model will be pinned to. */
  readonly agent: string
  /** The provider the vision model will be pinned to. */
  readonly vision: string
  /**
   * Whether the pair came from the environment or was completed by the runner. Recorded so the
   * manifest never claims an operator pinned both when the runner supplied one.
   */
  readonly source: ProviderSource
  /** Empty when the pin may be applied; otherwise why the run must not start. */
  readonly reasonCodes: readonly string[]
}

/**
 * Resolve the providers this run may use.
 *
 * Unset and empty both mean "not pinned" (the gateway tests truthiness), so both resolve to the
 * baseline pair. A *different* explicit provider is refused instead of silently corrected: quietly
 * swapping it back would run the baseline while the operator believed they had chosen otherwise.
 */
export function resolveProviders(
  env: Partial<Record<'VALIDATION_AGENT_PROVIDER' | 'VALIDATION_VISION_PROVIDER', string>>,
): ProviderResolution {
  const requestedAgent = env.VALIDATION_AGENT_PROVIDER ?? ''
  const requestedVision = env.VALIDATION_VISION_PROVIDER ?? ''
  const reasonCodes: string[] = []

  if (requestedAgent && requestedAgent !== REQUIRED_PROVIDERS.agent)
    reasonCodes.push('agent-provider-mismatch')
  if (requestedVision && requestedVision !== REQUIRED_PROVIDERS.vision)
    reasonCodes.push('vision-provider-mismatch')

  return {
    ok: reasonCodes.length === 0,
    agent: requestedAgent || REQUIRED_PROVIDERS.agent,
    vision: requestedVision || REQUIRED_PROVIDERS.vision,
    source:
      requestedAgent === REQUIRED_PROVIDERS.agent && requestedVision === REQUIRED_PROVIDERS.vision
        ? 'environment'
        : 'baseline-default',
    reasonCodes,
  }
}
