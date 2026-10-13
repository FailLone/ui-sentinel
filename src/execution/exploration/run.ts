import type { Page } from 'playwright'
import { click, observe, type ObservationPolicy } from './browser.ts'
import {
  actionKey,
  ExplorationGraph,
  stateKey,
  type Control,
  type Observation,
} from '../../inspection/exploration-graph.ts'

export interface DecisionInput {
  question?: string
  heading: string
  text: string
  candidates: Control[]
  checkedHere: number
  pendingElsewhere: number
  catalog?: { region: string; pending: number }[]
  totalCandidates?: number
  nextOffset?: number | null
  textLength?: number
  totalRegions?: number
  journey?: { control: string; heading: string }[]
}
export interface Decision {
  ref: string
  expectedHeading?: string
  understanding?: { purpose: string; quote: string }
  expectedText?: string
}
export interface ReadRequest {
  kind: 'controls' | 'text' | 'regions'
  offset: number
  region?: string
}
export type ReadPage = (request: ReadRequest) => unknown
export type Decide = (input: DecisionInput, read: ReadPage) => Promise<Decision>

/** A local evidence gap remains an obligation; it cannot end the entire frontier. */
export class ActionGap extends Error {
  constructor(
    readonly ref: string,
    readonly reason: string,
  ) {
    super(`agent-gap:${reason}`)
  }
}

export interface ExploreOptions {
  page: Page
  mode?: 'inspection' | 'recognition'
  reset: () => Promise<void>
  /** Caller contract: replay cannot duplicate writes or external effects. False disables replay. */
  replaySafe: boolean
  /** A trusted state adapter must cover relevant business/history state. Null forbids merging. */
  context: () => Promise<string | null>
  observation?: ObservationPolicy
  decide: Decide
  evidence: (
    index: number,
    before: Observation,
    decision: Decision,
    after: Observation,
  ) => Promise<string>
  /** Explicit scope exclusions, reported individually; never counted as verified. */
  exclude?: (control: Control) => string | undefined
  maxDecisions?: number
  maxClicks?: number
  maxStates?: number
  maxDepth?: number
  maxDurationMs?: number
  pageSize?: number
}

