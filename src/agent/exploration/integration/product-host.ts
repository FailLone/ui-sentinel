import { explorationRevisitIntent } from '../../../shared/r1-policy.ts'
/** Run-local planning only. The original executor validates, dispatches, measures and persists. */
import { normalizeFacts, type PlanningFacts } from '../facts.ts'
import { planNext } from '../scheduler.ts'
import { assessStrategies, planCounterexampleInvestigation } from '../strategies.ts'
import { buildFrontier } from '../frontier.ts'
import {
  reduceTrajectory,
  currentStateOf,
  type TrajectoryEvent,
  type PlanningStateKey,
} from '../trajectory.ts'
import type {
  ExperimentalDecision,
  ExperimentalHost,
} from '../../../execution/experimental-decision-host.ts'
import type { ObservationVersion } from '../../../execution/observation-version.ts'
import type { ExplorationPolicy } from '../../../shared/r1-policy.ts'
import type { ItemChecks } from '../../../inspection/check-contract.ts'
import {
  createControlledHost,
  digest,
  onlinePriority,
  pending,
  REVISION,
  type PublicFrame,
  type Score,
} from './host.ts'

export type ProductOutcome = {
  decision: ExperimentalDecision
  result: any
  observation: any
  checks: { itemId: string; checks: ItemChecks }[]
  evidenceRefs: string[]
}
export type ProductHost = ExperimentalHost & {
  recordOutcome(input: ProductOutcome, version: ObservationVersion): unknown
  snapshot(): unknown
}
const stateKey = (v: ObservationVersion, url: string): PlanningStateKey => ({
  pageId: url,
  documentVersion: v.planning!.documentId,
  relatedStateVersion: v.planning!.relatedState,
  viewKey: 'anonymous',
})

