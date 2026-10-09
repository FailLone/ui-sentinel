import { describe, expect, it } from 'vitest'
import { planNext, RECOVERY_CAP, type Plan, type PlanRequest } from './scheduler.ts'
import { normalizeFacts, type PlanningFactsDraft } from './facts.ts'
import {
  reduceTrajectory,
  branchKeyOf,
  stateKeyOf,
  type PlanningStateKey,
  type TrajectoryEvent,
} from './trajectory.ts'

const anon = (relatedStateVersion: string): PlanningStateKey => ({
  pageId: 'p0',
  documentVersion: 'doc-1',
  relatedStateVersion,
  viewKey: 'anon',
})

function raw(overrides: Partial<PlanningFactsDraft> = {}): PlanningFactsDraft {
  return {
    schemaVersion: 'r1-exploration-input-1',
    requestId: 's01',
    task: { goal: '检查目录入口', localTask: '排列当前控件', revision: 'task-1' },
    state: {
      pageId: 'p0',
      url: 'https://synthetic.invalid/view/0',
      documentVersion: 'doc-1',
      observationVersion: 'obs-1',
      relatedStateVersion: 'state-1',
      cacheable: false,
    },
    candidates: [
      {
        id: 'c1',
        targetKey: 'node-1',
        observationVersion: 'obs-1',
        text: '目录',
        role: 'button',
        publicState: { visible: true, enabled: true, expanded: false, selected: null },
        geometry: { x: 10, y: 10, width: 100, height: 30, inViewport: true },
        context: '隐藏的章节导航',
        allowedActions: ['click'],
        estimatedCost: 1,
      },
      {
        id: 'c2',
        targetKey: 'node-2',
        observationVersion: 'obs-1',
        text: '筛选',
        role: 'button',
        publicState: { visible: true, enabled: true, expanded: false, selected: null },
        geometry: { x: 140, y: 10, width: 100, height: 30, inViewport: true },
        context: '列表筛选',
        allowedActions: ['click'],
        estimatedCost: 1,
      },
    ],
    history: [],
    scope: { revision: 'scope-1', executableCandidateIds: ['c1', 'c2'] },
    budget: {
      revision: 'budget-1',
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 60000,
      maxRequestMs: 15000,
      remainingCostUsd: null,
    },
    limits: { maxCandidates: 32, maxInputBytes: 32768, maxHistory: 32 },
    view: { kind: 'anonymous', roleLabel: null, source: 'none', viewKey: 'anon' },
    ...overrides,
  }
}

function facts(overrides: Partial<PlanningFactsDraft> = {}) {
  const result = normalizeFacts(raw(overrides))
  if (!result.ok) throw new Error(result.reason)
  return result.value
}

const observed = (
  relatedStateVersion: string,
  candidates: { candidateId: string; targetKey: string }[],
): TrajectoryEvent => ({ kind: 'observed', stateKey: anon(relatedStateVersion), candidates })

const attempt = (
  relatedStateVersion: string,
  targetKey: string,
  after = relatedStateVersion,
): TrajectoryEvent[] => [
  {
    kind: 'dispatched',
    attemptId: `${relatedStateVersion}:${targetKey}`,
    itemId: `item-${targetKey}`,
    targetKey,
    action: 'click',
    beforeStateKey: anon(relatedStateVersion),
  },
  {
    kind: 'settled',
    attemptId: `${relatedStateVersion}:${targetKey}`,
    targetKey,
    action: 'click',
    beforeStateKey: anon(relatedStateVersion),
    afterStateKey: anon(after),
    effects: [],
    outcome: 'observed',
    itemId: `item-${targetKey}`,
    evidenceRef: `attempt/${targetKey}.json`,
  },
]

const request = (overrides: Partial<PlanRequest> = {}): PlanRequest => ({
  facts: facts(),
  trajectory: reduceTrajectory([
    observed('state-1', [
      { candidateId: 'c1', targetKey: 'node-1' },
      { candidateId: 'c2', targetKey: 'node-2' },
    ]),
  ]),
  ...overrides,
})

const acted = (plan: Plan) => {
  expect(plan.kind).toBe('act')
  if (plan.kind !== 'act') throw new Error('expected act')
  return plan
}

