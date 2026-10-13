import type { explore } from '../../src/execution/exploration/run.ts'
import {
  actionKey,
  type Observation,
  type Control,
} from '../../src/inspection/exploration-graph.ts'
type Report = Awaited<ReturnType<typeof explore>>

const stateLabel = (observation: Observation) => {
  if (observation.heading === 'Record details')
    return observation.text.includes('Record Beta') ? 'Record Beta' : 'Record Alpha'
  if (observation.heading === 'Search records')
    return `Search:${observation.controls.find((c) => c.name === 'Query')?.currentValue ?? ''}`
  if (observation.heading === 'Search results')
    return observation.text.includes('Matching Alpha') ? 'Results:alpha' : 'Results:'
  return observation.heading
}
const actionLabel = (control: Control) =>
  control.name === 'Open'
    ? `${control.region}:Open`
    : control.operation === 'fill'
      ? `Query=${control.value}`
      : control.name

/** Independent expected matrix, including defect location after the old 24-control cut-off. */
export function complexScore(report: Report, broken: boolean) {
  const oracle: {
    from: string
    action: string
    to: string
    heading: string
    fail: boolean
    reachable: boolean
  }[] = []
  const add = (
    from: string,
    action: string,
    to: string,
    heading = to,
    fail = false,
    reachable = true,
  ) => oracle.push({ from, action, to, heading, fail, reachable })
  for (let i = 1; i <= 28; i++)
    add(
      'Research workspace',
      `Shelf ${String(i).padStart(2, '0')}`,
      'Shared library',
      'Shared library',
      broken && i === 28,
    )
  add('Research workspace', 'Search', 'Search:', 'Search records')
  add('Research workspace', 'Load reports', 'Reports')
  add('Research workspace', 'Usage guide', 'Usage guide')
  add('Shared library', 'Shared library / Alpha record:Open', 'Record Alpha', 'Record details')
  add(
    'Shared library',
    'Shared library / Beta record:Open',
    'Record Beta',
    'Record details',
    broken,
  )
  add('Shared library', 'Advanced', 'Advanced chooser')
  add('Shared library', 'Close', 'Research workspace')
  add('Record Alpha', 'Back', 'Shared library')
  add('Record Beta', 'Back', 'Shared library', 'Shared library', false, !broken)
  add('Advanced chooser', 'Preview', 'Export preview')
  add('Advanced chooser', 'Back', 'Shared library')
  add('Export preview', 'Back', 'Advanced chooser')
  for (const value of ['', 'alpha']) {
    add(
      `Search:${value}`,
      `Query=${value ? '' : 'alpha'}`,
      `Search:${value ? '' : 'alpha'}`,
      'Search records',
    )
    add(`Search:${value}`, 'Apply', `Results:${value}`, 'Search results')
    add(`Search:${value}`, 'Cancel', 'Research workspace')
    add(`Results:${value}`, 'Back', `Search:${value}`, 'Search records')
  }
  add('Reports', 'Open summary', 'Report summary')
  add('Reports', 'Back', 'Research workspace')
  add('Report summary', 'Back', 'Reports')
  add('Usage guide', 'Continue', 'Receipt verified')
  add('Usage guide', 'Back', 'Research workspace')
  add('Receipt verified', 'Back', 'Research workspace')
  const rows = oracle.map((row) => {
    const edges = report.edges.filter((edge) => {
      const state = report.states.find((state) => state.id === edge.from)!
      const control = state.observation.controls.find(
        (control) => actionKey(control) === edge.action,
      )!
      return stateLabel(state.observation) === row.from && actionLabel(control) === row.action
    })
    return {
      ...row,
      attempts: edges.length,
      detected: edges.some((edge) => edge.verdict === 'fail'),
      wrongExpectation: edges.some((edge) => edge.expectedHeading !== row.heading),
      actual: edges.map((edge) =>
        stateLabel(report.states.find((state) => state.id === edge.to)!.observation),
      ),
    }
  })
  const matched = rows.reduce((n, row) => n + row.attempts, 0)
  return {
    rows,
    reachableEdges: rows.filter((row) => row.reachable).length,
    missedReachableEdges: rows.filter((row) => row.reachable && !row.attempts).length,
    duplicateExplorations: rows.reduce((n, row) => n + Math.max(0, row.attempts - 1), 0),
    unexpectedEdges: report.checkedEdges - matched,
    wrongExpectations: rows.filter((row) => row.wrongExpectation).length,
    falsePositives: rows.filter((row) => row.detected && !row.fail).length,
    truePositives: rows.filter((row) => row.detected && row.fail).length,
    falseNegatives: rows.filter((row) => row.fail && !row.detected).length,
  }
}
