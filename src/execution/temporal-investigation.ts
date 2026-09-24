import { z } from 'zod'
import type { ElementHandle } from 'playwright'
import { evaluateTransition, type TransitionObservation } from '../rules/transition.ts'
import { hypothesisTriggers } from './task-state.ts'
import type { EvidenceIntegrity } from '../shared/evidence-integrity.ts'

export const temporalInvestigationInput = z.object({
  phenomenon: z.string().min(1).max(800),
  basis: z.string().min(1).max(1600),
  trigger: z.enum(hypothesisTriggers),
  elementRef: z.string().min(1),
  target: z.string().min(1).max(300),
  condition: z.enum(['element-visible', 'element-actionable']),
  durationMs: z.number().int().min(250).max(12000),
  severity: z.enum(['error', 'warning']),
  freshWindowReason: z.string().max(800).default(''),
})
export type TemporalInvestigationInput = z.infer<typeof temporalInvestigationInput>
type BoundTarget = {
  handle: ElementHandle<HTMLElement | SVGElement>
  selector: string
  /** Only reusable versions are eligible for historical-result reuse. */
  version?: string
}
export interface InvestigationResult {
  evidenceIntegrity?: EvidenceIntegrity
  hypothesisId: string
  verdict: 'pass' | 'fail' | 'unknown'
  validationStatus: 'supported' | 'refuted' | 'inconclusive'
  condition: TemporalInvestigationInput['condition']
  window: { startedAtMs: number; observedUntilMs: number; durationMs: number }
  sampleCount: number
  evidenceRefs: readonly string[]
  findingId?: string
  reused: boolean
  scope: string
}
export const temporalInvestigationInstructions =
  'For a novel observed timing/visibility/operability anomaly with a current elementRef, prefer investigation_check. ' +
  'Declare the grounded question, applicable trigger, condition and full required duration. It registers the hypothesis, measures continuously and saves the bounded result in one call; no separate hypotheses_record, transition_observe or findings_submit is needed for that same claim. ' +
  'Select element-actionable for operability; element-visible proves only visibility. Do not investigate an ineligible or untriggered expectation. ' +
  'The window begins when measurement starts; it does not reconstruct an earlier deadline. Reused results retain their original time window. Request a new window only with freshWindowReason describing the additional question. ' +
  'Review saved results and continue other scope or explicitly run_finish. A pass refutes only the declared bounded defect; it does not prove the whole page correct. Legacy investigation tools remain available for other kinds of questions.'

/** A single browser owner calls this serially. No model call or learned-rule mutation. */
export function createTemporalInvestigator(deps: {
  guard: () => void
  epoch: () => string
  bind: (ref: string) => Promise<BoundTarget>
  version: () => Promise<string | undefined>
  record: (input: TemporalInvestigationInput) => Promise<string>
  measure: (input: TemporalInvestigationInput, bound: BoundTarget) => Promise<TransitionObservation>
  complete: (
    input: TemporalInvestigationInput,
    result: InvestigationResult,
    actual: string,
  ) => Promise<string | undefined>
  reused: (result: InvestigationResult) => Promise<void>
}) {
  const cache: { signature: string; target: BoundTarget; result: InvestigationResult }[] = []
  return {
    async run(raw: TemporalInvestigationInput): Promise<InvestigationResult> {
      deps.guard()
      const input = temporalInvestigationInput.parse(raw)
      const bound = await deps.bind(input.elementRef)
      let retained = false
      try {
        deps.guard()
        const signature = JSON.stringify([
          deps.epoch(),
          input.trigger,
          input.condition,
          input.durationMs,
        ])
        if (!input.freshWindowReason && bound.version) {
          for (const prior of cache) {
            if (prior.signature !== signature || prior.target.version !== bound.version) continue
            const sameNode = await bound.handle.evaluate(
              (el, previous) => el === previous,
              prior.target.handle,
            )
            deps.guard()
            if (!sameNode) continue
            const result = { ...prior.result, reused: true }
            await deps.reused(result)
            return result
          }
        }
        const hypothesisId = await deps.record(input)
        const measurement = await deps.measure(input, bound)
        deps.guard()
        const verdict = measurement.samples.some((s) => s.value === null)
          ? 'unknown'
          : evaluateTransition(
              {
                type: 'transition',
                name: input.phenomenon,
                description: input.basis,
                trigger: { eventType: input.trigger },
                expectation: {
                  condition: input.condition,
                  target: input.target,
                  timeoutMs: input.durationMs,
                },
                severity: input.severity,
              },
              measurement,
            )
        const result: InvestigationResult = {
          evidenceIntegrity: measurement.evidenceIntegrity,
          hypothesisId,
          verdict,
          validationStatus:
            verdict === 'fail' ? 'supported' : verdict === 'pass' ? 'refuted' : 'inconclusive',
          condition: input.condition,
          window: {
            startedAtMs: measurement.startedAtMs,
            observedUntilMs: measurement.observedUntilMs,
            durationMs: input.durationMs,
          },
          sampleCount: measurement.samples.length,
          evidenceRefs: measurement.evidenceRefs,
          reused: false,
          scope:
            'Only the declared DOM condition on the bound node during this recorded window. Does not prove pixel covering, click-handler behavior, permanent failure, or what happened before measurement began. The Agent owns requirement applicability and semantic target selection.',
        }
        const actual = `${input.target}: ${input.condition} ${verdict === 'fail' ? 'was false throughout the covered window' : verdict === 'pass' ? 'was true at a sampled point within the window' : 'could not be conclusively evaluated'}; ${measurement.samples.length} samples, declared interval ${measurement.startedAtMs}–${measurement.startedAtMs + input.durationMs}, declared duration ${input.durationMs}ms. This is a bounded observation, not a claim about an earlier deadline or permanent state.`
        result.findingId = await deps.complete(input, result, actual)
        deps.guard()
        const version = await deps.version()
        if (verdict !== 'unknown' && version) {
          cache.push({ signature, target: { ...bound, version }, result })
          retained = true
        }
        return result
      } finally {
        if (!retained) await bound.handle.dispose().catch(() => {})
      }
    },
    async close() {
      await Promise.allSettled(cache.map((c) => c.target.handle.dispose()))
      cache.length = 0
    },
  }
}