export async function explore(options: ExploreOptions) {
  const mode = options.mode ?? 'inspection'
  const graph = new ExplorationGraph()
  const recognitions: { state: string; action: string; purpose: string; quote: string }[] = []
  const pageSize = options.pageSize ?? 8
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 24) throw Error('invalid-page-size')
  let decisions = 0,
    clicks = 0,
    replayClicks = 0,
    replays = 0,
    reads = 0
  let error: string | null = null
  let inputBytes = 0,
    maxInputBytes = 0
  const exclusions: { state: string; action: string; reason: string }[] = []
  const unverifiedActions: { state: string; action: string; reason: string }[] = []
  const delivered = new Set<string>()
  const maxDecisions = options.maxDecisions ?? 100
  const maxClicks = options.maxClicks ?? 400
  const deadline = Date.now() + (options.maxDurationMs ?? 600000)
  const checkDeadline = () => {
    if (Date.now() >= deadline) throw Error('time-budget')
  }
  const capture = async () => {
    checkDeadline()
    const before = await options.context()
    const observation = await observe(options.page, before, options.observation)
    const after = await options.context()
    if (before === after) return observation
    const refreshed = await observe(options.page, after, options.observation)
    return after === (await options.context())
      ? refreshed
      : { ...refreshed, complete: false, gaps: [...(refreshed.gaps ?? []), 'unstable-context'] }
  }
  const meter = <T>(value: T): T => {
    const size = Buffer.byteLength(JSON.stringify(value))
    inputBytes += size
    maxInputBytes = Math.max(maxInputBytes, size)
    if (size > 32768) throw Error('context-page-budget')
    return value
  }
  const dispatch = async (before: Observation, action: string) => {
    checkDeadline()
    if (clicks >= maxClicks) throw Error('click-budget')
    if ((await options.context()) !== before.context) throw Error('stale-context')
    clicks++
    await click(options.page, before, action, options.observation)
  }
  try {
    await options.reset()
    const initial = await capture()
    const root = graph.observe(initial).state
    let current = root
    while (true) {
      for (const state of graph.states.values()) {
        for (const control of state.observation.controls) {
          const key = actionKey(control)
          const reason = options.exclude?.(control)
          if (reason && state.pending.has(key)) {
            exclusions.push({ state: state.id, action: key, reason })
            state.pending.delete(key)
          }
        }
      }
      if (graph.states.size > (options.maxStates ?? 100)) throw Error('state-budget')
      const target = graph.next(current)
      if (!target) break
      if (decisions >= maxDecisions) throw Error('decision-budget')
      if (target.path.length >= (options.maxDepth ?? 20)) throw Error('depth-budget')
      if (target.id !== current.id) {
        if (!options.replaySafe || target.observation.context === null) throw Error('unsafe-replay')
        replays++
        await options.reset()
        let restored = await capture()
        if (stateKey(restored) !== stateKey(initial)) throw Error('restore-root-mismatch')
        for (const hop of target.path) {
          await dispatch(restored, hop.action)
          replayClicks++
          restored = await capture()
          if (stateKey(restored) !== stateKey(graph.states.get(hop.target)!.observation))
            throw Error('restore-path-mismatch')
        }
        current = target
      }
      const before = await capture()
      if (stateKey(before) !== stateKey(current.observation)) throw Error('unexpected-state-change')
      const pending = before.controls.filter((control) => current.pending.has(actionKey(control)))
      const groups = new Map<string, number>()
      for (const control of pending)
        groups.set(control.region ?? 'Page', (groups.get(control.region ?? 'Page') ?? 0) + 1)
      const catalog = [...groups].map(([region, pending]) => ({ region, pending }))
      const viewed = new Set<string>()
      const present = (controls: Control[]) =>
        controls.map(({ selector: _, ...control }) => {
          viewed.add(control.ref)
          delivered.add(`${current.id}:${actionKey(control)}`)
          return control
        })
      const readTexts = [before.text.slice(0, 400)]
      let decisionReads = 0
      const read: ReadPage = (request) => {
        if (++decisionReads > 8) throw Error('read-budget')
        if (!Number.isSafeInteger(request.offset) || request.offset < 0) throw Error('invalid-page')
        reads++
        if (request.kind === 'text') {
          readTexts.push(before.text.slice(request.offset, request.offset + 2000))
          return meter({
            kind: 'text',
            text: before.text.slice(request.offset, request.offset + 2000),
            total: before.text.length,
            nextOffset: request.offset + 2000 < before.text.length ? request.offset + 2000 : null,
          })
        }
        const all =
          request.kind === 'regions'
            ? catalog
            : pending.filter((control) => !request.region || control.region === request.region)
        if (request.offset > all.length)
          return meter({
            error: 'page-offset-out-of-range',
            kind: request.kind,
            region: request.region ?? null,
            total: all.length,
            suggestedOffset: 0,
            detail:
              'Offset is relative to this filtered region; start at zero after changing regions. No action was executed.',
          })
        const items = all.slice(request.offset, request.offset + pageSize)
        return meter({
          kind: request.kind,
          region: request.region ?? null,
          offset: request.offset,
          items: request.kind === 'controls' ? present(items as Control[]) : items,
          total: all.length,
          nextOffset:
            request.offset + items.length < all.length ? request.offset + items.length : null,
        })
      }
      const input: DecisionInput = meter({
        heading: before.heading,
        text: before.text.slice(0, 400),
        textLength: before.text.length,
        candidates: present(pending.slice(0, pageSize)),
        totalCandidates: pending.length,
        nextOffset: pending.length > pageSize ? pageSize : null,
        catalog: catalog.slice(0, pageSize),
        totalRegions: catalog.length,
        checkedHere: graph.edges.filter((edge) => edge.from === current.id).length,
        pendingElsewhere: graph.report().remaining - current.pending.size,
        journey: current.path.map((hop, index, path) => ({
          control: graph.states
            .get(index ? path[index - 1]!.target : root.id)!
            .observation.controls.find((control) => actionKey(control) === hop.action)!.name,
          heading: graph.states.get(hop.target)!.observation.heading,
        })),
      })
      decisions++
      let decision: Decision
      try {
        decision = await options.decide(input, read)
      } catch (caught) {
        if (!(caught instanceof ActionGap)) throw caught
        const selected = pending.find((control) => control.ref === caught.ref)
        if (!selected || !viewed.has(selected.ref)) throw Error('invalid-gap-target')
        const action = actionKey(selected)
        unverifiedActions.push({ state: current.id, action, reason: caught.reason })
        current.pending.delete(action)
        continue
      }
      const selected = pending.find((control) => control.ref === decision.ref)
      if (
        !selected ||
        !viewed.has(selected.ref) ||
        (mode === 'inspection' && !decision.expectedHeading?.trim())
      )
        throw Error('invalid-decision')
      if (mode === 'recognition') {
        const understanding = decision.understanding
        const source = [
          ...readTexts,
          selected.name,
          selected.description,
          selected.region ?? '',
        ].join('\n')
        if (
          !understanding?.purpose.trim() ||
          !understanding.quote.trim() ||
          !source.includes(understanding.quote)
        )
          throw Error('ungrounded-recognition')
        recognitions.push({ state: current.id, action: actionKey(selected), ...understanding })
      }
      await dispatch(before, actionKey(selected))
      const after = await capture()
      const evidence = await options.evidence(decisions, before, decision, after)
      current = graph.record(
        current,
        actionKey(selected),
        after,
        mode === 'inspection' ? decision.expectedHeading : undefined,
        evidence,
        mode === 'inspection' ? decision.expectedText : undefined,
      ).state
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'exploration-error'
  }
  const report = graph.report()
  const discoveredActions = report.states.reduce(
    (total, state) => total + state.observation.controls.length,
    0,
  )
  return {
    ...report,
    mode,
    recognitions,
    error,
    decisions,
    clicks,
    replayClicks,
    replays,
    reads,
    inputBytes,
    maxInputBytes,
    deliveredActions: delivered.size,
    discoveredActions,
    unreadActions: discoveredActions - report.unavailable - exclusions.length - delivered.size,
    exclusions,
    unverifiedActions,
    status:
      !error &&
      !report.remaining &&
      !report.incompleteObservations &&
      !report.unknownContexts &&
      !unverifiedActions.length &&
      !report.unavailable
        ? 'bounded-scope-exhausted'
        : 'partial',
  }
}
