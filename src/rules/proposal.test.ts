import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { initDatabase, getDbClient } from '../storage/database.ts'
import { createRun, submitFinding } from '../execution/run-manager.ts'
import {
  createProposal,
  validateProposal,
  reviewProposal,
  enableProposal,
  loadEnabledProposals,
} from './proposal.ts'
import { clearRules, getAllRules, runChecks } from './engine.ts'
import {
  evaluateTransition,
  type TransitionObservation,
  type TransitionRuleConfig,
} from './transition.ts'
const config: TransitionRuleConfig = {
  type: 'transition',
  name: 'Retry availability',
  description: 'Retry must become available within five seconds',
  trigger: { eventType: 'retryable-failure' },
  expectation: { condition: 'element-actionable', target: 'retry', timeoutMs: 5000 },
  severity: 'warning',
}
const observation = (value: boolean): TransitionObservation => ({
  eventType: 'retryable-failure',
  startedAtMs: 0,
  observedUntilMs: 5250,
  samples: Array.from({ length: 21 }, (_, i) => ({ atMs: i * 250, target: 'retry', value })),
  evidenceRefs: ['observation'],
})
let findingId = ''
beforeAll(async () => {
  await initDatabase()
  const run = await createRun({ goal: 'test', environmentId: 'test', entryUrl: 'http://localhost' })
  const f = await submitFinding({
    runId: run.id,
    source: 'agent',
    ruleId: null,
    ruleRevision: null,
    hypothesisId: null,
    validationStatus: 'candidate',
    severity: 'warning',
    title: 'recovery',
    expected: 'retry available',
    actual: 'not observed',
    stepId: null,
    evidenceRefs: [],
  })
  findingId = f.id
  await getDbClient().execute({
    sql: 'INSERT INTO finding_feedback (id,finding_id,verdict,reason) VALUES (?,?,?,?)',
    args: [randomUUID(), findingId, 'confirmed', 'Human checked reproduction'],
  })
})
describe('declarative transition lifecycle', () => {
  it('evaluates actual state/time samples, including unknown rather than prose', () => {
    expect(evaluateTransition(config, observation(false))).toBe('fail')
    expect(evaluateTransition(config, observation(true))).toBe('pass')
    expect(evaluateTransition(config, { ...observation(false), samples: [] })).toBe('unknown')
    expect(evaluateTransition(config, { ...observation(false), observedUntilMs: 4000 })).toBe(
      'unknown',
    )
  })
  it('cannot create a rule for an unconfirmed or missing finding', async () => {
    await expect(createProposal('missing', config)).rejects.toThrow('confirmed')
  })
  it('rejects prose, empty arrays and approval without all evidence classes', async () => {
    const p = await createProposal(findingId, config)
    await expect(validateProposal(p.id, ['disabled'], ['working'])).rejects.toThrow('JSON')
    await expect(validateProposal(p.id, [], [])).rejects.toThrow()
    await expect(reviewProposal(p.id, 'approve', 'human')).rejects.toThrow()
  })
  it('enables the same tested declaration in the runtime registry and restores after restart', async () => {
    clearRules()
    const p = await createProposal(findingId, config)
    const results = await validateProposal(
      p.id,
      [JSON.stringify(observation(false))],
      [JSON.stringify(observation(true))],
    )
    expect([...results.positiveResults, ...results.negativeResults].every((r) => r.passed)).toBe(
      true,
    )
    expect(results.negativeResults.some((r) => r.expected === 'unknown')).toBe(true)
    await expect(enableProposal(p.id)).rejects.toThrow('approval')
    await reviewProposal(p.id, 'approve', 'human')
    await enableProposal(p.id)
    expect(getAllRules().some((r) => r.id === p.id)).toBe(true)
    clearRules()
    await loadEnabledProposals()
    const result = await runChecks({
      runId: 'r',
      currentUrl: 'http://localhost',
      pageTitle: 'x',
      timestamp: '',
      events: [],
      snapshot: {
        url: 'http://localhost',
        title: 'x',
        viewport: { width: 1280, height: 768 },
        elements: [],
        transitionObservations: [observation(false)],
      },
    })
    expect(result.results.find((r) => r.ruleId === p.id)?.verdict).toBe('fail')
  })
})
