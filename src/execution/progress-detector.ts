export interface ProgressFacts {
  readonly pageUrl: string | undefined
  readonly pageFingerprint?: string
  readonly hypothesisFacts: readonly string[]
  readonly findingFacts: readonly string[]
  readonly measurementFacts: readonly string[]
  readonly retrievedFacts?: readonly string[]
  readonly analysisFacts?: readonly string[]
}
export interface ProgressCheckResult {
  readonly isProgress: boolean
  readonly basis: string
}
/** IDs, timestamps and calling a tool are not proof of progress. */
export function createProgressDetector() {
  const seen = new Set<string>()
  function check(facts: ProgressFacts): ProgressCheckResult {
    const current = [
      `page:${facts.pageFingerprint ?? facts.pageUrl ?? ''}`,
      ...facts.hypothesisFacts.map((f) => `hypothesis:${f}`),
      ...facts.findingFacts.map((f) => `finding:${f}`),
      ...facts.measurementFacts.map((f) => `measurement:${f}`),
      ...(facts.analysisFacts ?? []).map((f) => `analysis:${f}`),
      ...(facts.retrievedFacts ?? []).map((f) => `retrieved:${f}`),
    ]
    const added = current.filter((f) => !seen.has(f))
    for (const fact of current) seen.add(fact)
    return {
      isProgress: added.length > 0,
      basis: added.length
        ? `New ${added[0].split(':')[0]} facts`
        : 'No new observed or verified facts',
    }
  }
  return { check }
}
