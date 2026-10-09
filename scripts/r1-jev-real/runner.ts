import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { compileInput } from '../../src/agent/decisions/jev-provider/compile.ts'
import { createJevSession } from '../../src/agent/decisions/jev-provider/session.ts'
import { identityFor, sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import type { HttpFetch, ProviderEvent } from '../../src/agent/decisions/jev-provider/http.ts'
import { rankCandidates } from '../../src/agent/decisions/exploration/ranking.ts'
import {
  authorizationSchema,
  blockers,
  configSchema,
  freezeSchema,
  type CampaignConfig,
} from './config.ts'
import { loadDataset } from './dataset.ts'
import { writeJson, sealEvidence } from './evidence.ts'
import { openCampaignLedger } from './ledger.ts'

const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
export function prepare(root: string, raw: unknown) {
  const config = configSchema.parse(raw)
  const dataset = loadDataset(root, config)
  const prepared = dataset.cases.map((c) => ({
    id: c.id,
    ...compileInput(c.input, config.profile),
  }))
  const requestsSha256 = sha256(
    JSON.stringify(
      prepared.map((c) => ({
        id: c.id,
        wireDigest: c.compiled.wireDigest,
        requestDigest: c.compiled.requestDigest,
      })),
    ),
  )
  const dirty = git(root, 'status', '--porcelain') !== ''
  const freeze = {
    version: 'r1-jev-freeze-1',
    sourceSha: git(root, 'rev-parse', 'HEAD'),
    lockSha256: sha256(readFileSync(join(root, 'pnpm-lock.yaml'))),
    config,
    configSha256: sha256(JSON.stringify(config)),
    requestsSha256,
    labelsSha256: null,
    labelsReviewed: false,
  }
  return {
    config,
    prepared,
    freeze,
    blockers: [
      ...blockers(config),
      ...(dirty ? ['source-dirty'] : []),
      ...(config.phase === 'holdout' ? ['independent-label-review-required'] : []),
    ],
  }
}
function freshOutput(output: string) {
  mkdirSync(output, { recursive: false })
}
export function dryRun(root: string, raw: unknown, output: string) {
  const p = prepare(root, raw)
  freshOutput(output)
  writeJson(join(output, 'freeze.json'), p.freeze)
  for (const c of p.prepared) {
    writeJson(join(output, 'inputs', `${c.id}.json`), c.input)
    writeJson(join(output, 'requests', `${c.id}.json`), c.compiled)
  }
  writeJson(join(output, 'preflight.json'), {
    mode: 'dry-run',
    networkRequests: 0,
    realModel: 'not-run',
    cases: p.prepared.length,
    httpAttemptLimit: p.config.limits.maxAttempts,
    identity: identityFor(p.config.profile),
    blockers: p.blockers,
    priceEstimate: null,
  })
  sealEvidence(output)
  return { mode: 'dry-run', cases: p.prepared.length, blockers: p.blockers }
}
export function validateRun(root: string, rawFreeze: unknown, rawAuthorization: unknown) {
  const freeze = freezeSchema.parse(rawFreeze)
  const authorization = authorizationSchema.parse(rawAuthorization)
  if (
    authorization.freezeSha256 !== sha256(JSON.stringify(freeze)) ||
    Date.parse(authorization.expiresAt) <= Date.now()
  )
    throw new Error('authorization-invalid')
  const p = prepare(root, freeze.config)
  if (p.blockers.filter((x) => x !== 'independent-label-review-required').length)
    throw new Error('real-preflight-blocked')
  if (freeze.config.phase === 'holdout' && (!freeze.labelsReviewed || !freeze.labelsSha256))
    throw new Error('holdout-labels-unreviewed')
  for (const key of ['sourceSha', 'lockSha256', 'configSha256', 'requestsSha256'] as const)
    if (freeze[key] !== p.freeze[key]) throw new Error(`freeze-mismatch:${key}`)
  return { freeze, authorization, prepared: p.prepared }
}
export async function runCampaign(options: {
  root: string
  freeze: unknown
  authorization: unknown
  output: string
  getKey: () => string
  fetch?: HttpFetch
  signal?: AbortSignal
}) {
  // No credential read or transport constructed until EVERY gate passes.
  const { freeze, authorization, prepared } = validateRun(
    options.root,
    options.freeze,
    options.authorization,
  )
  const key = options.getKey()
  if (!key) throw new Error('r1-key-missing')
  const config = freeze.config
  const claimRoot = join(options.root, 'artifacts/r1-jev-real/authorizations')
  mkdirSync(claimRoot, { recursive: true })
  // Consume a frozen campaign, not just a chosen output path; a new output cannot reset spend.
  writeFileSync(
    join(claimRoot, `${sha256(JSON.stringify(freeze))}.claim`),
    JSON.stringify({ sourceSha: freeze.sourceSha, output: resolve(options.output) }),
    { flag: 'wx', mode: 0o600 },
  )
  freshOutput(options.output)
  writeJson(join(options.output, 'freeze.json'), freeze)
  writeJson(join(options.output, 'authorization.json'), authorization)
  writeJson(join(options.output, 'environment.json'), {
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    git: git(options.root, '--version'),
    sourceSha: freeze.sourceSha,
  })
  const ledger = openCampaignLedger(options.output, config.limits)
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const timer = setTimeout(abort, config.limits.maxWallMs)
  const results: unknown[] = []
  let stopped: string | null = null
  try {
    for (let repetition = 0; repetition < config.repetitions; repetition++) {
      for (const c of prepared) {
        if (controller.signal.aborted) {
          stopped = 'cancelled-or-batch-timeout'
          break
        }
        const input = structuredClone(c.input)
        input.state.cacheable = false
        input.budget.remainingCostUsd = Math.min(
          input.budget.remainingCostUsd ?? config.limits.maxCostUsd,
          config.limits.maxCostUsd - ledger.snapshot().knownCostUsd,
        )
        input.budget.remainingMs = Math.min(input.budget.remainingMs, ledger.snapshot().remainingMs)
        input.budget.maxRequestMs = Math.min(input.budget.maxRequestMs, config.requestTimeoutMs)
        const prefix = `${c.id}-${repetition}`
        writeJson(join(options.output, 'inputs', `${prefix}.json`), input)
        const reserved = new Set<string>()
        const onEvent = (event: ProviderEvent) => {
          if (event.stage === 'dispatch') {
            ledger.reserve(event.attemptId, config.protocol.quoteUsd!)
            reserved.add(event.attemptId)
          }
          writeJson(join(options.output, 'attempts', `${prefix}-${event.stage}.json`), event)
          if (event.usage && reserved.has(event.attemptId))
            ledger.settle(
              event.attemptId,
              event.usage.status === 'known' ? event.usage.costUsd : null,
            )
        }
        const session = createJevSession({
          profile: config.profile,
          apiKey: key,
          fetch: options.fetch,
          quoteUsd: config.protocol.quoteUsd!,
          budget: input.budget,
          currentInput: () => input,
          onEvent,
        })
        const result = await session.decide(input, { signal: controller.signal })
        await session.settled()
        const row = {
          id: c.id,
          repetition,
          inputPath: `inputs/${prefix}.json`,
          baseline: rankCandidates(input),
          result,
        }
        results.push(row)
        writeJson(join(options.output, 'results', `${prefix}.json`), row)
        const snapshot = ledger.snapshot()
        if (
          snapshot.pending ||
          snapshot.overrun ||
          [
            'invalid-input',
            'invalid-receipt',
            'transport-failed',
            'timeout',
            'cancelled',
            'budget-exhausted',
            'stale-state',
            'unsupported',
          ].includes(result.reasonCode)
        ) {
          stopped = snapshot.pending
            ? 'unknown-cost'
            : snapshot.overrun
              ? 'cost-overrun'
              : result.reasonCode
          break
        }
      }
      if (stopped) break
    }
    writeJson(join(options.output, 'summary.json'), {
      mode: 'real',
      sourceSha: freeze.sourceSha,
      planned: prepared.length * config.repetitions,
      completed: results.length,
      stopped,
      ledger: ledger.snapshot(),
      qualityVerdict: 'not-evaluated',
    })
  } catch {
    stopped = 'campaign-error'
    writeJson(join(options.output, 'failure.json'), { code: stopped, ledger: ledger.snapshot() })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    ledger.close()
    sealEvidence(options.output)
  }
  return { completed: results.length, stopped }
}
