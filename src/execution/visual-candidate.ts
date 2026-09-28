import { z } from 'zod'
import { regionIsUsable, type Rect, type Viewport } from './focus-geometry.ts'

/**
 * Visual candidates: what the vision model is allowed to say, and what the server turns that into.
 *
 * Two separate shapes on purpose. The model returns only what it can see; the server attaches every
 * identity, binding and provenance. A model that tries to supply its own id, path or verdict is
 * rejected outright rather than partially honoured. Plan 4.2.
 */

/** Caps are enforced by the schema, not by asking the prompt to behave. Plan 4.2. */
export const CANDIDATE_MAX = 2
export const EXCLUDED_MAX = 4
export const TARGET_DESCRIPTION_MAX = 300
export const VISUAL_BASIS_MAX = 800

const finiteNumber = z.number().finite()
export const rectSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber.positive(),
  height: finiteNumber.positive(),
})

/**
 * Strict: unknown keys are an error. The model does not get to name its own identity or conclusion,
 * and silently dropping such keys would hide that it tried.
 */
const modelCandidateSchema = z
  .object({
    perceivedRegion: rectSchema,
    targetDescription: z.string().min(1).max(TARGET_DESCRIPTION_MAX),
    visualBasis: z.string().min(1).max(VISUAL_BASIS_MAX),
    excludedRegions: z.array(rectSchema).max(EXCLUDED_MAX),
    confidence: z.enum(['low', 'medium', 'high']),
  })
  .strict()

const modelScanSchema = z
  .object({ candidates: z.array(modelCandidateSchema).max(CANDIDATE_MAX) })
  .strict()

export interface VisualCandidate {
  readonly id: string
  readonly runId: string
  readonly kind: 'input-focus-region'
  readonly observationId: string
  /** Evidence id of the screenshot this candidate was perceived from, owned by this run. */
  readonly screenshotRef: string
  readonly perceivedRegion: Rect
  readonly targetDescription: string
  readonly visualBasis: string
  readonly excludedRegions: readonly Rect[]
  readonly confidence: 'low' | 'medium' | 'high'
  readonly algorithmVersion: string
  readonly createdAt: string
}

export type ModelVisualCandidate = z.infer<typeof modelCandidateSchema>

export type ParseResult =
  | { readonly ok: true; readonly candidates: readonly ModelVisualCandidate[] }
  | { readonly ok: false; readonly reason: string }

/**
 * Parse and validate a raw vision response against the viewport.
 *
 * Rejection is whole: a non-finite or out-of-viewport rectangle is refused, never clipped into a
 * plausible-looking region. An empty candidate list is a valid result - it says this bounded scan
 * raised nothing, not that the page is sound.
 */
export function parseVisualScanOutput(raw: unknown, viewport: Viewport): ParseResult {
  const parsed = modelScanSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: parsed.error.message }

  for (const candidate of parsed.data.candidates) {
    if (!regionIsUsable(candidate.perceivedRegion, viewport))
      return { ok: false, reason: 'candidate-perceived-region-outside-viewport' }
    for (const excluded of candidate.excludedRegions) {
      if (!regionIsUsable(excluded, viewport))
        return { ok: false, reason: 'candidate-excluded-region-outside-viewport' }
    }
  }

  return { ok: true, candidates: parsed.data.candidates }
}

/** Attach the server-owned identity and provenance to a validated model candidate. */
export function bindServerCandidate(
  model: ModelVisualCandidate,
  context: {
    readonly runId: string
    readonly observationId: string
    readonly screenshotRef: string
    readonly algorithmVersion: string
    readonly now: string
  },
  nextId: () => string,
): VisualCandidate {
  return {
    id: nextId(),
    runId: context.runId,
    kind: 'input-focus-region',
    observationId: context.observationId,
    screenshotRef: context.screenshotRef,
    perceivedRegion: model.perceivedRegion,
    targetDescription: model.targetDescription,
    visualBasis: model.visualBasis,
    excludedRegions: model.excludedRegions,
    confidence: model.confidence,
    algorithmVersion: context.algorithmVersion,
    createdAt: context.now,
  }
}
