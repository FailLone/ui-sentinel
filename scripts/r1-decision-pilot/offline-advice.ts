/** Experimental advice only. No browser, executor, model transport or task completion API. */
import { z } from 'zod'
import { parseExplorationInput } from '../../src/agent/decisions/exploration/contracts.ts'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import type { State } from './pilot.ts'

export const ADVICE_VERSION = 'r1-offline-advice-1' as const
const operationSchema = z.object({
  eventSeq: z.number().int().nonnegative(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  status: z.string(),
})
const publicSchema = z.object({
  stateId: z.string(),
  eventCutoffSeq: z.number().int(),
  at: z.string(),
  source: z.object({ snapshotEventSeq: z.number().int(), snapshotSha256: z.string() }),
  operations: z.array(operationSchema),
  registeredChecks: z.array(
    z.object({
      itemId: z.string(),
      category: z.string(),
      selected: z.boolean(),
      status: z.string(),
    }),
  ),
  permissions: z.object({
    session: z.string(),
    businessWrites: z.string(),
    origin: z.string(),
    scope: z.unknown(),
  }),
})
const contextSchema = z.object({
  ref: z.string(),
  snapshotId: z.string(),
  category: z.string(),
  selected: z.boolean(),
  status: z.string(),
  nativeAction: z.enum(['click', 'fill']),
  bindingAuthorization: z.string(),
  costUpperBoundUsd: z.union([z.number().nonnegative(), z.literal('unknown')]),
  observedHitTests: z.object({
    sampleCount: z.number().int().nonnegative(),
    relations: z.record(z.string(), z.number().int().nonnegative()),
  }),
})

export function makeAdvicePacket(state: State, rawPublic: unknown) {
  const parsed = parseExplorationInput(state.input)
  if (!parsed.ok) throw new Error(parsed.detail)
  const input = parsed.value
  const p = publicSchema.parse(rawPublic)
  if (
    state.id !== p.stateId ||
    state.id !== input.requestId ||
    p.source.snapshotEventSeq > p.eventCutoffSeq ||
    p.operations.some((o) => o.eventSeq > p.eventCutoffSeq)
  )
    throw new Error('public-cutoff-binding')
  if (
    state.facts.length !== input.candidates.length ||
    new Set(state.facts.map((f) => f.candidateId)).size !== state.facts.length ||
    state.facts.some((f) => !input.candidates.some((c) => c.id === f.candidateId))
  )
    throw new Error('facts-binding')
  const excluded: { candidateId: string; reason: string }[] = []
  const candidates = input.candidates
    .flatMap((c) => {
      const f = state.facts.find((f) => f.candidateId === c.id)!
      const context = contextSchema.parse(JSON.parse(c.context))
      const check = p.registeredChecks.find((q) => q.itemId === c.id)
      if (
        !check ||
        check.status !== context.status ||
        check.selected !== context.selected ||
        f.required !== check.selected ||
        (check.status === 'verified' && f.obligation !== 'completed') ||
        (check.status === 'pending' && f.obligation !== 'pending')
      )
        throw new Error('obligation-binding')
      // Unknown permission/budget stays unknown. Only known prohibitions remove the candidate.
      const reason =
        f.permission === 'no'
          ? 'known-prohibited'
          : !input.scope.executableCandidateIds.includes(c.id)
            ? 'outside-advice-scope'
            : !c.allowedActions.includes('inspect')
              ? 'no-permitted-inspection'
              : !check.selected
                ? 'outside-frozen-selected-checks'
                : f.obligation === 'completed' && !f.recheckReason
                  ? 'completed-no-explicit-recheck'
                  : f.obligation === 'unknown'
                    ? 'obligation-unknown'
                    : !c.targetKey
                      ? 'identity-unknown'
                      : null
      if (reason) {
        excluded.push({ candidateId: c.id, reason })
        return []
      }
      const relevantReads = p.operations.filter(
        (o) =>
          o.eventSeq >= p.source.snapshotEventSeq &&
          ['element_details', 'page_inspect'].includes(o.tool) &&
          (o.args.ref === context.ref ||
            (Array.isArray(o.args.refs) && o.args.refs.includes(context.ref))),
      )
      // Repeated reads are evidence of prior attention, NOT evidence of uselessness.
      return [
        {
          candidateId: c.id,
          targetKey: c.targetKey,
          text: c.text,
          role: c.role,
          observationVersion: c.observationVersion,
          publicState: c.publicState,
          geometry: c.geometry,
          obligation: {
            id: f.obligationId,
            category: check.category,
            status: check.status,
            selected: check.selected,
            recheckReason: f.recheckReason,
          },
          nativeAction: context.nativeAction,
          sourceAllowedActions: [...c.allowedActions],
          priorExactTargetReads: relevantReads.map((o) => ({
            eventSeq: o.eventSeq,
            tool: o.tool,
            status: o.status,
          })),
          observedHitTests: context.observedHitTests,
          estimatedEffort: c.estimatedCost,
          executionFacts: {
            permission: f.permission,
            preconditions: f.preconditions,
            actionMs: f.estimatedMs,
            actionCostUsd: f.estimatedActionCostUsd,
            bindingAuthorization: context.bindingAuthorization,
            sourceCostUpperBoundUsd: context.costUpperBoundUsd,
          },
          evidence: {
            publicPath: state.provenance.stateRef,
            candidateId: c.id,
            cutoff: p.eventCutoffSeq,
            snapshotSha256: p.source.snapshotSha256,
            ref: context.ref,
          },
        },
      ]
    })
    .sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0))
  excluded.sort((a, b) =>
    a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0,
  )
  return {
    version: ADVICE_VERSION,
    mode: 'offline-advice-only' as const,
    stateId: state.id,
    provenance: state.provenance,
    task: input.task,
    state: input.state,
    observedAtCutoff: p.at,
    budget: input.budget,
    permissions: p.permissions,
    registeredChecks: p.registeredChecks,
    priorOperations: p.operations,
    candidates,
    excluded,
    limits: {
      noExecution: true,
      noCompletionClaim: true,
      knownEffectsNotPredicted: true,
      sourceBudgetIsHistoricalNotAuthorization: true,
      nativeFillNotMappedToInspect: true,
    },
  }
}
export type AdvicePacket = ReturnType<typeof makeAdvicePacket>

