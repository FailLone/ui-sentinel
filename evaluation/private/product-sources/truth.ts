import type { Variant } from '../../fixtures/product-sources/page.ts'
/** Operator-only truth, frozen before model dispatch. Never included in the public API payload. */
export const cases = [
  {
    id: 'RA01',
    variant: 'healthy',
    expected: 'verified',
    preview: '预览就绪',
    details: '详情已就绪',
  },
  {
    id: 'RA02',
    variant: 'defect',
    expected: 'failed',
    preview: '预览就绪',
    details: '详情未能展示',
  },
  {
    id: 'RA03',
    variant: 'unavailable',
    expected: 'unverified',
    preview: '尚未预览',
    details: '尚未查看',
  },
] as const satisfies readonly {
  id: string
  variant: Variant
  expected: string
  preview: string
  details: string
}[]
// Counterbalanced across repeats; there is no warm-up, replacement row or automatic rerun.
export const rows = [cases[0], cases[1], cases[2], cases[2], cases[1], cases[0]].map((c, i) => ({
  ...c,
  id: `R${i + 1}`,
  caseId: c.id,
  repetition: i < 3 ? 1 : 2,
  mode: 'program' as const,
  scenario: c.variant,
  maxAgentRequests: 20,
  maxJevRequests: 0,
}))
export const rubric = {
  revision: 'r2-acceptance-truth-1',
  requiredOutcomes: ['预览目录 → 预览就绪', '查看详情 → 详情已就绪'],
  acceptedPlans:
    'Exact step titles, citation boundaries, selectors, inspection tools and read order are not scored. Any supported source-grounded plan is legitimate. A plan covering only preview is valid but incomplete for the primary two-outcome denominator; retain it without a rerun.',
  healthy:
    'Both outcomes verified, actual distinct original actions and measurements; default/selected obligations also resolved before covered.',
  defect:
    'Preview verified; detail action measured against its own original slot and immediate source requirement, failed. Missing detail coverage is a miss, never healthy.',
  unavailable:
    'Record the unmet availability prerequisite and retain path unverified/partial; no forced preview or detail action, no defect inferred from unready data. A sourced reasoned abstention without a plan can pass boundary restraint but fails registration subscore.',
  provenance:
    'Source read precedes registration; registration precedes browser actions; quotes exactly match source and semantically support values, timing and prerequisites. Missing prerequisite is a semantic extraction failure even if mechanical gates accept the plan.',
  scope:
    'Recommend/save/sync/admin/other viewports remain unchecked. No claim of full document/site coverage. Default sampling is never exempted by this rubric.',
  recovery:
    'Restart server, fetch same run report without fixture availability, compare source/plan/status/evidence validation; archive original artifacts and events.',
  humanReview:
    'Inspect all six trajectories, not only final prose. Mechanical candidate checks are not semantic acceptance. Complete the rubric in review.json with citations to request/response/event/artifact IDs.',
} as const
