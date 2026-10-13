import {
  explore as run,
  type ExploreOptions,
  type Decide,
} from '../../src/execution/exploration/run.ts'
export type { Decision, DecisionInput, Decide } from '../../src/execution/exploration/run.ts'

/** Legacy synchronous fixture contract, deliberately confined to evaluation. */
export async function explore(options: Omit<ExploreOptions, 'context' | 'replaySafe'>) {
  const report = await run({
    ...options,
    replaySafe: true,
    context: async () => 'lab-static-read-only-resettable-v1',
  })
  return {
    ...report,
    status:
      report.status === 'bounded-scope-exhausted'
        ? 'reachable-fixture-actions-exhausted'
        : 'partial',
  }
}
/** Free wiring driver, not a real agent. Uses only the public UI description. */
export const scriptedDecision: Decide = async (input) => {
  const control = input.candidates[0]!
  const expectedHeading = /(?:titled|heading) (.+)\.$/.exec(control.description)?.[1]
  if (!expectedHeading) throw Error('no-public-expectation')
  return { ref: control.ref, expectedHeading }
}
