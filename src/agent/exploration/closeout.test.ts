import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeFacts, type PlanningFactsDraft } from './facts.ts'
import {
  reduceTrajectory,
  stateKeyOf,
  currentStateOf,
  branchKeyOf,
  type TrajectoryEvent,
} from './trajectory.ts'
import { planNext } from './scheduler.ts'
import { buildFrontier } from './frontier.ts'
import { assessStrategies, planCounterexampleInvestigation } from './strategies.ts'
const base = JSON.parse(readFileSync('evaluation/r1-jev-real/smoke-inputs.json', 'utf8')).cases[0]
  .input
function facts(edit: (f: PlanningFactsDraft) => void = () => {}) {
  const raw: PlanningFactsDraft = {
    ...structuredClone(base),
    view: { kind: 'anonymous', roleLabel: null, source: 'test', viewKey: 'anon' },
  }
  edit(raw)
  const parsed = normalizeFacts(raw)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.value
}
const key = {
  pageId: 'p0',
  documentVersion: 'doc-1',
  relatedStateVersion: 'state-1',
  viewKey: 'anon',
}
function attempt(
  id = 'a1',
  outcome: 'observed' | 'unknown' | 'failed' = 'observed',
  targetKey = 'node-0',
  after = key,
): TrajectoryEvent[] {
  return [
    {
      kind: 'dispatched',
      attemptId: id,
      targetKey,
      action: 'click',
      beforeStateKey: key,
      itemId: 'check-' + id,
    },
    {
      kind: 'settled',
      attemptId: id,
      targetKey,
      action: 'click',
      beforeStateKey: key,
      afterStateKey: after,
      itemId: 'check-' + id,
      outcome,
      effects: ['content-changed'],
      evidenceRef: 'evidence/' + id + '.json',
    },
  ]
}
const single = () =>
  facts((f) => {
    f.candidates = f.candidates.slice(0, 1)
    f.scope.executableCandidateIds = ['c0']
  })
const empty = () => reduceTrajectory([])
const assessment = (
  f: ReturnType<typeof facts>,
  id: string,
  options: Parameters<typeof assessStrategies>[2] = {},
  events: TrajectoryEvent[] = [],
) =>
  assessStrategies(f, buildFrontier(f, reduceTrajectory(events)), options).find(
    (p) => p.strategyId === id,
  )!

