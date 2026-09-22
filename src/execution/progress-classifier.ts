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
    return { category: 'finish', toolsCalled, hasText, basis: 'called run_finish' }
  }

  if (toolsCalled.includes('page.act') || toolsCalled.includes('page_act')) {
    return { category: 'action', toolsCalled, hasText, basis: 'called page_act' }
  }

  if (toolsCalled.includes('findings.submit') || toolsCalled.includes('findings_submit')) {
    return { category: 'finding', toolsCalled, hasText, basis: 'submitted finding' }
  }

  if (toolsCalled.includes('hypotheses.record') || toolsCalled.includes('hypotheses_record')) {
    return { category: 'hypothesis', toolsCalled, hasText, basis: 'recorded hypothesis' }
  }

  if (toolsCalled.includes('transition.observe') || toolsCalled.includes('transition_observe')) {
    return {
      category: 'action',
      toolsCalled,
      hasText,
      basis: 'called transition_observe (measurement)',
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
