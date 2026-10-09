/** Explicitly authorized normal-product acceptance. --free uses a local partial-only provider; no real credentials. */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import { digest } from '../../src/agent/exploration/integration/host.ts'
import { startGateway, AGENT_MODEL } from '../../evaluation/support/model-gateway.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from '../r1-online-pilot/batch.ts'
import { checkPublishedPrice } from '../r1-online-pilot/preflight.ts'
import { createContinuation, combinedSpending } from '../r1-online-pilot/continuation.ts'
import { bindRunCancellation } from '../r1-online-pilot/lifecycle.ts'
import {
  makeProductManifest,
  authorizeProduct,
  LIMITS,
  documentFor,
  goal,
  type ProductManifest,
} from './manifest.ts'
import { fixtures, fixtureAt, pathFor } from './fixtures.ts'
const [mode, path, ...args] = process.argv.slice(2)
if (!['--free', '--run', '--freeze'].includes(mode))
  throw Error('explicit-product-acceptance-mode-required')
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const output = resolve(path)
if (mode === '--freeze') {
  writeFileSync(output, JSON.stringify(makeProductManifest(sha), null, 2) + '\n', { flag: 'wx' })
  console.log(
    JSON.stringify({ sourceSha: sha, manifestHash: digest(makeProductManifest(sha)), ...LIMITS }),
  )
  process.exit(0)
}
const free = mode === '--free'
const manifest: ProductManifest = free
  ? makeProductManifest(sha)
  : JSON.parse(readFileSync(args[0], 'utf8'))
const continuation = free
  ? undefined
  : createContinuation(digest(manifest), resolve(args[2] ?? ''), output)
let key = 'fixed-only-never-real',
  priceCheck: unknown = { mode: 'free' },
  approval: unknown
if (!free) {
  if (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8',
    }).trim()
  )
    throw Error('dirty-runtime-source')
  approval = JSON.parse(readFileSync(args[1], 'utf8'))
  authorizeProduct(manifest, approval, sha)
  continuation!.preflight()
  priceCheck = await checkPublishedPrice()
  key = process.env.R1_ONLINE_API_KEY ?? ''
  if (!key) throw Error('explicit-credential-required')
  if (existsSync(output)) throw Error('new-output-required')
  continuation!.claim()
} else if (existsSync(output)) throw Error('new-output-required')
mkdirSync(output, { recursive: true })
const save = (p: string, v: unknown) =>
  writeFileSync(join(output, p), JSON.stringify(v, null, 2) + '\n')
save('manifest.json', manifest)
save('price-check.json', priceCheck)
if (approval) save('approval.json', approval)
const session = await openCampaignSession(join(output, 'account'), String(LIMITS.maxCostUsd))
const batch = createBatch(
  session.ledger,
  manifest,
  output,
  undefined,
  () => continuation?.guard(),
  { mainRequests: LIMITS.mainRequests, jevRequests: 0, windowMs: LIMITS.windowMs },
)
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
const fixtureRequests: any[] = [],
  results: any[] = []
