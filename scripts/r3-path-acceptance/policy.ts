import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { digest } from '../../src/agent/exploration/integration/host.ts'
import { hashTree } from '../validation/url-scan-freeze.ts'
import { documentFor } from '../../evaluation/fixtures/r2-product-acceptance/page.ts'
export const policy = {
  revision: 'r3-real-acceptance-1',
  model: 'deepseek/deepseek-v4.1-flash',
  provider: 'Wafer',
  maxRuns: 4,
  maxRequests: 32,
  maxCostUsd: 2.56,
  reserveUsd: 0.08,
  authorRequests: 20,
  handoffRequests: 12,
  reuseRequests: 0,
  totalTimeoutMs: 180000,
  modelTimeoutMs: 60000,
  toolTimeoutMs: 15000,
  batchMs: 900000,
  maxActions: 4,
  maxOutputTokens: 4096,
  maxWireBytes: 131072,
  contextTokens: 1048576,
  promptPrice: 0.000000065,
  outputPrice: 0.00000099,
  retries: 0,
  fallback: false,
} as const
export const rows = [
  { id: 'author', scenario: 'healthy', mode: 'program', maxAgentRequests: 20, maxJevRequests: 0 },
  { id: 'reuse', scenario: 'healthy', mode: 'program', maxAgentRequests: 0, maxJevRequests: 0 },
  { id: 'defect', scenario: 'defect', mode: 'program', maxAgentRequests: 0, maxJevRequests: 0 },
  {
    id: 'handoff',
    scenario: 'ambiguous',
    mode: 'program',
    maxAgentRequests: 12,
    maxJevRequests: 0,
  },
] as const
export function htmlFor(scenario: string) {
  const html = documentFor(scenario === 'defect' ? 'defect' : 'healthy')
  return scenario === 'ambiguous'
    ? html.replace(
        "document.querySelector('#next').append(button);",
        "document.querySelector('#next').append(button); document.querySelector('#next').append(button.cloneNode(true));",
      )
    : html
}
export const publicInput = (origin: string) => ({
  kind: 'ui-scan',
  entryUrl: origin + '/',
  viewport: { width: 1000, height: 900 },
  productSource: {
    title: '轻阅目录：访客预览说明',
    version: '1.0',
    markdown: readFileSync('evaluation/fixtures/r2-product-acceptance/product-spec.md', 'utf8'),
  },
})
export const quoteUrl = 'https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints'
export function validateQuote(payload: any) {
  const matches = payload?.data?.endpoints?.filter(
    (e: any) => e.provider_name === policy.provider && e.status === 0,
  )
  if (matches?.length !== 1) throw Error('provider-quote-unavailable')
  const e = matches[0]
  if (
    e.model_id !== policy.model ||
    e.name !== 'Wafer | deepseek/deepseek-v4.1-flash-20260910' ||
    e.context_length !== policy.contextTokens ||
    !(e.max_completion_tokens >= policy.maxOutputTokens) ||
    e.supports_tool_choice?.required !== true ||
    !['tools', 'tool_choice', 'reasoning', 'max_tokens'].every((p) =>
      e.supported_parameters?.includes(p),
    )
  )
    throw Error('provider-capability-changed')
  function price(v: unknown, cap: number) {
    if (
      !['string', 'number'].includes(typeof v) ||
      String(v).trim() === '' ||
      !Number.isFinite(Number(v)) ||
      Number(v) < 0 ||
      Number(v) > cap
    )
      throw Error('quote-outside-policy')
  }
  if (!e.pricing) throw Error('missing-pricing')
  price(e.pricing.prompt, policy.promptPrice)
  price(e.pricing.completion, policy.outputPrice)
  for (const [k, v] of Object.entries(e.pricing)) {
    if (['prompt', 'completion'].includes(k)) continue
    if (k === 'input_cache_read') price(v, policy.promptPrice)
    else if (['discount', 'request', 'image', 'input_cache_write'].includes(k)) price(v, 0)
    else if (!(k === 'overrides' && Array.isArray(v) && !v.length))
      throw Error('unsupported-price-component')
  }
  return e
}
export async function manifest() {
  return {
    revision: policy.revision,
    // Documentation/index-only commits after freezing do not change executable identity.
    sourceCommit: execFileSync(
      'git',
      [
        'log',
        '-1',
        '--format=%H',
        '--',
        'src',
        'scripts/r3-path-acceptance',
        'scripts/r1-online-pilot/batch.ts',
      ],
      { encoding: 'utf8' },
    ).trim(),
    policy,
    rows,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    source: await hashTree('src'),
    build: await hashTree('dist'),
    runner: await hashTree('scripts/r3-path-acceptance'),
    support: await hashTree('evaluation/support'),
    sharedBatch: await hashTree('scripts/r1-online-pilot'),
    upstream: digest(readFileSync('scripts/r1-product/upstream.ts', 'utf8')),
    freezeSupport: digest(readFileSync('scripts/validation/url-scan-freeze.ts', 'utf8')),
    lock: digest(readFileSync('pnpm-lock.yaml', 'utf8')),
    protocol: digest(readFileSync('docs/r3-path-acceptance.md', 'utf8')),
    priceSourceSha: digest(readFileSync('evaluation/r3-path-reuse/price-source.json', 'utf8')),
    input: publicInput('http://127.0.0.1:PORT'),
    pages: rows.map((r) => ({ id: r.id, sha256: digest(htmlFor(r.scenario)) })),
  }
}
export function authorize(frozen: unknown, approval: any, current: unknown) {
  if (digest(frozen) !== digest(current)) throw Error('frozen-input-or-build-changed')
  if (
    !approval?.approvedBy?.trim() ||
    !approval.approvalReference?.trim() ||
    approval.manifestHash !== digest(frozen) ||
    approval.maxRuns !== policy.maxRuns ||
    approval.maxRequests !== policy.maxRequests ||
    approval.maxCostUsd !== policy.maxCostUsd ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) <= Date.now()
  )
    throw Error('new-r3-specific-approval-required')
}
/** Private acceptance checks. These expected values are never sent to the inspected Agent. */
export function assess(id: string, report: any, original?: any) {
  const steps = report.uiScan?.productSource?.steps ?? []
  const integrity = report.persistence?.status === 'verified' && !report.persistence?.issues?.length
  const expected = ['预览就绪', '详情已就绪']
  const plan =
    steps.length === 2 &&
    steps.every(
      (s: any, i: number) =>
        (s.targetName ?? s.title) === ['预览目录', '查看详情'][i] &&
        s.action === 'click' &&
        s.expectation?.condition === 'text-equals' &&
        s.expectation.expected === expected[i],
    )
  const measured = (i: number, state: string) =>
    steps[i]?.state === state && !!steps[i]?.actionId && !!steps[i]?.evidenceRefs?.length
  const distinct =
    !original ||
    steps.every(
      (s: any, i: number) =>
        s.actionId !== original.uiScan.productSource.steps[i].actionId &&
        s.evidenceRefs.every(
          (ref: string) =>
            !original.uiScan.productSource.steps.flatMap((o: any) => o.evidenceRefs).includes(ref),
        ),
    )
  const reused = report.uiScan?.pathReuse
  const ok =
    id === 'handoff'
      ? integrity &&
        report.status === 'blocked' &&
        report.uiScan?.inspection.coverage === 'partial' &&
        reused?.status === 'handoff' &&
        reused.result?.readOnly === true &&
        reused.result.reason === 'product-target-not-unique-source-match' &&
        report.usage?.actions === 1 &&
        measured(0, 'verified') &&
        steps[1]?.state === 'unverified' &&
        !steps[1]?.actionId
      : integrity &&
        plan &&
        distinct &&
        report.status === 'completed' &&
        report.uiScan?.proofVerified === true &&
        report.uiScan.inspection.coverage === 'covered' &&
        report.usage?.actions === 2 &&
        measured(0, 'verified') &&
        measured(1, id === 'defect' ? 'failed' : 'verified') &&
        (id === 'author' || reused?.status === (id === 'defect' ? 'measured-failure' : 'reused')) &&
        (id !== 'defect' || report.findings?.some((f: any) => f.validationStatus === 'supported'))
  return {
    ok: Boolean(ok),
    integrity,
    plan,
    distinct,
    semanticReview:
      id === 'handoff' ? 'pending-human-or-agent-transcript-review' : 'mechanical-checks-only',
  }
}
