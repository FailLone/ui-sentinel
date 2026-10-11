/** Scheduling only. Evidence and action permission remain owned by the original gates. */
type State = {
  registration: { phase: string }
  execution: { phase: string; step?: number; actionId?: string }
}
export function productStage(state: State) {
  const phase =
    state.execution.phase === 'registration-required'
      ? state.registration.phase
      : state.execution.phase
  const key = JSON.stringify([phase, state.execution.step, state.execution.actionId])
  const primary =
    phase === 'need-source'
      ? ['product_source_overview', 'product_source_read', 'product_source_search']
      : ['source-located', 'repair-needed'].includes(phase)
        ? ['product_path_register']
        : ['bind-next-step', 'inspect-binding', 'repair-binding-input'].includes(phase)
          ? ['product_path_bind']
          : phase === 'act-bound-step'
            ? ['page_act']
            : phase === 'verify-original-action'
              ? ['interaction_verify']
              : []
  // Keep source pagination available until registration. After freezing, the current
  // requirements are in the packet; retrieve observed nodes or original receipts directly.
  const sourcePhase = ['need-source', 'source-located', 'repair-needed', 'exhausted'].includes(
    phase,
  )
  const readOnlyTools = [
    ...(sourcePhase
      ? ['product_source_read', 'product_source_search']
      : ['page_inspect', 'element_details', 'page_observe']),
    'tool_result_read',
    'history_read',
  ]
  return {
    key,
    phase,
    step: state.execution.step,
    actionId: state.execution.actionId,
    // Once this path is evaluated, ordinary mandatory/default work still controls closure.
    unrestricted: phase === 'path-evaluated',
    allowedTools: [...new Set([...primary, 'run_finish', 'findings_submit', ...readOnlyTools])],
    readOnlyTools,
    decision:
      phase === 'path-evaluated'
        ? 'Selected path evaluated. Continue ordinary mandatory/default obligations using their existing gates; unselected source scope stays unchecked.'
        : primary.length
          ? 'Perform the stage task using existing evidence. For a specific missing fact, call an available read-only tool directly with its original arguments; use returned pagination cursors for truncated material. Source-located does not mean all requirements are known. The model still authors the plan and chooses observed selectors. Finish unverified if unsupported.'
          : 'Preserve the original failure or unresolved scope. Stage-specific read-only tools and honest reporting remain available; no action or replacement plan is authorized.',
  }
}
export const productStageAllows = (stage: ReturnType<typeof productStage>, tool: string) =>
  stage.unrestricted || stage.allowedTools.includes(tool)
