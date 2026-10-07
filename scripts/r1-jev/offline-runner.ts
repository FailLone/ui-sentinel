/**
 * Offline case runner for the committed seed set.
 *
 * Runs each scenario twice, in two clearly separated columns:
 *   baseline - the pure program ranking, no model at all;
 *   stub     - the program plus the fixed-response transport, including the test-driver
 *              "scenario" directives (e.g. a state change while the reply is outstanding).
 *
 * Reading the evaluator label is confined to this runner and to tests. No production module may
 * import `evaluation/r1-jev-dev/evaluator`.
 */
import { bindReceipt } from '../../src/agent/decisions/exploration/adapter.ts'
import { readFileSync } from 'node:fs'
import {
  parseExplorationInput,
  type ExplorationInput,
} from '../../src/agent/decisions/exploration/contracts.ts'
import { rankCandidates } from '../../src/agent/decisions/exploration/ranking.ts'
import { parseStubReply } from '../../src/agent/decisions/exploration/receipt.ts'
import { createExplorationSession } from '../../src/agent/decisions/exploration/session.ts'
import type { ScoreResult } from '../../src/agent/decisions/exploration/transport.ts'

const PUBLIC_DIR = 'evaluation/r1-jev-dev/public'
const STUB_DIR = 'evaluation/r1-jev-dev/stub'
const EVALUATOR_DIR = 'evaluation/r1-jev-dev/evaluator'

export const scenarios = [
  'menu',
  'accordion',
  'tabs',
  'same-text-context',
  'combined-effects',
  'revisit-new-state',
  'repeat-same-state',
  'empty-candidates',
  'ambiguous-binding',
  'stale-input',
  'disabled',
  'continuous-steps',
  'agent-investigation',
  'page-injection',
  'missing-candidate-reply',
  'unknown-candidate-reply',
  'stale-reply',
  'budget-empty',
  'low-score-fairness',
  'geometry-not-defect',
  'uncacheable',
  'duplicate-input-id',
] as const

