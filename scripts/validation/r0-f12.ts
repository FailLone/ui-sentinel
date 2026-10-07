/** F2/F1 free wiring evidence: compiled API, real SDK and browser; fixed local model only. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import { hashTree } from './url-scan-freeze.ts'
const root = resolve('data/r0-f12', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (n: string, v: unknown) =>
  writeFile(resolve(root, n), JSON.stringify(v, null, 2) + '\n')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(s: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as any).port}`
}
const reserve = createServer(),
  base = await listen(reserve)
await new Promise<void>((r) => reserve.close(() => r()))
let mode = '',
  turn = 0,
  selected: any[] = [],
  guided = 0
let requests: any[] = [],
  modelRequests: any[] = []
const fixture = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url })
  res.setHeader('content-type', 'text/html')
  if (req.url === '/info') return res.end('<h1>Information</h1><p>Public information.</p>')
  if (mode === 'no-items' || mode === 'after-normal') return res.end('<h1>Public information</h1>')
  const blocked = ['intercepted', 'cancel', 'closed', 'replaced', 'real-click-error'].includes(mode)
  res.end(
    `<h1>Options</h1><p>Open reveals the details.</p><span style="position:relative;display:inline-block"><button id=open type=button style="width:140px;height:60px" onclick="document.getElementById('details').hidden=false;fetch('/opened')">Open</button>${blocked ? '<span style="position:absolute;inset:0;z-index:2;background:#ddd"></span>' : ''}</span><section id=details hidden>Public details</section><a href=/info>Information</a>`,
  )
})
const origin = await listen(fixture)
const verify = {
  selector: '#details',
  condition: 'visible',
  expected: 'true',
  basis: 'The public instruction says Open reveals details.',
}
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw),
    packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  modelRequests.push(body)
  const cs = packet.inspectionScope?.candidates ?? [],
    local = cs.find((c: any) => c.category === 'local-interaction'),
    nav = cs.find((c: any) => c.category === 'navigation')
  let name = 'run_finish',
    args: any = { reason: 'scope-covered' }
  const action = (type: string, c: any, extra = {}) => {
    name = 'page_act'
    args = { type, ref: c?.ref, ...extra }
  }
  if (mode === 'after-normal') {
    /* finish */
  } else if (mode === 'no-items') {
    name = 'page_inspect'
    args = { selector: 'h1', offset: 0 }
  } else if (turn === 0) {
    selected = cs.filter((c: any) => ['local-interaction', 'navigation'].includes(c.category))
    name = 'exploration_update'
    args = {
      state: 'Check public controls and navigation',
      unexploredBranches: [],
      selectItems: selected.map((c) => ({ itemId: c.itemId, basis: 'Check public affordance' })),
    }
  } else if (mode.startsWith('guide-')) {
    name = 'page_inspect'
    args = { selector: '#details', offset: 0 }
    if (packet.remainingObligationGuidance) {
      guided++
      if (mode !== 'guide-ignore' && mode !== 'guide-cancel') action('click', local, { verify })
      if (mode === 'guide-cancel') {
        await fetch(`${base}/api/runs/${currentRun}/cancel`, { method: 'POST' })
      }
    } else if (guided && mode === 'guide-complete') {
      if (nav) action('click', nav)
      else {
        name = 'run_finish'
        args = { reason: 'scope-covered' }
      }
    }
  } else if (turn === 1) {
    action('probe', local)
    if (mode === 'real-click-error') action('click', local, { verify })
    if (mode === 'invalid') args = { type: 'probe', ref: 'never-observed' }
    if (mode === 'ambiguous') args = { type: 'probe', selector: 'button, a' }
    if (mode === 'missing') args = { type: 'probe', role: 'button', name: 'Absent' }
  } else if (turn === 2 && ['healthy', 'invalid', 'ambiguous', 'missing'].includes(mode)) {
    action('click', local, { verify })
  } else if (nav) action('click', nav)
  turn++
  const common = {
    id: `fixed-${turn}`,
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: `call-${turn}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
  )
})
const endpoint = await listen(model)
await save('identity.json', {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dist: await hashTree('dist'),
  source: await hashTree('src'),
  scripts: await hashTree('scripts'),
  paidRequests: 0,
  selfTest: true,
  independentAcceptance: false,
})
const logs: string[] = [],
  ipc: any[] = []
const launch = () => {
  const child = spawn(
    process.execPath,
    ['--import', resolve('scripts/validation/support/ui-probe-hook.mjs'), 'dist/server/index.js'],
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
        VISION_BASE_URL: endpoint + '/v1',
        VISION_API_KEY: 'local-only',
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
  child.stdout!.on('data', (b) => logs.push(String(b)))
  child.stderr!.on('data', (b) => logs.push(String(b)))
  child.on('message', (m) => ipc.push(m))
  return child
}
let child = launch(),
  currentRun = ''
const rows: any[] = [],
  reports: any[] = []
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
  throw Error('server-unavailable')
}
async function stop() {
  child.kill('SIGTERM')
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
}
try {
  await ready()
  for (mode of [
    'healthy',
    'intercepted',
    'invalid',
    'ambiguous',
    'missing',
    'real-click-error',
    'replaced',
    'closed',
    'cancel',
    'after-normal',
    'guide-complete',
    'guide-ignore',
    'guide-second-loop',
    'guide-cancel',
    'guide-budget',
    'no-items',
  ]) {
    turn = 0
    guided = 0
    requests = []
    modelRequests = []
    ipc.length = 0
    child.send({ command: 'arm', mode })
    const response = await fetch(base + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'ui-scan',
        entryUrl: origin + '/',
        goal: 'Inspect the public controls and navigation within scope.',
        ...(mode === 'guide-budget' ? { budget: { maxModelCalls: 6 } } : {}),
      }),
    })
    if (response.status !== 202) throw Error('admission-failed:' + (await response.text()))
    currentRun = ((await response.json()) as any).runId
    let cancelled: any,
      done = false
    for (let i = 0; i < 800; i++) {
      if (mode === 'cancel' && !cancelled && ipc.some((m) => m.event === 'probe-paused')) {
        cancelled = await fetch(`${base}/api/runs/${currentRun}/cancel`, { method: 'POST' }).then(
          (r) => r.json(),
        )
        child.send({ command: 'release' })
      }
      const r: any = await fetch(`${base}/api/runs/${currentRun}`).then((r) => r.json())
      if (!r.active && !['queued', 'running'].includes(r.status)) {
        done = true
        break
      }
      await sleep(50)
    }
    if (!done) throw Error('run-did-not-settle:' + mode)
    const report: any = await fetch(`${base}/api/runs/${currentRun}/report`).then((r) => r.json())
    const events = report.events
    await save(mode + '-report.json', report)
    await save(mode + '-requests.json', requests)
    await save(mode + '-model-requests.json', modelRequests)
    const evidence = await downloadRunEvidence(base, report, resolve(root, mode + '-artifacts'))
    await save(mode + '-artifact-index.json', evidence.index)
    const probes = events.filter((e: any) => e.type === 'probe:measured'),
      reminders = events.filter((e: any) => e.type === 'execution:remaining-obligation-guidance')
    const expected = ['cancel', 'guide-cancel'].includes(mode)
      ? 'cancelled'
      : ['closed', 'replaced', 'real-click-error'].includes(mode)
        ? 'execution-error'
        : ['guide-ignore', 'guide-second-loop', 'guide-budget'].includes(mode)
          ? 'blocked'
          : 'completed'
    const original = selected.find((c) => c.category === 'local-interaction')?.itemId
    const checks: Record<string, boolean> = {
      terminal: report.status === expected,
      noFalseIsolation: report.stopReason !== 'reconciliation-required',
      noWrites: requests.every((r) => r.method === 'GET'),
      oneReminder: reminders.length <= 1,
      noManufacturedEvidence: reminders.every((e: any) => e.evidenceRefs.length === 0),
      durable:
        !['completed', 'blocked'].includes(expected) || report.persistence.status === 'verified',
      noFailureFinish:
        !['cancelled', 'execution-error'].includes(expected) ||
        !events.some((e: any) => e.type === 'finish:accepted'),
    }
    if (mode === 'intercepted')
      Object.assign(checks, {
        negative: probes.length === 1 && probes[0].payload.outcome === 'intercepted',
        sameItem:
          probes[0]?.payload.itemId === original &&
          report.uiScan.inspection.items.some(
            (i: any) =>
              i.itemId === original &&
              i.status === 'failed' &&
              i.reasonCode === 'probe-intercepted',
          ),
        keptFinding: report.findings.some((f: any) => f.validationStatus === 'supported'),
        noClick: !requests.some((r) => r.url === '/opened'),
        noActionFailure: !events.some((e: any) => e.type === 'action:failed'),
      })
    if (mode === 'healthy')
      Object.assign(checks, {
        positiveOnly:
          probes.length === 1 &&
          probes[0].payload.outcome === 'actionable' &&
          !events.some(
            (e: any) =>
              e.type === 'scope:item-updated' &&
              e.payload.itemId === original &&
              e.seq > probes[0].seq &&
              e.seq <
                events.find((e: any) => e.type === 'action:executing' && e.payload.type === 'click')
                  ?.seq &&
              e.payload.status === 'verified',
          ),
        oneRealClick: requests.filter((r) => r.url === '/opened').length === 1,
        noFindings: report.findings.length === 0,
      })
    if (['invalid', 'ambiguous', 'missing', 'closed', 'replaced', 'cancel'].includes(mode))
      checks.noFalseMeasurement = probes.length === 0
    if (mode.startsWith('guide-') && mode !== 'guide-budget')
      Object.assign(checks, {
        oneReminder: reminders.length === 1,
        guidanceDelivered: guided === 1,
        bounded: turn <= 12,
      })
    if (mode === 'guide-ignore')
      checks.noReset = events.some(
        (e: any) =>
          e.type === 'execution:remaining-obligation-guidance-result' &&
          e.payload.newFacts === false &&
          e.payload.previousNoProgressStreak >= 3,
      )
    if (mode === 'guide-budget') checks.budgetStopsGuidance = reminders.length === 0 && turn <= 4
    if (mode === 'no-items') checks.noUnnecessaryReminder = reminders.length === 0
    rows.push({
      mode,
      runId: currentRun,
      checks,
      passed: Object.values(checks).every(Boolean),
      turn,
      status: report.status,
      cancelled,
    })
    reports.push({ mode, report })
    await save('observations.json', rows)
    console.log(mode, rows.at(-1).passed)
  }
  // Alter only this test database/receipt; restore every original byte and payload afterward.
  const blocked = reports.find((r) => r.mode === 'intercepted').report,
    event = blocked.events.find((e: any) => e.type === 'probe:measured')
  const db = createClient({ url: 'file:' + resolve(root, 'runs.db') })
  try {
    for (const variant of ['wrong-association', 'tampered-receipt']) {
      const original = JSON.stringify(event.payload)
      const file = await db.execute({
        sql: 'SELECT file_path FROM artifacts WHERE id=?',
        args: [event.payload.receiptRef],
      })
      const path = String(file.rows[0]!.file_path)
      const bytes = await readFile(path)
      if (variant === 'wrong-association')
        await db.execute({
          sql: 'UPDATE run_events SET payload=? WHERE id=?',
          args: [JSON.stringify({ ...event.payload, itemId: 'wrong-original' }), event.id],
        })
      else await writeFile(path, JSON.stringify({ forged: true }))
      const changed: any = await fetch(`${base}/api/runs/${blocked.runId}/report`).then((r) =>
        r.json(),
      )
      await save(variant + '-report.json', changed)
      rows.push({ mode: variant, passed: changed.persistence.status === 'inconsistent' })
      await db.execute({
        sql: 'UPDATE run_events SET payload=? WHERE id=?',
        args: [original, event.id],
      })
      await writeFile(path, bytes)
    }
  } finally {
    db.close()
  }
  await stop()
  child = launch()
  await ready()
  for (const { mode, report } of reports) {
    const restored: any = await fetch(`${base}/api/runs/${report.runId}/report`).then((r) =>
      r.json(),
    )
    await save(mode + '-restored.json', restored)
    rows.push({
      mode: mode + '-restart',
      passed:
        JSON.stringify(restored.events) === JSON.stringify(report.events) &&
        restored.status === report.status &&
        JSON.stringify(restored.persistence) === JSON.stringify(report.persistence),
    })
  }
} finally {
  await stop()
  fixture.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
  await save('server-log.json', logs)
  await save('summary.json', {
    selfTest: true,
    independentAcceptance: false,
    paidRequests: 0,
    passed: rows.length === 34 && rows.every((r) => r.passed),
    rows,
  })
}
console.log(
  JSON.stringify({
    directory: root,
    rows: rows.length,
    passed: rows.length === 34 && rows.every((r) => r.passed),
  }),
)
if (rows.length !== 34 || rows.some((r) => !r.passed)) process.exitCode = 1
