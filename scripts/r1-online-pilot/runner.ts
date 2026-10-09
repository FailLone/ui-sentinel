import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { build } from 'esbuild'
import { startGateway, AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from './batch.ts'
import { authorize, makeManifest, fixture, goal, POLICY, type Manifest } from './manifest.ts'
import { createControlledHost, digest } from '../../src/agent/exploration/integration/host.ts'
import { replyFor, jsonResponse } from '../r1-jev-real/test-support.ts'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import { checkPublishedPrice } from './preflight.ts'
import { evaluate } from './evaluate.ts'

const [mode, outputArg, ...args] = process.argv.slice(2)
if (!['--free', '--free-handoff', '--run'].includes(mode))
  throw Error('explicit-online-mode-required')
const free = mode !== '--run',
  output = resolve(outputArg)
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (
  !free &&
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim()
)
  throw Error('dirty-runtime-source')
const manifest: Manifest = free
  ? makeManifest(sourceSha)
  : JSON.parse(readFileSync(args[0], 'utf8'))
const approval = free ? null : JSON.parse(readFileSync(args[1], 'utf8'))
if (!free) authorize(manifest, approval, sourceSha)
if (existsSync(output)) throw Error('new-output-required')
const priceCheck = free ? { mode: 'fixed-only-no-price-http' } : await checkPublishedPrice()
const key = free ? 'fixed-not-a-real-key' : process.env.R1_ONLINE_API_KEY
if (!key || /[\r\n]/.test(key)) throw Error('online-credential-missing')
// Separate online claim namespace. Never accept or consume the old single-frame approval.
if (!free) {
  const claims = resolve(args[2] ?? '')
  if (!args[2]) throw Error('explicit-canonical-claim-directory-required')
  mkdirSync(claims, { recursive: true })
  writeFileSync(
    join(claims, digest(manifest) + '.claim'),
    JSON.stringify({ manifestHash: digest(manifest), output, approval }),
    { flag: 'wx', mode: 0o600, flush: true },
  )
}
mkdirSync(output, { recursive: false })
const save = (path: string, value: unknown) =>
  writeFileSync(join(output, path), JSON.stringify(value, null, 2) + '\n')
save('manifest.json', manifest)
if (approval) save('approval.json', approval)
save('price-check.json', priceCheck)
save('identity.json', {
  sourceSha,
  sourceDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
  node: process.version,
  free,
  manifestHash: digest(manifest),
  lockHash: digest(readFileSync('pnpm-lock.yaml', 'utf8')),
})
const session = await openCampaignSession(join(output, 'account'), String(POLICY.batchMaxUsd))
const batch = createBatch(session.ledger, manifest, output)
const token = randomBytes(24).toString('hex')
let current: Manifest['rows'][number] | undefined,
  actualRunId = '',
  api = '',
  child: ReturnType<typeof spawn> | undefined
let fakeHost = createControlledHost({ onlinePolicy: true })
const results: any[] = [],
  fixtureRequests: any[] = []
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
const fixtureServer = createServer((req, res) => {
  fixtureRequests.push({ row: current?.id, method: req.method, path: req.url })
  if (!current || req.method !== 'GET' || !['/', '/favicon.ico'].includes(req.url ?? '')) {
    res.writeHead(403).end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' }).end(fixture(current.scenario))
})
const origin = await listen(fixtureServer)
const fake: typeof fetch = async (url, init) => {
  const body = JSON.parse(String(init?.body))
  if (String(url).endsWith('/decisions')) {
    const response: any = replyFor(body)
    response.usage.cost = 0
    if (mode === '--free-handoff')
      response.answers.readiness = {
        type: 'choice',
        choice: 'requires-agent-investigation',
        confidence: 1,
        probabilities: {
          scoreable: 0,
          'insufficient-information': 0,
          'requires-agent-investigation': 1,
        },
      }
    return jsonResponse(response)
  }
  const input = JSON.parse(body.messages.filter((m: any) => m.role === 'user').at(-1).content)
  const decision = input.explorationHandoff
    ? null
    : await fakeHost.decide(input, {
        signal: new AbortController().signal,
        version: { key: 'fixed-agent', reusable: true, reason: 'free-only' },
      })
  const call =
    decision?.kind === 'tool'
      ? { name: decision.tool, arguments: JSON.stringify(decision.args) }
      : { name: 'run_finish', arguments: JSON.stringify({ reason: 'unverified-scope' }) }
  const chunk = {
    id: 'free-response',
    model: AGENT_MODEL,
    provider: 'Wafer',
    created: 1,
    object: 'chat.completion.chunk',
  }
  return new Response(
    `data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: randomBytes(8).toString('hex'), type: 'function', function: call }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } })}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
const service: typeof fetch = free ? fake : fetch
const upstream: typeof fetch = async (url, init) => {
  try {
    const response = await service(url, { ...init, redirect: 'error' })
    if (String(url).endsWith('/chat/completions')) {
      // Inspect the bounded complete response before SDK tools can execute. Original gateway still audits/settles it.
      const raw = await response.clone().text()
      let events: any[] = []
      try {
        events = raw.startsWith('data:')
          ? raw
              .split('\n')
              .filter((l) => l.startsWith('data:') && l.slice(5).trim() !== '[DONE]')
              .map((l) => JSON.parse(l.slice(5)))
          : [JSON.parse(raw)]
      } catch {}
      if (
        !response.ok ||
        events.some((e) => e.error) ||
        events.some((e) => e.provider && e.provider !== 'Wafer') ||
        events.some(
          (e) =>
            e.model && ![AGENT_MODEL, 'deepseek/deepseek-v4.1-flash-20260910'].includes(e.model),
        )
      )
        batch.stop('agent-provider-or-response-error')
    }
    return response
  } catch (error) {
    batch.stop('upstream-transport-error')
    throw error
  }
}
const gateway = await startGateway(key, output, upstream, {
  limitUsd: POLICY.batchMaxUsd,
  estimateCost: batch.estimate,
  ledger: batch.ledger,
  providers: { agent: POLICY.agent.provider, vision: 'disabled' },
  phase: 'r1-online-pilot-1',
})
const broker = createServer(async (req, res) => {
  const reply = (status: number, value: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
  }
  if (req.headers.authorization !== `Bearer ${token}` || req.method !== 'POST')
    return reply(403, {})
  const cancel = new AbortController()
  res.once('close', () => {
    if (!res.writableEnded) cancel.abort()
  })
  try {
    batch.guard()
    let raw = ''
    for await (const b of req) {
      raw += b
      if (Buffer.byteLength(raw) > 65536) throw Error('broker-input-bound')
    }
    const value = JSON.parse(raw)
    if (!actualRunId || value.runId !== actualRunId) throw Error('parent-run-mismatch')
    if (req.url === '/guard') return reply(200, { ok: true })
    if (req.url !== '/score') return reply(404, {})
    const scored = await batch.score(value.body, actualRunId, cancel.signal, key, upstream)
    reply(200, scored)
  } catch {
    reply(409, { error: 'online-request-stopped' })
  }
})
const brokerUrl = await listen(broker)
batch.signal.addEventListener('abort', () => {
  if (api && actualRunId)
    void fetch(`${api}/api/runs/${actualRunId}/cancel`, { method: 'POST' }).catch(() => {})
})
try {
  const rows =
    free && args.length ? manifest.rows.filter((r) => args.includes(r.id)) : manifest.rows
  if (!rows.length) throw Error('no-requested-row')
  for (current of rows) {
    batch.guard()
    actualRunId = ''
    fakeHost = createControlledHost({ onlinePolicy: true })
    const rowDir = join(output, current.id)
    mkdirSync(rowDir)
    const portServer = createServer()
    api = await listen(portServer)
    await new Promise<void>((r) => portServer.close(() => r()))
    const entry = join(rowDir, 'server.mjs')
    await build({
      entryPoints: ['scripts/r1-online-pilot/server-entry.ts'],
      outfile: entry,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      sourcemap: true,
    })
    const logs: string[] = []
    child = spawn(process.execPath, [entry], {
      cwd: rowDir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PORT: new URL(api).port,
        DATABASE_URL: 'file:' + join(rowDir, 'runs.db'),
        R1_ONLINE_MODE: current.mode,
        R1_ONLINE_BROKER: brokerUrl,
        R1_ONLINE_TOKEN: token,
        AGENT_MODEL: 'openai/' + AGENT_MODEL,
        OPENAI_BASE_URL: gateway.url,
        OPENAI_API_KEY: gateway.token,
        VISION_MODEL,
        VISION_BASE_URL: gateway.url,
        VISION_API_KEY: gateway.token,
        VISION_MODEL_FAMILY: 'qwen3',
        EXECUTION_URL_SCAN: '1',
        URL_SCAN_TRUSTED_ORIGINS: origin,
        EXECUTION_BLOCKER_REVIEW: '0',
        EXECUTION_VISUAL_DISCOVERY: '0',
        EXECUTION_JOURNEYS: '0',
        EXECUTION_ATOMIC_INVESTIGATION: '1',
        EXECUTION_OBSERVATION_REUSE: '1',
        EXECUTION_RULE_ROUTING: '1',
        OTEL_SDK_DISABLED: 'true',
        EXECUTION_MODEL_STREAMING: '1',
        EXECUTION_SHORT_FINISH: '1',
        MODEL_REQUEST_MAX_RETRIES: '0',
        RUN_TOTAL_TIMEOUT_MS: String(POLICY.totalTimeoutMs),
        RUN_MAX_ACTIONS: String(POLICY.actions),
        RUN_MAX_MODEL_CALLS: String(POLICY.modelCalls),
        TOOL_TIMEOUT_MS: String(POLICY.toolMs),
        MODEL_REQUEST_TIMEOUT_MS: String(POLICY.modelMs),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    child.on('message', (m: any) => {
      if (m.type !== 'run-registered' || actualRunId) {
        batch.stop('run-registration-invalid')
        return
      }
      actualRunId = m.runId
      try {
        batch.activate(current!, actualRunId, origin)
        gateway.begin(actualRunId, POLICY.agent.perRunRequests, POLICY.totalTimeoutMs)
      } catch {
        batch.stop('run-registration-failed')
      }
    })
    child.stdout!.on('data', (b) => logs.push(String(b)))
    child.stderr!.on('data', (b) => logs.push(String(b)))
    try {
      for (let n = 0; n < 100; n++) {
        if (
          await fetch(api + '/api/health')
            .then((r) => r.ok)
            .catch(() => false)
        )
          break
        if (n === 99) throw Error('api-start-failed')
        await new Promise((r) => setTimeout(r, 100))
      }
      const start = Date.now()
      const created: any = await fetch(api + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'ui-scan',
          entryUrl: origin + '/',
          goal: goal(current.scenario),
          budget: {
            maxActions: POLICY.actions,
            maxModelCalls: POLICY.modelCalls,
            totalTimeoutMs: POLICY.totalTimeoutMs,
          },
        }),
      }).then((r) => r.json())
      if (!created.runId) throw Error('run-create-failed')
      let report: any
      for (let n = 0; n < 1900; n++) {
        const s: any = await fetch(`${api}/api/runs/${created.runId}`).then((r) => r.json())
        if (!['queued', 'running'].includes(s.status) && !s.active) {
          report = await fetch(`${api}/api/runs/${created.runId}/report`).then((r) => r.json())
          break
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      if (!report?.uiScan || actualRunId !== report.runId) throw Error('run-report-binding')
      save(current.id + '/report.json', report)
      mkdirSync(join(rowDir, 'evidence'))
      const evidence: any[] = []
      for (const a of report.artifacts) {
        const r = await fetch(
          `${api}/api/runs/${report.runId}/artifacts/${encodeURIComponent(a.id)}`,
        )
        if (!r.ok) throw Error('missing-report-artifact')
        const b = Buffer.from(await r.arrayBuffer()),
          path = current.id + '/evidence/' + encodeURIComponent(a.id)
        writeFileSync(join(output, path), b)
        evidence.push({ id: a.id, path, bytes: b.length, sha256: sha256(b) })
      }
      save(current.id + '/evidence-index.json', evidence)
      const evaluation = evaluate(report, current.scenario, new Set(evidence.map((e) => e.id)))
      save(current.id + '/evaluation.json', evaluation)
      const requests = await gateway.end()
      const events = report.events,
        counts = report.uiScan.checkCounts
      const measured = events.filter((e: any) =>
        ['interaction:generic-collected-v2', 'interaction:effect-measured-v2'].includes(e.type),
      )
      const first = measured[0]
      const result = {
        row: current.id,
        scenario: current.scenario,
        mode: current.mode,
        runId: report.runId,
        status: report.status,
        checkCounts: counts,
        coverage: report.uiScan.inspection.counts,
        findings: report.findings.length,
        actions: report.usage.actions,
        mainRequests: requests.length,
        elapsedMs: Date.now() - start,
        firstMeasuredSeq: first?.seq ?? null,
        firstMeasuredAt: first?.timestamp ?? null,
        reads: events.filter(
          (e: any) =>
            e.type === 'tool:started' &&
            ['page_inspect', 'page_observe', 'element_details'].includes(e.payload.tool),
        ).length,
        handoffs: events.filter((e: any) => e.type === 'r1:handoff').length,
        defectExpected: current.scenario !== 'semantic',
        reference: 'fixture behavior; no unique rank label; development evaluation',
        quality: report.status === 'completed' ? 'concluded' : 'partial-not-pass-or-loss',
        realModels: !free,
      }
      results.push(result)
      save('results.json', results)
      console.log(JSON.stringify(result))
      const targets = events
        .filter((e: any) => e.type === 'action:executing')
        .map((e: any) => e.payload.target)
      if (
        new Set(targets).size !== targets.length ||
        report.inspectionIntegrity?.status === 'dirty'
      )
        batch.stop('safety-or-repeat')
      if (!evaluation.persistenceVerified) batch.stop('persistence')
      if (evaluation.falseSuccess) batch.stop('false-success')
      if (['execution-error', 'interrupted'].includes(report.status)) batch.stop('execution-error')
      for (const request of requests)
        if (
          request.status !== 'success' ||
          (request.actualModel &&
            ![AGENT_MODEL, 'deepseek/deepseek-v4.1-flash-20260910'].includes(
              request.actualModel,
            )) ||
          request.provider !== 'Wafer'
        )
          batch.stop('provider-or-transport-error')
    } finally {
      await gateway.end()
      batch.end()
      if (child) {
        child.kill('SIGTERM')
        await new Promise((r) => child!.once('exit', r))
        child = undefined
      }
      writeFileSync(
        join(rowDir, 'server.log'),
        gateway.redact(logs.join('')).split(token).join('[broker-token]'),
      )
    }
  }
  batch.guard()
} catch (error) {
  batch.stop('runner-failure')
  save('failure.json', { error: String(error).split(key).join('[REDACTED]'), noRetry: true })
  process.exitCode = 1
} finally {
  child?.kill('SIGTERM')
  await gateway.close()
  await batch.drain()
  await new Promise<void>((r) => broker.close(() => r()))
  await new Promise<void>((r) => fixtureServer.close(() => r()))
  save('fixture-requests.json', fixtureRequests)
  const entries = await session.ledger.entries()
  save('accounting.json', {
    spending: await session.ledger.spending(),
    requests: entries,
    stop: await session.ledger.stopState(),
    batch: batch.status(),
    free,
  })
  await session.close()
  save('result-summary.json', {
    completedRows: results.length,
    expectedRows: free && args.length ? args.length : 9,
    free,
    realRequests: free ? 0 : entries.filter((e) => e.status !== 'released').length,
    note: 'Shared account covers Agent + Jev; no quality conclusion from fixed services.',
  })
  // Curated evidence is indexed separately; do not seal databases/build trees as required attachments.
}
