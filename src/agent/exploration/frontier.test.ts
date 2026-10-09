import { describe, expect, it } from 'vitest'
import { buildFrontier, type FrontierCandidate } from './frontier.ts'
import { reduceTrajectory, type TrajectoryEvent } from './trajectory.ts'
import { normalizeFacts, type PlanningFactsDraft } from './facts.ts'
import type { ExplorationInput } from '../decisions/exploration/contracts.ts'

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
        allowedActions: ['click', 'inspect'],
        estimatedCost: 1,
      },
      {
        id: 'c2',
        targetKey: 'node-2',
        observationVersion: 'obs-1',
        text: '关于我们',
        role: 'link',
        publicState: { visible: true, enabled: true, expanded: null, selected: null },
        geometry: { x: 10, y: 60, width: 100, height: 30, inViewport: true },
        context: '页脚',
        allowedActions: ['click'],
        estimatedCost: 1,
      },
      {
        id: 'c3',
        targetKey: 'node-3',
        observationVersion: 'obs-1',
        text: '提交',
        role: 'button',
        publicState: { visible: true, enabled: false, expanded: null, selected: null },
        geometry: { x: 200, y: 60, width: 100, height: 30, inViewport: true },
        context: '当前不可用',
        allowedActions: ['click'],
        estimatedCost: 1,
      },
      {
        id: 'c4',
        targetKey: 'node-4',
        observationVersion: 'obs-1',
        text: '重置',
        role: 'button',
        publicState: { visible: true, enabled: true, expanded: null, selected: null },
        geometry: { x: 300, y: 60, width: 100, height: 30, inViewport: true },
        context: '未授权范围外',
        allowedActions: ['click'],
        estimatedCost: 1,
      },
    ],
    history: [],
    scope: { revision: 'scope-1', executableCandidateIds: ['c1', 'c2', 'c3'] },
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

const stateKey = {
  pageId: 'p0',
  documentVersion: 'doc-1',
  relatedStateVersion: 'state-1',
  viewKey: 'anon',
}
const observedHere = (
  candidates: { candidateId: string; targetKey: string }[],
): TrajectoryEvent => ({
  kind: 'observed',
  stateKey,
  candidates,
})

const entriesOf = (list: readonly { candidateId: string }[]) => list.map((c) => c.candidateId)

