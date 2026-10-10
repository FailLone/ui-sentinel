/** Private offline scoring. Never loaded into the provider prompt or served by the fixture. */
export const expectedRows = [
  {
    id: 'P01',
    expected: ['fail', 'pass'],
    validEntryPath: ['Details'],
    explanation: '400px native dialog at left 20px: clipped at 320, contained at 640.',
  },
  {
    id: 'P02',
    expected: ['fail', 'pass'],
    validEntryPath: ['More options', 'Details'],
    explanation:
      'Two public local actions reveal a 400px custom panel; unrelated buttons are not useful popup actions.',
  },
  {
    id: 'P03',
    expected: ['unknown', 'unknown'],
    validEntryPath: ['Details'],
    explanation:
      'No floating panel exists. Abstention or an observed failed prediction followed by honest handoff is acceptable; a wrong choice is not required.',
  },
]
export function scoreRow(id: string, parent: any, children: any[]) {
  const tasks = parent.uiScan?.checkTasks?.tasks ?? [],
    expected = expectedRows.find((r) => r.id === id)!
  const byWidth = [...tasks].sort(
    (a, b) => a.task.start.viewport.width - b.task.start.viewport.width,
  )
  const delegation =
    tasks.length === 2 &&
    new Set(tasks.map((t: any) => t.execution?.runId)).size === 2 &&
    byWidth[0]?.task.start.viewport.width === 320 &&
    byWidth[1]?.task.start.viewport.width === 640
  const childGoals = byWidth.map((t: any, i: number) => ({
    runId: t.execution?.runId,
    viewport: t.task.start.viewport,
    status: t.status,
    actual: t.result?.original?.popup?.verdict ?? 'unknown',
    expected: expected.expected[i],
    matched: t.result?.original?.popup?.verdict === expected.expected[i],
    missing: t.result?.unchecked ?? [t.error ?? 'missing original result'],
  }))
  const originalActions = children.flatMap((c) =>
    c.events
      .filter((e: any) => e.type === 'action:executing')
      .map((e: any) => ({ runId: c.runId, payload: e.payload })),
  )
  const executedChoices = children.flatMap((c) => {
    const executed = new Set(
      (c.uiScan?.popupCheck?.attempts ?? [])
        .filter((a: any) => a.actionId)
        .map((a: any) => a.itemId),
    )
    return (c.decisionInputs ?? []).flatMap((d: any) => {
      const candidate = d.packet.candidates.find((p: any) => p.id === d.proposal.choice)
      return candidate && executed.has(candidate.id)
        ? [{ runId: c.runId, stage: d.packet.stage, description: candidate.description }]
        : []
    })
  })
  const unrelated = executedChoices.filter((a: any) =>
    /Sort alphabetically|Change density/.test(a.description),
  )
  const entryPaths = children.map((c) =>
    executedChoices.filter((a: any) => a.runId === c.runId).map((a: any) => a.description),
  )
  const pathMatched =
    id === 'P03' ||
    (entryPaths.length === 2 &&
      entryPaths.every(
        (path) =>
          path.length === expected.validEntryPath.length &&
          path.every((name: string, i: number) => name.includes(expected.validEntryPath[i]!)),
      ))
  return {
    id,
    delegation,
    childGoals,
    originalActions,
    executedChoices,
    pathMatched,
    unrelatedPopupActions: unrelated.length,
    goalPassed:
      delegation && childGoals.every((c) => c.matched) && pathMatched && unrelated.length === 0,
    parentScope: {
      status: parent.status,
      coverage: parent.uiScan?.inspection?.coverage,
      inspection: parent.uiScan?.inspection,
      explanation:
        'A parent partial is retained as scope accounting, independently of popup subgoal success.',
    },
    persistence: parent.persistence,
    safetyStop:
      parent.persistence?.status !== 'verified' ||
      children.some((c) => c.persistence?.status !== 'verified'),
    expected: expected.explanation,
  }
}
