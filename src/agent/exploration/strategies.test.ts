import { describe, expect, it } from 'vitest'
import { assessStrategies, planCounterexampleInvestigation } from './strategies.ts'
import { buildFrontier } from './frontier.ts'
import { reduceTrajectory, type TrajectoryEvent } from './trajectory.ts'
import { normalizeFacts, type PlanningFactsDraft } from './facts.ts'

const stateKey = {
  pageId: 'p0',
  documentVersion: 'doc-1',
  relatedStateVersion: 'state-1',
  viewKey: 'anon',
}

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
        text: '帮助',
        role: 'button',
        publicState: { visible: true, enabled: true, expanded: false, selected: null },
        geometry: { x: 10, y: 60, width: 100, height: 30, inViewport: true },
        context: '健康对照',
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

const assessed = (f: ReturnType<typeof facts>, events: TrajectoryEvent[]) =>
  assessStrategies(f, buildFrontier(f, reduceTrajectory(events)))

const byId = (list: ReturnType<typeof assessed>, id: string) =>
  list.find((s) => s.strategyId === id)!

const observed = (
  relatedStateVersion: string,
  candidates: { candidateId: string; targetKey: string }[],
) =>
  ({
    kind: 'observed',
    stateKey: { ...stateKey, relatedStateVersion },
    candidates,
  }) as TrajectoryEvent

const probe = (
  relatedStateVersion: string,
  targetKey: string,
  action: 'click' | 'inspect' = 'click',
) =>
  ({
    kind: 'dispatched',
    attemptId: 'a1',
    targetKey,
    action,
    beforeStateKey: { ...stateKey, relatedStateVersion },
  }) as TrajectoryEvent

/** An observed navigation genuinely moves a path's precondition away from its postcondition. */
const navigatedTo = (relatedStateVersion: string, targetKey: string) =>
  ({
    kind: 'settled',
    attemptId: 'a1',
    targetKey,
    action: 'click',
    beforeStateKey: { ...stateKey, relatedStateVersion },
    afterStateKey: {
      pageId: 'p0',
      documentVersion: 'doc-1',
      relatedStateVersion: 'state-2',
      viewKey: 'anon',
    },
    effects: ['navigated'],
    outcome: 'observed',
  }) as TrajectoryEvent

const settled = (
  relatedStateVersion: string,
  targetKey: string,
  outcome: 'observed' | 'failed' | 'unknown',
  effects: ('expanded' | 'content-changed' | 'navigated')[] = [],
  action: 'click' | 'inspect' = 'click',
) =>
  ({
    kind: 'settled',
    attemptId: 'a1',
    targetKey,
    action,
    beforeStateKey: { ...stateKey, relatedStateVersion },
    afterStateKey: { ...stateKey, relatedStateVersion },
    effects,
    outcome,
  }) as TrajectoryEvent

