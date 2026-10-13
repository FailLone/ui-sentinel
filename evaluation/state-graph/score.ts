import { expectedTransitions } from './fixture.ts'
import { actionKey } from './graph.ts'
import type { explore } from './explore.ts'

/** Independent oracle: never passed into decide(). */
export function score(report: Awaited<ReturnType<typeof explore>>, broken: boolean) {
  const rows = expectedTransitions.map(([from, action, expected]) => {
    const evidence = report.edges.filter((edge) => {
      const state = report.states.find((state) => state.id === edge.from)!
      return (
        state.observation.heading === from &&
        state.observation.controls.find((control) => actionKey(control) === edge.action)?.name ===
          action
      )
    })
    const reachable = !(broken && from === 'Item details')
    const shouldFail = broken && from === 'Selected Alpha' && action === 'Details'
    return {
      from,
      action,
      expected,
      reachable,
      shouldFail,
      attempts: evidence.length,
      expectationCorrect:
        evidence.length > 0 && evidence.every((edge) => edge.expectedHeading === expected),
      detected: evidence.some((edge) => edge.verdict === 'fail'),
      actualHeadings: evidence.map(
        (edge) => report.states.find((state) => state.id === edge.to)!.observation.heading,
      ),
      verdictCorrect:
        evidence.length > 0 &&
        evidence.every((edge) => edge.verdict === (shouldFail ? 'fail' : 'pass')),
    }
  })
  return {
    rows,
    reachableEdges: rows.filter((row) => row.reachable).length,
    coveredEdges: rows.filter((row) => row.reachable && row.attempts > 0).length,
    missedReachableEdges: rows.filter((row) => row.reachable && row.attempts === 0).length,
    duplicateExplorations: rows.reduce((total, row) => total + Math.max(0, row.attempts - 1), 0),
    wrongExpectations: rows.filter((row) => row.attempts && !row.expectationCorrect).length,
    falsePositives: rows.filter((row) => row.detected && !row.shouldFail).length,
    truePositives: rows.filter((row) => row.detected && row.shouldFail).length,
    falseNegatives: rows.filter((row) => row.shouldFail && !row.detected).length,
    unreachableEdges: rows.filter((row) => !row.reachable).length,
  }
}