describe('buildFrontier', () => {
  it('exposes the eligible controls as available entries with their allowed actions', () => {
    const f = buildFrontier(facts(), reduceTrajectory([observedHere([])]))
    expect(entriesOf(f.available)).toEqual(['c1', 'c2'])
    expect(f.available[0].allowedActions).toEqual(['click', 'inspect'])
  })

  it('keeps a disabled control as a blocked branch with a checkable reason', () => {
    const f = buildFrontier(facts(), reduceTrajectory([observedHere([])]))
    expect(entriesOf(f.blocked)).toContain('c3')
    expect(f.blocked.find((c) => c.candidateId === 'c3')?.reason).toBe('disabled')
  })

  it('keeps an out-of-scope control visible as a blocked branch rather than dropping it', () => {
    const f = buildFrontier(facts(), reduceTrajectory([observedHere([])]))
    expect(f.blocked.find((c) => c.candidateId === 'c4')?.reason).toBe('out-of-scope')
    expect(entriesOf(f.available)).not.toContain('c4')
  })

  it('marks a candidate already tried in the current state as tried here', () => {
    const f = buildFrontier(
      facts(),
      reduceTrajectory([
        observedHere([{ candidateId: 'c1', targetKey: 'node-1' }]),
        {
          kind: 'dispatched',
          attemptId: 'a1',
          targetKey: 'node-1',
          action: 'click',
          beforeStateKey: stateKey,
        },
        {
          kind: 'settled',
          attemptId: 'a1',
          targetKey: 'node-1',
          action: 'click',
          beforeStateKey: stateKey,
          afterStateKey: stateKey,
          effects: [],
          outcome: 'observed',
        },
      ]),
    )
    expect(f.available.find((c) => c.candidateId === 'c1')?.attemptsInCurrentState).toBe(1)
    expect(f.available.find((c) => c.candidateId === 'c2')?.attemptsInCurrentState).toBe(0)
  })

  it('lists a target observed in another state as an unexplored branch for this state', () => {
    const f = buildFrontier(
      facts(),
      reduceTrajectory([
        observedHere([{ candidateId: 'c2', targetKey: 'node-2' }]),
        // node-9 was seen on a different related state and never checked here.
        {
          kind: 'observed',
          stateKey: {
            pageId: 'p0',
            documentVersion: 'doc-1',
            relatedStateVersion: 'state-9',
            viewKey: 'anon',
          },
          candidates: [{ candidateId: 'c9', targetKey: 'node-9' }],
        },
      ]),
    )
    expect(f.unexploredBranches.map((b) => b.targetKey)).toContain('node-9')
    expect(f.unexploredBranches.find((b) => b.targetKey === 'node-9')?.seenInStates).toEqual([
      JSON.stringify(['p0', 'doc-1', 'state-9', 'anon']),
    ])
  })

  it('does not list a target as an unexplored branch in the state where it was already handled', () => {
    const f = buildFrontier(
      facts(),
      reduceTrajectory([
        observedHere([{ candidateId: 'c1', targetKey: 'node-1' }]),
        {
          kind: 'dispatched',
          attemptId: 'measured',
          targetKey: 'node-1',
          action: 'click',
          beforeStateKey: stateKey,
          itemId: 'item-1',
        },
        {
          kind: 'settled',
          attemptId: 'measured',
          targetKey: 'node-1',
          action: 'click',
          beforeStateKey: stateKey,
          afterStateKey: stateKey,
          itemId: 'item-1',
          evidenceRef: 'evidence/measurement.json',
          outcome: 'observed',
          effects: [],
        },
      ]),
    )
    expect(f.unexploredBranches.map((b) => b.targetKey)).not.toContain('node-1')
  })

  it('records a path with its precondition and postcondition', () => {
    const f = buildFrontier(
      facts(),
      reduceTrajectory([
        observedHere([{ candidateId: 'c1', targetKey: 'node-1' }]),
        {
          kind: 'dispatched',
          attemptId: 'a1',
          targetKey: 'node-1',
          action: 'click',
          beforeStateKey: stateKey,
        },
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
        },
      ]),
    )
    expect(f.paths).toHaveLength(1)
    expect(f.paths[0].steps).toMatchObject([
      { targetKey: 'node-1', action: 'click', attemptId: 'a1' },
    ])
    expect(f.paths[0].precondition).toBe(JSON.stringify(['p0', 'doc-1', 'state-1', 'anon']))
    expect(f.paths[0].postcondition).toBe(JSON.stringify(['p0', 'doc-1', 'state-2', 'anon']))
  })

  it('retains every candidate in the retained queue so none disappears permanently', () => {
    const f = buildFrontier(facts(), reduceTrajectory([observedHere([])]))
    expect(f.retained.map((r) => r.candidateId).sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('does not invent a continuous-step predecessor from a mere observation', () => {
    const f = buildFrontier(facts(), reduceTrajectory([observedHere([])]))
    expect(f.continuousOpportunity).toBeNull()
  })

  it('drops the continuous-step opportunity once the only untried entry is used up', () => {
    const f = buildFrontier(
      facts({
        candidates: [raw().candidates[0]],
        scope: { revision: 'scope-1', executableCandidateIds: ['c1'] },
      }),
      reduceTrajectory([
        observedHere([{ candidateId: 'c1', targetKey: 'node-1' }]),
        {
          kind: 'dispatched',
          attemptId: 'a1',
          targetKey: 'node-1',
          action: 'click',
          beforeStateKey: stateKey,
        },
        {
          kind: 'settled',
          attemptId: 'a1',
          targetKey: 'node-1',
          action: 'click',
          beforeStateKey: stateKey,
          afterStateKey: stateKey,
          effects: [],
          outcome: 'observed',
        },
      ]),
    )
    expect(f.continuousOpportunity).toBeNull()
  })

  it('reports a candidate whose target has no stable key as unattributable rather than merging it', () => {
    const noKey = raw()
    const only = { ...noKey.candidates[0], targetKey: null }
    const f = buildFrontier(
      facts({
        candidates: [only],
        scope: { revision: 'scope-1', executableCandidateIds: [only.id] },
      }),
      reduceTrajectory([]),
    )
    expect(f.available[0].attributable).toBe(false)
    expect(f.available[0].attemptsInCurrentState).toBe(0)
    expect(f.continuousOpportunity).toBeNull()
  })

  it('is a pure function of its inputs', () => {
    const a = buildFrontier(facts(), reduceTrajectory([observedHere([])]))
    const b = buildFrontier(facts(), reduceTrajectory([observedHere([])]))
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })
})
