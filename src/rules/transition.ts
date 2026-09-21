import { z } from 'zod'
import type { Rule } from './types.ts'

export interface TransitionRuleConfig {
  readonly type: 'transition'
  readonly name: string
  readonly description: string
  readonly trigger: { readonly eventType: string; readonly fromState?: string; readonly toState?: string }
  readonly expectation: { readonly condition: 'state-reachable' | 'element-visible' | 'element-actionable'; readonly target: string; readonly timeoutMs: number }
  readonly severity: 'error' | 'warning'
}
export interface TransitionObservation {
  readonly condition?: 'state-reachable' | 'element-visible' | 'element-actionable'
  readonly eventType: string
  readonly fromState?: string
  readonly toState?: string
  readonly startedAtMs: number
  readonly observedUntilMs: number
  readonly samples: readonly { readonly atMs: number; readonly target: string; readonly value: boolean | string | null }[]
  readonly evidenceRefs: readonly string[]
}
export const transitionRuleSchema = z.object({
  type:z.literal('transition'),name:z.string().min(1),description:z.string().min(1),
  trigger:z.object({eventType:z.string().min(1),fromState:z.string().optional(),toState:z.string().optional()}).strict(),
  expectation:z.object({condition:z.enum(['state-reachable','element-visible','element-actionable']),target:z.string().min(1),timeoutMs:z.number().int().positive().max(60000)}).strict(),
  severity:z.enum(['error','warning']),
}).strict()
export function validateRuleConfig(config: TransitionRuleConfig): void { transitionRuleSchema.parse(config) }
const observationSchema = z.object({eventType:z.string(),fromState:z.string().optional(),toState:z.string().optional(),condition:z.enum(['state-reachable','element-visible','element-actionable']).optional(),startedAtMs:z.number().nonnegative(),observedUntilMs:z.number().nonnegative(),samples:z.array(z.object({atMs:z.number().nonnegative(),target:z.string(),value:z.union([z.boolean(),z.string(),z.null()])})),evidenceRefs:z.array(z.string())})
export function evaluateTransition(config: TransitionRuleConfig, observation: TransitionObservation): 'pass' | 'fail' | 'unknown' {
  validateRuleConfig(config)
  if (!observationSchema.safeParse(observation).success) return 'unknown'
  if (observation.condition && observation.condition !== config.expectation.condition) return 'unknown'
  if (!observation || observation.eventType !== config.trigger.eventType || (config.trigger.fromState && observation.fromState !== config.trigger.fromState) || (config.trigger.toState && observation.toState !== config.trigger.toState)) return 'unknown'
  if (!Number.isFinite(observation.startedAtMs) || !Number.isFinite(observation.observedUntilMs) || !Array.isArray(observation.samples)) return 'unknown'
  const deadline = observation.startedAtMs + config.expectation.timeoutMs
  const samples = observation.samples.filter(s => s.target === config.expectation.target && s.atMs >= observation.startedAtMs && s.atMs <= deadline).sort((a,b) => a.atMs-b.atMs)
  if (samples.some(s => s.value === true || (config.expectation.condition === 'state-reachable' && s.value === config.expectation.target))) return 'pass'
  // Bounded continuous sampling is needed to assert the entire window was unavailable.
  if (observation.observedUntilMs < deadline || !samples.length || samples.some(s => s.value !== false)) return 'unknown'
  if (samples[0]!.atMs - observation.startedAtMs > 250 || deadline - samples.at(-1)!.atMs > 250 || samples.some((s,i) => i > 0 && s.atMs - samples[i-1]!.atMs > 500)) return 'unknown'
  return 'fail'
}
export function compileTransitionRule(id: string, config: TransitionRuleConfig): Rule {
  validateRuleConfig(config)
  return { id, declaration: config, revision: '1', name: config.name, description: config.description, category: 'transition', enabled: true,
    async evaluate({snapshot}) {
      const observations = snapshot.transitionObservations ?? []
      const relevant = observations.filter(o => o.eventType === config.trigger.eventType)
      const verdicts = relevant.map(o => evaluateTransition(config,o))
      const verdict = verdicts.includes('fail') ? 'fail' : verdicts.includes('pass') ? 'pass' : 'unknown'
      return { ruleId:id, ruleRevision:'1', verdict, severity:config.severity, title:config.name, expected:config.description, actual:`${relevant.length} transition observations: ${verdict}`, evidenceRefs:relevant.flatMap(o=>[...o.evidenceRefs]), confidence: verdict==='unknown'?0:0.95, details:{observations:relevant} }
    }
  }
}
