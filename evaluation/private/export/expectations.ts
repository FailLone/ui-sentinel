import type { ExportVariantId } from './controller.ts'

/**
 * What each variant's *report* must say, stated independently of the production adapter.
 *
 * This is deliberately a second, private statement of the expected outcome rather than a call into
 * the adapter that produced the run. A scorer that asked the adapter what the answer was would
 * grade the run against itself: a bug in the adapter would move both the run's behaviour and the
 * expectation, and the pair would still agree. The private business truth (create/retry/artifact
 * counts) lives in the arena controller; the report-level expectations live here.
 */
export interface ReportExpectation {
  /** The business outcome the report must carry. */
  readonly businessResult: 'success' | 'rejected' | 'unknown'
  /** The execution status the report must carry. */
  readonly status: 'completed' | 'blocked'
  /** The private truth this variant must produce, restated for the scorer's own use. */
  readonly truth: {
    readonly creates: number
    readonly retries: number
    readonly jobs: number
    readonly artifacts: number
  }
  /**
   * Whether a supported defect finding is required, and whether any is forbidden. A healthy
   * variant with an extra "defect" is as wrong as a defective one with none: one is a missed
   * finding, the other is a false positive, and both make the run unusable as evidence.
   */
  readonly finding: 'required' | 'forbidden'
}

export const REPORT_EXPECTATIONS: Record<ExportVariantId, ReportExpectation> = Object.freeze({
  // A healthy export: the run must reach a clean completion and must not invent a defect.
  E0: {
    businessResult: 'success',
    status: 'completed',
    truth: { creates: 1, retries: 0, jobs: 1, artifacts: 1 },
    finding: 'forbidden',
  },
  // A recoverable failure: the recovery must actually be used - a report that only probed the
  // control and then finished would have observed the failure without recovering from it.
  E1: {
    businessResult: 'success',
    status: 'completed',
    truth: { creates: 1, retries: 1, jobs: 1, artifacts: 1 },
    finding: 'forbidden',
  },
  // The same failure with recovery unavailable: blocked, unknown, and one evidenced finding.
  E2: {
    businessResult: 'unknown',
    status: 'blocked',
    truth: { creates: 1, retries: 0, jobs: 1, artifacts: 0 },
    finding: 'required',
  },
  // A legitimate business rejection. Reporting it as a product defect would be a false positive.
  E3: {
    businessResult: 'rejected',
    status: 'completed',
    truth: { creates: 1, retries: 0, jobs: 1, artifacts: 0 },
    finding: 'forbidden',
  },
  // E1's business under different wording and layout: the same outcome, including the recovery.
  E4: {
    businessResult: 'success',
    status: 'completed',
    truth: { creates: 1, retries: 1, jobs: 1, artifacts: 1 },
    finding: 'forbidden',
  },
})

/** The declared retry semantics. A rule matching all four is the same rule under another id. */
export interface RetryDeclarationShape {
  readonly eventType: string
  readonly condition: string
  readonly target: string
}

/**
 * The semantics the approved retry declaration encodes.
 *
 * "No equivalent retry rule" is not "a rule named something else": a second rule with the same
 * trigger, condition and target measures the same thing, whatever it is called and whoever wrote
 * it. Comparing the shape rather than the id is what makes the check meaningful.
 */
export const RETRY_DECLARATION_SHAPE: RetryDeclarationShape = Object.freeze({
  eventType: 'retryable-failure',
  condition: 'element-actionable',
  target: 'Retry button',
})

/** A rule declaration, as a batch scorer sees it. */
export interface DeclaredRule {
  readonly id: string
  readonly revision: string
  readonly enabled: boolean
  readonly trigger?: { readonly eventType?: string }
  readonly expectation?: { readonly condition?: string; readonly target?: string }
}

/**
 * Enabled rules that measure the same thing as the retry declaration.
 *
 * Group A runs the export business with only the built-in rules enabled, so nothing may already
 * answer the retry question - otherwise "the agent discovered it" would be untestable, because a
 * pre-existing rule had already decided it.
 */
export function equivalentRetryRules(rules: readonly DeclaredRule[]): string[] {
  const shape = RETRY_DECLARATION_SHAPE
  return rules
    .filter(
      (rule) =>
        rule.enabled &&
        rule.trigger?.eventType === shape.eventType &&
        rule.expectation?.condition === shape.condition &&
        rule.expectation?.target === shape.target,
    )
    .map((rule) => `${rule.id}@${rule.revision}`)
}
