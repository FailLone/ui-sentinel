// Persistent server + real arena + Mastra + Chromium; local deterministic model only.
// Run after pnpm build: pnpm exec tsx scripts/experiments/persistence-preflight.ts
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { resetAndVerify, controlRequest } from '../../evaluation/private/controller.ts'
import { evaluateRun } from '../../evaluation/private/evaluator.ts'

const dir = resolve('data/persistence-preflight', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const requests: any[] = []
// Replay the tool sequence from the failed acceptance, against a local deterministic provider.
// This checks API/storage integration, not model quality or discovery ability.
const click = (name: string) => ({
  name: 'page_act',
  args: {
    type: 'click',
    role: 'button',
    name,
    nth: 0,
    selector: null,
    visualDescription: null,
    value: null,
    url: null,
    scrollY: null,
  },
})
const sequences = [
  [
    click('Add to Cart'),
    { name: 'page_observe', args: {} },
    click('View Cart →'),
    click('Proceed to Checkout'),
    click('Pay Now'),
    { name: 'run_finish', args: { reason: 'scope-covered' } },
  ],
  [
    click('Add to Cart'),
    click('Add to Cart'),
    { name: 'journey_run', args: { journeyId: '', revision: '1' } },
    click('Pay Now'),
    { name: 'run_finish', args: { reason: 'scope-covered' } },
  ],
]
const reports: any[] = []
let sequence = 0
let trial = 0
const fixture = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(404)
    res.end('Local model provider only')
    return
  }
  let raw = ''
  for await (const chunk of req) raw += String(chunk)
  const body = JSON.parse(raw)
  const input = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  requests.push(input)
  const recorded = sequences[trial === 0 ? 0 : 1]![sequence++]
  if (!recorded) {
    res.writeHead(500)
    res.end('script exhausted')
    return
  }
  const name = recorded.name
  const args: any = { ...recorded.args }
  if (name === 'journey_run') args.journeyId = input.availableJourneys[0]?.id ?? args.journeyId
  await new Promise((r) => setTimeout(r, 1100))
  const call = {
    index: 0,
    id: `call-${randomUUID()}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  }
  const base = {
    id: 'fixture',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: body.model,
  }
  res.setHeader('content-type', 'text/event-stream')
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\n`,
  )
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`,
  )
  res.end('data: [DONE]\n\n')
})
await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${(fixture.address() as any).port}`
async function reservePort() {
  const reservation = createServer()
  await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r))
  const port = (reservation.address() as any).port
  await new Promise<void>((r) => reservation.close(() => r()))
  return port
}
const port = await reservePort()
const arenaPort = await reservePort()
const controlPort = await reservePort()
const arenaUrl = `http://127.0.0.1:${arenaPort}`
const arena = spawn(process.execPath, ['dist/arena/index.js'], {
  env: {
    ...process.env,
    ARENA_STATIC: '1',
    ARENA_PORT: String(arenaPort),
    ARENA_API_PORT: String(await reservePort()),
    ARENA_CONTROL_PORT: String(controlPort),
    ARENA_CONTROL_TOKEN: 'local-only',
  },
  stdio: 'ignore',
})
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['dist/server/index.js'], {
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${dir}/runs.db`,
    AGENT_MODEL: 'openai/deterministic-fixture',
    OPENAI_API_KEY: 'local-fixture-only',
    OPENAI_BASE_URL: url + '/v1',
    VISION_MODEL: 'local-unused',
    VISION_API_KEY: 'local-fixture-only',
    VISION_BASE_URL: url + '/v1',
    VISION_MODEL_FAMILY: 'qwen3',
    OPENROUTER_API_KEY: '',
    EXECUTION_ATOMIC_INVESTIGATION: '1',
    EXECUTION_EVIDENCE_ANALYSIS: '0',
    ARENA_URL: arenaUrl,
    ARENA_PORT: String(arenaPort),
    RUN_TOTAL_TIMEOUT_MS: '30000',
    RUN_MAX_MODEL_CALLS: '30',
    OTEL_SDK_DISABLED: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
server.stdout.on('data', (chunk) => {
  log += String(chunk)
})
server.stderr.on('data', (chunk) => {
  log += String(chunk)
})
const get = async (path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw Error(`API ${path}: ${response.status}`)
  return response.json() as Promise<any>
}
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if ((await get('/api/health')).model.ready) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!ready) throw Error('fixture server unavailable')
  Object.assign(process.env, {
    PORT: String(port),
    ARENA_PORT: String(arenaPort),
    ARENA_CONTROL_PORT: String(controlPort),
    ARENA_CONTROL_TOKEN: 'local-only',
    ARENA_URL: arenaUrl,
  })
  for (trial = 0; trial < 6; trial++) {
    sequence = 0
    await resetAndVerify('C0')
    const run = await get('/api/runs', {
      goal: 'Inspect the purchase journey. Purchase one item and finish.',
      entryUrl: arenaUrl,
      environmentId: 'arena',
      budget: { totalTimeoutMs: 30000, maxActions: 40, maxModelCalls: 30 },
    })
    let terminal = false
    for (let i = 0; i < 200; i++) {
      const state = await get(`/api/runs/${run.runId}`)
      if (!['queued', 'running'].includes(state.status) && !state.active) {
        terminal = true
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    if (!terminal) {
      await get(`/api/runs/${run.runId}/cancel`, {})
      throw Error('fixture did not stop')
    }
    const report = await get(`/api/runs/${run.runId}/report`)
    await writeFile(`${dir}/report-${trial}.json`, JSON.stringify(report, null, 2))
    const artifacts: any = {}
    for (const artifact of report.artifacts) {
      const response = await fetch(base + artifact.url)
      const bytes = new Uint8Array(await response.arrayBuffer())
      artifacts[artifact.id] = {
        type: artifact.type,
        exists: response.ok && artifact.available && bytes.length > 0,
        ...(artifact.type !== 'screenshot'
          ? { data: JSON.parse(Buffer.from(bytes).toString()) }
          : {}),
      }
    }
    const evidence = {
      fixtureValid: true,
      backend: await controlRequest('/__control/state'),
      artifacts,
      events: report.events,
      budget: report.budget,
      hypotheses: report.hypotheses,
    }
    const score = evaluateRun(report, 'C0', trial + 1, evidence)
    await writeFile(`${dir}/score-${trial}.json`, JSON.stringify(score, null, 2))
    reports.push(report)
    const health = await get('/api/health')
    const summary = {
      trial,
      status: report.status,
      events: report.events.length,
      artifacts: report.artifacts.length,
      health,
    }
    console.log(JSON.stringify({ dir, ...summary }))
    await writeFile(`${dir}/summary-${trial}.json`, JSON.stringify(summary, null, 2))
    if (
      !score.overallPass ||
      health.activeRuns ||
      health.queuedRuns ||
      !report.events.some((e: any) => e.type === 'run:completed')
    )
      throw Error('Persistence mismatch')
  }
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exit = new Promise<void>((r) => server.once('exit', () => r()))
    server.kill('SIGTERM')
    const kill = setTimeout(() => server.kill('SIGKILL'), 3000)
    await exit
    clearTimeout(kill)
  }
  if (arena.exitCode === null && arena.signalCode === null) {
    const stopped = new Promise<void>((r) => arena.once('exit', () => r()))
    arena.kill('SIGTERM')
    const kill = setTimeout(() => arena.kill('SIGKILL'), 3000)
    await stopped
    clearTimeout(kill)
  }
  fixture.closeAllConnections()
  await new Promise<void>((r) => fixture.close(() => r()))
  await writeFile(`${dir}/server.log`, log)
  await writeFile(`${dir}/requests.json`, JSON.stringify(requests, null, 2))
}

// Read the closed database with a separate SQLite engine, not the server's connection pool.
const db = new DatabaseSync(`${dir}/runs.db`, { readOnly: true })
try {
  const results = reports.map((report) => {
    const row = db
      .prepare('SELECT status,business_result,stop_reason FROM runs WHERE id=?')
      .get(report.runId)!
    const events = db
      .prepare('SELECT id,seq,type FROM run_events WHERE run_id=? ORDER BY seq')
      .all(report.runId)
    const artifacts = db
      .prepare('SELECT id FROM artifacts WHERE run_id=? ORDER BY id')
      .all(report.runId)
    const passed =
      row.status === report.status &&
      row.business_result === report.businessResult &&
      row.stop_reason === report.stopReason &&
      JSON.stringify(events) ===
        JSON.stringify(report.events.map((e: any) => ({ id: e.id, seq: e.seq, type: e.type }))) &&
      JSON.stringify(artifacts.map((a) => a.id)) ===
        JSON.stringify(report.artifacts.map((a: any) => a.id).sort())
    return { runId: report.runId, passed, events: events.length, artifacts: artifacts.length }
  })
  await writeFile(
    `${dir}/durability.json`,
    JSON.stringify({ paidModelRequests: 0, results }, null, 2),
  )
  if (results.length !== 6 || results.some((r) => !r.passed))
    throw Error('Report and durable database disagree')
  console.log(
    JSON.stringify({ directory: dir, runs: results.length, durable: true, paidModelRequests: 0 }),
  )
} finally {
  db.close()
}
