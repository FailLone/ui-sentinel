import { createHash } from 'node:crypto'
import type {
  ExperimentalHost,
  ExperimentalDecision,
} from '../../../execution/experimental-decision-host.ts'
import type { ExplorationInput } from '../../decisions/exploration/contracts.ts'
import { rankCandidates } from '../../decisions/exploration/ranking.ts'
import { parseExplorationInput } from '../../decisions/exploration/contracts.ts'
import type { ItemChecks } from '../../../inspection/check-contract.ts'
export const REVISION = 'r1-controlled-loop-1'
export const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
export type PublicFrame = {
  revision: typeof REVISION
  binding: string
  input: ExplorationInput
  facts: any
}
export type ScoreReply = {
  binding: string
  packetHash: string
  kind: 'scores' | 'handoff'
  orderedIds: string[]
  reason?: string
}
export type Score = (frame: PublicFrame, signal: AbortSignal) => Promise<ScoreReply>
export const pending = (c: ItemChecks) => [
  ...(c.sourceReview.state === 'sealed' ? [] : ['source']),
  ...(['pending', 'unverified'].includes(c.generic.state) ? ['generic'] : []),
  ...c.effects
    .filter((e) => ['pending', 'unverified'].includes(e.state))
    .map((e) => 'effect:' + e.requirementId),
]
export function frameOf(raw: any, binding: string, dispatched: ReadonlySet<string>): PublicFrame {
  const facts = {
    goal: raw.goal,
    observation: raw.observation,
    inspectionScope: raw.inspectionScope,
    knownRules: raw.knownRules,
    pendingKnownRuleChecks: raw.pendingKnownRuleChecks,
    observedRuleTriggers: raw.observedRuleTriggers,
    latestToolResults: raw.latestToolResults,
    evidenceRefs: raw.evidenceRefs,
    evidenceIntegrity: raw.evidenceIntegrity,
    budgetRemaining: raw.budgetRemaining,
    activeTools: raw.activeTools,
  }
  const scope = raw.inspectionScope
  const open = new Set(scope.outstanding.map((c: any) => c.itemId))
  const checks = new Map<string, ItemChecks>(scope.checks.map((c: any) => [c.itemId, c.checks]))
  const candidates = scope.candidates
    .filter(
      (c: any) =>
        c.category === 'local-interaction' &&
        open.has(c.itemId) &&
        checks.has(c.itemId) &&
        checks.get(c.itemId)!.generic.state === 'pending' &&
        checks.get(c.itemId)!.sourceReview.state === 'sealed' &&
        !dispatched.has(c.itemId),
    )
    .flatMap((c: any) => {
      const e = raw.observation.elements.find((e: any) => e.ref === c.ref)
      if (!e || !e.visible || !e.enabled || !['button', 'a'].includes(e.tag)) return []
      return [
        {
          id: c.itemId,
          targetKey: c.itemId,
          observationVersion: binding,
          text: e.text ?? c.description,
          role: e.tag,
          publicState: { visible: e.visible, enabled: e.enabled, expanded: null, selected: null },
          geometry: null,
          context: JSON.stringify({
            ref: c.ref,
            snapshotId: c.snapshotId,
            pending: pending(checks.get(c.itemId)!),
          }),
          allowedActions: ['click'] as const,
          estimatedCost: 1,
        },
      ]
    })
  const input = {
    schemaVersion: 'r1-exploration-input-1',
    requestId: binding,
    task: {
      goal: raw.goal ?? 'Bounded UI inspection',
      localTask: 'Collect registered pending evidence without replay',
      revision: REVISION,
    },
    state: {
      pageId: raw.observation.url,
      url: raw.observation.url,
      documentVersion: binding,
      observationVersion: binding,
      relatedStateVersion: binding,
      cacheable: false,
    },
    candidates,
    history: [],
    scope: { revision: REVISION, executableCandidateIds: candidates.map((c: any) => c.id) },
    budget: {
      revision: digest(raw.budgetRemaining),
      remainingDecisions: raw.budgetRemaining.modelCalls,
      remainingActions: raw.budgetRemaining.actions,
      remainingMs: Math.max(0, raw.budgetRemaining.timeMs),
      maxRequestMs: 30000,
      remainingCostUsd: null,
    },
    limits: { maxCandidates: 32, maxInputBytes: 32768, maxHistory: 32 },
  }
  const parsed = parseExplorationInput(input)
  if (!parsed.ok) throw new Error('r1-frame:' + parsed.detail)
  return { revision: REVISION, binding, input: parsed.value, facts }
}
/** Public task has distinct lexical relevance across multiple candidates; no outcome label used. */
export function semanticCompetition(f: PublicFrame) {
  const tokens = new Set(f.input.task.goal.toLowerCase().match(/[a-z]{4,}/g) ?? [])
  const matches = f.input.candidates.map((c) =>
    (c.text.toLowerCase().match(/[a-z]{4,}/g) ?? []).some((w) => tokens.has(w)),
  )
  return matches.length > 1 && matches.some(Boolean) && matches.some((x) => !x)
}
export function createControlledHost(
  options: { score?: Score; onFrame?: (frame: PublicFrame) => void; maxSteps?: number } = {},
): ExperimentalHost {
  const dispatched = new Set<string>(),
    selectionAttempted = new Set<string>(),
    recoveries = new Map<string, number>(),
    inspected = new Set<string>()
  let steps = 0
  return {
    async decide(raw: any, { signal, version }): Promise<ExperimentalDecision> {
      signal.throwIfAborted()
      const handoff = (reason: string) => ({
        kind: 'handoff' as const,
        reason,
        packet: {
          revision: REVISION,
          remaining: raw.inspectionScope?.outstanding,
          checks: raw.inspectionScope?.checks,
          originalActions: raw.inspectionScope?.checkInteractions,
          forbiddenReplays: [...dispatched],
          evidenceRefs: raw.evidenceRefs,
          latestToolResults: raw.latestToolResults,
          dom: raw.observation,
          historyWindow: raw.historyWindow,
          budget: raw.budgetRemaining,
          verifiedProgress: 'executor-ledger-only',
        },
      })
      if (++steps > (options.maxSteps ?? 12)) return handoff('bounded-steps-exhausted')
      if (!version.reusable) return handoff('state-not-reliably-bindable')
      if (!raw.inspectionScope?.checks || raw.evidenceIntegrity?.status !== 'clean')
        return handoff('missing-or-dirty-evidence')
      const tool = (
        name: string,
        args: Record<string, unknown>,
        basis: unknown,
      ): ExperimentalDecision => ({ kind: 'tool', binding: version.key, tool: name, args, basis })
      const b = raw.budgetRemaining
      if (b.actions <= 0 || b.timeMs <= 1000) return handoff('budget-insufficient')
      // Existing dispatched obligations must be resolved read-only before any new action.
      for (const { itemId, checks } of raw.inspectionScope.checks as {
        itemId: string
        checks: ItemChecks
      }[]) {
        if (!checks.generic.actionId || !pending(checks).length) continue
        dispatched.add(itemId)
        if (checks.sourceReview.state !== 'sealed' || checks.effects.some((e) => e.late))
          return handoff('source-or-late-effect-needs-agent')
        const link = raw.inspectionScope.checkInteractions.find(
          (x: any) => x.itemId === itemId && x.actionId === checks.generic.actionId,
        )
        if (!link || link.attemptsRemaining < 1 || (recoveries.get(link.checkRef) ?? 0) >= 1)
          return handoff('read-only-recovery-exhausted')
        const effect = checks.effects.find((e) => ['pending', 'unverified'].includes(e.state))
        if (effect) {
          if (!inspected.has(link.checkRef)) {
            inspected.add(link.checkRef)
            return tool(
              'page_inspect',
              { selector: '[role="region"]', offset: 0 },
              { purpose: 'locate-public-result', checkRef: link.checkRef },
            )
          }
          const result = raw.latestToolResults?.tools?.find((t: any) => t.tool === 'page_inspect')
          const element = result?.elements?.find((e: any) => e.visible !== false)
          if (!element?.selector) return handoff('result-target-missing')
          recoveries.set(link.checkRef, 1)
          return tool(
            'interaction_verify',
            {
              checkRef: link.checkRef,
              purpose: 'verify-effect',
              requirementId: effect.requirementId,
              selector: element.selector,
            },
            { itemId, actionId: checks.generic.actionId, readOnly: true },
          )
        }
        recoveries.set(link.checkRef, 1)
        return tool(
          'interaction_verify',
          { checkRef: link.checkRef, purpose: 'collect-interaction' },
          { itemId, readOnly: true },
        )
      }
      const frame = frameOf(raw, version.key, dispatched)
      options.onFrame?.(frame)
      if (!frame.input.candidates.length) {
        // New DOM candidates still require the original scope admission tool; no private selection write.
        const known = new Set(raw.inspectionScope.checks.map((x: any) => x.itemId))
        const fresh = raw.inspectionScope.candidates
          .filter(
            (c: any) =>
              c.category === 'local-interaction' &&
              !known.has(c.itemId) &&
              !selectionAttempted.has(c.itemId) &&
              !dispatched.has(c.itemId),
          )
          .slice(0, 3)
        if (fresh.length) {
          fresh.forEach((c: any) => selectionAttempted.add(c.itemId))
          return tool(
            'exploration_update',
            {
              state: 'New public local controls require bounded inspection',
              unexploredBranches: [],
              selectItems: fresh.map((c: any) => ({
                itemId: c.itemId,
                basis: 'Observed local control; no completed check or prior dispatch',
              })),
            },
            { publicCandidates: fresh },
          )
        }
        return handoff('no-safe-new-action')
      }
      let ids = rankCandidates(frame.input).orderedCandidateIds
      if (options.score && semanticCompetition(frame)) {
        const response = await options.score(frame, signal)
        signal.throwIfAborted()
        if (response.binding !== frame.binding || response.packetHash !== digest(frame))
          return handoff('stale-score')
        if (response.kind === 'handoff') return handoff(response.reason ?? 'jev-handoff')
        if (
          response.orderedIds.length !== ids.length ||
          new Set(response.orderedIds).size !== ids.length ||
          response.orderedIds.some((id) => !ids.includes(id))
        )
          return handoff('invalid-score-candidates')
        ids = response.orderedIds
      }
      const chosen = frame.input.candidates.find((c) => c.id === ids[0])
      if (!chosen) return handoff('no-ranked-candidate')
      const context = JSON.parse(chosen.context)
      dispatched.add(chosen.id) // A failed/unknown dispatch is not replayable in this host.
      return tool(
        'page_act',
        { type: 'click', role: chosen.role === 'a' ? 'link' : 'button', name: chosen.text },
        {
          itemId: chosen.id,
          frameHash: digest(frame),
          pending: context.pending,
          decision: 'proposal-only-executor-authorizes',
        },
      )
    },
  }
}