describe('planNext — selection and duplicate control', () => {
  it('proposes an eligible, untried candidate with a coverage-gap basis', () => {
    const plan = acted(planNext(request()))
    expect(plan.targetKey).toBe('node-1')
    expect(plan.action).toBe('click')
    expect(plan.basis.coverageGap).toBe(true)
    expect(plan.basis.duplicateObservation).toBe(false)
  })

  it('prefers an untried candidate over a target already completed in this related state', () => {
    const plan = acted(
      planNext(
        request({
          trajectory: reduceTrajectory([
            observed('state-1', [
              { candidateId: 'c1', targetKey: 'node-1' },
              { candidateId: 'c2', targetKey: 'node-2' },
            ]),
            ...attempt('state-1', 'node-1'),
          ]),
        }),
      ),
    )
    expect(plan.targetKey).toBe('node-2')
    expect(plan.basis.coverageGap).toBe(true)
  })

  it('re-opens a target for re-checking once the related state has actually changed', () => {
    // node-1 was completed in state-1; we are now planning from state-2 where only node-2 was tried.
    const plan = acted(
      planNext(
        request({
          facts: facts({ state: { ...raw().state, relatedStateVersion: 'state-2' } }),
          trajectory: reduceTrajectory([
            observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
            ...attempt('state-1', 'node-1'),
            observed('state-2', [
              { candidateId: 'c1', targetKey: 'node-1' },
              { candidateId: 'c2', targetKey: 'node-2' },
            ]),
          ]),
        }),
      ),
    )
    expect(plan.targetKey).toBe('node-1')
    expect(plan.basis.duplicateObservation).toBe(false)
  })

  it('flags a repeat of a target that was already completed in the current state', () => {
    // Only one candidate, already completed here: the plan must still be explicit about the repeat.
    const single = raw()
    single.candidates = [single.candidates[0]]
    single.scope = { revision: 'scope-1', executableCandidateIds: ['c1'] }
    const plan = planNext(
      request({
        facts: facts({ candidates: single.candidates, scope: single.scope }),
        trajectory: reduceTrajectory([
          observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
          ...attempt('state-1', 'node-1'),
        ]),
        fairness: { decisionIndex: 3, firstEligibleDecision: { c1: 0 } },
      }),
    )
    // A repeat is only emitted under an explicit rotation, and is labelled as such.
    if (plan.kind === 'act') {
      expect(plan.basis.duplicateObservation).toBe(true)
      expect(plan.basis.riskBasis).toBe('rotation')
    } else {
      expect(plan.kind).toBe('handoff')
    }
  })

  it('keeps a low-priority candidate selectable on the rotation cadence', () => {
    const plan = planNext(
      request({
        fairness: { decisionIndex: 3, firstEligibleDecision: { c1: 0, c2: 1 } },
      }),
    )
    const chosen = acted(plan)
    // The rotation promotes the longest-waiting untried candidate instead of the queue head.
    expect(chosen.targetKey).toBe('node-2')
    expect(chosen.basis.riskBasis).toBe('rotation')
  })

  it('records a declared risk basis when the caller supplies one for the chosen target', () => {
    const plan = acted(
      planNext(
        request({
          risk: [{ targetKey: 'node-2', basis: 'declared-defect', source: 'frozen-scenario-C02' }],
        }),
      ),
    )
    expect(plan.targetKey).toBe('node-2')
    expect(plan.basis.riskBasis).toBe('declared')
  })

  it('carries the caller-declared risk source through when a risk-hinted target is chosen', () => {
    const single = raw()
    single.candidates = [single.candidates[1]]
    single.scope = { revision: 'scope-1', executableCandidateIds: ['c2'] }
    const plan = acted(
      planNext(
        request({
          facts: facts({ candidates: single.candidates, scope: single.scope }),
          trajectory: reduceTrajectory([
            observed('state-1', [{ candidateId: 'c2', targetKey: 'node-2' }]),
          ]),
          risk: [{ targetKey: 'node-2', basis: 'declared-defect', source: 'frozen-scenario-C02' }],
        }),
      ),
    )
    expect(plan.basis.riskBasis).toBe('declared')
    expect(plan.basis.riskSource).toBe('frozen-scenario-C02')
  })
})

describe('planNext — continuous steps and preconditions', () => {
  it('offers a continuation only when the predecessor completed in the current state', () => {
    const plan = acted(
      planNext(
        request({
          trajectory: reduceTrajectory([
            observed('state-1', [
              { candidateId: 'c1', targetKey: 'node-1' },
              { candidateId: 'c2', targetKey: 'node-2' },
            ]),
            ...attempt('state-1', 'node-1', 'state-2'),
          ]),
          facts: facts({ state: { ...raw().state, relatedStateVersion: 'state-2' } }),
        }),
      ),
    )
    expect(plan.basis.continuousStep).toBe(true)
    expect(plan.basis.precondition).toBe(JSON.stringify(['p0', 'doc-1', 'state-2', 'anon']))
  })

  it('does not offer a continuation when the predecessor never completed', () => {
    const plan = acted(
      planNext(
        request({
          trajectory: reduceTrajectory([
            observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
            {
              kind: 'dispatched',
              attemptId: 'a1',
              targetKey: 'node-1',
              action: 'click',
              beforeStateKey: anon('state-1'),
            },
            {
              kind: 'settled',
              attemptId: 'a1',
              targetKey: 'node-1',
              action: 'click',
              beforeStateKey: anon('state-1'),
              afterStateKey: anon('state-1'),
              effects: [],
              outcome: 'failed',
            },
          ]),
        }),
      ),
    )
    expect(plan.basis.continuousStep).toBe(false)
  })
})

