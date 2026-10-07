import { verifyUrlScanManifest, type UrlScanManifest } from './url-scan-freeze.ts'

/**
 * The dry run's view of a frozen batch (plan 10.3, B5).
 *
 * This is what an operator reads *before* asking for authorisation to spend, so it says exactly what
 * will run and what it is allowed to cost. It refuses to describe a manifest whose own hash does not
 * verify: a plan derived from a tampered identity would be a plan for a batch nobody froze.
 */

export interface UrlScanPlanSummary {
  readonly manifestHash: string
  readonly commit: string
  readonly buildHash: string
  readonly scorerHash: string
  readonly fixtureHash: string
  readonly totalRuns: number
  readonly costCeilingUsd: number
  /** Informational average only; enforcement uses one shared cap including smoke, never a per-row cap. */
  readonly perRunCeilingUsd: number
  readonly budgetAllocation: 'shared-total-including-smoke'
  readonly smokeRequests: number
  readonly rows: readonly { readonly sampleId: string; readonly repetition: number }[]
}

export function describeUrlScanPlan(manifest: UrlScanManifest): UrlScanPlanSummary {
  if (!verifyUrlScanManifest(manifest))
    throw new Error('The manifest does not verify against its own hash; refusing to plan from it.')
  const rows = manifest.plan.rows.map((r) => ({ sampleId: r.sampleId, repetition: r.repetition }))
  return {
    manifestHash: manifest.hash,
    commit: manifest.commit,
    buildHash: manifest.buildHash,
    scorerHash: manifest.scorerHash,
    fixtureHash: manifest.fixtureHash,
    totalRuns: rows.length,
    costCeilingUsd: manifest.costCeilingUsd,
    perRunCeilingUsd: manifest.costCeilingUsd / rows.length,
    budgetAllocation: 'shared-total-including-smoke',
    smokeRequests: Number((manifest.configuration.gateway as any)?.smokeRequests ?? 0),
    rows,
  }
}
