/** Executor-owned bounds only. Agent estimates and cached prompt budgets are never authority. */
export interface WorkBound {
  actions: number
  modelCalls: number
  timeMs: number
}
export function admitOptionalScope(input: {
  remaining: WorkBound
  requiredBound?: WorkBound
  extensionBound?: WorkBound
  closingReserve: WorkBound
}) {
  const bounds = [input.requiredBound, input.extensionBound, input.closingReserve]
  if (bounds.some((b) => !b || Object.values(b).some((n) => !Number.isFinite(n) || n < 0)))
    return {
      admitted: false,
      reason: 'cost-upper-bound-unknown' as const,
      remaining: input.remaining,
    }
  const needed = {
    actions: bounds.reduce((n, b) => n + b!.actions, 0),
    modelCalls: bounds.reduce((n, b) => n + b!.modelCalls, 0),
    timeMs: bounds.reduce((n, b) => n + b!.timeMs, 0),
  }
  return {
    admitted: Object.keys(needed).every(
      (k) => input.remaining[k as keyof WorkBound] >= needed[k as keyof WorkBound],
    ),
    reason: 'remaining-budget' as const,
    remaining: input.remaining,
    needed,
  }
}

/** Pure-program selection spends bounded tool work, not hypothetical Agent turns.
 * A later handoff must use the unchanged closing reserve and live run limits.
 * Jev/Agent extensions retain the conservative four-model bound.
 */
export function localExtensionBound(input: {
  programOnly: boolean
  toolMs: number
  modelMs: number
}): WorkBound {
  const modelCalls = input.programOnly ? 0 : 4
  return { actions: 1, modelCalls, timeMs: 4 * input.toolMs + modelCalls * input.modelMs }
}