export type CaseResult = {
  readonly attemptId: string
  readonly startedAt: string
  readonly durationMs: number
  readonly input: unknown
  readonly baselineOrderedCandidateIds: readonly string[]
  readonly fusedOrderedCandidateIds: readonly string[]
  readonly steps: readonly unknown[]
  readonly scenario: string
  readonly expectedBaseline: 'ranked' | 'handoff' | 'invalid-input'
  readonly expectedStub: 'ranked' | 'handoff' | 'invalid-input'
  readonly baselineOutcome: 'ranked' | 'handoff' | 'invalid-input'
  readonly stubOutcome: 'ranked' | 'handoff' | 'invalid-input'
  readonly orderedCandidateIds: readonly string[]
  readonly transmissions: number
  readonly checks: readonly string[]
  readonly reason: string
  readonly rotation: unknown
  readonly realModel: 'not-run'
  readonly stubReasonCode: string
  readonly baselineReasonCode: string
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** The evaluator's `expectedStatus` labels the STUB branch; a pure baseline column is separate. */
export function expectedFor(scenario: string): {
  expectedStub: 'ranked' | 'handoff' | 'invalid-input'
  checks: readonly string[]
  reason: string
} {
  const evaluator = readJson(`${EVALUATOR_DIR}/${scenario}.json`) as {
    expectedStatus: 'ranked' | 'handoff' | 'invalid-input'
    checks: string[]
    reason: string
  }
  return {
    expectedStub: evaluator.expectedStatus,
    checks: evaluator.checks ?? [],
    reason: evaluator.reason,
  }
}

/**
 * Baseline expectation is re-derived from the raw input's OWN declarations - the caller scope,
 * the tri-state public state and the permitted actions - not from the stub label and not from
 * the ranking module. The pure baseline has no model, so it can be `ranked` only when at least
 * one candidate is genuinely executable; a disabled control or an empty scope must hand off.
 */
function baselineExpectation(raw: unknown): 'ranked' | 'handoff' | 'invalid-input' {
  const input = raw as {
    scope?: { executableCandidateIds?: string[] }
    candidates?: {
      id: string
      publicState?: { visible?: boolean | null; enabled?: boolean | null }
      allowedActions?: string[]
    }[]
  }
  const executable = new Set(input.scope?.executableCandidateIds ?? [])
  const anyExecutable = (input.candidates ?? []).some(
    (c) =>
      executable.has(c.id) &&
      c.publicState?.visible === true &&
      c.publicState?.enabled === true &&
      (c.allowedActions?.length ?? 0) > 0,
  )
  return anyExecutable ? 'ranked' : 'handoff'
}

export async function runOfflineCase(scenario?: string): Promise<CaseResult[]> {
  const list = scenario ? [scenario] : [...scenarios]
  const results: CaseResult[] = []
  for (const name of list) {
    if (!(scenarios as readonly string[]).includes(name)) throw new Error('unknown-scenario')
    const startedAt = new Date().toISOString()
    const started = performance.now()
    const raw = readJson(`${PUBLIC_DIR}/${name}.json`)
    const expected = expectedFor(name)
    const parsed = parseExplorationInput(raw)
    let transmissions = 0
    let baselineOutcome: CaseResult['baselineOutcome'] = 'invalid-input'
    let baselineReasonCode = 'invalid-input'
    let baselineOrderedCandidateIds: readonly string[] = []
    let rotation: unknown = null
    const steps: unknown[] = []
    const original = parsed.ok ? parsed.value : null
    let current = structuredClone(raw)
    const fallbackBudget = {
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 5000,
      maxRequestMs: 1000,
      remainingCostUsd: null,
    }
    const exchanges: unknown[] = []
    const rawStub = readJson(`${STUB_DIR}/${name}.json`) as {
      kind: string
      change?: Record<string, string>
    }
    const session = createExplorationSession({
      budget: original?.budget ?? fallbackBudget,
      currentInput: () => current,
      send: async (request, options) => {
        transmissions++
        let rawReply: unknown = rawStub
        if (rawStub.kind === 'scenario') {
          // Actually alter the caller-owned state while a valid response is outstanding.
          await Promise.resolve()
          const changed = structuredClone(current) as ExplorationInput
          Object.assign(changed.state, rawStub.change)
          for (const candidate of changed.candidates)
            candidate.observationVersion = changed.state.observationVersion
          current = changed
          const sent = JSON.parse(request.body) as { candidates: { id: string }[] }
          rawReply = {
            schemaVersion: 'r1-stub-reply-1',
            kind: 'scores',
            model: 'stub/jev-exploration-1',
            provider: 'stub',
            scores: sent.candidates.map((c) => ({
              candidateId: c.id,
              relevance: 0.7,
              informationGain: 0.6,
              uncertainty: 0.1,
            })),
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: 'non-billable-stub' },
          }
        }
        const receipt = parseStubReply(rawReply)
        exchanges.push({
          request: structuredClone(request),
          attemptId: options.attemptId,
          requestDigest: options.requestDigest,
          rawReply: structuredClone(rawReply),
          normalizedReceipt: receipt.ok ? receipt.value : null,
        })
        if (!receipt.ok) throw new Error(receipt.detail)
        return bindReceipt(receipt.value, options)
      },
    })
    let last!: ScoreResult
    const count = name === 'low-score-fairness' ? 4 : 1
    for (let index = 0; index < count; index++) {
      const fairness = { decisionIndex: index, firstEligibleDecision: { c1: 0, c2: 0 } }
      const stepInput = structuredClone(current)
      const parsedStep = parseExplorationInput(stepInput)
      const baseline = parsedStep.ok ? rankCandidates(parsedStep.value, { fairness }) : null
      if (baseline) {
        baselineOutcome = baseline.kind
        baselineReasonCode = baseline.kind === 'ranked' ? 'ranked' : 'no-eligible-candidates'
        baselineOrderedCandidateIds = baseline.orderedCandidateIds
        rotation = baseline.rotation
      }
      const previousExchanges = exchanges.length
      last = await session.decide(stepInput, { fairness })
      steps.push({
        index,
        input: stepInput,
        fairness,
        baseline,
        result: last,
        exchanges: exchanges.slice(previousExchanges),
        currentAfter: structuredClone(current),
      })
    }
    results.push({
      scenario: name,
      attemptId: last.trace.attemptId,
      startedAt,
      durationMs: performance.now() - started,
      input: raw,
      steps,
      expectedBaseline: parsed.ok ? baselineExpectation(raw) : 'invalid-input',
      expectedStub: expected.expectedStub,
      baselineOutcome,
      stubOutcome: last.outcome,
      baselineReasonCode,
      stubReasonCode: last.reasonCode,
      baselineOrderedCandidateIds,
      fusedOrderedCandidateIds: last.orderedCandidateIds ?? [],
      orderedCandidateIds: last.orderedCandidateIds ?? [],
      transmissions,
      checks: expected.checks,
      reason: expected.reason,
      rotation,
      realModel: 'not-run',
    })
  }
  return results
}
