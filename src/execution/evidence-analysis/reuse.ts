import type { Finding } from '../../shared/types.ts'
import type { PageSnapshot } from '../../rules/types.ts'
import type { VisualReview } from './types.ts'

/** A narrow evidence adapter: pointer hit tests establish interception, never visual covering. */
export function occlusionReuseTarget(
  candidate: VisualReview['candidates'][number],
  finding: Finding,
  snapshot: PageSnapshot,
  evidenceRefs: string[],
): string | undefined {
  if (
    candidate.kind !== 'pointer-interception' ||
    finding.source !== 'rule' ||
    finding.ruleId !== 'overlay-blocking' ||
    finding.validationStatus !== 'supported' ||
    evidenceRefs.length < 2 ||
    !evidenceRefs.every((id) => finding.evidenceRefs.includes(id))
  )
    return undefined
  const center = {
    x: candidate.region.x + candidate.region.width / 2,
    y: candidate.region.y + candidate.region.height / 2,
  }
  return snapshot.elements.find(
    (e) =>
      e.visible &&
      e.enabled !== false &&
      ['button', 'a'].includes(e.tag) &&
      e.hitSamples &&
      e.hitSamples.length >= 5 &&
      e.hitSamples.every((s) => s.relation === 'unrelated') &&
      center.x >= e.bounds.x &&
      center.x <= e.bounds.x + e.bounds.width &&
      center.y >= e.bounds.y &&
      center.y <= e.bounds.y + e.bounds.height,
  )?.selector
}
