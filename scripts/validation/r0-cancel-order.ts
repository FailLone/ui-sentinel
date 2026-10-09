/** Cancellation order self-test: real API/SDK/Chromium, explicit IPC scheduling barriers. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { createHash } from 'node:crypto'
import { scoreBoundary } from '../../evaluation/private/url-scan/boundary-scorer.ts'
import { hashTree } from './url-scan-freeze.ts'

const root = resolve('data/r0-cancel-order-browser', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
const reserve = createServer()
const base = await listen(reserve)
await new Promise<void>((r) => reserve.close(() => r()))
let mode = '',
  calls = 0
let gate: import('node:http').ServerResponse | undefined
let pageRequests: { method?: string; url?: string }[] = []
const fixture = createServer((req, res) => {
  pageRequests.push({ method: req.method, url: req.url })
  if (req.url === '/redirect') {
    res.writeHead(302, { location: '/write' }).end()
    return
  }
  if (req.url === '/broken') return req.socket.destroy()
  if (req.url === '/gate') {
    gate = res
    return
  }
  res.setHeader('content-type', 'text/html')
  const onload = mode.startsWith('init-')
    ? "fetch('/write',{method:'POST'}).catch(()=>{});" +
      (mode === 'init-concurrent'
        ? "fetch('/write').catch(()=>{})"
        : mode === 'init-redirect'
          ? "fetch('/redirect').catch(()=>{})"
          : '')
    : mode === 'transport-error'
      ? "fetch('/broken').catch(()=>{})"
      : ''
  const action = mode.startsWith('action-') || mode === 'cancel-race'
  res.end(
    `<h1>Public information</h1><p>Refresh changes the status to Ready.</p>${action ? `<button id=refresh type=button onclick="fetch('/write',{method:'POST'}).catch(()=>{});${mode === 'cancel-race' ? "fetch('/gate').catch(()=>{});" : ''}">Refresh</button><output id=result>Idle</output>` : ''}<script>${onload}</script>`,
  )
})
const origin = await listen(fixture)
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw)
  calls++
  const truncated = mode === 'clean-length'
  let name = 'run_finish',
    args: any = {
      reason: mode === 'clean-fake' && calls === 1 ? 'observed-blocker' : 'scope-covered',
    }
  if (mode.startsWith('action-') || mode === 'cancel-race') {
    name = 'page_act'
    args = {
      type: 'click',
      selector: '#refresh',
      verify: {
        selector: '#result',
        condition: 'text-equals',
        expected: 'Ready',
        basis: 'The public instruction says Refresh changes the status to Ready.',
      },
    }
  }
  const common = {
    id: `probe-${calls}`,
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', ...(truncated ? { content: '' } : { tool_calls: [{ index: 0, id: `tool-${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }) }, finish_reason: null }] })}\n\n` +
      `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: truncated ? 'length' : 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
  )
})
const endpoint = await listen(model)
await save('identity.json', {
  candidate: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dist: await hashTree('dist'),
  evidenceClass: 'B-diagnostic',
  acceptanceGranted: false,
  paidRequests: 0,
})
const log: string[] = []
const messages: any[] = []
const launch = () => {
  const child = spawn(
    process.execPath,
    [
      '--import',
      resolve('scripts/validation/support/cancel-order-hook.mjs'),
      'dist/server/index.js',
    ],
    {
      env: {
        ...process.env,
        PORT: new URL(base).port,
        DATABASE_URL: 'file:' + resolve(root, 'runs.db'),
        AGENT_MODEL: 'openai/fixed-local',
        OPENAI_BASE_URL: endpoint + '/v1',
        OPENAI_API_KEY: 'local-only',
        OPENROUTER_API_KEY: '',
        VISION_MODEL: 'qwen/fixed-local',
        VISION_MODEL_FAMILY: 'qwen3',
        VISION_API_KEY: 'local-only',
        VISION_BASE_URL: endpoint + '/v1',
        COMPLETION_REVIEW_API_KEY: '',
        EXECUTION_URL_SCAN: '1',
        URL_SCAN_TRUSTED_ORIGINS: origin,
        EXECUTION_MODEL_STREAMING: '1',
        EXECUTION_SHORT_FINISH: '1',
        EXECUTION_BLOCKER_REVIEW: '0',
        EXECUTION_VISUAL_DISCOVERY: '0',
        RUN_TOTAL_TIMEOUT_MS: '300000',
        RUN_MAX_MODEL_CALLS: '30',
        RUN_MAX_ACTIONS: '20',
        OTEL_SDK_DISABLED: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  child.stdout!.on('data', (b) => log.push(String(b)))
  child.stderr!.on('data', (b) => log.push(String(b)))
  child.on('message', (message: any) => {
    messages.push(message)
  })
  return child
}
let child = launch()
const rows: any[] = [],
  reports: any[] = []
const stop = async () => {
  if (child.exitCode !== null) return
  const exited = new Promise((r) => child.once('exit', r))
  child.kill('SIGTERM')
  await Promise.race([exited, sleep(3000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}
async function message(event: string, point?: string) {
  for (let i = 0; i < 500; i++) {
    const index = messages.findIndex((m) => m.event === event && (!point || m.point === point))
    if (index >= 0) return messages.splice(index, 1)[0]
    await sleep(20)
  }
  throw Error(`missing scheduler signal ${event}:${point}`)
}
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      return
    await sleep(100)
  }
  throw Error('service-not-ready')
}
async function create() {
  const response = await fetch(base + '/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'ui-scan',
      entryUrl: origin + '/',
      goal: 'Inspect this public page within the allowed scope.',
    }),
  })
  if (response.status !== 202) throw Error('admission-refused: ' + (await response.text()))
  return ((await response.json()) as any).runId
}
async function settled(id: string) {
  for (let i = 0; i < 500; i++) {
    const run = (await fetch(`${base}/api/runs/${id}`).then((r) => r.json())) as any
    if (!['queued', 'running'].includes(run.status) && !run.active)
      return fetch(`${base}/api/runs/${id}/report`).then((r) => r.json()) as Promise<any>
    await sleep(20)
  }
  throw Error('run-not-settled:' + id)
}
async function cancel(id: string) {
  const response = await fetch(`${base}/api/runs/${id}/cancel`, { method: 'POST' })
  return { status: response.status, ...((await response.json()) as any) }
}
try {
  await ready()
  for (const [order, fixtureMode] of [
    ['cancel-first', 'init-denied'],
    ['terminal-first', 'init-denied'],
    ['cancel-first', 'clean'],
    ['terminal-first', 'clean'],
    ['terminal-first', 'clean-length'],
  ]) {
    mode = fixtureMode!
    calls = 0
    pageRequests = []
    const label = `${order}-${mode}`
    child.send({ command: 'arm', mode: order })
    await message('armed')
    const id = await create()
    await message('paused', order === 'cancel-first' ? 'finish' : 'terminal')
    const cancellation = cancel(id)
    void cancellation.catch(() => {})
    if (order === 'cancel-first') {
      await message('paused', 'cancellation')
      child.send({ command: 'release', point: 'finish' })
      await message('released', 'finish')
      child.send({ command: 'release', point: 'cancellation' })
    } else {
      const read = await message('cancel-read')
      if (read.status !== 'running') throw Error('cancel did not read preterminal snapshot')
      child.send({ command: 'release', point: 'terminal' })
    }
    const api = await cancellation,
      report = await settled(id)
    await save(label + '-report.json', report)
    await save(label + '-api.json', api)
    await save(label + '-requests.json', pageRequests)
    const final = report.events.filter((e: any) => e.type === 'run:completed')
    const requested = report.events.filter((e: any) => e.type === 'run:cancel-requested')
    const expected =
      order === 'cancel-first'
        ? 'cancelled'
        : mode === 'init-denied'
          ? 'blocked'
          : mode === 'clean-length'
            ? 'execution-error'
            : 'completed'
    const checks = {
      apiOrder:
        api.status === 200 &&
        api.accepted === (order === 'cancel-first') &&
        (api.accepted || typeof api.reason === 'string'),
      consistentTerminal:
        report.status === expected &&
        report.stopReason === (expected === 'completed' ? 'goal-reached' : expected),
      oneTerminal:
        final.length === 1 &&
        final[0].payload.status === expected &&
        final[0].payload.stopReason === report.stopReason,
      cancellationOrder:
        requested.length === (order === 'cancel-first' ? 1 : 0) &&
        (requested.length === 0 || requested[0].seq < final[0].seq),
      noFalseIsolation:
        report.stopReason !== 'reconciliation-required' &&
        !report.events.some((e: any) => e.type === 'run:storage-inconsistent'),
      noWrites: pageRequests.every((r) => ['GET', 'HEAD'].includes(r.method ?? '')),
      proof:
        expected === 'completed'
          ? report.uiScan.proofVerified === true
          : expected === 'blocked'
            ? scoreBoundary(report, pageRequests, id).passed
            : report.uiScan.proofVerified === false,
      finishPreserved:
        order !== 'cancel-first' || report.events.some((e: any) => e.type === 'finish:accepted'),
    }
    rows.push({ label, api, checks, passed: Object.values(checks).every(Boolean) })
    reports.push({ label, report })
    mode = 'clean'
    calls = 0
    pageRequests = []
    const next = await settled(await create())
    await save(label + '-next-report.json', next)
    rows.push({
      label: label + '-next',
      passed:
        next.status === 'completed' &&
        next.stopReason === 'goal-reached' &&
        next.uiScan.proofVerified === true &&
        next.persistence.status === 'verified',
    })
    reports.push({ label: label + '-next', report: next })
    await save('observations.json', rows)
  }
  await stop()
  child = launch()
  await ready()
  for (const { label, report } of reports) {
    const restored = (await fetch(`${base}/api/runs/${report.runId}/report`).then((r) =>
      r.json(),
    )) as any
    await save(label + '-restored.json', restored)
    rows.push({
      label: label + '-restart',
      passed:
        restored.status === report.status &&
        restored.stopReason === report.stopReason &&
        JSON.stringify(restored.events) === JSON.stringify(report.events) &&
        restored.uiScan.proofVerified === report.uiScan.proofVerified &&
        JSON.stringify(restored.persistence) === JSON.stringify(report.persistence),
    })
  }
  // Fresh SQLite view, independently compare the whole trace and terminal row to API reports.
  const db = createClient({ url: 'file:' + resolve(root, 'runs.db') })
  try {
    for (const { label, report } of reports) {
      const stored = await db.execute({
        sql: 'SELECT status,stop_reason FROM runs WHERE id=?',
        args: [report.runId],
      })
      const events = await db.execute({
        sql: 'SELECT * FROM run_events WHERE run_id=? ORDER BY seq',
        args: [report.runId],
      })
      const checks =
        stored.rows[0]?.status === report.status &&
        stored.rows[0]?.stop_reason === report.stopReason &&
        events.rows.length === report.events.length &&
        events.rows.every(
          (e: any, i: number) =>
            e.id === report.events[i].id &&
            e.run_id === report.runId &&
            Number(e.seq) === i &&
            e.type === report.events[i].type &&
            JSON.stringify(JSON.parse(e.payload)) === JSON.stringify(report.events[i].payload) &&
            JSON.stringify(JSON.parse(e.evidence_refs)) ===
              JSON.stringify(report.events[i].evidenceRefs),
        )
      rows.push({ label: label + '-sqlite', passed: checks })
    }
  } finally {
    db.close()
  }
} finally {
  await stop()
  fixture.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
  await save('server-log.json', log)
  await save('summary.json', {
    selfTest: true,
    independentAcceptance: false,
    paidRequests: 0,
    passed: rows.length === 30 && rows.every((r) => r.passed),
    rows,
  })
}
const passed = rows.length === 30 && rows.every((r) => r.passed)
console.log(JSON.stringify({ directory: root, passed, rows }))
if (!passed) process.exitCode = 1
