/** Free targeted production API + SDK + Chromium proof. The only model is a local scripted server.
 * Its explicit corrected choices are wiring tests, never a real-model stability claim. */
import { createServer } from 'node:http'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { hashTree } from './url-scan-freeze.ts'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
const root = resolve('data/r0-action-contract', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = async (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let mode = '',
  turn = 0,
  repaired = false,
  corrected = 0,
  currentRun = '',
  inputWindow = false
let child: ChildProcess
const requests: any[] = [],
  modelRequests: any[] = [],
  browserWindows: any[] = [],
  logs: string[] = []
const fixture = createServer((req, res) => {
  requests.push({ mode, method: req.method, path: req.url })
  if (req.url === '/info') {
    res.end('<h1>Information</h1>')
    return
  }
  const blocked = false // execution fault is a closed browser after a successful trial, not a defect
  res.setHeader('content-type', 'text/html')
  res.end(
    `<h1>Public catalog</h1><p>Open reveals public details.</p><span style="position:relative;display:inline-block"><button id=open type=button style="width:140px;height:60px" onclick="document.getElementById('details').hidden=false;fetch('/opened')">Open</button>${blocked ? '<span style="position:absolute;inset:0;z-index:2;background:#ddd"></span>' : ''}</span><section id=details hidden>Public details</section><a href=/info>Information</a>`,
  )
})
const origin = await listen(fixture)
const reservation = createServer((_, res) => res.end())
const base = await listen(reservation)
await new Promise<void>((r) => reservation.close(() => r()))
const verify = {
  selector: '#details',
  condition: 'visible',
  basis: 'The public instruction says Open reveals public details.',
}
const barrier = async (command: string, event: string) => {
  const result = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off('message', onMessage)
      reject(Error('test-hook-timeout'))
    }, 5000)
    const onMessage = (m: any) => {
      if (m.event === event) {
        clearTimeout(timeout)
        child.off('message', onMessage)
        resolve(m)
      }
    }
    child.on('message', onMessage)
  })
  child.send!({ command })
  return result
}
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw),
    packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  modelRequests.push({ mode, body })
  if (inputWindow) {
    const result = await barrier('close-input-window', 'input-window-closed')
    browserWindows.push({ mode, counts: result.counts })
    inputWindow = false
  }
  const candidates = packet.inspectionScope?.candidates ?? [],
    local = candidates.find((c: any) => c.category === 'local-interaction'),
    nav = candidates.find((c: any) => c.category === 'navigation')
  let calls: any[] = []
  const act = (type: string, c: any, extra: any = {}) => ({
    name: 'page_act',
    args: { type, ref: c?.ref, ...extra },
  })
  const invalid = () => ({
    name: 'page_act',
    args: { type: 'navigate', ref: nav?.ref, role: 'link', name: 'Information', url: null },
  })
  if (turn === 0)
    calls = [
      {
        name: 'exploration_update',
        args: {
          state: 'Check public controls',
          unexploredBranches: [],
          selectItems: candidates
            .filter(
              (c: any) =>
                c.category === 'local-interaction' ||
                (mode !== 'repair-url' && c.category === 'navigation'),
            )
            .map((c: any) => ({ itemId: c.itemId, basis: 'Public affordance' })),
        },
      },
    ]
  else if (mode === 'matrix-correct' && turn === 1) {
    calls = [
      invalid(),
      { name: 'page_act', args: { type: 'click' } },
      { name: 'page_act', args: { type: 'probe' } },
      act('fill', local, { value: null }),
      { name: 'page_act', args: { type: 'scroll', scrollY: null } },
      act('click', local, { role: 'button', name: 'Open', selector: '#open', verify }),
    ]
    await barrier('arm-input-window', 'input-window-armed')
    inputWindow = true
  } else if (mode === 'selected-link' && turn === 2)
    calls = [{ name: 'page_act', args: { type: 'navigate', url: origin + '/info' } }]
  else if (mode === 'repair-url' && turn === 1) calls = [act('click', local, { verify })]
  else if (
    ['repair-click', 'repair-url', 'repeat-error', 'execute-error', 'cancel-repair'].includes(
      mode,
    ) &&
    !repaired
  ) {
    if (packet.contractRepairAdvice) {
      repaired = true
      if (mode === 'execute-error')
        await barrier('arm-execution-failure', 'execution-failure-armed')
      if (mode === 'cancel-repair')
        await fetch(base + `/api/runs/${currentRun}/cancel`, { method: 'POST' })
      calls =
        mode === 'repeat-error'
          ? [invalid()]
          : mode === 'repair-url'
            ? [{ name: 'page_act', args: { type: 'navigate', url: origin + '/info' } }]
            : [act('click', local, { verify })]
      corrected = mode === 'repair-url' ? 2 : 1
    } else calls = [invalid()]
  } else if (mode === 'repeat-error') calls = [invalid()]
  else {
    if (mode === 'selected-link') corrected = turn === 1 ? 0 : turn === 3 ? 1 : 2
    calls =
      corrected === 0
        ? [act('click', local, { verify })]
        : corrected === 1
          ? [act('click', nav)]
          : [{ name: 'run_finish', args: { reason: 'scope-covered' } }]
    corrected++
  }
  turn++
  const common = {
    id: `fixed-${turn}`,
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls.map((call, i) => ({ index: i, id: `call-${turn}-${i}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
  )
})
const endpoint = await listen(model)
const identity = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dist: await hashTree('dist'),
  source: await hashTree('src'),
  scripts: await hashTree('scripts'),
  paidRequests: 0,
  model: 'local scripted',
  evidenceClass: 'B',
  independentAcceptance: false,
}
await save('identity.json', identity)
child = spawn(
  process.execPath,
  ['--import', resolve('scripts/validation/support/action-input-hook.mjs'), 'dist/server/index.js'],
  {
    env: {
      ...process.env,
      PORT: new URL(base).port,
      DATABASE_URL: 'file:' + resolve(root, 'runs.db'),
      AGENT_MODEL: 'openai/local-fixed',
      OPENAI_BASE_URL: endpoint + '/v1',
      OPENAI_API_KEY: 'local-only',
      OPENROUTER_API_KEY: '',
      VISION_MODEL: 'qwen/local-fixed',
      VISION_MODEL_FAMILY: 'qwen3',
      VISION_BASE_URL: endpoint + '/v1',
      VISION_API_KEY: 'local-only',
      COMPLETION_REVIEW_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      GOOGLE_API_KEY: '',
      EXECUTION_URL_SCAN: '1',
      URL_SCAN_TRUSTED_ORIGINS: origin,
      EXECUTION_MODEL_STREAMING: '1',
      EXECUTION_SHORT_FINISH: '1',
      EXECUTION_BLOCKER_REVIEW: '0',
      EXECUTION_VISUAL_DISCOVERY: '0',
      RUN_TOTAL_TIMEOUT_MS: '60000',
      RUN_MAX_MODEL_CALLS: '20',
      RUN_MAX_ACTIONS: '10',
      OTEL_SDK_DISABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  },
)
child.stdout!.on('data', (b) => logs.push(String(b)))
child.stderr!.on('data', (b) => logs.push(String(b)))
const ipc: any[] = []
child.on('message', (message) => ipc.push(message))
const rows: any[] = [],
  reports: any[] = []
const assert = (condition: unknown, message: string) => {
  if (!condition) throw Error(message)
}
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    await sleep(100)
    if (i === 99) throw Error('server-unavailable')
  }
  for (mode of [
    'matrix-correct',
    'repair-click',
    'repair-url',
    'repeat-error',
    'selected-link',
    'execute-error',
    'cancel-repair',
    'after-normal',
  ]) {
    turn = 0
    repaired = false
    corrected = 0
    inputWindow = false
    const created = (await fetch(base + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'ui-scan',
        entryUrl: origin,
        goal: 'Inspect the public controls and report evidence-backed results within scope.',
      }),
    }).then((r) => r.json())) as any
    currentRun = created.runId
    assert(currentRun, 'run-not-created')
    let report: any
    for (let i = 0; i < 600; i++) {
      const run = (await fetch(base + `/api/runs/${currentRun}`).then((r) => r.json())) as any
      if (!['queued', 'running'].includes(run.status) && !run.active) {
        report = await fetch(base + `/api/runs/${currentRun}/report`).then((r) => r.json())
        break
      }
      await sleep(100)
    }
    assert(report, 'run-did-not-stop')
    await save(mode + '-report.json', report)
    reports.push(report)
    const evidence = await downloadRunEvidence(base, report, resolve(root, mode, 'artifacts'))
    await save(mode + '-artifact-index.json', evidence.index)
    const events = report.events as any[],
      executing = events.filter((e) => e.type === 'action:executing'),
      repair = events.filter((e) => e.type === 'execution:contract-repair'),
      validation = events
        .filter((e) => e.type === 'agent:response')
        .flatMap((e) => e.payload.toolResults ?? [])
        .filter((r) => r.payload?.result?.error === true && r.payload.result.validationErrors)
    const expected =
      mode === 'repeat-error'
        ? 'blocked'
        : mode === 'execute-error'
          ? 'execution-error'
          : mode === 'cancel-repair'
            ? 'cancelled'
            : 'completed'
    assert(report.status === expected, `${mode}: terminal ${report.status}, expected ${expected}`)
    if (expected === 'completed')
      assert(
        report.uiScan.proofVerified && report.persistence.status === 'verified',
        mode + ': proof',
      )
    if (
      ['repair-click', 'repair-url', 'repeat-error', 'execute-error', 'cancel-repair'].includes(
        mode,
      )
    )
      assert(repair.length === 1, mode + ': one repair')
    if (mode === 'matrix-correct') {
      assert(validation.length === 6, 'matrix: six field refusals')
      assert(
        browserWindows[0] && Object.keys(browserWindows[0].counts).length === 0,
        'matrix: browser operations occurred on invalid inputs',
      )
      assert(
        executing.length === 2 && report.usage.actions === 2,
        'matrix: invalid inputs consumed action budget',
      )
      const beforeFirstAction = events.filter((e) => e.seq < executing[0].seq)
      assert(
        !beforeFirstAction.some(
          (e) =>
            e.type === 'scope:item-updated' &&
            ['verified', 'failed'].includes(e.payload.status) &&
            [
              'declared-postcondition-measured',
              'probe-intercepted',
              'navigation-observed',
            ].includes(e.payload.reasonCode),
        ),
        'matrix: false resolution',
      )
    }
    if (mode === 'repeat-error') {
      assert(validation.length === 4, 'repeat: must stop after three errors and one repair')
      assert(executing.length === 0 && report.usage.actions === 0, 'repeat: fabricated action')
      assert(
        !events.some((e) => e.type === 'execution:remaining-obligation-guidance'),
        'repeat: second allowance from F1',
      )
      assert(
        report.uiScan.inspection.items.some((i: any) => i.selected && i.status === 'pending'),
        'repeat: obligations lost',
      )
    }
    if (mode === 'repair-url')
      assert(
        executing.some((e) => e.payload.type === 'navigate') &&
          events.some(
            (e) => e.type === 'navigation:committed' && e.payload.url === origin + '/info',
          ),
        'url: correction must execute explicit navigate',
      )
    if (['repair-click', 'selected-link', 'matrix-correct'].includes(mode))
      assert(
        executing.length === 2 &&
          executing.every((e) => e.payload.type === 'click') &&
          report.uiScan.inspection.items.some(
            (i: any) => i.category === 'navigation' && i.selected && i.status === 'verified',
          ),
        'selected navigation must click',
      )
    if (mode === 'selected-link')
      assert(
        !executing.some((e) => e.payload.type === 'navigate'),
        'selected link URL bypass was dispatched',
      )
    if (mode === 'execute-error')
      assert(
        ipc.some((e) => e.event === 'execution-browser-closed-after-successful-trial') &&
          events.some((e) => e.type === 'action:failed') &&
          !events.some((e) => e.type === 'finish:accepted'),
        'real failure hidden',
      )
    if (mode === 'cancel-repair')
      assert(
        executing.length === 0 && !events.some((e) => e.type === 'finish:accepted'),
        'cancel caused dispatch or accepted finish',
      )
    rows.push({
      mode,
      runId: currentRun,
      passed: true,
      status: report.status,
      actions: report.usage.actions,
      modelCalls: report.usage.modelCalls,
      validationErrors: validation.length,
      contractRepairs: repair.length,
    })
  }
  assert(
    !requests.some((r) => r.method !== 'GET' && r.method !== 'HEAD'),
    'fixture write reached server',
  )
} finally {
  child.kill('SIGTERM')
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
  fixture.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
  await save('rows.json', rows)
  await save('model-requests.json', modelRequests)
  await save('page-requests.json', requests)
  await save('browser-windows.json', browserWindows)
  await save('browser-hook-events.json', ipc)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
}
const db = createClient({ url: 'file:' + resolve(root, 'runs.db') })
try {
  for (const report of reports) {
    const actual = await db.execute({
      sql: 'SELECT id,run_id,seq,type,payload,evidence_refs FROM run_events WHERE run_id=? ORDER BY seq',
      args: [report.runId],
    })
    assert(actual.rows.length === report.events.length, 'raw history length')
    for (const [i, e] of report.events.entries()) {
      const r = actual.rows[i]!
      assert(
        r.id === e.id &&
          r.run_id === e.runId &&
          r.seq === e.seq &&
          r.type === e.type &&
          JSON.stringify(JSON.parse(String(r.payload))) === JSON.stringify(e.payload) &&
          JSON.stringify(JSON.parse(String(r.evidence_refs))) === JSON.stringify(e.evidenceRefs),
        'raw history mismatch',
      )
    }
    const terminal = await db.execute({
      sql: 'SELECT status,stop_reason,business_result FROM runs WHERE id=?',
      args: [report.runId],
    })
    assert(
      terminal.rows[0]?.status === report.status &&
        terminal.rows[0]?.stop_reason === report.stopReason &&
        terminal.rows[0]?.business_result === report.businessResult,
      'raw terminal mismatch',
    )
  }
} finally {
  db.close()
}
const summary = {
  directory: root,
  rows,
  passed: rows.length === 8 && rows.every((r) => r.passed),
  databaseHistoryVerified: true,
  paidRequests: 0,
  realModel: false,
  claim: 'Action input contract and bounded repair wiring, not real-model R0 acceptance',
}
await save('summary.json', summary)
console.log(JSON.stringify(summary, null, 2))
assert(summary.passed, 'targeted-batch-failed')
