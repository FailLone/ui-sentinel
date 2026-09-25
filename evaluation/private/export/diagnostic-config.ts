/**
 * The providers a real-model run must be pinned to.
 *
 * The acceptance plan's 8.4 fixes the current reproducible baseline to Wafer (agent) and Alibaba
 * (vision). The validation gateway applies those names as OpenRouter's `provider.only`; when the
 * environment variable is missing or empty it omits the constraint entirely, and OpenRouter is then
 * free to route to any endpoint of the model.
 *
 * Leaving it unset is not neutral. Measured on this machine's first paid diagnostic, the run's own
 * ledger records the endpoints that served the calls as DeepInfra (33) and Sail Research (24), with
 * Wafer at zero, at 20-54s per call against the baseline's 4-11s. The runs then hit the plan's fixed
 * 300s ceiling partway through the inspection and failed on latency rather than on behaviour.
 *
 * Applying the pin here rather than requiring an operator to export two variables is what makes the
 * accepted baseline reproducible by running the documented command: the same model served by a
 * different endpoint is a different measurement, and a batch that silently mixed them would be filed
 * under a baseline it never ran on.
 */
export const REQUIRED_PROVIDERS = Object.freeze({ agent: 'Wafer', vision: 'Alibaba' })

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