/** Both program and any future model must read this exact packet, identified by digest. */
export function rankOfflineAdvice(packet: AdvicePacket) {
  if (packet.version !== ADVICE_VERSION || packet.mode !== 'offline-advice-only')
    throw new Error('advice-version')
  const ordered = [...packet.candidates].sort((a, b) => {
    const signal = (c: typeof a) => ((c.observedHitTests.relations.unrelated ?? 0) > 0 ? 1 : 0)
    return (
      signal(b) - signal(a) ||
      a.priorExactTargetReads.length - b.priorExactTargetReads.length ||
      a.estimatedEffort - b.estimatedEffort ||
      (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0)
    )
  })
  const priorities = ordered.map((c) => ({
    candidateId: c.candidateId,
    text: c.text,
    intent: 'investigate-candidate' as const,
    supportingFacts: [
      { fact: 'selected-obligation', value: c.obligation, source: c.evidence },
      { fact: 'public-state', value: c.publicState, source: c.evidence },
      { fact: 'observed-hit-samples', value: c.observedHitTests, source: c.evidence },
      { fact: 'prior-exact-target-reads', value: c.priorExactTargetReads, source: c.evidence },
    ],
    investigationQuestion:
      (c.observedHitTests.relations.unrelated ?? 0) > 0
        ? '调查当前候选的命中样点为何落在无关元素上；确认遮挡、目标身份与可观察状态，不把几何线索当缺陷。'
        : c.nativeAction === 'fill'
          ? '明确此未完成控件检查还缺少的值/选择状态与测量依据；fill不在本实验动作契约内，不能用inspect冒充已检查。'
          : '明确此未完成事项的局部状态、预期新增信息及可验证后置测量；避免没有新目的的再次读取。',
    unknowns: { ...c.executionFacts, actionEffect: 'unknown', incrementalReadValue: 'unknown' },
    preExecutionChecks: [
      '由执行器核对实时目标、权限、同源及副作用限制',
      '确认动作前提和动作/时间/费用预算；未知值不能填yes或0',
      '明确相对既有读取的新信息目标；无法说明则交回',
      '绑定检查事项、后置测量与证据；未执行不计入验证覆盖',
      ...(c.nativeAction === 'fill' ? ['原生fill需另行支持的执行路径；本建议不含fill操作'] : []),
    ],
    completeExecutionPath: 'unknown' as const,
    directlyExecutable: false as const,
    verifiedProgress: false as const,
  }))
  return {
    version: ADVICE_VERSION,
    stateId: packet.stateId,
    sharedPacketSha256: sha256(JSON.stringify(packet)),
    decision: priorities.length ? 'investigation-priority' : 'handoff',
    reason: priorities.length ? 'public-facts-support-investigation-only' : 'no-advice-candidate',
    priorities,
    selectedCandidateId: priorities[0]?.candidateId ?? null,
    completeExecutionPath: 'unknown',
    verifiedProgress: false,
    jev: priorities.length > 1 ? 'not-run-reference-gate-pending' : 'not-needed-single-or-zero',
  }
}
