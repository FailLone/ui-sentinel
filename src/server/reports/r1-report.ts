import type { Run, RunEvent } from '../../shared/types.ts'
import type { ItemChecks } from '../../inspection/check-contract.ts'

/** The planner's path proposal is joined to original persisted actions/checks before any verified label. */
export function r1Report(
  run: Run,
  events: readonly RunEvent[],
  items: readonly {
    itemId: string
    selected: boolean
    checks?: ItemChecks
    status: string
    category?: string
    evidenceRefs?: readonly string[]
  }[],
  readable?: ReadonlySet<string>,
) {
  if (!run.spec.uiContract?.exploration) return undefined
  const last = events
    .filter((e) => e.type === 'r1:progress' || (e.type === 'r1:handoff' && e.payload.packet))
    .at(-1)
  const progress =
    last?.type === 'r1:handoff' ? (last.payload.packet as Record<string, unknown>) : last?.payload
  const attempts = Array.isArray(progress?.attempts) ? progress.attempts.slice(0, 24) : []
  const rows = attempts.map((a: any) => {
    const actual = events.find((e) => e.type === 'action:executing' && e.actionId === a.attemptId)
    const item = items.find((i) => i.itemId === a.itemId && i.selected)
    const check = item?.checks
    const navStep = events.some(
      (e) =>
        e.type === 'r1:step' &&
        (e.payload.toolResults as any[])?.some(
          (t) =>
            t.result?.verification?.itemId === a.itemId &&
            t.result.verification.actionId === a.attemptId &&
            t.result.verification.outcome === 'verified',
        ),
    )
    const refs = check
      ? [
          ...new Set([
            ...check.generic.evidenceRefs,
            ...check.effects.flatMap((e) => e.measurementRefs),
          ]),
        ]
      : item?.category === 'navigation'
        ? [...(item.evidenceRefs ?? [])]
        : []
    const measuredNavigation =
      !!actual &&
      navStep &&
      item?.category === 'navigation' &&
      item.status === 'verified' &&
      refs.length > 0 &&
      !!readable &&
      refs.every((ref) => readable.has(ref))
    const measured =
      measuredNavigation ||
      (!!actual &&
        !!check &&
        check.generic.actionId === a.attemptId &&
        refs.length > 0 &&
        !!readable &&
        refs.every((ref) => readable.has(ref)) &&
        check.sourceReview.state === 'sealed' &&
        ['collected', 'failed'].includes(check.generic.state) &&
        check.effects.every((e) => ['verified', 'failed'].includes(e.state)))
    return {
      actionId: String(a.attemptId),
      itemId: String(a.itemId),
      label: String(a.label ?? a.targetKey),
      action: String(a.action),
      from: String(a.beforeState),
      to: a.afterState === null ? null : String(a.afterState),
      visited: !!actual,
      measurement: measured ? (item!.status === 'failed' ? 'failed' : 'verified') : 'unverified',
      evidenceRefs: refs,
    }
  })
  const paths = (Array.isArray(progress?.paths) ? progress.paths : [])
    .slice(0, 24)
    .map((p: any) => {
      const ids = Array.isArray(p.steps) ? p.steps.map((s: any) => String(s.attemptId)) : []
      return {
        actionIds: ids,
        measured:
          ids.length > 0 &&
          ids.every((id: string) =>
            rows.some((r) => r.actionId === id && r.measurement !== 'unverified'),
          ),
      }
    })
  const handoffs = events
    .filter((e) => e.type === 'r1:handoff')
    .map((e) => ({
      eventId: e.id,
      reason: String(
        e.payload.reason ?? (e.payload.handoff as any)?.reason ?? 'unverified-handoff',
      ),
    }))
  const scores = events.filter((e) => e.type === 'r1:score')
  return {
    revision: 'r1-product-report-1',
    policy: run.spec.uiContract.exploration,
    visitedStates: Array.isArray(progress?.visitedStates) ? progress.visitedStates : [],
    attempts: rows,
    paths,
    handoffs,
    unexplored: Array.isArray(progress?.unexplored) ? progress.unexplored : [],
    strategies: Array.isArray(progress?.strategies) ? progress.strategies : [],
    counterexample:
      progress?.counterexample &&
      typeof progress.counterexample === 'object' &&
      'kind' in progress.counterexample &&
      typeof progress.counterexample.kind === 'string'
        ? { kind: progress.counterexample.kind }
        : null,
    omittedItemIds: items.filter((i) => !i.selected).map((i) => i.itemId),
    usage: {
      totalModelCalls: run.usage.modelCalls,
      jevCalls: scores.filter((e) => e.payload.dispatched === true).length,
      jevKnownUsd: scores.reduce(
        (n, e) => n + (typeof e.payload.actualUsd === 'number' ? e.payload.actualUsd : 0),
        0,
      ),
      jevUnknown: scores.some(
        (e) => e.payload.dispatched === true && typeof e.payload.actualUsd !== 'number',
      ),
    },
    meaning:
      'A measured path has original action and check evidence; it is not a claim that all effects passed or all possible paths were checked.',
  }
}