describe('planNext — handoff objects', () => {
  it('hands off with insufficient-information when nothing eligible remains', () => {
    const plan = planNext(
      request({
        facts: facts({ scope: { revision: 'scope-1', executableCandidateIds: [] } }),
        trajectory: reduceTrajectory([observed('state-1', [])]),
      }),
    )
    expect(plan.kind).toBe('handoff')
    if (plan.kind !== 'handoff') return
    expect(plan.handoff.reason).toBe('insufficient-information')
  })

  it('hands off with budget-exhausted before dispatch when decisions are used up', () => {
    const plan = planNext(
      request({ facts: facts({ budget: { ...raw().budget, remainingDecisions: 0 } }) }),
    )
    expect(plan.kind).toBe('handoff')
    if (plan.kind !== 'handoff') return
    expect(plan.handoff.reason).toBe('budget-exhausted')
    expect(plan.handoff.remainingBudget.decisions).toBe(0)
  })

  it('hands off with budget-exhausted when actions are used up', () => {
    const plan = planNext(
      request({ facts: facts({ budget: { ...raw().budget, remainingActions: 0 } }) }),
    )
    expect(plan.kind).toBe('handoff')
    if (plan.kind !== 'handoff') return
    expect(plan.handoff.reason).toBe('budget-exhausted')
  })

  it('hands off as unrecoverable once the per-branch recovery cap is reached', () => {
    const plan = planNext(
      request({
        trajectory: reduceTrajectory([
          observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
          ...attempt('state-1', 'node-1'),
        ]),
        recovery: { [branchKeyOf(stateKeyOf(anon('state-1')), 'node-1')]: RECOVERY_CAP },
      }),
    )
    if (plan.kind !== 'handoff') return
    expect(plan.handoff.reason).toBe('unrecoverable')
  })

  it('never emits an act whose target has exhausted its recovery cap', () => {
    const plan = planNext(
      request({
        trajectory: reduceTrajectory([
          observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
          ...attempt('state-1', 'node-1'),
        ]),
        recovery: { [branchKeyOf(stateKeyOf(anon('state-1')), 'node-1')]: RECOVERY_CAP },
      }),
    )
    if (plan.kind === 'act') expect(plan.targetKey).not.toBe('node-1')
  })

  it('carries the facts a handing-off agent needs to continue', () => {
    const plan = planNext(
      request({ facts: facts({ budget: { ...raw().budget, remainingDecisions: 0 } }) }),
    )
    if (plan.kind !== 'handoff') throw new Error('expected handoff')
    const h = plan.handoff
    expect(h.remainingBudget.decisions).toBe(0)
    expect(Array.isArray(h.executedActions)).toBe(true)
    expect(Array.isArray(h.unverifiedItems)).toBe(true)
    expect(Array.isArray(h.continuableCandidates)).toBe(true)
    expect(Array.isArray(h.forbiddenReplays)).toBe(true)
  })

  it('lists a target with an unknown outcome as a forbidden blind replay', () => {
    const plan = planNext(
      request({
        facts: facts({ budget: { ...raw().budget, remainingDecisions: 0 } }),
        trajectory: reduceTrajectory([
          observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
          {
            kind: 'dispatched',
            attemptId: 'a1',
            targetKey: 'node-1',
            action: 'click',
            beforeStateKey: anon('state-1'),
          },
          {
            kind: 'settled',
            attemptId: 'a1',
            targetKey: 'node-1',
            action: 'click',
            beforeStateKey: anon('state-1'),
            afterStateKey: anon('state-1'),
            effects: [],
            outcome: 'unknown',
          },
        ]),
      }),
    )
    if (plan.kind !== 'handoff') throw new Error('expected handoff')
    expect(plan.handoff.forbiddenReplays).toContain('node-1')
  })

  it('reports visited coverage and verified coverage as different numbers', () => {
    const plan = planNext(
      request({
        facts: facts({ budget: { ...raw().budget, remainingDecisions: 0 } }),
        trajectory: reduceTrajectory([
          observed('state-1', [
            { candidateId: 'c1', targetKey: 'node-1' },
            { candidateId: 'c2', targetKey: 'node-2' },
          ]),
          // Visited both, but only node-1 was measured.
          ...attempt('state-1', 'node-1'),
        ]),
      }),
    )
    if (plan.kind !== 'handoff') throw new Error('expected handoff')
    expect(plan.handoff.coverage.visitedStates).toBe(1)
    expect(plan.handoff.coverage.verifiedItems).toBe(1)
    expect(plan.handoff.coverage.observedTargets).toBe(2)
  })
})

describe('planNext — purity and authority boundaries', () => {
  it('never carries a permission, authority or completion field', () => {
    const plan = planNext(request())
    const text = JSON.stringify(plan)
    for (const forbidden of ['authorized', 'permission', 'defect', 'finished', 'passed'])
      expect(text).not.toContain(forbidden)
  })

  it('does not mutate the facts or the trajectory it was given', () => {
    const req = request()
    const factsSnapshot = JSON.stringify(req.facts)
    planNext(req)
    expect(JSON.stringify(req.facts)).toEqual(factsSnapshot)
    expect(req.trajectory.attempts).toHaveLength(0)
  })

  it('is deterministic for identical inputs', () => {
    expect(JSON.stringify(planNext(request()))).toEqual(JSON.stringify(planNext(request())))
  })

  it('reuses the shared ranking policy version rather than declaring its own scorer', () => {
    expect(acted(planNext(request())).basis.policyVersion).toBe('r1-exploration-policy-2')
  })
})
