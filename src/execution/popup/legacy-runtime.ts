import { adoptPopupSuggestion, POPUP_SEMANTIC_POLICY } from '../../agent/popup/policy.ts'
import { LEGACY_POPUP_POLICY as POPUP_POLICY } from '../../shared/popup-policy.ts'
import {
  choices,
  hash,
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
  text?: string
  entries: { id: string; ref: string; description: string; visible?: boolean; enabled?: boolean }[]
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
  candidateGeometry?: {
    targetId: string
    geometryVerdict: PopupMeasurement['verdict']
    reason: string
    receiptRef: string
    association: 'unconfirmed'
  }[]
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
  remaining(): { actions: number; calls: number; timeMs: number; reads?: number }
  frame(refresh: boolean): Promise<PopupFrame>
  decide: PopupDecision
  act(
    entry: PopupFrame['entries'][number],
    binding: string,
  ): Promise<{ status: string; actionId?: string; evidenceRefs: string[] }>
  consumeRead(): void
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
  const readActions = new Set<string>()
  const refreshed = new Set<string>()
  const candidateMeasurements = new Map<
    string,
    { result: PopupMeasurement; screenshotRef: string; ref: string }
  >()
  let candidateCount = 0
  async function current(frame: PopupFrame) {
    deps.guard()
    if (deps.remaining().timeMs <= 0) throw Error('popup-time-budget')
    const now = await deps.frame(false)
    deps.guard()
    if (deps.remaining().timeMs <= 0) throw Error('popup-time-budget')
    if (!now.reusable || now.binding !== frame.binding) throw Error('popup-stale-observation')
  }
  const eligible = (frame: PopupFrame) =>
    frame.entries.filter((e) => e.visible !== false && e.enabled !== false)
  const facts = (frame: PopupFrame) =>
    hash({ url: frame.url, text: frame.text ?? '', entries: eligible(frame), panels: frame.panels })
  const newEntries = (frame: PopupFrame) => {
    const before = new Set(lastBefore ? eligible(lastBefore).map((e) => e.id) : [])
    return lastBefore
      ? eligible(frame).filter((e) => !before.has(e.id) && !attempted.has(e.id))
      : []
  }
  const readsRemaining = () =>
    Math.max(0, Math.min(POPUP_POLICY.maxReads - state.reads, deps.remaining().reads ?? Infinity))
  function readAdmission(frame: PopupFrame, stage: PopupQuestion['stage']) {
    const remaining = deps.remaining(),
      action = state.attempts.at(-1)
    if (!frame.reusable || !lastBefore || !action?.actionId || action.result !== 'completed')
      return { allowed: false, reason: 'popup-read-no-action-gap' }
    if (!state.missing.length || facts(frame) === facts(lastBefore))
      return { allowed: false, reason: 'popup-read-no-new-facts' }
    if (stage !== 'target' && newEntries(frame).length)
      return { allowed: false, reason: 'popup-reuse-new-entry-facts' }
    if (readActions.has(action.actionId))
      return { allowed: false, reason: 'popup-read-already-used-for-action' }
    if (readsRemaining() < 1 || remaining.calls < 1 || remaining.timeMs < 6000)
      return { allowed: false, reason: 'popup-read-budget' }
    return { allowed: true, reason: 'unresolved-post-action-observation' }
  }
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
      revision: 'popup-semantic-2',
      stage,
      binding: frame.binding,
      goal: deps.goal,
      candidates: candidates.map((c) => {
        const entry = frame.entries.find((e) => e.id === c.id)
        return {
          ...c,
          ...(entry
            ? {
                visible: entry.visible,
                enabled: entry.enabled,
                newlyObserved: newEntries(frame).some((e) => e.id === c.id),
              }
            : {}),
        }
      }),
      context: {
        previousAction: state.attempts.length
          ? {
              ...state.attempts.at(-1)!,
              description: lastBefore?.entries.find((e) => e.id === state.attempts.at(-1)?.itemId)
                ?.description,
            }
          : undefined,
        observation: {
          text: (frame.text ?? '').slice(0, 800),
          visiblePanels: frame.panels.filter((p) => p.visible).length,
          newEntryIds: newEntries(frame).map((e) => e.id),
          changedSinceAction: !!lastBefore && facts(frame) !== facts(lastBefore),
        },
        remaining: { ...deps.remaining(), reads: readsRemaining() },
        read: readAdmission(frame, stage),
      },
      evidenceRefs: [...state.evidenceRefs],
      missing: [...state.missing],
      attempts: structuredClone(state.attempts),
    }
    state.decisions++
    const packetRef = await deps.save('popup-question', JSON.stringify(packet))
    const decision = adoptPopupSuggestion(packet, await deps.decide(packet, deps.signal))
    const proposal = decision.proposal
    deps.guard()
    const current = await deps.frame(false)
    if (!current.reusable || current.binding !== frame.binding)
      throw Error('popup-stale-suggestion')
    const ref = await deps.save(
      'popup-suggestion',
      JSON.stringify({ packetHash: hash(packet), ...decision, alternatives: choices(packet) }),
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
        adoption: decision,
      },
      [packetRef, ref],
    )
    state.evidenceRefs = [...new Set([...state.evidenceRefs, packetRef, ref])]
    return proposal.choice
  }
  async function collectCandidates(panels: PopupFacts[], frame: PopupFrame) {
    for (const target of panels.slice(0, POPUP_POLICY.maxCandidates)) {
      const key = frame.binding + ':' + target.id
      if (target.unsupported.length || candidateMeasurements.has(key)) continue
      if (
        candidateCount >= POPUP_SEMANTIC_POLICY.maxCandidateMeasurements ||
        readsRemaining() < 1 ||
        deps.remaining().timeMs < 6000
      )
        break
      await current(frame)
      deps.consumeRead()
      state.reads++
      candidateCount++
      const screenshotRef = await deps.screenshot()
      const result = await deps.measure(target.id, target)
      await current(frame)
      const evidenceRefs = [
        ...new Set([...state.evidenceRefs, ...frame.evidenceRefs, screenshotRef]),
      ]
      const receipt = {
        revision: 'popup-candidate-geometry-1',
        policy: POPUP_SEMANTIC_POLICY.version,
        taskId: deps.taskId,
        contractHash: deps.contractHash,
        association: 'unconfirmed',
        actionId: null,
        itemId: null,
        frame,
        targetId: target.id,
        measurement: result,
        screenshotRef,
        evidenceRefs,
        evidenceHashes: await deps.seal(evidenceRefs),
      }
      await current(frame)
      const ref = await deps.save('popup-candidate-geometry', JSON.stringify(receipt))
      await current(frame)
      await deps.emit(
        'popup:candidate-geometry',
        {
          taskId: deps.taskId,
          receiptRef: ref,
          receiptHash: hash(receipt),
          targetId: target.id,
          geometryVerdict: result.verdict,
          association: 'unconfirmed',
          reason: result.reason,
        },
        [...evidenceRefs, ref],
      )
      candidateMeasurements.set(key, { result, screenshotRef, ref })
      state.candidateGeometry ??= []
      state.candidateGeometry.push({
        targetId: target.id,
        geometryVerdict: result.verdict,
        reason: result.reason,
        receiptRef: ref,
        association: 'unconfirmed',
      })
      state.evidenceRefs = [...new Set([...state.evidenceRefs, ...evidenceRefs, ref])]
    }
  }
  async function measure(target: PopupFacts, frame: PopupFrame) {
    await current(frame)
    const cached = candidateMeasurements.get(frame.binding + ':' + target.id)
    const screenshotRef = cached?.screenshotRef ?? (await deps.screenshot())
    const result = cached?.result ?? (await deps.measure(target.id, target))
    await current(frame)
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
    await current(frame)
    const ref = await deps.save('popup-measurement', JSON.stringify(receipt))
    await current(frame)
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
    await current(frame)
    await deps.settle(result, ref, state.evidenceRefs)
    deps.guard()
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
      let frame = await deps.frame(false)
      if (mode === 'refresh' && !newEntries(frame).length) {
        if (refreshed.has(facts(frame))) return handoff('popup-read-already-used-for-facts')
        if (readsRemaining() < 1 || deps.remaining().timeMs < 6000)
          return handoff('popup-read-budget')
        refreshed.add(facts(frame))
        state.reads++
        frame = await deps.frame(true)
        deps.guard()
      }
      state.evidenceRefs = [...new Set([...state.evidenceRefs, ...frame.evidenceRefs])]
      if (!frame.reusable) return handoff('popup-unverifiable-state')
      if (
        lastFrame &&
        facts(lastFrame) === facts(frame) &&
        state.status === 'handoff' &&
        state.reason !== 'popup-action-lineage-changed'
      )
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
        await collectCandidates(panels, frame)
        state.missing = ['which-actual-new-panel-is-the-action-result']
        const choice = await question(
          'target',
          frame,
          panels.map((p) => ({ id: p.id, description: p.description })),
        )
        const target = panels.find((p) => p.id === choice)
        if (target) return await measure(target, frame)
        return await handoff('popup-target-ambiguous')
      }
      const freshEntries = newEntries(frame)
      if (lastBefore && state.attempts.at(-1)?.actionId && !panels.length && !freshEntries.length) {
        state.missing = ['no-new-target-after-action']
        return await requestRead(frame, 'recovery')
      }
      const entries = (freshEntries.length ? freshEntries : eligible(frame))
        .filter((e) => !attempted.has(e.id))
        .slice(0, POPUP_POLICY.maxCandidates)
      state.missing = [
        freshEntries.length
          ? 'new-public-entry-observed-popup-effect-unproven'
          : state.attempts.length
            ? 'no-new-popup-observed-need-nested-entry-or-public-read'
            : 'possible-popup-entry',
      ]
      if (!entries.length) {
        await collectCandidates(panels, frame)
        return await handoff('popup-no-entry-or-target')
      }
      if (
        state.attempts.length >= POPUP_POLICY.maxActions ||
        deps.remaining().actions < 1 ||
        deps.remaining().timeMs < 6000
      )
        return await handoff('popup-action-budget')
      const choice = await question(
        'entry',
        frame,
        entries.map((e) => ({ id: e.id, description: e.description })),
      )
      const entry = entries.find((e) => e.id === choice)
      if (!entry) return await handoff('popup-entry-abstained')
      if (deps.remaining().actions < 1 || deps.remaining().timeMs < 6000)
        return await handoff('popup-action-budget')
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
  async function requestRead(frame: PopupFrame, stage: PopupQuestion['stage']) {
    deps.guard()
    const admission = readAdmission(frame, stage)
    if (!admission.allowed) return handoff(admission.reason)
    readActions.add(state.attempts.at(-1)!.actionId!)
    refreshed.add(facts(frame))
    state.reads++
    const fresh = await deps.frame(true)
    state.evidenceRefs = [...new Set([...state.evidenceRefs, ...fresh.evidenceRefs])]
    deps.guard()
    if (!fresh.reusable) return handoff('popup-unverifiable-state')
    if (facts(fresh) === facts(frame)) return handoff('popup-public-read-no-change')
    state.status = 'active'
    state.reason = 'public-facts-refreshed'
    return publish()
  }
  return { step, snapshot }
}
