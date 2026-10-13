import { describe, expect, it } from 'vitest'
import { actionKey, ExplorationGraph, similarityKey, type Observation } from './graph.ts'

const observation = (heading = 'Home', context: string | null = 'read-only-v1'): Observation => ({
  url: 'http://fixture/',
  heading,
  text: heading,
  complete: true,
  context,
  controls: [{ ref: 'a1', name: 'Open', description: 'Opens panel', enabled: true }],
})

describe('exploration graph prototype contracts', () => {
  it('merges exact states without depending on ephemeral element refs', () => {
    const graph = new ExplorationGraph()
    const first = graph.observe(observation())
    const second = observation()
    second.controls[0]!.ref = 'a901'
    expect(graph.observe(second)).toMatchObject({ reused: true, state: { id: first.state.id } })
  })
  it('records both incoming paths but expands a shared state once', () => {
    const graph = new ExplorationGraph()
    const root = observation()
    root.controls.push({
      ref: 'a2',
      name: 'Other route',
      description: 'Opens panel',
      enabled: true,
    })
    const state = graph.observe(root).state
    graph.record(state, actionKey(root.controls[0]!), observation('Panel'), 'Panel', 'e1')
    graph.record(state, actionKey(root.controls[1]!), observation('Panel'), 'Panel', 'e2')
    expect(graph.report()).toMatchObject({
      stateCount: 2,
      checkedEdges: 2,
      reusedArrivals: 1,
      remaining: 1,
    })
  })
  it('keeps similar screens distinct when text, enabled state or effect context changes', () => {
    const graph = new ExplorationGraph()
    const a = observation()
    const b = { ...observation(), text: 'Permission denied' }
    expect(similarityKey(a)).toBe(similarityKey(b))
    graph.observe(a)
    expect(graph.observe(b).reused).toBe(false)
    expect(graph.observe(observation('Home', 'record-already-created')).reused).toBe(false)
    const disabled = observation()
    disabled.controls[0]!.enabled = false
    expect(graph.observe(disabled).reused).toBe(false)
  })
  it('refuses deduplication with unknown history or incomplete collection', () => {
    const graph = new ExplorationGraph()
    for (let i = 0; i < 2; i++) graph.observe(observation('Home', null))
    for (let i = 0; i < 2; i++) graph.observe({ ...observation(), complete: false })
    expect(graph.report()).toMatchObject({
      stateCount: 4,
      incompleteObservations: 2,
      unknownContexts: 2,
    })
  })
  it('records self-loops once and reports a contradicted expectation as a failure', () => {
    const graph = new ExplorationGraph()
    const state = graph.observe(observation()).state
    graph.record(state, actionKey(state.observation.controls[0]!), observation(), 'Panel', 'e1')
    expect(graph.report()).toMatchObject({ cycleArrivals: 1, failedEdges: 1, remaining: 0 })
    expect(() =>
      graph.record(state, actionKey(state.observation.controls[0]!), observation(), 'Panel', 'e2'),
    ).toThrow('not-pending')
  })
  it('never turns unvisited or disabled actions into passes', () => {
    const graph = new ExplorationGraph()
    graph.observe(observation())
    const disabled = observation('Disabled')
    disabled.controls[0]!.enabled = false
    graph.observe(disabled)
    expect(graph.report()).toMatchObject({ checkedEdges: 0, remaining: 1, unavailable: 1 })
  })
  it('rejects ambiguous action identity and missing evidence', () => {
    const graph = new ExplorationGraph()
    const a = observation()
    a.controls.push({ ...a.controls[0]!, ref: 'a2' })
    expect(() => graph.observe(a)).toThrow('ambiguous-controls')
    const state = graph.observe(observation()).state
    expect(() =>
      graph.record(state, actionKey(state.observation.controls[0]!), observation(), 'Home', ''),
    ).toThrow('missing-expectation-or-evidence')
  })
})
