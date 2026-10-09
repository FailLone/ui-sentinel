import type { Batch2Dom } from './batch2-facts.ts'
import type { ImagePaintFact } from '../rules/image-shape.ts'
import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../shared/evidence-integrity.ts'

export interface ImageRequestReceipt {
  id: number
  url: string
  startedAt: string
  status?: number
  failed?: string
  finished?: boolean
}
/** Review output, deliberately not a RuleResult or a finding. */
export function reviewImageFallbacks(input: {
  dom: Batch2Dom
  stable: boolean
  issues: string[]
  requests: ImageRequestReceipt[]
  requestsTruncated: boolean
  imagePaint: readonly ImagePaintFact[]
  evidenceRefs: string[]
  evidenceIntegrity: EvidenceIntegrity
}) {
  const rows = input.dom.images.map((target) => {
    const img = target.image
    const requests = input.requests.filter((r) => r.url === img?.currentSrc)
    const reasons = [...input.issues]
    if (!input.stable) reasons.push('observation-changed')
    if (target.issue) reasons.push(target.issue)
    if (!cleanEvidenceIntegrity(input.evidenceIntegrity))
      reasons.push('evidence-intervened-or-missing')
    if (input.requestsTruncated) reasons.push('request-history-truncated')
    if (requests.length > 1) reasons.push('request-to-element-association-ambiguous')
    const request = requests.length === 1 ? requests[0] : undefined
    let resourceState = 'unknown'
    if (img) {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) resourceState = 'loaded'
      else if (!img.src?.trim() && !img.srcset?.trim() && !img.currentSrc)
        resourceState = 'source-absent'
      else if (
        !img.complete &&
        img.loading === 'lazy' &&
        !img.inViewport &&
        !requests.length &&
        !input.requestsTruncated
      )
        resourceState = 'lazy-no-request-observed'
      else if (!img.complete) resourceState = 'loading'
      else if (request?.status && request.status >= 400) resourceState = 'http-failed'
      else if (request?.failed) resourceState = 'request-failed'
      else if (img.complete && img.currentSrc && img.naturalWidth === 0)
        resourceState = 'load-or-decode-failed'
    }
    const explicitPresentation =
      img?.alt === '' && (img.role === 'presentation' || img.role === 'none')
    // This is review eligibility, never a defect or proof of identity equivalence.
    const disposition =
      reasons.length || !img
        ? 'unknown'
        : explicitPresentation || resourceState === 'loaded'
          ? 'not-applicable'
          : ['source-absent', 'http-failed', 'request-failed', 'load-or-decode-failed'].includes(
                resourceState,
              )
            ? 'review-needed'
            : 'unknown'
    const measurement = !img || reasons.length ? 'incomplete' : 'observed'
    return {
      selector: target.selector,
      disposition,
      measurement,
      resourceState,
      reasons,
      applicability: explicitPresentation
        ? 'explicit-presentational-image'
        : resourceState === 'loaded'
          ? 'no-missing-image-trigger'
          : 'identification-role-not-established',
      measured: target,
      requests,
      paint: input.imagePaint.find((f) => f.selector === target.selector) ?? null,
      association: {
        confidence: img?.container ? 'structural-only' : 'unknown',
        identityEquivalence: 'unknown',
        textVisibility: 'DOM layout/style only; not verified legibility or lack of occlusion',
        replacementImageMeaning: 'unknown',
      },
      advice:
        disposition === 'review-needed'
          ? [
              'Review whether this region needs an image at all; visible text can be sufficient.',
              'Check the saved same-region text, image alternatives and layout; no placeholder style is required.',
              'Entity identity and equivalence require independent evidence; alt and proximity do not establish either.',
            ]
          : [],
      limitation:
        'A missing avatar, empty slot or different placeholder is not automatically a defect. No-image entities without a native img are not enumerated.',
    }
  })
  return {
    id: 'image-fallback-review',
    revision: '0.1.0',
    knowledgeId: 'UIK-R005',
    enabled: false,
    kind: 'review-material' as const,
    rows,
    evidenceRefs: input.evidenceRefs,
    evidenceIntegrity: input.evidenceIntegrity,
    total: input.dom.totalImages,
    omitted: input.dom.omittedImages,
    ruleEvaluated: false,
    confirmedDefects: 0,
    healthyPasses: 0,
    requiresHumanOrGroundedSemanticReview: true,
  }
}
