export const hypothesisTriggers = [
  'always',
  'payment-success',
  'payment-rejected',
  'retryable-failure',
  'overlay-present',
] as const
export type HypothesisTrigger = (typeof hypothesisTriggers)[number]
export function createTaskState(goal: string) {
  const hypotheses = new Map<
    string,
    { id: string; phenomenon: string; status: string; trigger: HypothesisTrigger }
  >()
  let unexploredBranches: string[] = []
  const triggered = new Set<HypothesisTrigger>(['always'])
  let businessObserved = false
  const applicability = (trigger: HypothesisTrigger) =>
    triggered.has(trigger) ? 'triggered' : businessObserved ? 'not-triggered' : 'pending'
  const relevant = (h: { trigger: HypothesisTrigger }) =>
    applicability(h.trigger) !== 'not-triggered'
  return {
    observeFacts(
      response: { success?: boolean; status?: string; canRetry?: boolean } | undefined,
      overlay: boolean,
    ) {
      if (overlay) triggered.add('overlay-present')
      if (!response) return
      businessObserved = true
      if (response.success === true) triggered.add('payment-success')
      if (['rejected', 'declined'].includes(response.status ?? ''))
        triggered.add('payment-rejected')
      if (response.status === 'failed' && response.canRetry === true)
        triggered.add('retryable-failure')
    },
    recordHypothesis(id: string, phenomenon: string, trigger: HypothesisTrigger = 'always') {
      hypotheses.set(id, { id, phenomenon, status: 'open', trigger })
    },
    resolveHypothesis(id: string, status: string) {
      const h = hypotheses.get(id)
      if (h) h.status = status === 'candidate' ? 'open' : status
    },
    setBranches(branches: string[]) {
      unexploredBranches = [...new Set(branches)]
    },
    hasOpenHypotheses: () =>
      [...hypotheses.values()].some(
        (h) => relevant(h) && ['open', 'inconclusive'].includes(h.status),
      ),
    completionGaps() {
      return [
        ...[...hypotheses.values()]
          .filter((h) => relevant(h) && ['open', 'inconclusive'].includes(h.status))
          .map((h) => `hypothesis:${h.id}:${h.status}`),
        ...unexploredBranches.map((branch) => `unverified:${branch}`),
      ]
    },
    facts: () =>
      [...hypotheses.values()].map((h) =>
        JSON.stringify([h.phenomenon, h.status, applicability(h.trigger)]),
      ),
    snapshot: () => ({
      goal,
      hypotheses: [...hypotheses.values()].map((h) => ({
        ...h,
        applicability: applicability(h.trigger),
      })),
      conditions: hypothesisTriggers
        .filter((t) => t !== 'always')
        .map((trigger) => ({ trigger, applicability: applicability(trigger) })),
      unexploredBranches,
    }),
  }
}
