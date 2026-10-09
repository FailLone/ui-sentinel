/** Product acceptance of the recommended program mode. This does not authorize Jev adoption or 72-arm statistics. */
import { readFileSync } from 'node:fs'
import { digest } from '../../src/agent/exploration/integration/host.ts'
import { CONTINUATION, acceptanceFor } from '../r1-online-pilot/continuation.ts'
import { fixtures, documentFor } from './fixtures.ts'
export const CASES = [
  ['C10', 'ambiguous'],
  ['C01', 'menu-healthy'],
  ['C02', 'tabs-defect'],
  ['C03', 'boundary-input'],
  ['C04a', 'refresh'],
  ['C04b', 'return-start'],
  ['C04c', 'view-context'],
  ['C05', 'three-step-defect'],
  ['C06', 'three-step-healthy'],
  ['C07', 'fairness'],
  ['C08', 'layout-pair'],
  ['C09', 'repeat-defect'],
  ['C11', 'recovery'],
  ['C12', 'budget'],
] as const
export type Scenario = (typeof CASES)[number][1]
export const LIMITS = {
  runs: 28,
  mainRequests: 224,
  jevRequests: 0,
  maxCostUsd: 14.112,
  windowMs: 5400000,
  actions: 6,
  modelCalls: 8,
  totalTimeoutMs: 180000,
  toolMs: 5000,
  modelMs: 15000,
} as const
export function goal(scenario: string) {
  return scenario === 'view-context'
    ? 'Inspect "Read panel".'
    : scenario === 'fairness'
      ? 'Inspect "Primary".'
      : scenario === 'refresh'
        ? 'Refresh the page after inspecting its public controls.'
        : scenario === 'return-start'
          ? 'Return to the previous page after visiting details.'
          : undefined
}
export { documentFor } from './fixtures.ts'
export function makeProductManifest(sourceSha: string) {
  return {
    version: 'r1-product-acceptance-1',
    sourceSha,
    integratedMainSha: '48b02b3fbfe7e5d95189a0d813480761b123ff6b',
    entry:
      'src/server/index.ts; ordinary POST /api/runs; frozen exploration program opt-in, Jev off',
    policy: LIMITS,
    mainModel: 'deepseek/deepseek-v4.1-flash',
    provider: 'Wafer',
    maxOutputTokens: 4096,
    retries: 0,
    vision: false,
    jev: false,
    priceSourceSha: digest(
      JSON.parse(readFileSync('plans/r1-online-pilot/price-source.json', 'utf8')),
    ),
    continuation: { ...CONTINUATION, acceptance: acceptanceFor(LIMITS.maxCostUsd) },
    fixtures: Object.keys(fixtures).map((id) => ({
      id,
      htmlHash: digest(documentFor(id as keyof typeof fixtures)),
      goal: goal(id) ?? null,
    })),
    rows: CASES.flatMap(([caseId, scenario]) =>
      [1, 2].map((repetition) => ({
        id: `${caseId}-${repetition}`,
        caseId,
        scenario,
        repetition,
        mode: 'program' as const,
        maxAgentRequests: 8,
        maxJevRequests: 0,
        reserveUsd: 0.504,
        maxActions: scenario === 'budget' ? 1 : 6,
      })),
    ),
    smoke:
      'C10-1; first ordinary bounded Agent handoff doubles as provider compatibility check; no extra probe',
    stop: [
      'transport-error',
      'safety',
      'dirty-evidence',
      'persistence',
      'false-covered',
      'new-unknown',
      'cost-overrun',
      'changed-old-lineage',
    ],
    quality:
      'Retain partials and failures without tuning, reruns or model changes. Both repetitions must meet the predeclared product evidence checks. No Jev benefit or A/B/C statistics claim.',
  }
}
export type ProductManifest = ReturnType<typeof makeProductManifest>
export function authorizeProduct(m: ProductManifest, approval: any, sourceSha: string) {
  if (digest(m) !== digest(makeProductManifest(sourceSha))) throw Error('product-manifest-mismatch')
  if (
    !approval?.approvedBy?.trim() ||
    !approval?.approvalReference?.trim() ||
    approval.manifestHash !== digest(m) ||
    approval.maxRuns !== LIMITS.runs ||
    approval.maxCostUsd !== LIMITS.maxCostUsd ||
    digest(approval.riskAcceptance) !== digest(m.continuation.acceptance) ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) <= Date.now()
  )
    throw Error('product-specific-approval-required')
}
