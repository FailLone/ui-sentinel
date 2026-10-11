/** Scheduling only. Evidence and action permission remain owned by the original gates. */
export const productGapTools = [
  'product_source_overview',
  'product_source_read',
  'product_source_search',
  'product_path_status',
  'page_inspect',
  'element_details',
  'page_observe',
  'history_read',
  'tool_result_read',
] as const
export type ProductGap = {
  question: string
  tool: (typeof productGapTools)[number]
  stageKey: string
}

type State = {
  registration: { phase: string }
  execution: { phase: string; step?: number; actionId?: string }
}
export function productStage(state: State, gap?: ProductGap) {
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
  const retrieval = gap?.stageKey === key ? gap : undefined
  return {
    key,
    phase,
    step: state.execution.step,
    actionId: state.execution.actionId,
    // Once this path is evaluated, ordinary mandatory/default work still controls closure.
    unrestricted: phase === 'path-evaluated',
    allowedTools: [
      ...new Set([
        ...primary,
        'product_path_gap',
        'run_finish',
        'findings_submit',
        ...(retrieval ? [retrieval.tool] : []),
      ]),
    ],
    retrieval,
    decision:
      phase === 'path-evaluated'
        ? 'Selected path evaluated. Continue ordinary mandatory/default obligations using their existing gates; unselected source scope stays unchecked.'
        : primary.length
          ? 'Perform the stage task using existing evidence, or declare one specific missing fact with product_path_gap before retrieving it. The model still authors the plan and chooses observed selectors. Finish unverified if unsupported.'
          : 'Preserve the original failure or unresolved scope. Read-only gaps and honest reporting remain available; no action or replacement plan is authorized.',
  }
}
export const productStageAllows = (stage: ReturnType<typeof productStage>, tool: string) =>
  stage.unrestricted || stage.allowedTools.includes(tool)
