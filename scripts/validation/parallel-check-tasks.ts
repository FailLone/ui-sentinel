/** Free local scripted model -> real Mastra tools -> ordinary API -> protected Chromium. */
import { createServer } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const out = resolve('data/parallel-check-tasks', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(out, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const listen = async (server: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
let scenario: 'parallel' | 'cancel' | 'failure' | 'boundary' | 'serial' = 'parallel'
let toolCalls: { scenario: string; name: string; args: unknown }[] = []
const pageRequests: { at: number; method: string; path: string }[] = []
const fixture = createServer(async (req, res) => {
  pageRequests.push({ at: Date.now(), method: req.method!, path: req.url! })
  await sleep(scenario === 'cancel' ? 700 : 300)
  res.setHeader('content-type', 'text/html')
  res.end(`<html><head><title>Independent context fixture</title></head><body>
<h1 id="target">loading</h1><button>Open details</button>
<script>const visits = Number(localStorage.getItem('visits') || 0) + 1;
localStorage.setItem('visits', String(visits));
document.querySelector('h1').textContent = 'visits=' + visits + ';width=' + innerWidth;
${scenario === 'boundary' ? "if(innerWidth === 320) { fetch('/write', {method:'POST'}).catch(()=>{}); fetch('http://127.0.0.1:9/private').catch(()=>{}); }" : ''}
</script></body></html>`)
})
const fixtureOrigin = await listen(fixture)
let submitted = 0,
  finishAttempted = false
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  const state = String(body.messages?.find((m: any) => m.role === 'user')?.content ?? '')
  let view: any = {}
  try {
    view = JSON.parse(state)
  } catch {}
  let action: { name: string; args: any } | undefined
  if (view.inspectionScope) {
    if (scenario !== 'serial' && submitted < 2) {
      const i = submitted++
      action = {
        name: 'check_task_submit',
        args: {
          version: 1,
          key: `child-${i}`,
          kind: 'element-measurement',
          purpose: `Measure independent viewport ${i}`,
          target: { selector: scenario === 'failure' && i === 0 ? '[' : '#target' },
          start: {
            url: fixtureOrigin + '/',
            viewport: { width: i ? 640 : 320, height: 480 },
            prerequisites: [],
          },
          publicFacts: [],
          evidenceRefs: [],
          permissions: { session: 'anonymous', writes: 'none', actions: 'none' },
          quota: { actions: 0, modelCalls: 0, reads: 2 },
          deadlineAt: view.checkTasks?.deadlineAt,
        },
      }
    } else if (
      scenario !== 'serial' &&
      view.checkTasks?.tasks?.some((t: any) => ['queued', 'running'].includes(t.status))
    ) {
      action = { name: 'check_task_wait', args: { waitMs: 1000 } }
    } else if (!finishAttempted) {
      finishAttempted = true
      action = { name: 'run_finish', args: { reason: 'scope-covered' } }
    } else action = { name: 'run_finish', args: { reason: 'unverified-scope' } }
  }
  if (action) {
    assert(
      body.tools.some((t: any) => t.function.name === action!.name),
      `tool exposed: ${action.name}`,
    )
    toolCalls.push({ scenario, ...action })
  }
  await sleep(60)
  const base = { id: randomUUID(), object: 'chat.completion.chunk', created: 1, model: body.model }
  res.setHeader('content-type', 'text/event-stream')
  const delta = action
    ? {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: randomUUID(),
            type: 'function',
            function: { name: action.name, arguments: JSON.stringify(action.args) },
          },
        ],
      }
    : { role: 'assistant', content: 'ok' }
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
  )
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: action ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`,
  )
  res.end('data: [DONE]\n\n')
})
const modelOrigin = await listen(model)
const portServer = createServer()
const base = await listen(portServer)
await new Promise<void>((r) => portServer.close(() => r()))
const serverPath = resolve(out, 'server.mjs')
await build({
  entryPoints: ['src/server/index.ts'],
  outfile: serverPath,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
})
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  PORT: new URL(base).port,
  DATABASE_URL: `file:${out}/runs.db`,
  AGENT_MODEL: 'openai/free-script',
  OPENAI_API_KEY: 'local-fixture-only',
  OPENAI_BASE_URL: `${modelOrigin}/v1`,
  VISION_MODEL: 'local-unused',
  VISION_API_KEY: 'local-fixture-only',
  VISION_BASE_URL: `${modelOrigin}/v1`,
  VISION_MODEL_FAMILY: 'qwen3',
  OPENROUTER_API_KEY: '',
  COMPLETION_REVIEW_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  GOOGLE_API_KEY: '',
  DOTENV_CONFIG_PATH: `${out}/absent.env`,
  EXECUTION_URL_SCAN: '1',
  EXECUTION_PARALLEL_CHECK_TASKS: '1',
  EXECUTION_BLOCKER_REVIEW: '0',
  URL_SCAN_TRUSTED_ORIGINS: fixtureOrigin,
  URL_SCAN_DNS_MODE: 'system',
  RUN_TOTAL_TIMEOUT_MS: '60000',
  RUN_MAX_ACTIONS: '12',
  RUN_MAX_MODEL_CALLS: '20',
  OTEL_SDK_DISABLED: 'true',
}
let child: ChildProcess | undefined,
  logs = ''
const launch = () => {
  child = spawn(process.execPath, [serverPath], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.on('data', (b) => {
    logs += b
  })
  child.stderr?.on('data', (b) => {
    logs += b
  })
}
const stop = async () => {
  if (!child || child.exitCode !== null) return
  const current = child
  await new Promise<void>((r) => {
    current.once('exit', () => r())
    current.kill('SIGTERM')
  })
}
const api = async (path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  })
  const value = (await response.json()) as any
  assert(response.ok, JSON.stringify(value))
  return value
}
const until = async (read: () => Promise<any>, done: (x: any) => boolean) => {
  for (let i = 0; i < 300; i++) {
    const value = await read()
    if (done(value)) return value
    await sleep(100)
  }
  throw Error('condition timed out')
}
const ready = () =>
  until(async () => {
    try {
      return await api('/api/health')
    } catch {
      return null
    }
  }, Boolean)
const create = () =>
  api('/api/runs', {
    kind: 'ui-scan',
    entryUrl: fixtureOrigin + '/',
    budget: { totalTimeoutMs: 60000, maxActions: 12, maxModelCalls: 20 },
  })
const settle = (id: string) =>
  until(
    () => api(`/api/runs/${id}`),
    (r) => !['queued', 'running'].includes(r.status) && !r.active,
  )
const reports: Record<string, any> = {}
try {
  launch()
  await ready()
  for (const name of ['parallel', 'failure', 'boundary', 'cancel'] as const) {
    scenario = name
    submitted = 0
    finishAttempted = false
    const run = await create()
    const id = run.runId
    assert(id, JSON.stringify(run))
    if (name === 'cancel') {
      await until(
        () => api(`/api/runs/${id}/report`),
        (r) => r.uiScan?.checkTasks?.tasks?.filter((t: any) => t.status === 'running').length === 2,
      )
      await api(`/api/runs/${id}/cancel`, {})
    }
    await settle(id)
    const report = await api(`/api/runs/${id}/report`)
    reports[name] = report
    await writeFile(`${out}/${name}-report.json`, JSON.stringify(report, null, 2))
    const tasks = report.uiScan?.checkTasks?.tasks
    assert.equal(tasks?.length, 2, `two tasks: ${name}`)
    assert.notEqual(
      report.uiScan.inspection.coverage,
      'covered',
      'child evidence cannot clear the original button obligation',
    )
    if (name === 'parallel') {
      assert(
        tasks.every((t: any) => t.status === 'completed'),
        JSON.stringify(tasks),
      )
      assert(
        Math.max(...tasks.map((t: any) => t.startedAt)) <
          Math.min(...tasks.map((t: any) => t.endedAt)),
        'actual execution intervals overlap',
      )
      const measurements = tasks.map((t: any) => t.result.measurements[0])
      assert(
        measurements.every((m: any) => m.value.elements[0].text.includes('visits=1;')),
        'localStorage is isolated',
      )
      assert(measurements[0].value.elements[0].text.includes('width=320'))
      assert(measurements[1].value.elements[0].text.includes('width=640'))
      assert.equal(new Set(tasks.flatMap((t: any) => t.result.evidenceRefs)).size, 4)
      for (const task of tasks)
        for (const ref of task.result.evidenceRefs) {
          const artifact = report.artifacts.find((a: any) => a.id === ref)
          assert(artifact.available && artifact.metadata.childTaskId === task.task.childTaskId)
          assert((await fetch(base + artifact.url)).ok)
        }
    }
    if (name === 'boundary') {
      assert.deepEqual(tasks.map((t: any) => t.status).sort(), ['completed', 'unverified'])
      assert(
        pageRequests.every((r) => r.method === 'GET'),
        'no child POST reaches the origin',
      )
    }
    if (name === 'failure')
      assert.deepEqual(tasks.map((t: any) => t.status).sort(), ['completed', 'failed'])
    if (name === 'cancel') assert(tasks.every((t: any) => t.status === 'cancelled'))
  }
  // Restart with the feature off: ordinary default path plus actual top-level queue serialization.
  await stop()
  env.EXECUTION_PARALLEL_CHECK_TASKS = '0'
  scenario = 'serial'
  submitted = 0
  finishAttempted = false
  launch()
  await ready()
  const a = await create(),
    b = await create()
  await settle(a.runId)
  await settle(b.runId)
  const ar = await api(`/api/runs/${a.runId}/report`),
    br = await api(`/api/runs/${b.runId}/report`)
  assert(!ar.uiScan.checkTasks && !br.uiScan.checkTasks)
  const { createClient } = await import('@libsql/client')
  const db = createClient({ url: env.DATABASE_URL! })
  const lifecycle = (
    await db.execute(
      "SELECT run_id,type,timestamp FROM run_events WHERE type IN ('run:started','run:completed') ORDER BY rowid",
    )
  ).rows
  const aEnd = lifecycle.findIndex((r) => r.run_id === a.runId && r.type === 'run:completed')
  const bStart = lifecycle.findIndex((r) => r.run_id === b.runId && r.type === 'run:started')
  assert(aEnd >= 0 && bStart > aEnd, JSON.stringify(lifecycle))
  const resourceRows = (
    await db.execute("SELECT payload FROM run_events WHERE type='check-task:resource-closed'")
  ).rows
  assert(resourceRows.length >= 6, 'every prepared child browser closes')
  assert(
    resourceRows.every((r) => {
      const p = JSON.parse(String(r.payload))
      return !p.browserConnected && p.pageClosed
    }),
    'closed workers release resources',
  )
  db.close()
  const summary = {
    paidRequests: 0,
    mastraToolCalls: toolCalls,
    overlap: reports.parallel.uiScan.checkTasks.tasks.map((t: any) => ({
      id: t.task.childTaskId,
      start: t.startedAt,
      end: t.endedAt,
      text: t.result.measurements[0].value.elements[0].text,
    })),
    parentCancel: true,
    originalNetworkBoundary: true,
    childFailure: true,
    evidenceIsolation: true,
    falseCoveredRefused: true,
    defaultSerial: true,
    pageRequests,
    output: out,
  }
  await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await stop()
  await writeFile(`${out}/server.log`, logs)
  await writeFile(`${out}/tool-calls.json`, JSON.stringify(toolCalls, null, 2))
  fixture.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
}
