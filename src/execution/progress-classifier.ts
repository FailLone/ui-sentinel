export type ProgressCategory =
  | 'action'
  | 'observe-only'
  | 'hypothesis'
  | 'finding'
  | 'finish'
  | 'judgment'
  | 'no-progress'

export interface ProgressClassification {
  readonly category: ProgressCategory
  readonly toolsCalled: readonly string[]
  readonly hasText: boolean
  readonly basis: string
}

export function classifyResponse(result: {
  readonly text?: string
  readonly toolResults?: readonly ToolResult[]
}): ProgressClassification {
  const toolResults = result.toolResults ?? []
  const toolsCalled = toolResults.map(extractToolName)
  const hasText = typeof result.text === 'string' && result.text.trim().length > 0

  if (toolsCalled.includes('run.finish') || toolsCalled.includes('run_finish')) {
    const accepted = toolResults.some((item) => {
      const payload = item.payload as Record<string, unknown> | undefined
      const value = (payload?.result ?? item.result) as { accepted?: boolean } | undefined
      return (
        ['run_finish', 'run.finish'].includes(extractToolName(item)) && value?.accepted === true
      )
    })
    return {
      category: accepted ? 'finish' : 'no-progress',
      toolsCalled,
      hasText,
      basis: accepted ? 'run_finish accepted' : 'run_finish not accepted',
    }
  }

  if (toolsCalled.some((t) => ['page.act', 'page_act', 'journey.run', 'journey_run'].includes(t))) {
    return { category: 'action', toolsCalled, hasText, basis: 'called page_act' }
  }

  if (toolsCalled.includes('findings.submit') || toolsCalled.includes('findings_submit')) {
    return { category: 'finding', toolsCalled, hasText, basis: 'submitted finding' }
  }

  if (
    toolsCalled.some((t) =>
      [
        'hypotheses.record',
        'hypotheses_record',
        'hypotheses.link.finding',
        'hypotheses_link_finding',
      ].includes(t),
    )
  ) {
    return { category: 'hypothesis', toolsCalled, hasText, basis: 'recorded hypothesis' }
  }

  if (
    toolsCalled.some((t) =>
      ['transition.observe', 'transition_observe', 'rule.check', 'rule_check'].includes(t),
    )
  ) {
    return {
      category: 'action',
      toolsCalled,
      hasText,
      basis: 'called transition_observe (measurement)',
    }
  }

  if (toolsCalled.some((t) => ['visual.review', 'visual_review'].includes(t))) {
    return {
      category: 'observe-only',
      toolsCalled,
      hasText,
      basis: 'requested frozen evidence analysis; completed facts determine progress',
    }
  }

  if (toolsCalled.includes('page.observe') || toolsCalled.includes('page_observe')) {
    return { category: 'observe-only', toolsCalled, hasText, basis: 'only called page_observe' }
  }

  if (toolsCalled.includes('checks.run') || toolsCalled.includes('checks_run')) {
    return { category: 'observe-only', toolsCalled, hasText, basis: 'only called checks_run' }
  }

  if (toolsCalled.includes('exploration.update') || toolsCalled.includes('exploration_update')) {
    return { category: 'judgment', toolsCalled, hasText, basis: 'exploration state update' }
  }

  if (hasText && toolsCalled.length === 0) {
    return { category: 'judgment', toolsCalled, hasText, basis: 'text response without tool calls' }
  }

  return {
    category: 'no-progress',
    toolsCalled,
    hasText,
    basis:
      toolsCalled.length === 0 ? 'empty response' : `unrecognized tools: ${toolsCalled.join(', ')}`,
  }
}

function extractToolName(tr: ToolResult): string {
  if (typeof tr === 'object' && tr !== null) {
    if ('toolName' in tr && typeof tr.toolName === 'string') return tr.toolName
    if ('name' in tr && typeof tr.name === 'string') return tr.name
    if ('tool' in tr && typeof tr.tool === 'string') return tr.tool
    if ('payload' in tr && typeof tr.payload === 'object' && tr.payload !== null) {
      const p = tr.payload as Record<string, unknown>
      if ('toolName' in p && typeof p.toolName === 'string') return p.toolName
    }
  }
  return 'unknown'
}

export interface ProgressSummary {
  readonly totalResponses: number
  readonly categories: Record<ProgressCategory, number>
  readonly effectiveActionRate: number | null
  readonly noProgressRate: number | null
}

export function summarizeProgress(
  classifications: readonly ProgressClassification[],
): ProgressSummary {
  const categories: Record<ProgressCategory, number> = {
    action: 0,
    'observe-only': 0,
    hypothesis: 0,
    finding: 0,
    finish: 0,
    judgment: 0,
    'no-progress': 0,
  }

  for (const c of classifications) {
    categories[c.category]++
  }

  const total = classifications.length
  const effectiveActions = categories.action + categories.finding + categories.finish
  const effectiveActionRate = total > 0 ? effectiveActions / total : null
  const noProgressRate = total > 0 ? categories['no-progress'] / total : null

  return { totalResponses: total, categories, effectiveActionRate, noProgressRate }
}

type ToolResult = Record<string, unknown>
