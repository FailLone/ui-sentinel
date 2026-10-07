import { describe, expect, it } from 'vitest'
import { reduceTrajectory, stateKeyOf, type TrajectoryEvent } from './trajectory.ts'

const key = (relatedStateVersion: string, viewKey = 'anon') => ({ relatedStateVersion, viewKey })

const observed = (
  relatedStateVersion: string,
  candidates: { candidateId: string; targetKey: string }[],
  viewKey = 'anon',
): TrajectoryEvent => ({
  kind: 'observed',
  stateKey: key(relatedStateVersion, viewKey),
  candidates,
})

describe('stateKeyOf', () => {
  it('separates two related states that differ only by view context', () => {
    expect(stateKeyOf(key('state-1', 'anon'))).not.toBe(stateKeyOf(key('state-1', 'decl-admin')))
  })

  it('separates the same view reached under different related-state versions', () => {
    expect(stateKeyOf(key('state-1'))).not.toBe(stateKeyOf(key('state-2')))
  })

  it('is stable for the same inputs regardless of key order', () => {
    expect(stateKeyOf(key('state-1'))).toBe(stateKeyOf(key('state-1')))
  })
})

describe('reduceTrajectory — visited, selected and verified stay distinct', () => {
  it('records an observation as visited without any selection or verification', () => {
    const t = reduceTrajectory([observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }])])
    expect(t.visitedStates).toContain(stateKeyOf(key('state-1')))
    expect(t.observedTargets.get('node-1')).toEqual(new Set([stateKeyOf(key('state-1'))]))
    expect(t.attempts).toHaveLength(0)
    expect(t.verifiedItems).toHaveLength(0)
  })

  it('records a dispatch as selected but never as verified', () => {
    const t = reduceTrajectory([
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      { kind: 'dispatched', targetKey: 'node-1', action: 'click', beforeStateKey: key('state-1') },
    ])
    expect(t.attempts).toHaveLength(1)
    expect(t.attempts[0].selected).toBe(true)
    expect(t.attempts[0].verified).toBe(false)
    expect(t.verifiedItems).toHaveLength(0)
  })

  it('does not let an observed outcome without evidence count as verified', () => {
    const t = reduceTrajectory([
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      { kind: 'dispatched', targetKey: 'node-1', action: 'click', beforeStateKey: key('state-1') },
      {
        kind: 'settled',
        targetKey: 'node-1',
        action: 'click',
        beforeStateKey: key('state-1'),
        afterStateKey: key('state-2'),
        effects: ['expanded'],
        outcome: 'observed',
      },
    ])
    expect(t.attempts[0].outcome).toBe('observed')
    expect(t.attempts[0].verified).toBe(false)
    expect(t.verifiedItems).toHaveLength(0)
  })

  it('counts an item as verified only with a measured post-observation and an evidence reference', () => {
    const t = reduceTrajectory([
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      { kind: 'dispatched', targetKey: 'node-1', action: 'click', beforeStateKey: key('state-1') },
      {
        kind: 'settled',
        targetKey: 'node-1',
        action: 'click',
        beforeStateKey: key('state-1'),
        afterStateKey: key('state-2'),
        effects: ['expanded'],
        outcome: 'observed',
        evidenceRef: 'attempt-7/measurement.json',
        itemId: 'item-1',
      },
    ])
    expect(t.attempts[0].verified).toBe(true)
    expect(t.verifiedItems).toEqual(['item-1'])
  })

  it('never lets a visited state alone populate the verified set', () => {
    const t = reduceTrajectory([
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      observed('state-2', [{ candidateId: 'c1', targetKey: 'node-1' }]),
    ])
    expect(t.visitedStates).toHaveLength(2)
    expect(t.verifiedItems).toHaveLength(0)
  })

  it('keeps the transition edge from the state the action actually started in', () => {
    const t = reduceTrajectory([
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      { kind: 'dispatched', targetKey: 'node-1', action: 'click', beforeStateKey: key('state-1') },
      {
        kind: 'settled',
        targetKey: 'node-1',
        action: 'click',
        beforeStateKey: key('state-1'),
        afterStateKey: key('state-2'),
        effects: ['expanded', 'content-changed'],
        outcome: 'observed',
      },
    ])
    expect(t.transitions).toHaveLength(1)
    expect(t.transitions[0].from).toBe(stateKeyOf(key('state-1')))
    expect(t.transitions[0].to).toBe(stateKeyOf(key('state-2')))
    expect(t.transitions[0].effects).toEqual(['expanded', 'content-changed'])
  })

  it('attributes attempts within a state, and lets a changed state allow re-checking', () => {
    const t = reduceTrajectory([
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      { kind: 'dispatched', targetKey: 'node-1', action: 'click', beforeStateKey: key('state-1') },
      {
        kind: 'settled',
        targetKey: 'node-1',
        action: 'click',
        beforeStateKey: key('state-1'),
        afterStateKey: key('state-1'),
        effects: [],
        outcome: 'observed',
      },
      observed('state-2', [{ candidateId: 'c1', targetKey: 'node-1' }]),
    ])
    expect(t.attemptsInState('node-1', stateKeyOf(key('state-1')))).toBe(1)
    expect(t.attemptsInState('node-1', stateKeyOf(key('state-2')))).toBe(0)
  })

  it('does not treat an unknown outcome as a completed attempt in the state', () => {
    const t = reduceTrajectory([
      observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }]),
      { kind: 'dispatched', targetKey: 'node-1', action: 'click', beforeStateKey: key('state-1') },
      {
        kind: 'settled',
        targetKey: 'node-1',
        action: 'click',
        beforeStateKey: key('state-1'),
        afterStateKey: key('state-1'),
        effects: [],
        outcome: 'unknown',
      },
    ])
    expect(t.attempts).toHaveLength(1)
    expect(t.attemptsInState('node-1', stateKeyOf(key('state-1')))).toBe(0)
  })

  it('reduces an empty event list to an empty trajectory', () => {
    const t = reduceTrajectory([])
    expect(t.visitedStates).toHaveLength(0)
    expect(t.attempts).toHaveLength(0)
    expect(t.transitions).toHaveLength(0)
    expect(t.verifiedItems).toHaveLength(0)
  })

  it('never mutates the event list it was given', () => {
    const events = [observed('state-1', [{ candidateId: 'c1', targetKey: 'node-1' }])]
    const snapshot = JSON.stringify(events)
    reduceTrajectory(events)
    expect(JSON.stringify(events)).toEqual(snapshot)
  })
})