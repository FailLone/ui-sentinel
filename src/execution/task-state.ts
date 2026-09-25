export const hypothesisTriggers = [
  'always',
  'payment-success',
  'payment-rejected',
  'business-success',
  'business-rejected',
  'retryable-failure',
  'overlay-present',
] as const
export type HypothesisTrigger = (typeof hypothesisTriggers)[number]

/** Minimal normalized view of a business fact, so this module needs no adapter dependency. */
export interface NormalizedFactView {
  readonly phase: 'processing' | 'succeeded' | 'rejected' | 'failed'
  readonly retryEligibility: 'allowed' | 'denied' | 'unknown'
  /** Checkout compatibility only: the response carried a payment-success signal. */
  readonly paymentOutcome?: 'paid' | 'rejected' | undefined
}

export function createTaskState(goal: string) {
  const hypotheses = new Map<
    string,
    { id: string; phenomenon: string; status: string; trigger: HypothesisTrigger }
  >()
  let unexploredBranches: { description: string; trigger: HypothesisTrigger }[] = []
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
      if (response.success === false && response.canRetry === true)
        triggered.add('retryable-failure')
    },
    /**
     * Record a normalized business fact.
     *
     * Only a *concluded* phase counts as a business outcome. A `processing` fact means the
     * operation is accepted and still running, so it must leave every conditional branch pending:
     * treating it as an outcome would silently shrink the remaining scope by declaring the
     * success, rejection and retry branches unreachable before they could happen.
     */
    observeNormalizedFacts(fact: NormalizedFactView | undefined, overlay: boolean) {
      if (overlay) triggered.add('overlay-present')
      if (!fact) return
      if (fact.phase === 'processing') return
      businessObserved = true
      if (fact.phase === 'succeeded') triggered.add('business-success')
      if (fact.phase === 'rejected') triggered.add('business-rejected')
      if (fact.phase === 'failed' && fact.retryEligibility === 'allowed')
        triggered.add('retryable-failure')
      // Checkout compatibility: the approved shopping triggers keep their historical meaning.
      if (fact.paymentOutcome === 'paid') triggered.add('payment-success')
      if (fact.paymentOutcome === 'rejected') triggered.add('payment-rejected')
    },
    recordHypothesis(id: string, phenomenon: string, trigger: HypothesisTrigger = 'always') {
      hypotheses.set(id, { id, phenomenon, status: 'open', trigger })
    },
    resolveHypothesis(id: string, status: string) {
      const h = hypotheses.get(id)
      if (h) h.status = status === 'candidate' ? 'open' : status
    },
    setBranches(branches: { description: string; trigger: HypothesisTrigger }[]) {
      unexploredBranches = [...new Map(branches.map((b) => [JSON.stringify(b), b])).values()]
    },
    /** A blocked path cannot silently turn pending outcomes into completed or untriggered scope. */
    recordBlockedScope(unresolvedOutcome = false) {
      if (businessObserved && !unresolvedOutcome) return false
      const description = businessObserved
        ? 'The business outcome remains unknown. Recovery and its downstream outcomes are unverified.'
        : 'No business outcome has been observed. The remaining path and pending conditional outcomes are unverified.'
      if (unexploredBranches.some((b) => b.description === description)) return false
      unexploredBranches.push({ description, trigger: 'always' })
      return true
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
        ...unexploredBranches
          .filter(relevant)
          .map((branch) => `unverified:${branch.trigger}:${branch.description}`),
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
      unexploredBranches: unexploredBranches.map((b) => ({
        ...b,
        applicability: applicability(b.trigger),
      })),
    }),
  }
}
