import type { Journey } from './library.ts'
import { conditionMatches } from './library.ts'
import type { PageSnapshot } from '../../rules/types.ts'

export async function runJourney(
  journey: Journey,
  options: {
    guard: () => void
    snapshot: () => PageSnapshot
    observe: () => Promise<unknown>
    blocked: () => boolean
    unique: (step: Journey['steps'][number]) => Promise<boolean>
    act: (action: Journey['steps'][number]['action']) => Promise<any>
  },
) {
  const completed: unknown[] = []
  const handoff = (reason: string) => ({
    status: 'handoff',
    reason,
    completed,
    journeyId: journey.id,
    revision: journey.revision,
    nextStep: completed.length,
  })
  if (journey.steps.length < 2 || journey.steps.length > 3 || journey.writePolicy !== 'read-only')
    return handoff('unsupported journey contract')
  await options.observe()
  for (const step of journey.steps) {
    options.guard()
    if (options.blocked())
      return handoff('quality anomaly or business boundary; inspect current evidence')
    if (!conditionMatches(step.before, options.snapshot()) || !(await options.unique(step)))
      return handoff('precondition or unique semantic target changed')
    const result = await options.act(step.action)
    options.guard()
    if (result?.error || result?.status !== 'completed')
      return handoff('action failed; do not replay completed steps')
    completed.push({
      action: step.action,
      status: result.status,
      evidenceRefs: result.evidenceRefs,
    })
    if (options.blocked())
      return handoff('new quality anomaly or business boundary; inspect current evidence')
    if (!conditionMatches(step.after, options.snapshot()))
      return handoff('postcondition changed; return control to agent')
  }
  return {
    status: 'completed',
    journeyId: journey.id,
    revision: journey.revision,
    completed,
    nextStep: completed.length,
  }
}