const fixture = createServer((req, res) => {
  fixtureRequests.push({ method: req.method, url: req.url })
  const name = fixtureAt(req.url ?? '')
  if (req.method !== 'GET' || !name) {
    res.writeHead(req.url === '/favicon.ico' ? 204 : 403).end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' }).end(documentFor(name))
})
const origin = await listen(fixture)
const fake: typeof fetch = async (_url, init) => {
  const chunk = {
    id: 'fixed',
    model: AGENT_MODEL,
    provider: 'Wafer',
    object: 'chat.completion.chunk',
    created: 1,
  }
  return new Response(
    `data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'partial', type: 'function', function: { name: 'run_finish', arguments: JSON.stringify({ reason: 'unverified-scope' }) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } })}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
const upstream: typeof fetch = async (url, init) => {
  batch.auditWire(String(url), String(init?.body))
  try {
    const r = await (free ? fake : fetch)(url, { ...init, redirect: 'error' })
    if (!r.ok) {
      batch.stop('provider-http-error')
      return r
    }
    const raw = await r.clone().text()
    const chunks = raw
      .split('\n')
      .filter((l) => l.startsWith('data:') && l.slice(5).trim() !== '[DONE]')
      .map((l) => JSON.parse(l.slice(5)))
    if (
      !chunks.length ||
      chunks.some(
        (e) =>
          e.error ||
          (e.provider && e.provider !== 'Wafer') ||
          (e.model && ![AGENT_MODEL, 'deepseek/deepseek-v4.1-flash-20260910'].includes(e.model)),
      )
    )
      batch.stop('provider-response-error')
    return r
  } catch (e) {
    batch.stop('transport-error')
    throw e
  }
}
const gateway = await startGateway(key, output, upstream, {
  limitUsd: LIMITS.maxCostUsd,
  estimateCost: batch.estimate,
  ledger: batch.ledger,
  providers: { agent: 'Wafer', vision: 'disabled' },
  phase: manifest.version,
})
let api = '',
  runId = '',
  child: ReturnType<typeof spawn> | undefined
const unbind = bindRunCancellation(batch.signal, () => ({ api, runId }))
try {
  const entry = join(output, 'server.mjs')
  await build({
    entryPoints: ['src/server/index.ts'],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  })
  const rows =
    free && args.length ? manifest.rows.filter((r) => args.includes(r.id)) : manifest.rows
  if (!rows.length) throw Error('no-requested-row')
  for (const row of rows) {
    batch.guard()
    runId = ''
    const dir = join(output, row.id)
    mkdirSync(dir)
    const port = createServer()
    api = await listen(port)
    await new Promise<void>((r) => port.close(() => r()))
    // Campaign runId names a predeclared row; run-binding.json links it to the actual API-created run.
    const accountRun = 'product-row:' + row.id
    batch.activate(row, accountRun, origin)
    gateway.begin(accountRun, 8, LIMITS.totalTimeoutMs)
    const logs: string[] = []
    writeFileSync(join(dir, 'empty.env'), '')
    child = spawn(process.execPath, [entry], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOTENV_CONFIG_PATH: join(dir, 'empty.env'),
        PORT: new URL(api).port,
        DATABASE_URL: 'file:' + join(dir, 'runs.db'),
        AGENT_MODEL: 'openai/' + AGENT_MODEL,
        OPENAI_BASE_URL: gateway.url,
        OPENAI_API_KEY: gateway.token,
        VISION_MODEL: 'qwen/disabled',
        VISION_BASE_URL: gateway.url,
        VISION_API_KEY: gateway.token,
        VISION_MODEL_FAMILY: 'qwen3',
        EXECUTION_URL_SCAN: '1',
        URL_SCAN_DNS_MODE: 'system',
        URL_SCAN_TRUSTED_ORIGINS: origin,
        EXECUTION_BLOCKER_REVIEW: '0',
        EXECUTION_VISUAL_DISCOVERY: '0',
        EXECUTION_JOURNEYS: '0',
        EXECUTION_MODEL_STREAMING: '1',
        MODEL_REQUEST_MAX_RETRIES: '0',
        RUN_TOTAL_TIMEOUT_MS: String(LIMITS.totalTimeoutMs),
        RUN_MAX_MODEL_CALLS: '8',
        RUN_MAX_ACTIONS: '6',
        MODEL_REQUEST_TIMEOUT_MS: String(LIMITS.modelMs),
        TOOL_TIMEOUT_MS: String(LIMITS.toolMs),
        OTEL_SDK_DISABLED: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (b) => logs.push(String(b)))
    child.stderr!.on('data', (b) => logs.push(String(b)))
    const exited = new Promise((r) => child!.once('exit', r))
    try {
      for (let i = 0; i < 100; i++) {
        if (
          await fetch(api + '/api/health')
            .then((r) => r.ok)
            .catch(() => false)
        )
          break
        if (i === 99) throw Error('startup')
        await new Promise((r) => setTimeout(r, 100))
      }
      const request = {
        kind: 'ui-scan',
        entryUrl: origin + pathFor(row.scenario),
        goal: goal(row.scenario),
        exploration: { mode: 'program', jev: false },
        budget: {
          maxActions: row.maxActions,
          maxModelCalls: 8,
          totalTimeoutMs: LIMITS.totalTimeoutMs,
        },
      }
      save(row.id + '/request.json', request)
      const created: any = await fetch(api + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }).then((r) => r.json())
      if (!created.runId) throw Error('create-run')
      runId = created.runId
      save(row.id + '/run-binding.json', {
        accountRun,
        runId,
        row: row.id,
        manifestHash: digest(manifest),
      })
      let report: any
      for (let i = 0; i < 1900; i++) {
        const current: any = await fetch(api + `/api/runs/${runId}`).then((r) => r.json())
        if (!['running', 'queued'].includes(current.status) && !current.active) {
          report = await fetch(api + `/api/runs/${runId}/report`).then((r) => r.json())
          if (!['running', 'queued'].includes(report.status)) break
        }
        if (i === 1899) throw Error('timeout')
        await new Promise((r) => setTimeout(r, 100))
      }
      save(row.id + '/report.json', report)
      mkdirSync(join(dir, 'evidence'))
      const evidence: any[] = []
      for (const a of report.artifacts) {
        const r = await fetch(api + `/api/runs/${runId}/artifacts/${encodeURIComponent(a.id)}`)
        if (!r.ok) throw Error('missing-artifact')
        const bytes = Buffer.from(await r.arrayBuffer())
        writeFileSync(join(dir, 'evidence', encodeURIComponent(a.id)), bytes)
        evidence.push({
          id: a.id,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        })
      }
      save(row.id + '/evidence-index.json', evidence)
      const requests = await gateway.end(),
        exp = report.uiScan?.exploration
      const productCheck = await import('./evaluate.ts')
      const evaluation = productCheck.evaluateProduct(
        report,
        row.scenario,
        new Set(evidence.map((e) => e.id)),
      )
      results.push({
        row: row.id,
        runId,
        status: report.status,
        actions: report.usage.actions,
        modelRequests: requests.length,
        jevRequests: exp?.usage.jevCalls,
        evaluation,
      })
      save('results.json', results)
      console.log(JSON.stringify(results.at(-1)))
      if (!evaluation.integrity || evaluation.falseCovered)
        batch.stop('persistence-or-false-covered')
      if (['execution-error', 'interrupted'].includes(report.status)) batch.stop('execution-error')
      if (requests.some((r) => r.status !== 'success' || r.provider !== 'Wafer'))
        batch.stop('provider-request-failed')
    } finally {
      await gateway.end()
      batch.end()
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => child?.kill('SIGKILL'), 5000)
      await exited
      clearTimeout(killTimer)
      child = undefined
      writeFileSync(join(dir, 'server.log'), gateway.redact(logs.join('')))
    }
  }
  batch.guard()
} catch (e) {
  batch.stop('runner-failed')
  save('failure.json', { error: gateway.redact(String(e)), noRetry: true })
  process.exitCode = 1
} finally {
  child?.kill('SIGTERM')
  await gateway.close()
  await batch.drain()
  batch.dispose()
  unbind()
  fixture.close()
  save('summary.json', {
    sourceSha: sha,
    manifestHash: digest(manifest),
    completedRows: results.length,
    fullRealAcceptancePassed:
      !free &&
      results.length === LIMITS.runs &&
      results.every((r) => r.evaluation.passed) &&
      !batch.status().stopped,
    realModels: !free,
    oldNineAnd72Replaced: false,
  })
  save('fixture-requests.json', fixtureRequests)
  const spending = await session.ledger.spending()
  save('accounting.json', {
    spending,
    ...(continuation ? { combined: combinedSpending(spending) } : {}),
    entries: await session.ledger.entries(),
    status: batch.status(),
    realModels: !free,
  })
  await session.close()
}
