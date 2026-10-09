import { z } from 'zod'
import type { ImageShapeContract, ImagePaintFact } from '../image-shape.ts'
import type { Rule, RuleVerdict } from '../types.ts'

const contractSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    pageUrl: z.string().url().max(4096),
    selector: z.string().trim().min(1).max(1000),
    resourceUrl: z.string().url().max(65536),
    resourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    viewport: z
      .object({ width: z.number().int().positive(), height: z.number().int().positive() })
      .strict(),
    intent: z.enum(['preserve', 'intentional-distortion']),
    basis: z
      .object({
        reference: z.string().trim().min(1).max(4096),
        statement: z.string().trim().min(1).max(4000),
        confirmedBy: z.string().trim().min(1).max(200),
      })
      .strict(),
  })
  .strict()

function measure(fact: ImagePaintFact) {
  const { contentWidth: w, contentHeight: h, naturalWidth: nw, naturalHeight: nh } = fact
  if (
    !fact.complete ||
    ![w, h, nw, nh].every((v) => v !== undefined && Number.isFinite(v) && v > 0)
  )
    return { reason: 'image-not-loaded-or-no-positive-content-size' }
  let sx = w! / nw!,
    sy = h! / nh!
  switch (fact.objectFit) {
    case 'fill':
      break
    case 'contain':
      sx = sy = Math.min(sx, sy)
      break
    case 'cover':
      sx = sy = Math.max(sx, sy)
      break
    case 'none':
      sx = sy = 1
      break
    case 'scale-down':
      sx = sy = Math.min(1, sx, sy)
      break
    default:
      return { reason: 'unsupported-object-fit' }
  }
  if (!fact.matrix || !fact.matrix.every(Number.isFinite)) return { reason: 'missing-transform' }
  const [ma, mb, mc, md] = fact.matrix
  const a = ma * sx,
    b = mb * sx,
    c = mc * sy,
    d = md * sy
  // Singular values detect shear as well as unequal axis scales; an AABB ratio cannot do this.
  const trace = a * a + b * b + c * c + d * d,
    determinant = a * d - b * c
  const delta = Math.sqrt(Math.max(0, trace * trace - 4 * determinant * determinant))
  const maxScale = Math.sqrt((trace + delta) / 2)
  const minScale = Math.abs(determinant) / maxScale
  if (!Number.isFinite(maxScale) || !Number.isFinite(minScale) || minScale <= 1e-8)
    return { reason: 'degenerate-transform' }
  return {
    ratio: maxScale / minScale,
    contentScale: [sx, sy],
    minScale,
    maxScale,
    paintedSize: { width: nw! * sx, height: nh! * sy },
  }
}

/** Explicit host opt-in only. This is not the learned-rule approval API or semantic inference. */
export function createImageShapeDistortionRule(
  contracts: readonly ImageShapeContract[] = [],
): Rule {
  const requirements = z.array(contractSchema).max(32).parse(contracts)
  if (new Set(requirements.map((c) => c.id)).size !== requirements.length)
    throw Error('duplicate-image-contract-id')
  return {
    id: 'image-shape-distortion',
    revision: '0.1.0',
    name: 'Contract-bound raster image shape',
    description:
      'Measures CSS deformation of a known static raster under an explicit resource/viewport design contract; does not infer image intent.',
    category: 'visual',
    enabled: false,
    routing: { version: '1', execution: 'automatic', eventTypes: [], cache: 'never' },
    observation: {
      imageTargets: requirements.map(({ pageUrl, selector }) => ({ pageUrl, selector })),
    },
    async evaluate({ snapshot }) {
      const rows = requirements.map((contract) => {
        const row = (
          verdict: RuleVerdict,
          reason: string,
          fact?: ImagePaintFact,
          measurement?: ReturnType<typeof measure>,
        ) => ({ contract, verdict, reason, fact, measurement })
        if (
          snapshot.url !== contract.pageUrl ||
          snapshot.viewport.width !== contract.viewport.width ||
          snapshot.viewport.height !== contract.viewport.height
        )
          return row('not-applicable', 'outside-contracted-page-or-viewport')
        const matches = snapshot.imagePaint?.filter((f) => f.selector === contract.selector) ?? []
        if (matches.length !== 1) return row('unknown', 'missing-or-ambiguous-measurement')
        const fact = matches[0]!
        if (fact.matchCount !== 1 || !fact.nodeId)
          return row('unknown', 'missing-or-ambiguous-native-image', fact)
        if (!fact.stable) return row('unknown', 'paint-changed-across-observation', fact)
        if (!fact.decoded || !fact.complete || !fact.naturalWidth || !fact.naturalHeight)
          return row('unknown', 'image-not-loaded', fact)
        if (
          fact.currentSrc !== contract.resourceUrl ||
          fact.resource?.sha256 !== contract.resourceSha256
        )
          return row('unknown', 'resource-not-verified-or-variant-changed', fact)
        if (contract.intent === 'intentional-distortion')
          return row('not-applicable', 'explicit-authorized-distortion', fact)
        if (fact.excluded) return row('not-applicable', fact.excluded, fact)
        if (fact.unsupported?.length) return row('unknown', 'unsupported-paint-conditions', fact)
        if (!snapshot.screenshotPath || !fact.resource?.evidenceRef)
          return row('unknown', 'missing-paint-evidence', fact)
        const measurement = measure(fact)
        if (!('ratio' in measurement)) return row('unknown', measurement.reason!, fact, measurement)
        // Engineering resolution, not a universal visual standard. The grey zone is not a pass.
        const verdict =
          measurement.ratio! <= 1.001 ? 'pass' : measurement.ratio! >= 1.02 ? 'fail' : 'unknown'
        return row(
          verdict,
          verdict === 'fail'
            ? 'nonuniform-content-transform'
            : verdict === 'pass'
              ? 'uniform-content-transform'
              : 'near-resolution-boundary',
          fact,
          measurement,
        )
      })
      const verdict = rows.some((r) => r.verdict === 'fail')
        ? 'fail'
        : !rows.length || rows.some((r) => r.verdict === 'unknown')
          ? 'unknown'
          : rows.some((r) => r.verdict === 'pass')
            ? 'pass'
            : 'not-applicable'
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict,
        severity: verdict === 'fail' ? 'warning' : 'info',
        title: 'Contract-bound raster image shape',
        expected: 'The identified raster retains its source shape under the cited design contract',
        actual: rows.length
          ? rows.map((r) => `${r.contract.id}: ${r.verdict} (${r.reason})`).join('; ')
          : 'No explicit image shape contract; applicability unknown',
        evidenceRefs: [
          ...new Set([
            ...(snapshot.screenshotPath ? [snapshot.screenshotPath] : []),
            ...rows.flatMap((r) => (r.fact?.resource ? [r.fact.resource.evidenceRef] : [])),
          ]),
        ],
        confidence: verdict === 'unknown' ? 0 : 0.95,
        details: {
          knowledgeId: 'UIK-D004',
          method: 'static-raster-content-transform',
          rows,
          scope:
            'CSS deformation relative to the cited original only; no source-artwork, cropping, identity or QR usability judgment',
          resolution: { passMaxRatio: 1.001, failMinRatio: 1.02, between: 'unknown' },
        },
      }
    },
  }
}

export const imageShapeDistortionRule = createImageShapeDistortionRule()
