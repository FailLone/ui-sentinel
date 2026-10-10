/** Free local scripted model -> real Mastra tools -> ordinary API -> protected Chromium. */
import { createServer } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const out = resolve('data/parallel-popup-product', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(out, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const listen = async (server: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
let scenario:
  | 'parallel'
  | 'cancel'
  | 'failure'
  | 'boundary'
  | 'wrong'
  | 'ambiguous'
  | 'budget'
  | 'serial' = 'parallel'
let toolCalls: { scenario: string; name: string; args: unknown }[] = []
const pageRequests: { at: number; method: string; path: string }[] = []
const fixture = createServer(async (req, res) => {
  pageRequests.push({ at: Date.now(), method: req.method!, path: req.url! })
  await sleep(scenario === 'cancel' ? 700 : 300)
  res.setHeader('content-type', 'text/html')
  res.end(`<!doctype html><html><head><title>Parallel popup fixture</title><style>dialog{position:fixed} [hidden]{display:none!important}</style></head><body>
<script>localStorage.visits=String(Number(localStorage.visits||0)+1);window.localClicks=0;</script><h1>Independent dialog</h1><button>Sort alphabetically</button><button>Change density</button>
<button onclick="${scenario === 'wrong' ? "document.querySelector('output').textContent='No popup'" : scenario === 'ambiguous' ? "document.querySelectorAll('section').forEach(n=>n.hidden=false)" : "document.querySelector('dialog').textContent='visits='+localStorage.visits+';clicks='+(++window.localClicks)+';width='+innerWidth;document.querySelector('dialog').showModal()"}">Open details</button>
<output></output><dialog style="left:20px;top:80px;margin:0;max-width:none;width:400px;height:100px;box-sizing:border-box">Content</dialog>
${scenario === 'ambiguous' ? '<section hidden style="position:fixed;left:10px;top:150px;width:120px;height:120px">First panel</section><section hidden style="position:fixed;left:150px;top:150px;width:120px;height:120px">Second panel</section>' : ''}
</body></html>`)
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
    if (
      scenario !== 'serial' &&
      (submitted < 2 ||
        (scenario === 'budget' &&
          view.checkTasks?.tasks?.length === 1 &&
          view.checkTasks.tasks[0].status !== 'running'))
    ) {
      const i = Math.min(submitted++, 1)
      action = {
        name: 'check_task_submit',
        args: {
          version: 1,
          key: `child-${i}`,
          kind: 'popup-viewport',
          purpose: `Check popup viewport; ${scenario}; viewport ${i}`,

          start: {
            url: fixtureOrigin + '/',
            viewport: { width: i ? 640 : 320, height: 480 },
            prerequisites: [],
          },
          publicFacts: [],
          evidenceRefs: [],
          permissions: { session: 'anonymous', writes: 'none', actions: 'local-ui' },
          quota: {
            actions: scenario === 'budget' && submitted > 2 ? 1 : 2,
            modelCalls: 3,
            reads: 2,
          },
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
const wrapper = resolve(out, 'entry.ts')
await writeFile(
  wrapper,
  `import { installPopupDecision } from ${JSON.stringify(resolve('src/agent/popup/contract.ts'))};
import { appendEvent } from ${JSON.stringify(resolve('src/execution/run-manager.ts'))};
installPopupDecision((runId) => async (packet, signal) => {
  await appendEvent(runId, 'fixture:jev-started', { stage: packet.stage, at: Date.now() });
  try {
  await new Promise(r => setTimeout(r, packet.goal.includes('cancel') ? 3000 : 450));
  signal.throwIfAborted();
  if (packet.goal.includes('failure') && packet.goal.includes('viewport 0')) throw Error('fixed child decision failure');
  const candidate = packet.stage === 'target' ? undefined : packet.candidates.find(c => /Open details/.test(c.description));
  return { binding: packet.binding, choice: candidate?.id ?? 'handoff', confidence: 1 };
  } finally { await appendEvent(runId, 'fixture:jev-finished', { stage: packet.stage, at: Date.now() }); }
});
await import(${JSON.stringify(resolve('src/server/index.ts'))});`,
)

await build({
  entryPoints: [wrapper],
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
  EXECUTION_POPUP_JEV: '1',
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
const until = async (read: () => Promise<any>, done: (x: any) => boolean | Promise<boolean>) => {
  for (let i = 0; i < 300; i++) {
    const value = await read()
    if (await done(value)) return value
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
    ...(scenario !== 'serial' ? { popupCheck: { mode: 'popup-viewport' } } : {}),
    entryUrl: fixtureOrigin + '/',
    budget: {
      totalTimeoutMs: 60000,
      maxActions: scenario === 'budget' ? 2 : 12,
      maxModelCalls: 20,
    },
  })
const settle = (id: string) =>
  until(
    () => api(`/api/runs/${id}`),
    (r) => !['queued', 'running'].includes(r.status) && !r.active,
  )
const reports: Record<string, any> = {}
const runtimeProof: Record<string, any> = {}
try {
  launch()
  await ready()
  for (const name of ['parallel', 'wrong', 'ambiguous', 'failure', 'budget', 'cancel'] as const) {
    scenario = name
    submitted = 0
    finishAttempted = false
    const run = await create()
    const id = run.runId
    assert(id, JSON.stringify(run))
    if (name === 'cancel') {
      await until(
        () => api(`/api/runs/${id}/report`),
        async (r) => {
          const running =
            r.uiScan?.checkTasks?.tasks?.filter((t: any) => t.status === 'running') ?? []
          if (running.length !== 2) return false
          const childRows = await Promise.all(
            running.map((t: any) => api(`/api/runs/${t.execution.runId}`).catch(() => null)),
          )
          return childRows.every((row) => row?.usage?.modelCalls >= 1)
        },
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
    const children = await Promise.all(tasks.map((t: any) => api(t.execution.reportUrl)))
    const windows = children.map((c: any) => ({
      runId: c.runId,
      actions: c.events.filter((e: any) =>
        ['action:executing', 'action:completed'].includes(e.type),
      ),
      jev: c.events.filter((e: any) =>
        ['fixture:jev-started', 'fixture:jev-finished'].includes(e.type),
      ),
      closed: c.events.find((e: any) => e.type === 'run:delegated-resource-closed'),
      completed: c.events.find((e: any) => e.type === 'run:completed'),
    }))
    const parentCompleted = report.events.find((e: any) => e.type === 'run:completed')
    for (const c of windows) {
      assert.equal(c.closed?.payload.closed, true, 'actual child browser closed')
      assert(c.closed.seq < c.completed.seq, 'browser closes before child commit')
      assert(
        c.completed.timestamp <= parentCompleted.timestamp,
        'child commit before parent commit',
      )
    }
    const mainCalls = report.events.filter((e: any) => e.type === 'model:request-started').length
    const jevCalls = windows.reduce(
      (n: number, c: any) => n + c.jev.filter((e: any) => e.type === 'fixture:jev-started').length,
      0,
    )
    assert.equal(
      report.usage.modelCalls,
      mainCalls + jevCalls,
      'parent counts original main and child calls',
    )
    assert.equal(
      report.usage.actions,
      children.reduce((n: number, c: any) => n + c.usage.actions, 0),
    )
    if (name === 'parallel') {
      const starts = windows.map(
        (c: any) => c.jev.find((e: any) => e.type === 'fixture:jev-started').payload.at,
      )
      const ends = windows.map(
        (c: any) => c.jev.find((e: any) => e.type === 'fixture:jev-finished').payload.at,
      )
      assert(Math.max(...starts) < Math.min(...ends), 'actual child Jev intervals overlap')
    }
    runtimeProof[name] = { parentRunId: id, mainCalls, jevCalls, usage: report.usage, windows }
    if (name === 'parallel' || name === 'budget') {
      assert.deepEqual(
        tasks.map((t: any) => t.status),
        ['defect', 'completed'],
        JSON.stringify(tasks),
      )
      if (name === 'parallel')
        assert(
          Math.max(...tasks.map((t: any) => t.startedAt)) <
            Math.min(...tasks.map((t: any) => t.endedAt)),
          'overlap',
        )
      for (const t of tasks) {
        assert(
          t.result.original.popup.attempts.some((a: any) => a.actionId),
          'original action exists',
        )
        const cr = await api(t.execution.reportUrl)
        assert(cr.events.some((e: any) => e.type === 'action:completed'))
        assert.equal(cr.persistence.status, 'verified')
        assert.equal(t.usage.actions, 1)
        assert.equal(t.usage.modelCalls, 1)
      }
      assert.notEqual(tasks[0].execution.runId, tasks[1].execution.runId)
      assert.notEqual(
        tasks[0].result.measurements[0].itemId,
        tasks[1].result.measurements[0].itemId,
      )
      assert.equal(report.usage.actions, 2)
      assert(report.usage.modelCalls <= report.budget.maxModelCalls)
      for (const t of tasks) {
        assert(
          t.result.original.receipt.after.panels.some((p: any) =>
            p.description.includes('visits=1;clicks=1;'),
          ),
          'independent storage/action state',
        )
      }
      if (name === 'budget') {
        assert(
          toolCalls.filter((t) => t.scenario === 'budget' && t.name === 'check_task_submit')
            .length >= 3,
          'competing reservation refused then retried after release',
        )
        assert.equal(tasks[1].task.quota.actions, 1)
      }
    }
    if (['wrong', 'ambiguous'].includes(name))
      assert(
        tasks.every((t: any) => t.status === 'unverified'),
        JSON.stringify(tasks),
      )
    if (name === 'failure')
      assert.deepEqual(tasks.map((t: any) => t.status).sort(), ['completed', 'unverified'])
    if (name === 'cancel') assert(tasks.every((t: any) => t.status === 'cancelled'))
  }

  // A real service restart must reproduce child receipts and parent aggregation.
  await stop()
  launch()
  await ready()
  for (const report of Object.values(reports)) {
    const restored = await api(`/api/runs/${report.runId}/report`)
    assert.deepEqual(restored.uiScan.checkTasks, report.uiScan.checkTasks)
  }
  const { createClient: openDb } = await import('@libsql/client')
  const audit = openDb({ url: env.DATABASE_URL! })
  const measured = reports.parallel.uiScan.checkTasks.tasks[0]
  const rawId = measured.result.original.popup.receiptRef
  const raw = (
    await audit.execute({ sql: 'SELECT file_path FROM artifacts WHERE id=?', args: [rawId] })
  ).rows[0]
  const originalBytes = await readFile(String(raw.file_path))
  try {
    await writeFile(String(raw.file_path), '{invalid')
    const invalid = await api(`/api/runs/${reports.parallel.runId}/report`)
    assert.equal(invalid.persistence.status, 'inconsistent')
    assert.equal(invalid.uiScan.checkTasks.tasks[0].status, 'unverified')
    assert.equal(invalid.uiScan.checkTasks.tasks[0].result.original.popup.verdict, 'unknown')
  } finally {
    await writeFile(String(raw.file_path), originalBytes)
  }
  const envelope = (
    await audit.execute({
      sql: 'SELECT file_path FROM artifacts WHERE id=?',
      args: [measured.result.evidenceRefs[0]],
    })
  ).rows[0]
  const envelopeBytes = await readFile(String(envelope.file_path))
  try {
    await writeFile(String(envelope.file_path), '{}')
    const invalid = await api(`/api/runs/${reports.parallel.runId}/report`)
    assert.equal(invalid.persistence.status, 'inconsistent')
    assert.equal(invalid.uiScan.checkTasks.tasks[0].status, 'unverified')
  } finally {
    await writeFile(String(envelope.file_path), envelopeBytes)
  }
  const terminal = (
    await audit.execute({
      sql: "SELECT id,payload FROM run_events WHERE run_id=? AND type='check-task:terminal'",
      args: [reports.parallel.runId],
    })
  ).rows
  const row = terminal.find(
    (r) => JSON.parse(String(r.payload)).snapshot.task.childTaskId === measured.task.childTaskId,
  )!
  const swapped = JSON.parse(String(row.payload))
  swapped.snapshot.result.original = reports.parallel.uiScan.checkTasks.tasks[1].result.original
  try {
    await audit.execute({
      sql: 'UPDATE run_events SET payload=? WHERE id=?',
      args: [JSON.stringify(swapped), row.id!],
    })
    const invalid = await api(`/api/runs/${reports.parallel.runId}/report`)
    assert.equal(invalid.persistence.status, 'inconsistent')
    assert.equal(invalid.uiScan.checkTasks.tasks[0].status, 'unverified')
  } finally {
    await audit.execute({
      sql: 'UPDATE run_events SET payload=? WHERE id=?',
      args: [row.payload!, row.id!],
    })
  }
  audit.close()
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
  db.close()
  const summary = {
    paidRequests: 0,
    runtimeProof,
    swappedSiblingResultRevoked: true,
    changedParentEnvelopeRevoked: true,
    mastraToolCalls: toolCalls,
    overlap: reports.parallel.uiScan.checkTasks.tasks.map((t: any) => ({
      id: t.task.childTaskId,
      start: t.startedAt,
      end: t.endedAt,
      verdict: t.result.original.popup.verdict,
    })),
    parentCancel: true,
    originalPopupExecutor: true,
    childFailure: true,
    evidenceIsolation: true,
    falseCoveredRefused: true,
    defaultSerial: true,
    restartedReports: true,
    invalidOriginalReceiptRevoked: true,
    quotaCompetitionAndRelease: true,
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
