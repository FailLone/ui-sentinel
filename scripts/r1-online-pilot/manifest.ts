import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { digest } from '../../src/agent/exploration/integration/host.ts'
import { CONTINUATION, acceptanceFor } from './continuation.ts'
import { html } from '../r1-controlled-loop/fixtures.ts'
export const MODES = ['agent', 'program', 'jev'] as const
export type Mode = (typeof MODES)[number]
export const CASES = ['semantic', 'ambiguity', 'expanded'] as const
export type Case = (typeof CASES)[number]
export const AGENT = 'deepseek/deepseek-v4.1-flash'
export const POLICY = {
  revision: 'r1-online-pilot-3',
  candidateSource: 'original-executor-selected-local-public-frame',
  actions: 6,
  modelCalls: 8,
  totalTimeoutMs: 180000,
  toolMs: 5000,
  modelMs: 15000,
  retries: 0,
  maxCandidates: 3,
  maxQuestions: 7,
  maxFrameBytes: 32768,
  maxAgentBytes: 131072,
  jevConfidence: 0.5,
  confidenceMeaning: 'pre-registered exploratory abstention, not calibrated',
  agent: {
    model: AGENT,
    provider: 'Wafer',
    maxOutputTokens: 4096,
    contextTokens: 1048576,
    inputPerTokenUsd: 0.000000055,
    outputPerTokenUsd: 0.0000012,
    reserveUsd: 0.063,
    perRunRequests: 8,
    batchRequests: 72,
  },
  jev: {
    model: 'typesafe/jev-1.13',
    expectedModel: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    reserveUsd: 0.003,
    perRunRequests: 2,
    batchRequests: 6,
  },
  vision: { enabled: false, perRunRequests: 0, batchRequests: 0, reservationUsd: 0 },
  batchMaxRequests: 78,
  batchMaxUsd: 4.554,
  batchWindowMs: 1800000,
  noFallback: true,
  scopeExpansion: 'existing-one-local-extension-1',
} as const
export function fixture(id: Case) {
  if (id !== 'ambiguity') return html(id)
  // One new fixture. Both outcomes are public obligations; there is no unique correct ranking.
  return `<!doctype html><html><head><title>Preferences and reference</title><style>body{padding:30px;font:18px sans-serif}button{padding:12px;margin:10px}</style></head><body><h1>Delivery preferences</h1><p>Configure changes the delivery confirmation panel. Learn more opens the explanatory reference panel. Both controls are part of the inspection scope.</p><button onclick="document.querySelector('#reference').textContent='Information'">Learn more</button><button onclick="document.querySelector('#result').textContent='Wrong'">Configure</button><p>Synchronously after clicking "Configure", show text "Ready".</p><p>Synchronously after clicking "Learn more", show text "Information".</p><section id="result" role="region"></section><section id="reference" role="region"></section></body></html>`
}
export const goal = (id: Case) =>
  id === 'semantic' ? 'After clicking "Reveal", show text "Ready".' : undefined
export function makeManifest(sourceSha: string) {
  return {
    version: POLICY.revision,
    sourceSha,
    baseSha: 'aa35a9544d11dd57b85d7efcc4088dc8538977cc',
    policy: POLICY,
    continuation: { ...CONTINUATION, acceptance: acceptanceFor(POLICY.batchMaxUsd) },
    priceSourceSha: digest(
      JSON.parse(
        readFileSync('evaluation/fixtures/legacy-runs/r1-online-pilot/price-source.json', 'utf8'),
      ),
    ),
    fixtures: CASES.map((id) => ({ id, htmlHash: digest(fixture(id)), goal: goal(id) ?? null })),
    rows: CASES.flatMap((scenario) =>
      MODES.map((mode) => ({
        id: `${scenario}-${mode}`,
        scenario,
        mode,
        maxAgentRequests: 8,
        maxJevRequests: mode === 'jev' ? 2 : 0,
        reserveUsd: mode === 'jev' ? 0.51 : 0.504,
      })),
    ),
    smoke: 'semantic-agent',
    stop: ['safety', 'persistence', 'unknown-cost', 'overrun', 'false-success', 'transport-error'],
    quality:
      'Finish pre-registered rows; retain ties, partials and no-advantage results; no tuning or added runs.',
  }
}
export type Manifest = ReturnType<typeof makeManifest>
export function validateManifest(m: Manifest, sourceSha: string) {
  if (digest(m) !== digest(makeManifest(sourceSha))) throw Error('online-manifest-mismatch')
}
export function authorize(m: Manifest, approval: any, sourceSha: string) {
  validateManifest(m, sourceSha)
  if (
    !approval?.approvedBy ||
    !approval?.approvalReference ||
    approval.manifestHash !== digest(m) ||
    approval.maxCostUsd !== POLICY.batchMaxUsd ||
    approval.maxRuns !== 9 ||
    digest(approval.riskAcceptance ?? null) !== digest(m.continuation.acceptance) ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) <= Date.now()
  )
    throw Error('online-authorization-required')
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv[2] === '--freeze'
) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const manifest = makeManifest(sha)
  writeFileSync(process.argv[3], JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  console.log(
    JSON.stringify({
      sourceSha: sha,
      manifestHash: digest(manifest),
      maxCostUsd: POLICY.batchMaxUsd,
      requests: 78,
      runs: 9,
    }),
  )
}