export function createProductHost(
  policy: ExplorationPolicy,
  options: { score?: Score } = {},
): ProductHost {
  const events: TrajectoryEvent[] = [],
    recovery = createControlledHost({ maxSteps: policy.maxProgramSteps })
  const waiting = new Map<string, number>(),
    selectionAttempts = new Set<string>(),
    navigation = new Set<string>()
  let index = 0,
    steps = 0,
    lastFacts: PlanningFacts | undefined,
    lastPlan: unknown,
    strategies: unknown,
    counterexample: unknown
  let stopped = '',
    scoreCalls = 0
  let proposed:
    | {
        itemId: string
        targetKey: string
        action: 'click' | 'fill' | 'navigate'
        before: PlanningStateKey
        label: string
        navigation?: boolean
      }
    | undefined
  let pendingActual:
    | {
        attemptId: string
        itemId: string
        targetKey: string
        action: 'click' | 'fill' | 'navigate'
        before: PlanningStateKey
        navigation?: boolean
      }
    | undefined
  const labels = new Map<string, string>()
  const knownCandidates = new Map<string, PlanningFacts['input']['candidates'][number]>()
  function snapshot() {
    const trajectory = reduceTrajectory(events)
    const frontier = lastFacts ? buildFrontier(lastFacts, trajectory) : undefined
    return {
      revision: policy.revision,
      visitedStates: trajectory.visitedStates,
      attempts: trajectory.attempts.map((a) => ({ ...a, label: labels.get(a.targetKey) })),
      paths: frontier?.paths ?? [],
      unexplored: frontier?.unexploredBranches ?? [],
      blocked: frontier?.blocked ?? [],
      plan: lastPlan,
      strategies,
      counterexample,
      handoffReason: stopped || null,
      semantics: 'visited is not verified; measurements belong to the original inspection items',
    }
  }
  function handoff(raw: any, reason: string): ExperimentalDecision {
    stopped = reason
    return {
      kind: 'handoff',
      reason,
      packet: {
        ...(snapshot() as object),
        remaining: raw.inspectionScope?.outstanding,
        checks: raw.inspectionScope?.checks,
        originalActions: raw.inspectionScope?.checkInteractions,
        evidenceRefs: raw.evidenceRefs,
        budget: raw.budgetRemaining,
      },
    }
  }
  function settle(input: ProductOutcome, version: ObservationVersion) {
    if (!pendingActual || !version.planning) return
    const c = input.checks.find((c) => c.itemId === pendingActual!.itemId)?.checks
    const measured =
      c &&
      c.generic.actionId === pendingActual.attemptId &&
      ['collected', 'failed'].includes(c.generic.state) &&
      !pending(c).length
    const nav =
      pendingActual.navigation &&
      input.result?.verification?.actionId === pendingActual.attemptId &&
      input.result?.verification?.itemId === pendingActual.itemId &&
      input.result.verification.outcome === 'verified'
    if (!measured && !nav) return
    const evidence = measured
      ? (c!.generic.receiptRef ?? c!.generic.evidenceRefs[0])
      : input.result.verification.evidenceRefs?.[0]
    if (!evidence) return
    events.push({
      kind: 'settled',
      attemptId: pendingActual.attemptId,
      itemId: pendingActual.itemId,
      targetKey: pendingActual.targetKey,
      action: pendingActual.action,
      beforeStateKey: pendingActual.before,
      afterStateKey: stateKey(version, input.observation.url),
      outcome: 'observed',
      evidenceRef: evidence,
      effects:
        pendingActual.before.pageId !== input.observation.url
          ? ['navigated']
          : c?.generic.feedback === 'change-observed'
            ? ['content-changed']
            : [],
    })
    pendingActual = undefined
  }
  return {
    snapshot,
    recordOutcome(input, version) {
      if (proposed && input.decision.kind === 'tool' && input.decision.tool === 'page_act') {
        const c = input.checks.find((c) => c.itemId === proposed!.itemId)?.checks
        const actionId = c?.generic.actionId ?? input.result?.verification?.actionId
        if (proposed.navigation && input.result?.verification?.itemId)
          proposed.itemId = input.result.verification.itemId
        if (input.result?.error || input.result?.status !== 'completed' || !actionId)
          stopped = 'action-not-measured-or-refused'
        else {
          pendingActual = { ...proposed, attemptId: actionId }
          events.push({
            kind: 'dispatched',
            attemptId: actionId,
            itemId: proposed.itemId,
            targetKey: proposed.targetKey,
            action: proposed.action,
            beforeStateKey: proposed.before,
          })
        }
        proposed = undefined
      }
      settle(input, version)
      if (version.planning)
        events.push({
          kind: 'observed',
          stateKey: stateKey(version, input.observation.url),
          candidates: [],
        })
      return snapshot()
    },
    async decide(raw: any, { signal, version }): Promise<ExperimentalDecision> {
      signal.throwIfAborted()
      raw = { ...raw, observation: raw.r1?.observation ?? raw.observation }
      if (stopped) return handoff(raw, stopped)
      if (++steps > policy.maxProgramSteps) return handoff(raw, 'program-step-limit')
      if (!version.reusable || !version.planning) return handoff(raw, 'state-not-reliably-bindable')
      if (raw.evidenceIntegrity?.status !== 'clean' || !raw.inspectionScope?.checks)
        return handoff(raw, 'missing-or-dirty-evidence')
      if (raw.budgetRemaining.actions <= 0 || raw.budgetRemaining.timeMs <= 1000)
        return handoff(raw, 'budget-insufficient')
      const tool = (
        name: string,
        args: Record<string, unknown>,
        basis: unknown,
      ): ExperimentalDecision => ({ kind: 'tool', binding: version.key, tool: name, args, basis })
      // Read-only recovery stays tied to the original action. Never replay a pending/unknown action.
      if (
        raw.inspectionScope.checks.some(
          (c: any) => c.checks.generic.actionId && pending(c.checks).length,
        )
      ) {
        const inspected = raw.latestToolResults?.tools?.find(
          (t: any) => t.tool === 'page_inspect',
        )?.elements
        if (inspected?.filter((e: any) => e.visible !== false).length > 1)
          return handoff(raw, 'ambiguous-result-target')
        const result = await recovery.decide(raw, { signal, version })
        if (result.kind === 'handoff') return handoff(raw, result.reason)
        return ['page_inspect', 'interaction_verify'].includes(result.tool)
          ? result
          : handoff(raw, 'unresolved-original-action')
      }
      const checks = new Map<string, ItemChecks>(
        raw.inspectionScope.checks.map((c: any) => [c.itemId, c.checks]),
      )
      const source = raw.inspectionScope.candidates.flatMap((c: any) => {
        const e = raw.observation.elements.find((e: any) => e.ref === c.ref)
        if (!e || !e.visible || !e.enabled || !version.planning!.targetKeys[e.selector]) return []
        const check = checks.get(c.itemId)
        if (check && check.generic.state !== 'pending') return []
        if (!check && !raw.r1?.selectableIds.includes(c.itemId)) return []
        const role = ['input', 'textarea'].includes(e.tag)
          ? 'textbox'
          : e.tag === 'a'
            ? 'link'
            : 'button'
        if (!['button', 'a', 'input', 'textarea'].includes(e.tag)) return []
        const targetKey = version.planning!.targetKeys[e.selector],
          text = e.attributes['aria-label'] || e.text || e.attributes.placeholder || ''
        labels.set(targetKey, text)
        if (!waiting.has(targetKey)) waiting.set(targetKey, index)
        return [
          {
            id: c.itemId,
            targetKey,
            observationVersion: version.key,
            text,
            role,
            publicState: {
              visible: e.visible,
              enabled: e.enabled,
              expanded: e.attributes['aria-expanded'] === 'true',
              selected:
                e.attributes['aria-selected'] === 'true' || e.attributes['aria-pressed'] === 'true',
            },
            geometry: null,
            context: JSON.stringify({ ref: c.ref, selector: e.selector, category: c.category }),
            allowedActions: [role === 'textbox' ? 'fill' : 'click'],
            estimatedCost: 1,
          },
        ]
      })
      const input = {
        schemaVersion: 'r1-exploration-input-1',
        requestId: version.key,
        task: {
          goal: raw.goal ?? 'Bounded UI inspection',
          localTask: 'Inspect current public scope; preserve omitted branches',
          revision: policy.revision,
        },
        state: {
          pageId: raw.observation.url,
          url: raw.observation.url,
          documentVersion: version.planning.documentId,
          observationVersion: version.key,
          relatedStateVersion: version.planning.relatedState,
          cacheable: false,
        },
        candidates: source,
        history: [],
        scope: { revision: policy.revision, executableCandidateIds: source.map((c: any) => c.id) },
        budget: {
          revision: digest(raw.budgetRemaining),
          remainingDecisions: policy.maxProgramSteps - steps + 1,
          remainingActions: raw.budgetRemaining.actions,
          remainingMs: raw.budgetRemaining.timeMs,
          maxRequestMs: 15000,
          remainingCostUsd: null,
        },
        limits: { maxCandidates: 32, maxInputBytes: 32768, maxHistory: 32 },
      }
      const accepted = normalizeFacts({
        ...input,
        view: {
          kind: 'anonymous',
          roleLabel: null,
          source: 'frozen-ui-contract',
          viewKey: 'anonymous',
        },
      })
      if (!accepted.ok) return handoff(raw, 'planning-facts:' + accepted.reason)
      const facts = (lastFacts = accepted.value)
      facts.input.candidates.forEach((c) => knownCandidates.set(c.targetKey!, c))
      const state = stateKey(version, raw.observation.url)
      events.push({
        kind: 'observed',
        stateKey: state,
        candidates: facts.input.candidates.map((c) => ({
          candidateId: c.id,
          targetKey: c.targetKey!,
        })),
      })
      const trajectory = reduceTrajectory(events),
        frontier = buildFrontier(facts, trajectory)
      const failure = raw.inspectionScope.checks.find((c: any) =>
        c.checks.effects.some((e: any) => e.state === 'failed'),
      )
      const failedTarget =
        failure && trajectory.attempts.find((a) => a.itemId === failure.itemId)?.targetKey
      if (failedTarget && knownCandidates.has(failedTarget))
        counterexample = planCounterexampleInvestigation(
          {
            ...facts,
            input: {
              ...facts.input,
              candidates: [
                knownCandidates.get(failedTarget)!,
                ...facts.input.candidates.filter((c) => c.targetKey !== failedTarget),
              ],
            },
          },
          { targetKey: failedTarget, claimedEffect: 'content-changed', verified: true },
        )
      const boundaries = source.flatMap((c: any) => {
        const e = raw.observation.elements.find((e: any) => e.ref === JSON.parse(c.context).ref),
          n = Number(e.attributes.maxlength)
        return c.role === 'textbox' &&
          e.attributes.maxlength !== undefined &&
          Number.isInteger(n) &&
          n >= 0 &&
          n <= 256
          ? [
              {
                candidateId: c.id,
                stateKey: currentStateOf(facts),
                observationVersion: version.key,
                kind: 'max-length' as const,
                maximum: n,
                evidenceRef: raw.evidenceRefs[0],
              },
            ]
          : []
      })
      const intent = explorationRevisitIntent(String(raw.goal ?? '')),
        url = raw.observation.url
      const prior = trajectory.transitions.filter((t) => t.effects.includes('navigated')).at(-1)
      const returnState = prior?.from,
        returnUrl = returnState ? JSON.parse(returnState)[0] : undefined
      const revisit =
        source.length === 0 &&
        !raw.inspectionScope.outstanding.some((c: any) =>
          ['local-interaction', 'navigation'].includes(c.category),
        ) &&
        navigation.size < policy.maxRevisits
          ? intent === 'refresh' && !navigation.has('refresh:' + url)
            ? {
                action: 'refresh' as const,
                stateKey: currentStateOf(facts),
                expectedState: currentStateOf(facts),
                observationVersion: version.key,
                evidenceRef: raw.evidenceRefs[0],
              }
            : intent === 'back' &&
                returnState &&
                returnUrl &&
                new URL(returnUrl).origin === new URL(url).origin &&
                ![...navigation].some((n) => n.startsWith('back:'))
              ? {
                  action: 'back' as const,
                  stateKey: currentStateOf(facts),
                  expectedState: returnState,
                  observationVersion: version.key,
                  evidenceRef: raw.evidenceRefs[0],
                }
              : undefined
          : undefined
      const assessed = assessStrategies(facts, frontier, {
        fillCandidateIds: boundaries.map((b: any) => b.candidateId),
        boundaries,
        ...(revisit ? { navigation: revisit } : {}),
      })
      strategies = assessed
      if (revisit && assessed.some((s) => s.strategyId === 'return-refresh' && s.proposable)) {
        navigation.add(revisit.action + ':' + url)
        proposed = {
          itemId: 'pending-navigation',
          targetKey: version.planning.documentId + ':' + revisit.action,
          action: 'navigate',
          before: state,
          label: revisit.action,
          navigation: true,
        }
        labels.set(proposed.targetKey, revisit.action)
        return tool(
          'page_act',
          { type: 'navigate', url: revisit.action === 'refresh' ? url : returnUrl },
          {
            strategy: assessed.find((s) => s.strategyId === 'return-refresh'),
            basis:
              'Explicit public task; revisit an already observed same-origin URL; no history/session restoration claim',
          },
        )
      }
      const frame: PublicFrame = {
        revision: REVISION,
        binding: version.key,
        input: facts.input,
        facts: {
          goal: raw.goal,
          observation: raw.observation,
          inspectionScope: raw.inspectionScope,
          evidenceRefs: raw.evidenceRefs,
        },
      }
      const priority = onlinePriority(frame)
      const definite = !priority.ambiguity && priority.ids.length > 1 ? priority.ids[0] : undefined
      const fairness = {
        decisionIndex: index,
        firstEligibleDecision: Object.fromEntries(
          source.map((c: any) => [c.id, waiting.get(c.targetKey)!]),
        ),
      }
      const comparison = (counterexample as { steps?: { targetKey: string }[] } | undefined)
        ?.steps?.[0]?.targetKey
      let plan = planNext({
        facts,
        trajectory,
        fairness,
        risk: comparison
          ? [
              {
                targetKey: comparison,
                basis: 'measured failure; inspect a public same-role comparison',
                source: failure?.itemId ?? 'original-effect-measurement',
              },
            ]
          : definite
            ? [
                {
                  targetKey: source.find((c: any) => c.id === definite).targetKey,
                  basis: 'explicit public goal or pending effect',
                  source: 'frozen-goal-and-checks',
                },
              ]
            : [],
      })
      lastPlan = plan
      if (plan.kind === 'handoff')
        return handoff(raw, plan.handoff.reason + ':' + plan.handoff.detail)
      let chosen = facts.input.candidates.find(
        (c) => c.id === (plan as { candidateId: string }).candidateId,
      )!
      if (source.filter((c: any) => c.text === chosen.text && c.role === chosen.role).length > 1)
        return handoff(raw, 'ambiguous-public-target')
      // A priority tie is the only scoring opportunity. A fairness turn is already decided.
      if (
        policy.jev &&
        options.score &&
        priority.ambiguity &&
        plan.basis.riskBasis !== 'rotation' &&
        source.length >= 2 &&
        source.length <= 3
      ) {
        if (Buffer.byteLength(JSON.stringify(frame)) > 30000)
          return handoff(raw, 'scoring-frame-too-large')
        if (scoreCalls >= policy.maxJevCalls) return handoff(raw, 'jev-call-limit')
        scoreCalls++
        const score = await options.score(frame, signal)
        signal.throwIfAborted()
        if (score.binding !== frame.binding || score.packetHash !== digest(frame))
          return handoff(raw, 'stale-score')
        if (score.kind === 'handoff') return handoff(raw, score.reason ?? 'jev-handoff')
        if (
          score.orderedIds.length !== source.length ||
          new Set(score.orderedIds).size !== source.length ||
          score.orderedIds.some((id) => !source.some((c: any) => c.id === id))
        )
          return handoff(raw, 'invalid-score-candidates')
        // Reuse planner eligibility, rather than letting a score override replay/fairness gates.
        const next = planNext({
          facts,
          trajectory,
          fairness,
          risk: [
            {
              targetKey: source.find((c: any) => c.id === score.orderedIds[0]).targetKey,
              basis: 'bounded public priority score',
              source: 'jev-receipt',
            },
          ],
        })
        if (next.kind !== 'act') return handoff(raw, 'no-safe-scored-plan')
        plan = next
        lastPlan = plan
        chosen = facts.input.candidates.find(
          (c) => c.id === (plan as { candidateId: string }).candidateId,
        )!
      }
      if (source.filter((c: any) => c.text === chosen.text && c.role === chosen.role).length > 1)
        return handoff(raw, 'ambiguous-public-target')
      if (!checks.has(chosen.id) && !raw.r1?.selectedIds.includes(chosen.id)) {
        const initial = raw.r1?.initialSelectionIds as string[] | undefined
        const ids = initial?.length ? initial : [chosen.id]
        if (ids.some((id) => selectionAttempts.has(id)))
          return handoff(raw, 'sampling-admission-refused')
        ids.forEach((id) => selectionAttempts.add(id))
        return tool(
          'exploration_update',
          {
            state: 'R1 public bounded frontier',
            unexploredBranches: [],
            selectItems: ids.map((itemId) => ({
              itemId,
              basis: 'R1 observed candidate within frozen local-check and action budgets',
            })),
          },
          { plan, strategies: assessed },
        )
      }
      if (checks.has(chosen.id) && checks.get(chosen.id)!.sourceReview.state !== 'sealed')
        return handoff(raw, 'source-not-sealed')
      const context = JSON.parse(chosen.context)
      let args: Record<string, unknown> = { type: 'click', ref: context.ref }
      if (chosen.role === 'textbox') {
        const strategy = assessed.find((s) => s.strategyId === 'boundary-input' && s.proposable)
        const step = strategy?.plan.steps.find(
          (s) => s.targetKey === chosen.targetKey && s.action === 'fill',
        )
        if (!step || step.action !== 'fill')
          return handoff(raw, 'public-input-constraint-unavailable')
        args = { type: 'fill', ref: context.ref, value: step.value }
      }
      proposed = {
        itemId: chosen.id,
        targetKey: chosen.targetKey!,
        action: args.type as 'click' | 'fill',
        before: state,
        label: chosen.text,
        navigation: context.category === 'navigation',
      }
      index++
      return tool('page_act', args, {
        itemId: chosen.id,
        plan,
        strategies: assessed,
        frameHash: digest(frame),
        decision: 'proposal-only-executor-authorizes',
      })
    },
  }
}
