import type { explore } from '../../src/execution/exploration/run.ts'
import { actionKey } from '../../src/inspection/exploration-graph.ts'
import { complexScore } from './complex-score.ts'
type Report = Awaited<ReturnType<typeof explore>>

/** Independent graph oracle. No prediction, defect, or heading-expectation score. */
export function recognitionScore(report: Report, shelves = 28) {
  const oracle = complexScore(report, false)
    .rows.filter((row) => !row.action.startsWith('Shelf '))
    .map(({ from, action, to }) => ({ from, action, to }))
  for (let i = 1; i <= shelves; i++)
    oracle.push({
      from: 'Research workspace',
      action: `Shelf ${String(i).padStart(2, '0')}`,
      to: 'Shared library',
    })
  oracle.push(
    { from: 'Research workspace', action: 'Refresh view', to: 'Research workspace' },
    { from: 'Research workspace', action: 'Delete history guide', to: 'Usage guide' },
  )
  const label = (state: Report['states'][number]) => {
    const o = state.observation
    if (o.heading === 'Record details')
      return o.text.includes('Record Beta') ? 'Record Beta' : 'Record Alpha'
    if (o.heading === 'Search records')
      return `Search:${o.controls.find((c) => c.name === 'Query')?.currentValue ?? ''}`
    if (o.heading === 'Search results')
      return o.text.includes('Matching Alpha') ? 'Results:alpha' : 'Results:'
    return o.heading
  }
  const actual = report.edges.map((edge) => {
    const from = report.states.find((s) => s.id === edge.from)!
    const control = from.observation.controls.find((c) => actionKey(c) === edge.action)!
    const action =
      control.name === 'Open'
        ? `${control.region}:Open`
        : control.operation === 'fill'
          ? `Query=${control.value}`
          : control.name
    return { from: label(from), action, to: label(report.states.find((s) => s.id === edge.to)!) }
  })
  const same = (a: (typeof actual)[number], b: (typeof actual)[number]) =>
    a.from === b.from && a.action === b.action && a.to === b.to
  const missing = oracle.filter((row) => !actual.some((edge) => same(row, edge)))
  const unexpected = actual.filter((edge) => !oracle.some((row) => same(row, edge)))
  const duplicates = actual.length - new Set(actual.map((edge) => JSON.stringify(edge))).size
  const stateLabels = report.states.map(label)
  const duplicateStates = stateLabels.length - new Set(stateLabels).size
  const wrongPrunes = report.exclusions.filter((e) => {
    const state = report.states.find((s) => s.id === e.state)!
    return (
      state.observation.controls.find((c) => actionKey(c) === e.action)?.name !==
        'Delete workspace' || !e.reason
    )
  })
  return {
    expectedStates: 14,
    actualStates: report.stateCount,
    expectedEdges: oracle.length,
    actualEdges: actual.length,
    missing,
    unexpected,
    duplicateExpansions: duplicates,
    duplicateStates,
    wrongPrunes: wrongPrunes.length,
    exclusions: report.exclusions.length,
    observedOnly: report.edges.every(
      (e) => e.verdict === 'observed' && e.expectedHeading === undefined,
    ),
    passed:
      report.status === 'bounded-scope-exhausted' &&
      report.stateCount === 14 &&
      !missing.length &&
      !unexpected.length &&
      !duplicates &&
      !duplicateStates &&
      !wrongPrunes.length &&
      report.exclusions.length === 1 &&
      report.unreadActions === 0 &&
      report.edges.every((e) => e.verdict === 'observed'),
  }
}
