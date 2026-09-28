import {
  bindServerCandidate,
  parseVisualScanOutput,
  type ModelVisualCandidate,
  type VisualCandidate,
} from './visual-candidate.ts'
import type { Viewport } from './focus-geometry.ts'

/**
 * The bounded read-only vision pass that turns one screenshot into at most two server-bound candidates.
 *
 * Scan and verdict are deliberately separate: the scan reports what the picture suggested, and only
 * the focus probe can say whether it is true. Nothing here reads the DOM, clicks, or concludes - a
 * candidate is a hypothesis about a region, and the receipt is the fact. Plan 4.2.
 *
 * The model call is charged exactly once per scan and the result is memoised per observation, so a
 * page that never changes is never paid for twice.
 */

export const SCAN_ALGORITHM_VERSION = 'visual-scan-1'

export interface VisualScanContext {
  readonly observationId: string
  /** Evidence id of the screenshot the scan reads, owned by this run. */
  readonly screenshotRef: string
}

export type VisualScanResult =
  | {
      readonly status: 'scanned'
      readonly candidates: readonly VisualCandidate[]
      /** True when this scan was served from an earlier scan of the same observation. */
      readonly reused: boolean
    }
  | {
      readonly status: 'rejected'
      readonly reason: string
      readonly candidates: readonly []
      readonly reused: boolean
    }

export interface VisualScanDeps {
  readonly viewport: Viewport
  readonly runId: string
  /** Cancellation/abort gate. Must run BEFORE any model call, so a cancelled run starts no work. */
  guard: () => void
  /** Charges one model call against the run budget. */
  countModel: () => void
  /** One raw vision response for the current screenshot. Rejecting means no candidates. */
  scan: () => Promise<unknown>
  saveCandidate: (candidate: VisualCandidate) => Promise<void>
  nextId: () => string
  now: () => string
}

export interface VisualScanner {
  run(context: VisualScanContext): Promise<VisualScanResult>
}

export function createVisualScanner(deps: VisualScanDeps): VisualScanner {
  /** Keyed by observation, so a repeated scan of one screenshot is never paid for twice. */
  const byObservation = new Map<string, VisualScanResult>()
  /** One in-flight scan per observation, so concurrent callers share a single model call. */
  const inFlight = new Map<string, Promise<VisualScanResult>>()

  async function scanOnce(context: VisualScanContext): Promise<VisualScanResult> {
    deps.guard()
    deps.countModel()

    let raw: unknown
    try {
      raw = await deps.scan()
    } catch (error) {
      // A failed call is not a candidate and not a clean page: it is simply unknown.
      return {
        status: 'rejected',
        reason: `vision-scan-failed:${String(error)}`,
        candidates: [],
        reused: false,
      }
    }
    deps.guard()

    const parsed = parseVisualScanOutput(raw, deps.viewport)
    if (!parsed.ok)
      return { status: 'rejected', reason: parsed.reason, candidates: [], reused: false }

    const candidates = parsed.candidates.map((model: ModelVisualCandidate) =>
      bindServerCandidate(
        model,
        {
          runId: deps.runId,
          observationId: context.observationId,
          screenshotRef: context.screenshotRef,
          algorithmVersion: SCAN_ALGORITHM_VERSION,
          now: deps.now(),
        },
        deps.nextId,
      ),
    )
    // Persist only after the whole response validated, so a rejected scan leaves no partial record.
    for (const candidate of candidates) await deps.saveCandidate(candidate)

    return { status: 'scanned', candidates, reused: false }
  }

  return {
    async run(context: VisualScanContext): Promise<VisualScanResult> {
      const cached = byObservation.get(context.observationId)
      if (cached) return { ...cached, reused: true }
      const pending = inFlight.get(context.observationId)
      if (pending) return pending

      const started = scanOnce(context).finally(() => inFlight.delete(context.observationId))
      inFlight.set(context.observationId, started)
      const result = await started
      // Every outcome is remembered, refusals included. The scan is bounded, so one screenshot costs
      // at most one model call no matter how often the candidate list is consulted.
      byObservation.set(context.observationId, result)
      return result
    },
  }
}
