import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { digest } from '../../src/agent/exploration/integration/host.ts'
import { hashTree } from '../validation/url-scan-freeze.ts'
import { documentFor } from '../../evaluation/fixtures/r2-product-acceptance/page.ts'
import { rows, rubric } from '../../evaluation/private/r2-product-acceptance/truth.ts'
export const root = 'evaluation/fixtures/r2-product-acceptance'
export const quoteUrl = 'https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints'
export const policy = {
  version: 'r2-product-acceptance-2',
  model: 'deepseek/deepseek-v4.1-flash',
  provider: 'Wafer',
  runs: 6,
  requestsPerRun: 20,
  maxRequests: 120,
  maxCostUsd: 7.56,
  reserveUsd: 0.063,
  totalTimeoutMs: 180000,
  modelTimeoutMs: 60000,
  toolTimeoutMs: 15000,
  maxActions: 8,
  batchMs: 1500000,
  maxOutputTokens: 4096,
  maxWireBytes: 131072,
  contextTokens: 1048576,
  promptPrice: 0.00000006,
  outputPrice: 0.0000016,
  retries: 0,
  fallback: false,
  jev: false,
  vision: false,
} as const
export const productSource = () => ({
  title: '轻阅目录：访客预览说明',
  version: '1.0',
  markdown: readFileSync(`${root}/product-spec.md`, 'utf8'),
})
export const publicInput = (origin: string) => ({
  kind: 'ui-scan',
  entryUrl: origin + '/',
  viewport: { width: 1000, height: 900 },
  productSource: productSource(),
})
export function validateQuote(payload: any) {
  const matches = payload?.data?.endpoints?.filter(
    (e: any) => e.provider_name === policy.provider && e.status === 0,
  )
  if (matches?.length !== 1) throw Error('provider-quote-unavailable')
  const e = matches[0]
  const price = (v: unknown, cap: number) => {
    if (
      !(
        (typeof v === 'number' || typeof v === 'string') &&
        String(v).trim() !== '' &&
        Number.isFinite(Number(v)) &&
        Number(v) >= 0 &&
        Number(v) <= cap
      )
    )
      throw Error('quote-outside-policy')
  }
  if (
    e.model_id !== policy.model ||
    e.name !== 'Wafer | deepseek/deepseek-v4.1-flash-20260910' ||
    e.context_length !== policy.contextTokens ||
    typeof e.max_completion_tokens !== 'number' ||
    e.max_completion_tokens < 4096 ||
    e.supports_tool_choice?.required !== true ||
    !['tools', 'tool_choice', 'reasoning', 'max_tokens'].every((p) =>
      e.supported_parameters?.includes(p),
    )
  )
    throw Error('provider-capability-changed')
  if (!e.pricing) throw Error('missing-pricing')
  price(e.pricing.prompt, policy.promptPrice)
  price(e.pricing.completion, policy.outputPrice)
  for (const [k, v] of Object.entries(e.pricing)) {
    if (['prompt', 'completion'].includes(k)) continue
    if (k === 'input_cache_read') price(v, policy.promptPrice)
    else if (['discount', 'request', 'image', 'input_cache_write'].includes(k)) price(v, 0)
    else if (k === 'overrides' && Array.isArray(v) && v.length === 0) continue
    else throw Error('unsupported-price-component')
  }
  return e
}
export async function manifest() {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  return {
    version: policy.version,
    sourceSha,
    baseline: '1db982428ffe4735450f2fca6a601d72f4b965dc',
    policy,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    protocolHash: digest(readFileSync('docs/experiments/r2-product-acceptance.md', 'utf8')),
    source: await hashTree('src'),
    build: await hashTree('dist'),
    runner: await hashTree('scripts/r2-product-acceptance'),
    sharedSupport: await hashTree('evaluation/support'),
    sharedR1: await hashTree('scripts/r1-online-pilot'),
    sharedUpstream: digest(readFileSync('scripts/r1-product/upstream.ts', 'utf8')),
    arenaServer: digest(readFileSync('evaluation/fixtures/counterexample-arena/server.ts', 'utf8')),
    lock: digest(readFileSync('pnpm-lock.yaml', 'utf8')),
    publicInput: publicInput('http://127.0.0.1:PORT'),
    privateTruth: rubric,
    rows: rows.map((r) => ({ ...r, htmlHash: digest(documentFor(r.variant)) })),
    priceSourceSha: digest(
      JSON.parse(
        readFileSync('evaluation/private/r2-product-acceptance/price-source.json', 'utf8'),
      ),
    ),
  }
}
export function authorize(frozen: any, approval: any, current: any) {
  if (digest(frozen) !== digest(current)) throw Error('frozen-input-or-build-changed')
  if (
    !approval?.approvedBy?.trim() ||
    !approval.approvalReference?.trim() ||
    approval.manifestHash !== digest(frozen) ||
    approval.maxRuns !== 6 ||
    approval.maxRequests !== 120 ||
    approval.maxCostUsd !== 7.56 ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) <= Date.now()
  )
    throw Error('new-r2-specific-approval-required')
}
