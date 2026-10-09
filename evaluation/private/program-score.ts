import type { Page } from 'playwright'
import type { ProgramReceipt } from '../../src/execution/investigation/runner.ts'
import type { InvestigationCase } from '../fixtures/investigation.ts'

/** Evaluator-owned semantics. Independent geometry must agree with the declared comparison. */
export async function scoreProgramReceipts(
  page: Page,
  id: InvestigationCase,
  receipts: ProgramReceipt[],
  actions: { type?: string; target?: string }[] = [],
) {
  const family = id.split('-')[0]
  const selector =
    family === 'menu'
      ? '[role="option"]:last-child'
      : family === 'feedback'
        ? '#message'
        : '#continue'
  const trigger = family === 'menu' ? '#open' : family === 'feedback' ? '#check' : '#load'
  const control =
    family === 'menu' ? 'Delivery times' : family === 'feedback' ? 'Check address' : 'Load details'
  const metric = family === 'menu' ? 'unclippedFraction' : 'viewportFraction'
  const healthy = id.endsWith('healthy')
  let triggered = false
  for (const action of actions) {
    if (action.type !== 'click' || !action.target) continue
    if (action.target === `button[${control}]` || action.target.startsWith(`button[${control}][`))
      triggered = true
    else {
      const target = action.target.replace(/^css=/, '')
      triggered ||= await page.evaluate(
        ({ a, b }) => {
          try {
            return (
              document.querySelectorAll(a).length === 1 &&
              document.querySelector(a) === document.querySelector(b)
            )
          } catch {
            return false
          }
        },
        { a: target, b: trigger },
      )
    }
  }
  const relevant = []
  for (const r of receipts) {
    for (const a of r.assertions) {
      // Rectangular containment and positive sampled hit coverage are different valid observations.
      // Hit tests qualify only when the independently measured fixture geometry confirms the issue.
      if (
        ![metric, 'hitFraction'].includes(a.left.metric) ||
        !('value' in a.right) ||
        typeof a.right.value !== 'number' ||
        a.right.value <= 0 ||
        a.right.value > 1 ||
        !['gte', 'eq'].includes(a.operator)
      )
        continue
      const target = r.program.targets.find((t) => t.name === a.left.target)
      if (!target) continue
      const same = await page.evaluate(
        ({ a, b }) => {
          try {
            return (
              document.querySelectorAll(a).length === 1 &&
              document.querySelector(a) === document.querySelector(b)
            )
          } catch {
            return false
          }
        },
        { a: target.selector, b: selector },
      )
      const measured = r.samples[a.left.sample]?.[a.left.target]?.[metric]
      const geometryMatches =
        typeof measured === 'number' && (healthy ? measured === 1 : measured < 1)
      if (same && geometryMatches)
        relevant.push({
          verdict: r.verdict,
          assertion: a.verdict,
          metric: a.left.metric,
          geometry: measured,
        })
    }
  }
  const expected = healthy ? 'pass' : 'fail'
  // Healthy discovery requires exercising the relevant control and no false finding; it need not
  // invent an anomaly just to run a program. Exact generated programs are separately replayed on
  // BOTH variants, and the suite cannot pass unless all those paired replays pass.
  return {
    expected,
    triggered,
    relevant,
    passed:
      triggered &&
      (healthy
        ? !receipts.some((r) => r.verdict === 'fail')
        : relevant.some((r) => r.verdict === 'fail' && r.assertion === 'fail')),
  }
}
