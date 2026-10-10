import {
  createPopupRuntime as legacyRuntime,
  type PopupState as LegacyState,
  type PopupFrame,
} from './legacy-runtime.ts'
import { hash, choices, type PopupQuestion } from '../../agent/popup/contract.ts'
import { adoptPopupSuggestion } from '../../agent/popup/policy.ts'
import { POPUP_POLICY } from '../../shared/popup-policy.ts'
import { floatingSurface } from './surface.ts'
import type { PopupMeasurement } from './geometry.ts'
export type { PopupFrame } from './legacy-runtime.ts'
export type UiCheck = {
  targetId: string
  verdict: 'pass' | 'fail' | 'unknown'
  reason: string
  receiptRef: string
}
type UiState = Omit<LegacyState, 'revision' | 'measurement'> & {
  revision: 'popup-viewport-2'
  uiChecks: UiCheck[]
  measurement?: { verdict: 'pass' | 'fail' | 'unknown'; reason: string }
  functionalScope: 'separate-original-item-effects'
}
export type PopupState = LegacyState | UiState
export type PopupDeps = Parameters<typeof legacyRuntime>[0] & {
  revision?: 'popup-viewport-1' | 'popup-viewport-2'
  recordUi?(measurement: PopupMeasurement, ref: string, refs: string[]): Promise<void>
  completeUi?(verdict: 'pass' | 'fail', ref: string, refs: string[]): Promise<void>
}
/** Current visible surface inspection. Clicks are exploration, never a causal proof. */
export function createPopupRuntime(deps: PopupDeps) {
  if (deps.revision === 'popup-viewport-1') return legacyRuntime(deps)
  const state: UiState = {
    revision: 'popup-viewport-2',
    goal: deps.goal,
    status: 'active',
    reason: 'visible-surface-needed',
    attempts: [],
    evidenceRefs: [],
    missing: ['visible-floating-surface'],
    decisions: 0,
    reads: 0,
    uiChecks: [],
    functionalScope: 'separate-original-item-effects',
  }
  const attempted = new Set<string>(),
    readActions = new Set<string>()
  let before: PopupFrame | undefined,
    lastFacts = '',
    busy = false
  const facts = (f: PopupFrame) =>
    hash({ url: f.url, text: f.text, entries: f.entries, panels: f.panels })
  const snapshot = () =>
    structuredClone({ ...state, taskId: deps.taskId, budgetRemaining: deps.remaining() })
  const publish = async () => {
    await deps.emit('popup:state', snapshot(), state.evidenceRefs)
    return snapshot()
  }
  const handoff = async (reason: string) => {
    state.status = 'handoff'
    state.reason = reason
    state.missing = [reason]
    return publish()
  }
  async function current(frame: PopupFrame) {
    deps.guard()
    if (deps.remaining().timeMs <= 0) throw Error('popup-time-budget')
    const fresh = await deps.frame(false)
    deps.guard()
    if (deps.remaining().timeMs <= 0) throw Error('popup-time-budget')
    if (!fresh.reusable || fresh.binding !== frame.binding) throw Error('popup-stale-observation')
  }
  async function inspect(frame: PopupFrame) {
    const panels = frame.panels.filter((p) => p.visible),
      checks: UiCheck[] = []
    let screenshotRef: string | undefined
    for (const panel of panels) {
      if (
        state.uiChecks.length >= 2 ||
        state.reads >= POPUP_POLICY.maxReads ||
        (deps.remaining().reads ?? Infinity) < 1 ||
        deps.remaining().timeMs < 6000
      )
        break
      await current(frame)
      deps.consumeRead()
      state.reads++
      screenshotRef ??= await deps.screenshot()
      const applicable = floatingSurface(panel.kind, panel.surface)
      const measurement: PopupMeasurement = applicable
        ? await deps.measure(panel.id, panel)
        : {
            revision: 'popup-geometry-1',
            targetId: panel.id,
            verdict: 'unknown',
            reason: 'floating-surface-type-unconfirmed',
            samples: [],
            tolerancePx: 1,
          }
      await current(frame)
      const refs = [...new Set([...state.evidenceRefs, ...frame.evidenceRefs, screenshotRef])]
      const body = {
        revision: 'popup-ui-measurement-2',
        ruleRevision: 'popup-visible-viewport-2',
        taskId: deps.taskId,
        contractHash: deps.contractHash,
        relation: 'observed-visible-surface',
        actionId: null,
        itemId: null,
        reproduction: state.attempts.at(-1) ?? null,
        frame,
        targetId: panel.id,
        applicable,
        measurement,
        screenshotRef,
        evidenceRefs: refs,
        evidenceHashes: await deps.seal(refs),
      }
      await current(frame)
      const ref = await deps.save('popup-ui-measurement', JSON.stringify(body))
      await current(frame)
      await deps.emit(
        'popup:ui-measurement',
        {
          taskId: deps.taskId,
          receiptRef: ref,
          receiptHash: hash(body),
          targetId: panel.id,
          verdict: measurement.verdict,
          reason: measurement.reason,
        },
        [...refs, ref],
      )
      await current(frame)
      if (!deps.recordUi) throw Error('popup-ui-recorder-missing')
      await deps.recordUi(measurement, ref, [...refs, ref])
      deps.guard()
      checks.push({
        targetId: panel.id,
        verdict: measurement.verdict,
        reason: measurement.reason,
        receiptRef: ref,
      })
      state.uiChecks.push(checks.at(-1)!)
      state.evidenceRefs = [...new Set([...state.evidenceRefs, ...refs, ref])]
    }
    const unchecked = panels
      .filter((p) => !checks.some((c) => c.targetId === p.id))
      .map((p) => p.id)
    const verdict =
      unchecked.length || checks.some((c) => c.verdict === 'unknown') || !checks.length
        ? 'unknown'
        : checks.some((c) => c.verdict === 'fail')
          ? 'fail'
          : 'pass'
    const reason = unchecked.length
      ? 'visible-surfaces-not-all-checked'
      : verdict === 'unknown'
        ? 'unsupported-or-ambiguous-floating-surface'
        : verdict === 'fail'
          ? 'observed-floating-surface-clipped'
          : 'observed-floating-surfaces-fit'
    await current(frame)
    const body = {
      revision: 'popup-ui-summary-2',
      taskId: deps.taskId,
      contractHash: deps.contractHash,
      actionId: null,
      itemId: null,
      frame,
      checks,
      unchecked,
      verdict,
      reason,
      evidenceRefs: state.evidenceRefs,
      evidenceHashes: await deps.seal(state.evidenceRefs),
    }
    await current(frame)
    const ref = await deps.save('popup-ui-summary', JSON.stringify(body))
    await current(frame)
    await deps.emit(
      'popup:ui-summary',
      { taskId: deps.taskId, receiptRef: ref, receiptHash: hash(body), verdict, reason },
      [...state.evidenceRefs, ref],
    )
    state.receiptRef = ref
    state.evidenceRefs = [...state.evidenceRefs, ref]
    state.measurement = { verdict, reason }
    if (verdict === 'unknown') return handoff(reason)
    await current(frame)
    if (!deps.completeUi) throw Error('popup-ui-completion-missing')
    await deps.completeUi(verdict, ref, state.evidenceRefs)
    deps.guard()
    state.status = 'measured'
    state.reason = reason
    state.missing = []
    return publish()
  }
  async function step(mode: 'continue' | 'refresh' = 'continue'): Promise<PopupState> {
    if (busy) throw Error('popup-step-already-running')
    busy = true
    try {
      deps.guard()
      if (state.status === 'measured') return snapshot()
      let frame = await deps.frame(false)
      deps.guard()
      if (!frame.reusable) return handoff('popup-unverifiable-state')
      state.evidenceRefs = [...new Set([...state.evidenceRefs, ...frame.evidenceRefs])]
      if (state.status === 'handoff' && lastFacts === facts(frame)) return snapshot()
      lastFacts = facts(frame)
      state.observation = {
        binding: frame.binding,
        url: frame.url,
        entryIds: frame.entries.map((e) => e.id),
        panelIds: frame.panels.map((p) => p.id),
      }
      if (frame.panels.some((p) => p.visible)) return await inspect(frame)
      const eligible = frame.entries.filter(
        (e) => e.visible !== false && e.enabled !== false && !attempted.has(e.id),
      )
      const fresh = before
        ? eligible.filter(
            (e) =>
              !before!.entries.some(
                (old) => old.id === e.id && old.visible !== false && old.enabled !== false,
              ),
          )
        : []
      if (before && !fresh.length) {
        const action = state.attempts.at(-1)?.actionId
        if (!action || readActions.has(action) || facts(before) === facts(frame))
          return handoff('no-visible-floating-surface')
        if (
          state.reads >= POPUP_POLICY.maxReads ||
          (deps.remaining().reads ?? Infinity) < 1 ||
          deps.remaining().timeMs < 6000
        )
          return handoff('popup-read-budget')
        readActions.add(action)
        state.reads++
        frame = await deps.frame(true)
        deps.guard()
        if (!frame.reusable) return handoff('popup-unverifiable-state')
        state.evidenceRefs = [...new Set([...state.evidenceRefs, ...frame.evidenceRefs])]
        if (frame.panels.some((p) => p.visible)) return await inspect(frame)
        return handoff('no-visible-floating-surface-after-bounded-read')
      }
      const entries = (fresh.length ? fresh : eligible).slice(0, POPUP_POLICY.maxCandidates)
      if (!entries.length) return handoff('no-visible-floating-surface-or-entry')
      const remaining = deps.remaining()
      if (
        state.attempts.length >= POPUP_POLICY.maxActions ||
        remaining.actions < 1 ||
        remaining.timeMs < 6000
      )
        return handoff('popup-action-budget')
      if (state.decisions >= POPUP_POLICY.maxDecisions || remaining.calls < 1)
        return handoff('popup-decision-budget')
      const packet: PopupQuestion = {
        revision: 'popup-semantic-2',
        stage: 'entry',
        binding: frame.binding,
        goal: deps.goal,
        candidates: entries.map((e) => ({ ...e, newlyObserved: fresh.some((n) => n.id === e.id) })),
        evidenceRefs: state.evidenceRefs,
        missing: ['exploration-entry'],
        attempts: state.attempts,
        context: {
          previousAction: state.attempts.length
            ? {
                ...state.attempts.at(-1)!,
                description: before?.entries.find((e) => e.id === state.attempts.at(-1)?.itemId)
                  ?.description,
              }
            : undefined,
          observation: {
            text: (frame.text ?? '').slice(0, 800),
            visiblePanels: 0,
            newEntryIds: fresh.map((e) => e.id),
            changedSinceAction: !!before && facts(before) !== facts(frame),
          },
          remaining: {
            ...remaining,
            reads: deps.remaining().reads ?? POPUP_POLICY.maxReads - state.reads,
          },
          read: { allowed: false, reason: 'program-owned' },
        },
      }
      state.decisions++
      const packetRef = await deps.save('popup-question', JSON.stringify(packet))
      const adoption = adoptPopupSuggestion(packet, await deps.decide(packet, deps.signal))
      await current(frame)
      const suggestionRef = await deps.save(
        'popup-suggestion',
        JSON.stringify({ packetHash: hash(packet), ...adoption, alternatives: choices(packet) }),
      )
      await deps.emit(
        'popup:decision',
        {
          stage: 'entry',
          packetRef,
          suggestionRef,
          packetHash: hash(packet),
          proposal: adoption.proposal,
          adoption,
        },
        [packetRef, suggestionRef],
      )
      state.evidenceRefs = [...new Set([...state.evidenceRefs, packetRef, suggestionRef])]
      const entry = entries.find((e) => e.id === adoption.proposal.choice)
      if (!entry) return handoff('popup-entry-abstained')
      await current(frame)
      if (deps.remaining().actions < 1 || deps.remaining().timeMs < 6000)
        return handoff('popup-action-budget')
      attempted.add(entry.id)
      before = frame
      const result = await deps.act(entry, frame.binding)
      deps.guard()
      state.attempts.push({ itemId: entry.id, actionId: result.actionId, result: result.status })
      state.evidenceRefs = [...new Set([...state.evidenceRefs, ...result.evidenceRefs])]
      if (result.status !== 'completed' || !result.actionId) return handoff('popup-action-refused')
      state.status = 'active'
      state.reason = 'post-action-observation-needed'
      return publish()
    } catch (error) {
      deps.signal.throwIfAborted()
      return handoff(error instanceof Error ? error.message : 'popup-unavailable')
    } finally {
      busy = false
    }
  }
  return { step, snapshot }
}
