import { createHash } from 'node:crypto'

/** Pure bounded exploration ledger. Browser access and policy belong to the host. */
export interface Control {
  ref: string
  name: string
  description: string
  enabled: boolean
  role?: string
  region?: string
  operation?: 'click' | 'fill' | 'select' | 'check'
  value?: string
  currentValue?: string
  selector?: string
}
export interface Observation {
  url: string
  heading: string
  text: string
  controls: Control[]
  complete: boolean
  /** Null means hidden/history-dependent state has not been bounded: do not merge. */
  context: string | null
  gaps?: string[]
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const actionKey = (control: Control) =>
  hash({
    name: control.name,
    description: control.description,
    role: control.role,
    region: control.region,
    operation: control.operation,
    value: control.value,
  })
export function stateKey(observation: Observation): string {
  const { controls, ...state } = observation
  return hash({
    ...state,
    controls: controls.map(({ ref: _, selector: __, ...control }) => control),
  })
}
export function similarityKey(observation: Observation): string {
  return hash(observation.controls.map((c) => c.name))
}
export interface Hop {
  action: string
  target: string
}
export interface State {
  id: string
  observation: Observation
  path: Hop[]
  pending: Set<string>
  unavailable: string[]
}
export interface Edge {
  from: string
  action: string
  to: string
  expectedHeading?: string
  expectedText?: string
  verdict: 'pass' | 'fail' | 'observed'
  reused: boolean
  cycle: boolean
  evidence: string
}

export class ExplorationGraph {
  readonly states = new Map<string, State>()
  readonly edges: Edge[] = []
  private readonly identities = new Map<string, string>()

  observe(observation: Observation, path: Hop[] = []): { state: State; reused: boolean } {
    // Duplicate semantic action keys are ambiguous: no arbitrary first-element binding.
    const keys = observation.controls.map(actionKey)
    if (new Set(keys).size !== keys.length) throw Error('ambiguous-controls')
    const identity = stateKey(observation)
    const mergeable = observation.complete && observation.context !== null
    const previous = mergeable ? this.identities.get(identity) : undefined
    if (previous) return { state: this.states.get(previous)!, reused: true }
    const id = `s${this.states.size + 1}`
    const state: State = {
      id,
      observation,
      path,
      pending: new Set(observation.controls.filter((c) => c.enabled).map(actionKey)),
      unavailable: observation.controls.filter((c) => !c.enabled).map(actionKey),
    }
    this.states.set(id, state)
    if (mergeable) this.identities.set(identity, id)
    return { state, reused: false }
  }

  record(
    from: State,
    action: string,
    after: Observation,
    expectedHeading: string | undefined,
    evidence: string,
    expectedText?: string,
  ) {
    if (!from.pending.has(action)) throw Error('not-pending')
    if ((expectedHeading !== undefined && !expectedHeading.trim()) || !evidence)
      throw Error('missing-expectation-or-evidence')
    const target = this.observe(after)
    if (!target.reused) target.state.path = [...from.path, { action, target: target.state.id }]
    const cycle =
      target.reused &&
      (target.state.id === from.id ||
        from.path.some((hop) => hop.target === target.state.id) ||
        target.state.path.length === 0)
    const edge: Edge = {
      from: from.id,
      action,
      to: target.state.id,
      expectedHeading,
      expectedText,
      verdict:
        expectedHeading === undefined
          ? 'observed'
          : after.heading === expectedHeading &&
              (!expectedText || after.text.includes(expectedText))
            ? 'pass'
            : 'fail',
      reused: target.reused,
      cycle,
      evidence,
    }
    this.edges.push(edge)
    from.pending.delete(action)
    return { ...target, edge }
  }

  next(current: State): State | undefined {
    if (current.pending.size) return current
    // Continue deepest discovered unfinished branch. Every replay is checked by the runner.
    return [...this.states.values()].reverse().find((state) => state.pending.size)
  }

  report() {
    const states = [...this.states.values()].map((state) => ({
      ...state,
      pending: [...state.pending],
      similarityGroup: similarityKey(state.observation),
    }))
    return {
      states,
      edges: this.edges,
      stateCount: states.length,
      checkedEdges: this.edges.length,
      remaining: states.reduce((total, state) => total + state.pending.length, 0),
      unavailable: states.reduce((total, state) => total + state.unavailable.length, 0),
      incompleteObservations: states.filter((state) => !state.observation.complete).length,
      unknownContexts: states.filter((state) => state.observation.context === null).length,
      gaps: [...new Set(states.flatMap((state) => state.observation.gaps ?? []))],
      failedEdges: this.edges.filter((edge) => edge.verdict === 'fail').length,
      reusedArrivals: this.edges.filter((edge) => edge.reused).length,
      cycleArrivals: this.edges.filter((edge) => edge.cycle).length,
    }
  }
}
