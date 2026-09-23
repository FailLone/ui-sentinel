export interface ProgressFacts {
  readonly pageUrl: string | undefined
  readonly hypothesisIds: ReadonlySet<string>
  readonly findingIds: ReadonlySet<string>
  readonly businessResponseCount: number
  readonly activeTransitionDeadline: number | null
}

export interface ProgressCheckResult {
  readonly isProgress: boolean
  readonly isExempt: boolean
  readonly basis: string
}

export function createProgressDetector() {
  let previousUrl: string | undefined
  const knownHypothesisIds = new Set<string>()
  const knownFindingIds = new Set<string>()
  let previousBusinessResponseCount = 0
  let activeTransitionDeadline: number | null = null

  function setTransitionDeadline(deadlineMs: number | null): void {
    activeTransitionDeadline = deadlineMs
  }

  function check(
    facts: ProgressFacts,
    classification: { category: string; toolsCalled: readonly string[] },
    toolResults: readonly Record<string, unknown>[],
  ): ProgressCheckResult {
    const now = Date.now()
    if (activeTransitionDeadline !== null && now < activeTransitionDeadline) {
      return { isProgress: false, isExempt: true, basis: 'measurement window active' }
    }
    if (activeTransitionDeadline !== null && now >= activeTransitionDeadline) {
      activeTransitionDeadline = null
    }

    if (facts.pageUrl !== undefined && facts.pageUrl !== previousUrl) {
      previousUrl = facts.pageUrl
      return { isProgress: true, isExempt: false, basis: 'page URL changed' }
    }
    previousUrl = facts.pageUrl

    for (const id of facts.hypothesisIds) {
      if (!knownHypothesisIds.has(id)) {
        knownHypothesisIds.add(id)
        return { isProgress: true, isExempt: false, basis: 'new hypothesis recorded' }
      }
    }

    for (const id of facts.findingIds) {
      if (!knownFindingIds.has(id)) {
        knownFindingIds.add(id)
        return { isProgress: true, isExempt: false, basis: 'new finding submitted' }
      }
    }

    if (facts.businessResponseCount > previousBusinessResponseCount) {
      previousBusinessResponseCount = facts.businessResponseCount
      return { isProgress: true, isExempt: false, basis: 'new business response observed' }
    }

    if (classification.category === 'action') {
      const hasError = toolResults.some(
        (r) =>
          r &&
          typeof r === 'object' &&
          'payload' in r &&
          typeof r.payload === 'object' &&
          r.payload !== null &&
          'error' in (r.payload as Record<string, unknown>),
      )
      if (hasError) {
        return { isProgress: false, isExempt: false, basis: 'action failed with error' }
      }
      return { isProgress: true, isExempt: false, basis: 'successful action executed' }
    }

    if (classification.category === 'finish') {
      return { isProgress: true, isExempt: false, basis: 'finish attempted' }
    }

    return { isProgress: false, isExempt: false, basis: `no fact change (${classification.category})` }
  }

  return { check, setTransitionDeadline }
}

export type ProgressDetector = ReturnType<typeof createProgressDetector>