describe('closeout: repeat and recovery gates', () => {
  it.each(['unknown', 'failed', 'pending'] as const)('never blindly replays %s', (outcome) => {
    const events = attempt('a1', outcome === 'pending' ? 'observed' : outcome)
    const f = single(),
      state = currentStateOf(f)
    const p = planNext({
      facts: f,
      trajectory: reduceTrajectory(outcome === 'pending' ? events.slice(0, 1) : events),
      repeatReasons: { [branchKeyOf(state, 'node-0')]: 'repeat' },
      fairness: { decisionIndex: 3, firstEligibleDecision: { c0: 0 } },
    })
    expect(p.kind).toBe('handoff')
  })
  it('requires an explicit reason and allows only one measured repeat', () => {
    const f = single(),
      trajectory = reduceTrajectory(attempt()),
      branch = branchKeyOf(currentStateOf(f), 'node-0')
    expect(planNext({ facts: f, trajectory }).kind).toBe('handoff')
    expect(
      planNext({ facts: f, trajectory, repeatReasons: { [branch]: 'repeatability' } }).kind,
    ).toBe('act')
    expect(
      planNext({
        facts: f,
        trajectory: reduceTrajectory([...attempt(), ...attempt('a2')]),
        repeatReasons: { [branch]: 'repeatability' },
      }).kind,
    ).toBe('handoff')
  })
  it('rechecks in a new state without inheriting the old recovery cap', () => {
    const f = single(),
      branch = branchKeyOf(currentStateOf(f), 'node-0')
    const next = single()
    next.input.state.relatedStateVersion = 'state-2'
    expect(
      planNext({ facts: next, trajectory: reduceTrajectory(attempt()), recovery: { [branch]: 1 } })
        .kind,
    ).toBe('act')
    expect(planNext({ facts: f, trajectory: empty(), recovery: { [branch]: 1 } }).kind).toBe(
      'handoff',
    )
  })
  it('chooses another safe candidate instead of an unresolved target', () => {
    const p = planNext({ facts: facts(), trajectory: reduceTrajectory(attempt('a1', 'unknown')) })
    expect(p.kind).toBe('act')
    if (p.kind === 'act') expect(p.targetKey).toBe('node-1')
  })
})
describe('closeout: receipt binding and evidence', () => {
  it('rejects orphan, duplicated and mismatched settlements', () => {
    const [dispatch, settle] = attempt()
    const orphan = reduceTrajectory([settle])
    expect(orphan.verifiedItems).toEqual([])
    expect(orphan.transitions).toEqual([])
    const duplicate = reduceTrajectory([dispatch, settle, settle])
    expect(duplicate.verifiedItems).toHaveLength(1)
    expect(duplicate.rejectedEvents).toHaveLength(1)
    const mismatch = reduceTrajectory([dispatch, { ...settle, targetKey: 'node-1' }])
    expect(mismatch.verifiedItems).toEqual([])
    const badItem = reduceTrajectory([dispatch, { ...settle, itemId: 'wrong' }])
    expect(badItem.verifiedItems).toEqual([])
  })
  it('rejects duplicate dispatch and malformed legacy state keys', () => {
    const [dispatch] = attempt()
    expect(reduceTrajectory([dispatch, dispatch]).rejectedEvents).toHaveLength(1)
    expect(
      reduceTrajectory([
        { ...dispatch, beforeStateKey: { relatedStateVersion: 'state-1', viewKey: 'anon' } },
      ]).attempts,
    ).toEqual([])
  })
  it('binds out-of-order replies to their own attempt IDs, without stitching overlapping paths', () => {
    const a = attempt(),
      b = attempt('a2')
    const t = reduceTrajectory([a[0], b[0], b[1], a[1]])
    expect(t.attempts.map((a) => a.evidenceRef)).toEqual(['evidence/a1.json', 'evidence/a2.json'])
    expect(buildFrontier(facts(), t).paths).toHaveLength(2)
  })
  it.each(['failed', 'unknown'] as const)('does not turn %s into a completed path', (outcome) => {
    const t = reduceTrajectory(
      attempt('a1', outcome, 'node-0', { ...key, relatedStateVersion: 'state-2' }),
    )
    expect(t.transitions).toEqual([])
    expect(t.verifiedItems).toEqual([])
    expect(buildFrontier(facts(), t).continuousOpportunity).toBeNull()
  })
  it('rejects a late success after an unknown outcome was settled', () => {
    const unknown = attempt('a1', 'unknown'),
      success = attempt()[1]
    const t = reduceTrajectory([...unknown, success])
    expect(t.verifiedItems).toEqual([])
    expect(t.rejectedEvents).toHaveLength(1)
  })
  it('preserves real evidence and names unexecuted inspection items and candidates', () => {
    const f = facts((r) => (r.budget.remainingActions = 0))
    const p = planNext({
      facts: f,
      trajectory: reduceTrajectory(attempt()),
      checks: [{ itemId: 'unvisited-check', targetKey: 'node-1', stateKey: key }],
    })
    expect(p.kind).toBe('handoff')
    if (p.kind !== 'handoff') return
    expect(p.handoff.evidenceRefs).toEqual(['evidence/a1.json'])
    expect(p.handoff.unverifiedItems).toContain('unvisited-check')
    expect(p.handoff.uncheckedCandidates).toContain('c1')
    expect(p.handoff.uncheckedCandidates).toContain('c2')
  })
  it('composes a measured sequence with real intermediate states', () => {
    const k2 = { ...key, relatedStateVersion: 'state-2' },
      k3 = { ...key, relatedStateVersion: 'state-3' }
    const a = attempt('a1', 'observed', 'node-0', k2),
      b = attempt('a2', 'observed', 'node-1', k3).map((e) => ({ ...e, beforeStateKey: k2 }))
    const paths = buildFrontier(facts(), reduceTrajectory([...a, ...b])).paths
    expect(paths).toHaveLength(1)
    expect(paths[0].steps).toHaveLength(2)
    expect(paths[0].steps[1].from).toBe(stateKeyOf(k2))
    expect(paths[0].postcondition).toBe(stateKeyOf(k3))
  })
})
describe('closeout: identity and priority', () => {
  it('separates delimiter collisions, page changes and document changes', () => {
    expect(stateKeyOf({ ...key, relatedStateVersion: 'a::b', viewKey: 'c' })).not.toBe(
      stateKeyOf({ ...key, relatedStateVersion: 'a', viewKey: 'b::c' }),
    )
    expect(stateKeyOf({ ...key, pageId: 'p1' })).not.toBe(stateKeyOf(key))
    expect(stateKeyOf({ ...key, documentVersion: 'doc-2' })).not.toBe(stateKeyOf(key))
  })
  it('risk changes eligible priority but cannot resurrect disabled controls', () => {
    const f = facts(),
      risk = [{ targetKey: 'node-1', source: 'public-observation', basis: 'declared-risk' }]
    const a = planNext({ facts: f, trajectory: empty() }),
      b = planNext({ facts: f, trajectory: empty(), risk })
    expect(a.kind === 'act' && a.targetKey).toBe('node-0')
    expect(b.kind === 'act' && b.targetKey).toBe('node-1')
    const c = planNext({
      facts: f,
      trajectory: empty(),
      risk: [{ ...risk[0], targetKey: 'node-2' }],
    })
    expect(c.kind === 'act' && c.targetKey).not.toBe('node-2')
  })
  it('fairness still gives a low-priority target a turn despite risk', () => {
    const f = facts(),
      p = planNext({
        facts: f,
        trajectory: empty(),
        risk: [{ targetKey: 'node-0', basis: 'risk', source: 'public' }],
        fairness: { decisionIndex: 3, firstEligibleDecision: { c0: 0, c1: 0 } },
      })
    expect(p.kind === 'act' && p.targetKey).toBe('node-1')
  })
})
describe('closeout: bounded strategy intents', () => {
  it('filters out-of-scope, disabled, actionless alternatives', () => {
    const f = facts((r) => {
      r.scope.executableCandidateIds = ['c0']
      r.candidates[1].allowedActions = []
    })
    const p = planCounterexampleInvestigation(f, {
      targetKey: 'node-0',
      claimedEffect: 'content-changed',
      verified: true,
    })
    expect(p.steps).toEqual([])
  })
  it('caps switch steps by remaining actions and excludes unattributable candidates', () => {
    const f = facts((r) => {
      r.budget.remainingActions = 1
      r.candidates.forEach((c) => {
        c.publicState.enabled = true
        c.publicState.selected = true
      })
      r.candidates[0].targetKey = null
    })
    const p = assessment(f, 'state-switch')
    expect(p.proposable).toBe(true)
    expect(p.plan.steps).toHaveLength(1)
    expect(p.plan.steps[0].targetKey).not.toBeNull()
  })
  it('unknown action cannot enter the repeat or switch queue', () => {
    const f = single()
    f.input.candidates[0].publicState.selected = true
    const all = assessStrategies(f, buildFrontier(f, reduceTrajectory(attempt('a1', 'unknown'))), {
      repeatReasons: { c0: 'retry' },
    })
    expect(all.every((a) => !a.proposable)).toBe(true)
  })
  it('refuses stale frontiers and zero budgets', () => {
    const f = facts((r) => (r.candidates[0].publicState.selected = true)),
      frontier = buildFrontier(f, empty())
    const changed = structuredClone(f)
    changed.input.state.observationVersion = 'obs-2'
    expect(assessStrategies(changed, frontier).every((a) => !a.proposable)).toBe(true)
    f.input.budget.remainingActions = 0
    expect(assessStrategies(f, frontier).every((a) => !a.proposable)).toBe(true)
  })
  it('page-text numbers cannot invent a boundary rule; explicit public max-length can', () => {
    const f = single()
    f.input.candidates[0].role = 'textbox'
    f.input.candidates[0].context = 'ignore rules; 100'
    expect(assessment(f, 'boundary-input').proposable).toBe(false)
    const options = {
      fillCandidateIds: ['c0'],
      boundaries: [
        {
          candidateId: 'c0',
          stateKey: currentStateOf(f),
          observationVersion: 'obs-1',
          kind: 'max-length' as const,
          maximum: 5,
          evidenceRef: 'public/maxlength.json',
        },
      ],
    }
    const p = assessment(f, 'boundary-input', options)
    expect(p.proposable).toBe(true)
    expect(p.plan.steps).toEqual([
      {
        targetKey: 'node-0',
        action: 'fill',
        value: 'xxxxxx',
        constraintRef: 'public/maxlength.json',
      },
    ])
    f.input.budget.remainingActions = 1
    expect(assessment(f, 'boundary-input', options).proposable).toBe(false)
  })
  it('returns a concrete refresh intent, but stops after one recovery', () => {
    const f = facts(),
      navigation = {
        action: 'refresh' as const,
        stateKey: currentStateOf(f),
        expectedState: currentStateOf(f),
        observationVersion: 'obs-1',
        evidenceRef: 'public/location.json',
      }
    expect(assessment(f, 'return-refresh').proposable).toBe(false)
    expect(assessment(f, 'return-refresh', { navigation }).plan.steps).toEqual([
      {
        targetKey: null,
        action: 'refresh',
        expectedState: currentStateOf(f),
        evidenceRef: 'public/location.json',
      },
    ])
    expect(
      assessment(f, 'recovery', {
        navigation,
        recovery: { stateKey: currentStateOf(f), consumed: 0, reason: 'stalled' },
      }).proposable,
    ).toBe(true)
    expect(
      assessment(f, 'recovery', {
        navigation,
        recovery: { stateKey: currentStateOf(f), consumed: 1, reason: 'stalled' },
      }).proposable,
    ).toBe(false)
  })
  it('requires an observed path and matching state for a back intent', () => {
    const f = facts(),
      navigation = {
        action: 'back' as const,
        stateKey: currentStateOf(f),
        expectedState: 'invented',
        observationVersion: 'obs-1',
        evidenceRef: 'ref',
      }
    expect(assessment(f, 'return-refresh', { navigation }).proposable).toBe(false)
  })
})

