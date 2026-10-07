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
import { readFileSync } from 'node:fs'
import { createBudgetLedger } from '../../src/agent/decisions/exploration/budget.ts'
import {
  parseExplorationInput,
  type ExplorationInput,
} from '../../src/agent/decisions/exploration/contracts.ts'
import { rankCandidates } from '../../src/agent/decisions/exploration/ranking.ts'
import {
  parseStubReply,
  type NormalizedReceipt,
} from '../../src/agent/decisions/exploration/receipt.ts'
import { requestExplorationScores } from '../../src/agent/decisions/exploration/transport.ts'
import { createStubTransport } from '../../src/agent/decisions/exploration/stub-transport.ts'

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

function stubReceipt(scenario: string): NormalizedReceipt | 'scenario' {
  const raw = readJson(`${STUB_DIR}/${scenario}.json`) as { kind: string }
  if (raw.kind === 'scenario') return 'scenario'
  const parsed = parseStubReply(raw)
  if (!parsed.ok) throw new Error(`stub ${scenario}: ${parsed.detail}`)
  return parsed.value
}

export async function runOfflineCase(scenario?: string): Promise<CaseResult[]> {
  const list = scenario ? [scenario] : [...scenarios]
  const results: CaseResult[] = []

  for (const name of list) {
    const raw = readJson(`${PUBLIC_DIR}/${name}.json`)
    const expected = expectedFor(name)
    const parsed = parseExplorationInput(raw)

    let transmissions = 0
    let stubOutcome: CaseResult['stubOutcome']
    let baselineOutcome: CaseResult['baselineOutcome']
    let baselineReasonCode: string
    let stubReasonCode: string
    let orderedCandidateIds: readonly string[] = []
    let rotation: unknown = null

    if (!parsed.ok) {
      baselineOutcome = 'invalid-input'
      stubOutcome = 'invalid-input'
      baselineReasonCode = parsed.reasonCode
      stubReasonCode = parsed.reasonCode
    } else {
      const input: ExplorationInput = parsed.value

      // Column 1: pure program baseline, no transport at all.
      const baseline = rankCandidates(input, {
        fairness: { decisionIndex: 0, firstEligibleDecision: {} },
      })
      baselineOutcome = baseline.kind
      baselineReasonCode = baseline.kind === 'ranked' ? 'ranked' : 'no-eligible-candidates'
      orderedCandidateIds = baseline.orderedCandidateIds
      rotation = baseline.rotation

      // Column 2: program + fixed-response stub, with the scenario directive honoured.
      const receipt = stubReceipt(name)
      const input2 = input
      const result = await requestExplorationScores({
        input: input2,
        ledger: createBudgetLedger({
          remainingDecisions: input2.budget.remainingDecisions,
          remainingActions: input2.budget.remainingActions,
          remainingMs: input2.budget.remainingMs,
          maxRequestMs: input2.budget.maxRequestMs,
          remainingCostUsd: input2.budget.remainingCostUsd,
        }),
        send: async (request, options) => {
          transmissions += 1
          if (receipt === 'scenario') {
            // The directive resolves only from the test transport; it never reaches production.
            return Promise.resolve({
              kind: 'handoff',
              reasonCode: 'uncertain',
              usage: {
                status: 'unknown',
                inputTokens: null,
                outputTokens: null,
                costUsd: null,
                source: 'provider' as const,
              },
              modelId: null,
            })
          }
          void request
          return receipt
        },
      })
      stubOutcome = result.outcome
      stubReasonCode = result.reasonCode
      if (result.kind === 'ranked' && result.orderedCandidateIds)
        orderedCandidateIds = result.orderedCandidateIds
    }

    results.push({
      scenario: name,
      expectedBaseline: parsed.ok ? baselineExpectation(raw) : 'invalid-input',
      expectedStub: expected.expectedStub,
      baselineOutcome,
      stubOutcome,
      orderedCandidateIds,
      transmissions,
      checks: expected.checks,
      reason: expected.reason,
      rotation,
      realModel: 'not-run',
      stubReasonCode,
      baselineReasonCode,
    })
  }
  return results
}
