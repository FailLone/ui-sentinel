/** Explicit in-process experiment injection; no env flag, route, or default installation. */
import type { ObservationVersion } from './observation-version.ts'
export type ExperimentalDecision =
  | { kind: 'tool'; binding: string; tool: string; args: Record<string, unknown>; basis: unknown }
  | { kind: 'handoff'; reason: string; packet: unknown }
export type ExperimentalHost = {
  decide(
    input: unknown,
    context: { signal: AbortSignal; version: ObservationVersion },
  ): Promise<ExperimentalDecision>
}
let factory: ((runId: string) => ExperimentalHost | undefined) | undefined
export function installExperimentalHost(value: (runId: string) => ExperimentalHost | undefined) {
  if (factory) throw new Error('experimental-host-already-installed')
  factory = value
  return () => {
    factory = undefined
  }
}
export function createExperimentalHost(runId: string) {
  return factory?.(runId)
}

let scopeExpansion = false
/** Same explicit bounded selection window for all experiment arms, including the Agent arm. */
export function installExperimentalScopeExpansion() {
  scopeExpansion = true
}
export function experimentalScopeExpansionEnabled() {
  return scopeExpansion
}