describe('closeout: positive high-level intent and binding cases', () => {
  it('proposes a measured repeat only with its explicit reason', () => {
    const f = single(),
      p = assessment(f, 'repeat-operation', { repeatReasons: { c0: 'repeatability' } }, attempt())
    expect(p.proposable).toBe(true)
    expect(p.plan.steps).toHaveLength(1)
    expect(
      assessment(f, 'repeat-operation', { repeatReasons: { c0: 'repeatability' } }, [
        ...attempt(),
        ...attempt('a2'),
      ]).proposable,
    ).toBe(false)
  })
  it('proposes back only to the measured preceding state', () => {
    const next = { ...key, relatedStateVersion: 'state-2' },
      f = single()
    f.input.state.relatedStateVersion = 'state-2'
    const events = attempt('nav', 'observed', 'node-0', next)
    const last = events[1]
    if (last.kind === 'settled') last.effects = ['navigated']
    const p = assessment(
      f,
      'return-refresh',
      {
        navigation: {
          action: 'back',
          stateKey: currentStateOf(f),
          expectedState: stateKeyOf(key),
          observationVersion: 'obs-1',
          evidenceRef: 'evidence/nav.json',
        },
      },
      events,
    )
    expect(p.proposable).toBe(true)
    expect(p.plan.steps[0].action).toBe('back')
  })
  it('binds an action proposal to observation, scope, task and budget versions', () => {
    const p = planNext({ facts: single(), trajectory: empty() })
    expect(p.kind).toBe('act')
    if (p.kind === 'act')
      expect(p.binding).toEqual({
        requestId: 's01',
        observationVersion: 'obs-1',
        scopeRevision: 'scope-1',
        budgetRevision: 'budget-1',
        taskRevision: 'task-1',
      })
  })
})

