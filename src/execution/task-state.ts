export function createTaskState(goal: string) {
  const hypotheses = new Map<string, { id: string; phenomenon: string; status: string }>()
  let unexploredBranches: string[] = []
  return {
    recordHypothesis(id: string, phenomenon: string) {
      hypotheses.set(id, { id, phenomenon, status: 'open' })
    },
    resolveHypothesis(id: string, status: string) {
      const h = hypotheses.get(id)
      if (h) h.status = status === 'candidate' ? 'open' : status
    },
    setBranches(branches: string[]) {
      unexploredBranches = [...new Set(branches)]
    },
    hasOpenHypotheses: () => [...hypotheses.values()].some((h) => h.status === 'open'),
    completionGaps() {
      return [
        ...[...hypotheses.values()]
          .filter((h) => ['open', 'inconclusive'].includes(h.status))
          .map((h) => `hypothesis:${h.id}:${h.status}`),
        ...unexploredBranches.map((branch) => `unverified:${branch}`),
      ]
    },
    facts: () => [...hypotheses.values()].map((h) => JSON.stringify([h.phenomenon, h.status])),
    snapshot: () => ({ goal, hypotheses: [...hypotheses.values()], unexploredBranches }),
  }
}
