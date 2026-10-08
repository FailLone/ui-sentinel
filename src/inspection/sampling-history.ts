import type { RunEvent } from '../shared/types.ts'
import type { InspectionScopeSnapshot } from './scope.ts'
import type { UiSamplingPolicy } from '../shared/ui-sampling-policy.ts'

export function samplingFrames(events: readonly RunEvent[], snapshot: InspectionScopeSnapshot) {
  return events
    .filter((e) => e.type === 'scope:sampling-frozen')
    .map((e) => {
      const p = e.payload as any
      const selected = (p.pool as string[]).filter((id) =>
        snapshot.items.some((i) => i.itemId === id && i.selected),
      )
      return {
        url: String(p.url),
        registrationItemId: String(p.itemId),
        required: Number(p.count),
        pool: p.pool as string[],
        candidates: p.candidates,
        selected,
        truncated: Number(p.truncated ?? 0),
        notChecked: (p.pool as string[]).filter((id) => !selected.includes(id)),
      }
    })
}
/** Validate the source denominator against the persisted original candidates, never today's DOM. */
export function samplingHistoryIssues(
  events: readonly RunEvent[],
  snapshot: InspectionScopeSnapshot,
  policy: UiSamplingPolicy,
  covered: boolean,
) {
  const issues: string[] = []
  const frames = samplingFrames(events, snapshot)
  const bootstrap = snapshot.items.filter((i) => i.basis === 'default-sampling:entry-registration')
  if (
    bootstrap.length !== 1 ||
    !bootstrap[0]!.selected ||
    bootstrap[0]!.targetSource !== 'executor' ||
    bootstrap[0]!.status === 'excluded'
  )
    issues.push('default-sampling-registration-missing')
  const observed = new Set(
    snapshot.items
      .filter((i) => i.category === 'entry-observation' && i.status === 'verified')
      .map((i) => i.url),
  )
  if (covered && [...observed].some((url) => !frames.some((f) => f.url === url)))
    issues.push('default-sampling-page-missing')
  if (new Set(frames.map((f) => f.url)).size !== frames.length)
    issues.push('default-sampling-page-resampled')
  for (const frame of frames) {
    const event = events.find(
      (e) => e.type === 'scope:sampling-frozen' && e.payload.itemId === frame.registrationItemId,
    )!
    const candidates = event.payload.candidates as any[]
    const expectedPool = candidates
      .filter((c) => c.category === 'local-interaction')
      .map((c) => c.itemId)
    const registered = snapshot.items.find((i) => i.itemId === frame.registrationItemId)
    if (
      !registered?.selected ||
      registered.targetSource !== 'executor' ||
      frame.required !== Math.min(policy.localSamplesPerVisitedPage, frame.pool.length) ||
      candidates.length > policy.candidateLimit ||
      JSON.stringify(expectedPool) !== JSON.stringify(frame.pool) ||
      new Set(frame.pool).size !== frame.pool.length ||
      frame.pool.some(
        (id) =>
          !snapshot.items.some(
            (i) => i.itemId === id && i.category === 'local-interaction' && i.url === frame.url,
          ),
      ) ||
      candidates.some(
        (c) =>
          !events.some((e) => e.type === 'scope:candidate-bound' && e.payload.itemId === c.itemId),
      )
    )
      issues.push('default-sampling-source-mismatch')
    if (
      frame.selected.length > frame.required ||
      (covered && frame.selected.length !== frame.required)
    )
      issues.push('default-sampling-count-mismatch')
    if (
      covered &&
      ((frame.required > 0 && registered?.status !== 'verified') ||
        (frame.required === 0 && registered?.reasonCode !== 'not-applicable-fact'))
    )
      issues.push('default-sampling-source-open')
  }
  const nav = events.filter((e) => e.type === 'scope:sampling-navigation-frozen')
  if (nav.length > 1) issues.push('default-sampling-navigation-resampled')
  if (
    covered &&
    events.some(
      (e) =>
        e.type === 'scope:candidate-bound' &&
        snapshot.items.some((i) => i.itemId === e.payload.itemId && i.category === 'navigation'),
    ) &&
    nav.length !== 1
  )
    issues.push('default-sampling-navigation-missing')
  for (const e of nav) {
    const p = e.payload as any,
      selected = p.pool.filter((id: string) =>
        snapshot.items.some((i) => i.itemId === id && i.selected),
      )
    const registration = snapshot.items.find((i) => i.itemId === p.itemId)
    if (
      !registration?.selected ||
      p.count !== 1 ||
      !p.pool.length ||
      p.pool.some(
        (id: string) => !snapshot.items.some((i) => i.itemId === id && i.category === 'navigation'),
      ) ||
      selected.length > 1 ||
      (covered && (selected.length !== 1 || registration.status !== 'verified'))
    )
      issues.push('default-sampling-navigation-mismatch')
  }
  return [...new Set(issues)]
}