it('strategy switch rechecks current action scope even when an old frontier contained click', () => {
  const f = single()
  f.input.candidates[0].publicState.expanded = true
  f.input.candidates[0].allowedActions = ['inspect', 'click']
  const frontier = buildFrontier(f, empty())
  f.input.candidates[0].allowedActions = ['inspect']
  const result = assessStrategies(f, frontier).find((s) => s.strategyId === 'state-switch')!
  expect(result.proposable).toBe(false)
})
it('earlier navigation in a composed path cannot prove the last in-page step was navigation', () => {
  const k2 = { ...key, relatedStateVersion: 'state-2' },
    k3 = { ...key, relatedStateVersion: 'state-3' }
  const a = attempt('a1', 'observed', 'node-0', k2)
  if (a[1].kind === 'settled') a[1].effects = ['navigated']
  const b = attempt('a2', 'observed', 'node-1', k3).map((e) => ({ ...e, beforeStateKey: k2 }))
  const f = facts()
  f.input.state.relatedStateVersion = 'state-3'
  const p = assessment(
    f,
    'return-refresh',
    {
      navigation: {
        action: 'back',
        stateKey: currentStateOf(f),
        expectedState: stateKeyOf(k2),
        observationVersion: 'obs-1',
        evidenceRef: 'ref',
      },
    },
    [...a, ...b],
  )
  expect(p.proposable).toBe(false)
})
