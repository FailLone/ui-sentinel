import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startGateway, AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
import {
  downloadRunEvidence,
  auditStoppedGroup,
} from '../../evaluation/support/campaign-evidence.ts'
import { resolveProviders } from '../../evaluation/private/export/diagnostic-config.ts'
import {
  isVisualCaseId,
  VISUAL_VIEWPORTS,
  visualTruthFor,
  type VisualCaseId,
} from '../../evaluation/fixtures/visual.ts'
import { visualSmokeProblems } from '../../evaluation/preflight/visual-smoke-score.ts'

// Explicit paid development smoke. It cannot certify G4/G5, and it never retries a case silently.
const options = process.argv.slice(2).filter((a) => a !== '--')
let cases: VisualCaseId[] = ['D0', 'H0', 'H1']
let spendingSource: string | undefined
const seen = new Set<string>()
for (let i = 0; i < options.length; i += 2) {
  const name = options[i],
    value = options[i + 1]
  if (!value || seen.has(name) || !['--cases', '--spending-source'].includes(name))
    throw Error('Expected --cases D0,H0,H1 [--spending-source <previous-directory>]')
  seen.add(name)
  if (name === '--spending-source') spendingSource = resolve(value)
  else {
    const ids = value.split(',')
    if (!ids.length || !ids.every(isVisualCaseId) || new Set(ids).size !== ids.length)
      throw Error('Invalid visual cases')
    cases = ids as VisualCaseId[]
  }
}
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY; no mock fallback')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze clean commit before paid smoke')
const providers = resolveProviders(process.env)
if (!providers.ok) throw Error(`Pinned provider mismatch: ${providers.reasonCodes.join(',')}`)
Object.assign(process.env, {
  VALIDATION_AGENT_PROVIDER: providers.agent,
  VALIDATION_VISION_PROVIDER: providers.vision,
})
const limitUsd = Number(process.env.VALIDATION_MAX_COST_USD ?? '2')
let priorUsd = 0
if (spendingSource) {
  const previous = JSON.parse(await readFile(resolve(spendingSource, 'summary.json'), 'utf8'))
  assert.equal(previous.kind, 'visual-focus-p2-smoke')
  priorUsd = previous.totalAccountedUsd
}
assert(
  Number.isFinite(limitUsd) &&
    limitUsd > 0 &&
    Number.isFinite(priorUsd) &&
    priorUsd >= 0 &&
    priorUsd < limitUsd,
  'invalid/exhausted spending limit',
)
const buildResult = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
if (buildResult.status !== 0) process.exit(buildResult.status ?? 1)
const build = await buildIdentity()
const directory = resolve('data/visual-focus-p2', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(directory, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n')
console.log(`P2 smoke evidence: ${directory}`)
const models = (await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
}).then((r) => {
  if (!r.ok) throw Error('model-list-unavailable')
  return r.json()
})) as any
const prices = [AGENT_MODEL, VISION_MODEL].map((id) => models.data?.find((m: any) => m.id === id))
assert(
  prices.every(
    (m) =>
      m &&
      Number.isFinite(Number(m.pricing.prompt)) &&
      Number.isFinite(Number(m.pricing.completion)),
  ),
  'model-pricing-unavailable',
)
await write('models.json', prices)
const gateway = await startGateway(key, directory, fetch, {
  limitUsd: limitUsd - priorUsd,
  estimateCost: (body) => {
    const model = prices.find((m) => m.id === body.model)
    // Conservative request-byte reservation, including image data, plus bounded completion.
    return (
      Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
      4096 * Number(model.pricing.completion)
    )
  },
})
const port = async () => {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const n = (s.address() as { port: number }).port
  await new Promise<void>((r) => s.close(() => r()))
  return String(n)
}
const env = {
  ...process.env,
  PORT: await port(),
  ARENA_PORT: await port(),
  ARENA_API_PORT: await port(),
  ARENA_CONTROL_PORT: await port(),
  ARENA_CONTROL_TOKEN: randomBytes(24).toString('hex'),
  DATABASE_URL: `file:${directory}/runs.db`,
  ARENA_STATIC: '1',
  AGENT_MODEL: `openai/${AGENT_MODEL}`,
  OPENAI_API_KEY: gateway.token,
  OPENAI_BASE_URL: gateway.url,
  VISION_MODEL,
  VISION_API_KEY: gateway.token,
  VISION_BASE_URL: gateway.url,
  VISION_MODEL_FAMILY: 'qwen3',
  OPENROUTER_API_KEY: '',
  MIDSCENE_MODEL_API_KEY: '',
  COMPLETION_REVIEW_API_KEY: '',
  EXECUTION_VISUAL_DISCOVERY: '1',
  EXECUTION_ATOMIC_INVESTIGATION: '1',
  EXECUTION_BLOCKER_REVIEW: '0',
  EXECUTION_SHORT_FINISH: '1',
  EXECUTION_MODEL_STREAMING: '1',
  EXECUTION_RULE_ROUTING: '1',
  EXECUTION_JOURNEYS: '1',
  EXECUTION_OBSERVATION_REUSE: '1',
  RUN_TOTAL_TIMEOUT_MS: '300000',
  RUN_MAX_ACTIONS: '40',
  RUN_MAX_MODEL_CALLS: '30',
  MODEL_REQUEST_TIMEOUT_MS: '60000',
  MODEL_REQUEST_MAX_RETRIES: '1',
  TOOL_TIMEOUT_MS: '15000',
  AGENT_LENGTH_RECOVERY_WITHOUT_REASONING: '1',
  OTEL_SDK_DISABLED: 'true',
}
const base = `http://127.0.0.1:${env.PORT}`
const children: ChildProcess[] = []
let logs = ''
function launch(entry: string) {
  const p = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(p)
  for (const out of [p.stdout, p.stderr])
    out?.on('data', (b) => {
      logs += gateway.redact(String(b))
    })
}
async function stop(p: ChildProcess) {
  if (p.exitCode !== null || p.signalCode !== null) return
  await new Promise<void>((done) => {
    const timer = setTimeout(() => p.kill('SIGKILL'), 3000)
    p.once('exit', () => {
      clearTimeout(timer)
      done()
    })
    p.kill('SIGTERM')
  })
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function json(url: string, body?: unknown, token?: string): Promise<any> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw Error(`HTTP ${response.status}: ${gateway.redact(await response.text())}`)
  return response.json()
}
const control = (path: string, body?: unknown) =>
  json(
    `http://127.0.0.1:${env.ARENA_CONTROL_PORT}/__control/${path}`,
    body,
    env.ARENA_CONTROL_TOKEN,
  )