describe('assessStrategies — applicability is declared, never assumed', () => {
  it('reports every strategy with an explicit applicability verdict and a reason', () => {
    const list = assessed(facts(), [observed('state-1', [])])
    expect(list.map((s) => s.strategyId).sort()).toEqual([
      'boundary-input',
      'recovery',
      'repeat-operation',
      'return-refresh',
      'state-switch',
    ])
    for (const s of list) expect(s.reason.length).toBeGreaterThan(0)
  })

  it('does not apply the repeat-operation strategy before anything has been tried', () => {
    const list = assessed(facts(), [
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
    ])
    expect(byId(list, 'repeat-operation').applicable).toBe(false)
  })

  it('applies repeat-operation once a target was tried in the current state, with its postcondition', () => {
    const list = assessed(facts(), [
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      probe('state-1', 'node-1'),
      settled('state-1', 'node-1', 'observed'),
    ])
    const s = byId(list, 'repeat-operation')
    expect(s.applicable).toBe(true)
    expect(s.proposable).toBe(false) // no measured item or explicit repeat reason
    expect(s.requiredMeasurement).toContain('before-and-after')
  })

  it('applies state-switch only for a control with a declared toggle state', () => {
    const toggling = raw()
    toggling.candidates = [
      {
        ...toggling.candidates[0],
        publicState: { visible: true, enabled: true, expanded: true, selected: null },
      },
    ]
    expect(
      assessed(
        facts({
          candidates: toggling.candidates,
          scope: { revision: 'scope-1', executableCandidateIds: ['c1'] },
        }),
        [observed('state-1', [])],
      ).find((s) => s.strategyId === 'state-switch')?.applicable,
    ).toBe(true)
    expect(byId(assessed(facts(), [observed('state-1', [])]), 'state-switch').applicable).toBe(
      false,
    )
  })

  it('applies return-refresh when an observed navigation moved off a state we still hold', () => {
    const list = assessed(facts(), [
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      probe('state-1', 'node-1'),
      navigatedTo('state-1', 'node-1'),
    ])
    expect(byId(list, 'return-refresh').applicable).toBe(true)
  })

  it('does not treat an in-page state change as a navigation', () => {
    const list = assessed(facts(), [
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      probe('state-1', 'node-1'),
      // The related state moves (state-1 -> state-2) but nothing navigated.
      {
        kind: 'settled',
        attemptId: 'a1',
        targetKey: 'node-1',
        action: 'click',
        beforeStateKey: stateKey,
        afterStateKey: {
          pageId: 'p0',
          documentVersion: 'doc-1',
          relatedStateVersion: 'state-2',
          viewKey: 'anon',
        },
        effects: ['expanded'],
        outcome: 'observed',
      } as TrajectoryEvent,
    ])
    expect(byId(list, 'return-refresh').applicable).toBe(false)
  })

  it('does not apply return-refresh when nothing navigated', () => {
    const list = assessed(facts(), [
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      probe('state-1', 'node-1'),
      settled('state-1', 'node-1', 'observed', ['expanded']),
    ])
    expect(byId(list, 'return-refresh').applicable).toBe(false)
  })

  it('applies boundary-input only for a control the caller declared as a text entry', () => {
    const box = raw()
    box.candidates = [{ ...box.candidates[0], role: 'textbox' }]
    box.scope = { revision: 'scope-1', executableCandidateIds: ['c1'] }
    expect(
      byId(
        assessed(facts({ candidates: box.candidates, scope: box.scope }), [
          observed('state-1', []),
        ]),
        'boundary-input',
      ).applicable,
    ).toBe(true)
    expect(byId(assessed(facts(), [observed('state-1', [])]), 'boundary-input').applicable).toBe(
      false,
    )
  })

  it('marks boundary-input as needing a public constraint before it may propose a value', () => {
    const box = raw()
    box.candidates = [{ ...box.candidates[0], role: 'textbox', context: '无公开约束说明' }]
    box.scope = { revision: 'scope-1', executableCandidateIds: ['c1'] }
    const s = byId(
      assessed(facts({ candidates: box.candidates, scope: box.scope }), [observed('state-1', [])]),
      'boundary-input',
    )
    expect(s.applicable).toBe(true)
    expect(s.proposable).toBe(false)
    expect(s.reason).toContain('public-constraint')
  })

  it('never proposes a value from a guessed business rule', () => {
    const box = raw()
    box.candidates = [{ ...box.candidates[0], role: 'textbox', context: '长度不超过 10 个字符' }]
    box.scope = { revision: 'scope-1', executableCandidateIds: ['c1'] }
    const s = byId(
      assessed(facts({ candidates: box.candidates, scope: box.scope }), [observed('state-1', [])]),
      'boundary-input',
    )
    expect(s.proposable).toBe(false)
    expect(s.plan.steps).toEqual([])
  })

  it('declares a maximum action count for every applicable strategy', () => {
    const list = assessed(facts(), [
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      probe('state-1', 'node-1'),
      settled('state-1', 'node-1', 'observed', ['navigated']),
    ])
    for (const s of list) if (s.applicable) expect(s.maxActions).toBeGreaterThan(0)
  })
})

describe('planCounterexampleInvestigation', () => {
  it('proposes comparing a healthy neighbour for a claimed anomaly', () => {
    const plan = planCounterexampleInvestigation(facts(), {
      targetKey: 'node-1',
      claimedEffect: 'content-changed',
      verified: true,
    })
    expect(plan.kind).toBe('compare-healthy')
    expect(plan.steps.length).toBeGreaterThan(0)
  })

  it('refuses to treat an unverified claim as a defect', () => {
    const plan = planCounterexampleInvestigation(facts(), {
      targetKey: 'node-1',
      claimedEffect: 'content-changed',
      verified: false,
    })
    expect(plan.kind).toBe('requires-verification')
  })

  it('proposes an alternative sequence when no healthy neighbour exists', () => {
    const plan = planCounterexampleInvestigation(
      facts({ scope: { revision: 'scope-1', executableCandidateIds: [] }, candidates: [] }),
      {
        targetKey: 'node-1',
        claimedEffect: 'navigated',
        verified: true,
      },
    )
    expect(plan.kind).toBe('alternative-sequence')
  })

  it('is deterministic for identical inputs', () => {
    const a = planCounterexampleInvestigation(facts(), {
      targetKey: 'node-1',
      claimedEffect: 'expanded',
    })
    const b = planCounterexampleInvestigation(facts(), {
      targetKey: 'node-1',
      claimedEffect: 'expanded',
    })
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })
})
