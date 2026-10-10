import { POPUP_POLICY } from '../../shared/popup-policy.ts'
import {
  choices,
  hash,
  validateSuggestion,
  type PopupDecision,
  type PopupQuestion,
} from '../../agent/popup/contract.ts'
import type { PopupFacts, PopupMeasurement } from './geometry.ts'
export type PopupFrame = {
  binding: string
  version?: string
  actionEpoch?: number
  url: string
  reusable: boolean
  evidenceRefs: string[]
  entries: { id: string; ref: string; description: string }[]
  panels: PopupFacts[]
}
export type PopupState = {
  revision: 'popup-viewport-1'
  goal: string
  status: 'active' | 'handoff' | 'measured'
  reason: string
  attempts: { itemId: string; actionId?: string; result: string }[]
  evidenceRefs: string[]
  missing: string[]
  decisions: number
  reads: number
  measurement?: PopupMeasurement
  receiptRef?: string
  observation?: { binding: string; url: string; entryIds: string[]; panelIds: string[] }
  budgetRemaining?: { actions: number; calls: number; timeMs: number }
}
export function createPopupRuntime(deps: {
  signal: AbortSignal
  goal: string
  taskId: string
  contractHash: string
  guard(): void
  remaining(): { actions: number; calls: number; timeMs: number }
  frame(refresh: boolean): Promise<PopupFrame>
  decide: PopupDecision
  act(
    entry: PopupFrame['entries'][number],
    binding: string,
  ): Promise<{ status: string; actionId?: string; evidenceRefs: string[] }>
  measure(id: string, expected: PopupFacts): Promise<PopupMeasurement>
  screenshot(): Promise<string>
  save(kind: string, body: string): Promise<string>
  emit(kind: string, payload: Record<string, unknown>, refs: string[]): Promise<void>
  seal(refs: string[]): Promise<Record<string, string>>
  settle(measurement: PopupMeasurement, receiptRef: string, refs: string[]): Promise<void>
}) {
  const state: PopupState = {
    revision: 'popup-viewport-1',
    goal: deps.goal,
    status: 'active',
    reason: 'entry-needed',
    attempts: [],
    evidenceRefs: [],
    missing: ['possible-popup-entry'],
    decisions: 0,
    reads: 0,
  }
  let lastFrame: PopupFrame | undefined, lastBefore: PopupFrame | undefined
  const attempted = new Set<string>()
  let busy = false
  const snapshot = () =>
    structuredClone({ ...state, taskId: deps.taskId, budgetRemaining: deps.remaining() })
  async function publish() {
    await deps.emit('popup:state', snapshot(), [...state.evidenceRefs])
    return snapshot()
  }
  async function handoff(reason: string) {
    state.status = 'handoff'
    state.reason = reason
    return publish()
  }
  async function question(
    stage: PopupQuestion['stage'],
    frame: PopupFrame,
    candidates: PopupQuestion['candidates'],
  ) {
    if (
      state.decisions >= POPUP_POLICY.maxDecisions ||
      deps.remaining().calls < 1 ||
      deps.remaining().timeMs < 2000
    )
      throw Error('popup-decision-budget')
    const packet: PopupQuestion = {
      revision: 'popup-viewport-1',
      stage,
      binding: frame.binding,
      goal: deps.goal,
      candidates,
      evidenceRefs: [...state.evidenceRefs],
      missing: [...state.missing],
      attempts: structuredClone(state.attempts),
    }
    state.decisions++
    const packetRef = await deps.save('popup-question', JSON.stringify(packet))
    const proposal = validateSuggestion(packet, await deps.decide(packet, deps.signal))
    deps.guard()
    const current = await deps.frame(false)
    if (!current.reusable || current.binding !== frame.binding)
      throw Error('popup-stale-suggestion')
    const ref = await deps.save(
      'popup-suggestion',
      JSON.stringify({ packetHash: hash(packet), proposal, alternatives: choices(packet) }),
    )
    await deps.emit(
      'popup:decision',
      {
        stage,
        packetRef,
        suggestionRef: ref,
        packetHash: hash(packet),
        suggestionHash: hash(proposal),
        proposal,
      },
      [packetRef, ref],
    )
    state.evidenceRefs = [...new Set([...state.evidenceRefs, packetRef, ref])]
    return proposal.choice
  }
  async function measure(target: PopupFacts, frame: PopupFrame) {
    const screenshotRef = await deps.screenshot()
    const result = await deps.measure(target.id, target)
    deps.guard()
    const last = lastBefore ? state.attempts.at(-1) : undefined
    const receipt = {
      revision: 'popup-receipt-1',
      taskId: deps.taskId,
      contractHash: deps.contractHash,
      bindingKind: last?.actionId ? 'original-action-result' : 'observed-current-native-panel',
      actionId: last?.actionId ?? null,
      itemId: last?.itemId ?? null,
      before: lastBefore ?? frame,
      after: frame,
      targetId: target.id,
      measurement: result,
      screenshotRef,
      evidenceRefs: [...new Set([...state.evidenceRefs, ...frame.evidenceRefs, screenshotRef])],
    }
    Object.assign(receipt, { evidenceHashes: await deps.seal(receipt.evidenceRefs) })
    const ref = await deps.save('popup-measurement', JSON.stringify(receipt))
    await deps.emit(
      'popup:measurement',
      {
        taskId: deps.taskId,
        receiptRef: ref,
        receiptHash: hash(receipt),
        actionId: receipt.actionId,
        itemId: receipt.itemId,
        verdict: result.verdict,
        reason: result.reason,
      },
      [...receipt.evidenceRefs, ref],
    )
    state.evidenceRefs = [...receipt.evidenceRefs, ref]
    state.measurement = result
    state.receiptRef = ref
    if (result.verdict === 'unknown') {
      state.missing = [result.reason]
      return handoff(result.reason)
    }
    await deps.settle(result, ref, state.evidenceRefs)
    state.status = 'measured'
    state.reason = result.reason
    state.missing = []
    return publish()
  }
  async function step(mode: 'continue' | 'refresh' = 'continue'): Promise<PopupState> {
    if (busy) throw Error('popup-step-already-running')
    busy = true
    try {
      deps.guard()
      if (state.status === 'measured') return snapshot() // Historical result; never relabelled as a current-state assertion.
      if (mode === 'refresh' && state.reads >= POPUP_POLICY.maxReads)
        return handoff('popup-read-budget')
      if (mode === 'refresh') state.reads++
      const frame = await deps.frame(mode === 'refresh')
      state.evidenceRefs = [...new Set([...state.evidenceRefs, ...frame.evidenceRefs])]
      if (!frame.reusable) return handoff('popup-unverifiable-state')
      if (lastFrame?.binding === frame.binding && state.status === 'handoff' && mode !== 'refresh')
        return snapshot()
      lastFrame = frame
      state.observation = {
        binding: frame.binding,
        url: frame.url,
        entryIds: frame.entries.map((e) => e.id),
        panelIds: frame.panels.map((p) => p.id),
      }
      state.status = 'active'
      // Main Agent actions after handoff cannot be attributed to an older child action.
      // Preserve those attempts, invalidate only their target association, and require a fresh read.
      if (
        lastBefore?.actionEpoch !== undefined &&
        frame.actionEpoch !== undefined &&
        frame.actionEpoch !== lastBefore.actionEpoch + (state.attempts.at(-1)?.actionId ? 1 : 0)
      ) {
        lastBefore = undefined
        state.missing = ['original-action-association-invalidated-by-intervening-action']
        return await handoff('popup-action-lineage-changed')
      }
      // Deterministic target binding when exactly one actual new native/public dialog exists.
      const previous = new Set(lastBefore?.panels.filter((p) => p.visible).map((p) => p.id) ?? [])
      const panels = frame.panels.filter((p) => p.visible && !previous.has(p.id))
      const explicit = panels.filter((p) => p.kind !== 'custom')
      if (explicit.length === 1 && panels.filter((p) => p.kind !== 'custom').length === 1)
        return await measure(explicit[0]!, frame)
      if (panels.length && lastBefore && state.attempts.at(-1)?.actionId) {
        state.missing = ['which-actual-new-panel-is-the-action-result']
        const choice = await question(
          'target',
          frame,
          panels.map((p) => ({ id: p.id, description: p.description })),
        )
        const target = panels.find((p) => p.id === choice)
        if (target) return await measure(target, frame)
        if (choice === 'read') return await requestRead()
        return await handoff('popup-target-ambiguous')
      }
      const entries = frame.entries
        .filter((e) => !attempted.has(e.id))
        .slice(0, POPUP_POLICY.maxCandidates)
      state.missing = [
        state.attempts.length
          ? 'no-new-popup-observed-need-nested-entry-or-public-read'
          : 'possible-popup-entry',
      ]
      if (!entries.length) return await handoff('popup-no-entry-or-target')
      if (
        state.attempts.length >= POPUP_POLICY.maxActions ||
        deps.remaining().actions < 1 ||
        deps.remaining().timeMs < 6000
      )
        return await handoff('popup-action-budget')
      const choice = await question(
        state.attempts.length ? 'recovery' : 'entry',
        frame,
        entries.map((e) => ({ id: e.id, description: e.description })),
      )
      if (choice === 'read') return await requestRead()
      const entry = entries.find((e) => e.id === choice)
      if (!entry) return await handoff('popup-entry-abstained')
      attempted.add(entry.id)
      lastBefore = frame
      const result = await deps.act(entry, frame.binding)
      deps.guard()
      state.attempts.push({ itemId: entry.id, actionId: result.actionId, result: result.status })
      state.evidenceRefs = [...new Set([...state.evidenceRefs, ...result.evidenceRefs])]
      state.reason =
        result.status === 'completed' && result.actionId
          ? 'post-action-target-needed'
          : 'popup-action-refused'
      state.missing = ['actual-post-action-target']
      if (!result.actionId || result.status !== 'completed')
        return await handoff('popup-action-refused')
      return await publish()
    } catch (error) {
      deps.signal.throwIfAborted()
      state.missing = [error instanceof Error ? error.message : 'popup-unavailable']
      return await handoff(state.missing[0]!)
    } finally {
      busy = false
    }
  }
  async function requestRead() {
    if (state.reads >= POPUP_POLICY.maxReads) return handoff('popup-read-budget')
    state.reads++
    const fresh = await deps.frame(true)
    state.evidenceRefs = [...new Set([...state.evidenceRefs, ...fresh.evidenceRefs])]
    if (fresh.binding === lastFrame?.binding) return handoff('popup-public-read-no-change')
    state.status = 'active'
    state.reason = 'public-facts-refreshed'
    return publish()
  }
  return { step, snapshot }
}