const goal =
  'Inspect the shopping experience, complete one normal purchase, and report evidenced issues and unverified scope.'
const records: any[] = cases.map((id) => ({ case: id, status: 'not-run', passed: false }))
let audit: unknown, failure: string | undefined
await write('manifest.json', {
  kind: 'visual-focus-p2-smoke',
  scope: 'Development smoke on known fixtures, not G4/formal/holdout acceptance',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  buildHash: build.hash,
  models: { agent: AGENT_MODEL, vision: VISION_MODEL },
  providers,
  cases,
  goal,
  fixtureRevision: 'visual-search-server-rendered-2',
  viewports: VISUAL_VIEWPORTS,
  flags: { visualDiscovery: true, atomicInvestigation: true, blockerReview: false },
  budget: { seconds: 300, actions: 40, modelCalls: 30 },
  limitUsd,
  priorUsd,
  spendingSource,
})
await write('build-identity.json', build)
try {
  launch('dist/server/index.js')
  launch('dist/arena/index.js')
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (await json(base + '/api/health')).model.ready &&
        (await json(`http://127.0.0.1:${env.ARENA_PORT}/api/variant-config`))
      ) {
        ready = true
        break
      }
    } catch {}
    await pause(100)
  }
  assert(ready, 'services-not-ready')
  const repeated = new Map<string, number>()
  for (const record of records) {
    const id = record.case as VisualCaseId
    const dir = resolve(directory, id)
    await mkdir(dir, { recursive: true })
    await control('reset', { variant: 'C0', visual: visualTruthFor(id).presentation })
    const before = await control('state')
    assert.equal(before.visualPresent, visualTruthFor(id).presentation)
    assert.equal(before.orders.length, 0)
    gateway.begin(id, 30, 300000)
    record.status = 'running'
    const started = Date.now()
    try {
      const run = await json(base + '/api/runs', {
        environmentId: 'arena',
        goal,
        viewport: VISUAL_VIEWPORTS[id],
        budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
      })
      record.runId = run.runId
      for (;;) {
        const state = await json(`${base}/api/runs/${run.runId}`)
        if (!['queued', 'running'].includes(state.status) && !state.active) break
        if (Date.now() - started > 330000) {
          await json(`${base}/api/runs/${run.runId}/cancel`, {})
          throw Error('run-did-not-settle')
        }
        await pause(250)
      }
      record.report = await json(`${base}/api/runs/${run.runId}/report`)
      const downloaded = await downloadRunEvidence(base, record.report, resolve(dir, 'artifacts'))
      record.artifactIndex = downloaded.index
      const lines = (await readFile(resolve(directory, 'requests.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter((r) => r.run === id)
      const sentImages = lines
        .filter((r) => r.model === VISION_MODEL)
        .flatMap((r) =>
          r.body.messages
            .flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
            .filter((p: any) => p.type === 'image_url')
            .map((p: any) =>
              createHash('sha256')
                .update(Buffer.from(p.image_url.url.split(',')[1], 'base64'))
                .digest('hex'),
            ),
        )
      record.truth = await control('state')
      record.problems = visualSmokeProblems(id, record.report, downloaded.artifacts, sentImages)
      if (record.truth.orders.length !== 1 || record.truth.orders[0].status !== 'paid')
        record.problems.push('private-purchase-truth-mismatch')
      record.passed = record.problems.length === 0
      record.status = record.passed ? 'passed' : 'failed'
      await write(`${id}/report.json`, record.report)
      await write(`${id}/truth.json`, record.truth)
      await write(`${id}/artifact-index.json`, downloaded.index)
      await write(`${id}/sent-image-hashes.json`, sentImages)
    } catch (error) {
      record.status = 'failed'
      record.error = gateway.redact(String(error))
    } finally {
      record.requests = await gateway.end()
      record.elapsedMs = Date.now() - started
      await write(`${id}/record.json`, record)
      await write('spending.json', gateway.spending())
    }
    console.log(
      `${id}: ${record.status}; ${record.elapsedMs}ms; ${JSON.stringify(record.problems ?? record.error)}`,
    )
    const signature =
      record.problems?.includes('required-probe-missing') &&
      record.problems?.includes('visual-scope-unverified')
        ? 'visual-probe-unavailable'
        : JSON.stringify(record.problems ?? record.error)
    if (!record.passed) repeated.set(signature, (repeated.get(signature) ?? 0) + 1)
    if (
      record.error ||
      record.report?.status === 'cancelled' ||
      record.requests.some((r: any) => r.status !== 'success') ||
      (repeated.get(signature) ?? 0) >= 2 ||
      record.report?.inspectionIntegrity?.status === 'intervened'
    )
      break
  }
} catch (error) {
  failure = gateway.redact(String(error))
} finally {
  for (const p of children) await stop(p)
  try {
    audit = await auditStoppedGroup(
      env.DATABASE_URL,
      records.filter((r) => r.report),
      undefined,
    )
  } catch (error) {
    failure ??= gateway.redact(String(error))
  }
  await write('persistence-audit.json', audit ?? null)
  const passed = !failure && records.every((r) => r.passed) && (audit as any)?.passed === true
  await write('summary.json', {
    kind: 'visual-focus-p2-smoke',
    passed,
    failure,
    buildHash: build.hash,
    cases: records.map(({ report, artifactIndex, truth, requests, ...rest }) => ({
      ...rest,
      calls: requests?.length,
    })),
    spending: gateway.spending(),
    priorUsd,
    totalAccountedUsd: priorUsd + gateway.spending().accountedUsd,
    limitUsd,
  })
  await writeFile(resolve(directory, 'server.log'), logs)
  await gateway.close()
  console.log(`${passed ? 'PASS' : 'FAIL'}: ${directory}`)
  if (!passed) process.exitCode = 1
}
