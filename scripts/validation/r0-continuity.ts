/** Free B evidence: formal API, real SDK, real Chromium; no remote model endpoint. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import { hashTree } from './url-scan-freeze.ts'

const root = resolve('data/r0-continuity', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
await save('build-identity.json', {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dist: await hashTree('dist'),
  source: await hashTree('src'),
  scripts: await hashTree('scripts'),
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (server.address() as any).port
}
const reserve = createServer(),
  base = await listen(reserve)
await new Promise<void>((r) => reserve.close(() => r()))
let mode = '',
  turn = 0,
  selected: any[] = [],
  originalId = '',
  clicks = 0,
  messages: any[] = [],
  requests: any[] = []
const fixture = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url })
  res.setHeader('content-type', 'text/html')
  if (req.url === '/info')
    return res.end('<h1>Information</h1><p>This service provides a status refresh.</p>')
  if (req.url === '/status') {
    clicks++
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ text: 'Ready' }))
  }
  res.end(
    (mode === 'label-contract'
      ? '<label>View<select id=choice><option value=stored-option>Public choice</option></select></label>'
      : '') +
      (mode === 'sampling-cap'
        ? '<p>The additional buttons show their ready state.</p><button type=button id=second onclick="this.textContent=\'Second ready\'">Second</button><button type=button id=third onclick="this.textContent=\'Third ready\'">Third</button><button type=button id=fourth onclick="fetch(\'/fourth-dispatched\')">Fourth</button>'
        : '') +
      '<h1>Service status</h1><p>Refresh updates the status to Ready.</p><button type=button id=refresh>Refresh</button><output id=result>Idle</output><a href=/info>Information</a><script>refresh.onclick=async()=>{let d=await(await fetch("/status")).json();result.outerHTML="<output id=result>"+d.text+"</output>"}</script>',
  )
})
const origin = await listen(fixture)
const verification = {
  selector: '#result',
  condition: 'text-equals',
  expected: 'Ready',
  basis: 'The public instruction says Refresh updates status to Ready',
}
const program = (explicit: boolean) => ({
  version: 1,
  phenomenon: 'Refresh status response',
  basis: verification.basis,
  targets: [
    { name: 'button', selector: '#refresh' },
    { name: 'result', selector: '#result', ...(explicit ? { binding: 'post-action' } : {}) },
  ],
  steps: [
    { op: 'act', type: 'click', target: 'button' },
    { op: 'wait', ms: 100 },
    ...(explicit ? [{ op: 'bind_results' }] : []),
    { op: 'measure', name: 'after' },
  ],
  assertions: [
    {
      expectation: 'Status is Ready',
      left: { sample: 'after', target: 'result', metric: 'text' },
      operator: 'eq',
      right: { value: 'Ready' },
    },
  ],
})
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw),
    packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  messages.push({ turn, body })
  let name = 'run_finish',
    args: any = { reason: mode === 'unknown-replay' ? 'unverified-scope' : 'scope-covered' }
  const candidates = packet.inspectionScope?.candidates ?? []
  if (turn === 0) {
    selected = candidates.filter(
      (c: any) => c.description.includes('Refresh') || c.category === 'navigation',
    )
    originalId = selected.find((c) => c.description.includes('Refresh'))?.itemId ?? ''
    name = 'exploration_update'
    args = {
      state: 'status',
      unexploredBranches: [],
      selectItems: selected.map((c) => ({
        itemId: c.itemId,
        basis: 'Check the public control and destination',
      })),
    }
  } else if (turn === 1) {
    name = 'page_observe'
    args = {}
  } else if (turn === 2) {
    if (['program-preflight', 'wire-null'].includes(mode)) {
      name = 'investigation_run'
      args = program(false)
    } else {
      name = 'page_act'
      args = {
        type: 'click',
        ref: candidates.find((c: any) => c.description.includes('Refresh'))?.ref,
        ...(mode === 'action-preflight'
          ? {}
          : {
              verify:
                mode === 'unknown-replay'
                  ? { ...verification, selector: '#missing' }
                  : verification,
            }),
      }
    }
  } else if (turn === 3 && !['continuity', 'covered-loop'].includes(mode)) {
    name = ['program-preflight', 'wire-null'].includes(mode) ? 'investigation_run' : 'page_act'
    args = ['program-preflight', 'wire-null'].includes(mode)
      ? program(true)
      : { type: 'click', selector: '#refresh', verify: verification }
  } else if (
    (turn === 3 && ['continuity', 'covered-loop'].includes(mode)) ||
    (turn === 4 && !['continuity', 'covered-loop'].includes(mode))
  ) {
    name = 'page_act'
    args = { type: 'click', ref: candidates.find((c: any) => c.category === 'navigation')?.ref }
  }
  if (mode === 'covered-loop' && turn >= 4) {
    name = 'page_inspect'
    args = { selector: 'h1', offset: 0 }
  }
  if (mode === 'label-contract' && turn >= 2 && turn <= 5) {
    name = 'page_act'
    args =
      turn <= 3
        ? {
            type: 'fill',
            selector: '#choice',
            value: 'Public choice',
            verify: {
              selector: '#choice',
              condition: turn === 2 ? 'value-equals' : 'selected-label-equals',
              expected: 'Public choice',
              basis: 'Public option label in the View control',
            },
          }
        : turn === 4
          ? { type: 'click', selector: '#refresh', verify: verification }
          : { type: 'click', ref: candidates.find((c: any) => c.category === 'navigation')?.ref }
  }
  if (mode === 'sampling-cap' && turn >= 2 && turn <= 7) {
    name = 'page_act'
    if (turn <= 3) args = { type: 'click', selector: '#refresh', verify: verification }
    else if (turn <= 6) {
      const id = ['second', 'third', 'fourth'][turn - 4]!
      args = {
        type: 'click',
        selector: '#' + id,
        verify: {
          selector: '#' + id,
          condition: 'text-equals',
          expected: id[0]!.toUpperCase() + id.slice(1) + ' ready',
          basis: 'Public buttons show their ready state',
        },
      }
    } else
      args = { type: 'click', ref: candidates.find((c: any) => c.category === 'navigation')?.ref }
  }
  if (mode === 'navigation-expectation' && turn === 3) {
    name = 'page_act'
    args = {
      type: 'click',
      ref: candidates.find((c: any) => c.category === 'navigation')?.ref,
      verify: {
        selector: 'body',
        condition: 'text-contains',
        expected: 'Invented destination text',
        basis: 'Unsupported guess from link label',
      },
    }
  }
  if (mode === 'navigation-contract' && turn === 3) {
    name = 'page_act'
    args = { type: 'navigate', url: origin + '/info' }
  }
  if (mode === 'wire-null' && name === 'investigation_run') {
    args.targets = args.targets.map((target: any) => ({
      identityBasis: null,
      binding: null,
      ...target,
    }))
    args.steps = args.steps.map((step: any) =>
      step.op === 'act' ? { value: null, scrollY: null, ...step } : step,
    )
  }
  if (['contract-repair', 'contract-loop'].includes(mode) && turn >= 1) {
    name =
      turn <= 2
        ? 'page_observe'
        : turn <= 4
          ? 'investigation_run'
          : turn === 5
            ? 'page_act'
            : 'run_finish'
    args =
      turn <= 3 || mode === 'contract-loop'
        ? {}
        : turn === 4
          ? program(true)
          : turn === 5
            ? { type: 'click', ref: candidates.find((c: any) => c.category === 'navigation')?.ref }
            : { reason: 'scope-covered' }
  }
  turn++
  const common = {
    id: randomUUID(),
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
  )
})
const endpoint = await listen(model),
  dbfile = resolve(root, 'runs.db'),
  log: string[] = []
const child = spawn(process.execPath, ['dist/server/index.js'], {
  env: {
    ...process.env,
    PORT: new URL(base).port,
    DATABASE_URL: 'file:' + dbfile,
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
    EXECUTION_OBSERVATION_REUSE: '1',
    EXECUTION_RULE_ROUTING: '1',
    EXECUTION_SHORT_FINISH: '1',
    EXECUTION_MODEL_STREAMING: '1',
    EXECUTION_BLOCKER_REVIEW: '0',
    EXECUTION_VISUAL_DISCOVERY: '0',
    RUN_TOTAL_TIMEOUT_MS: '300000',
    RUN_MAX_MODEL_CALLS: '30',
    RUN_MAX_ACTIONS: '20',
    OTEL_SDK_DISABLED: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', (b) => log.push(String(b)))
child.stderr.on('data', (b) => log.push(String(b)))
const results: any[] = []
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    await sleep(100)
  }
  for (mode of [
    'continuity',
    'covered-loop',
    'label-contract',
    'sampling-cap',
    'navigation-contract',
    'navigation-expectation',
    'program-preflight',
    'wire-null',
    'contract-repair',
    'contract-loop',
    'action-preflight',
    'unknown-replay',
  ]) {
    turn = 0
    clicks = 0
    messages = []
    requests = []
    selected = []
    originalId = ''
    const response = await fetch(base + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'ui-scan',
        entryUrl: origin + '/catalog?view=status',
        goal: 'Inspect this public page and its controls.',
      }),
    })
    if (response.status !== 202) throw Error('admission: ' + (await response.text()))
    const { runId } = (await response.json()) as any
    for (let i = 0; i < 800; i++) {
      const r = (await fetch(base + '/api/runs/' + runId).then((r) => r.json())) as any
      if (!['running', 'queued'].includes(r.status) && !r.active) break
      if (i === 799) throw Error('did-not-settle')
      await sleep(100)
    }
    const report = (await fetch(base + '/api/runs/' + runId + '/report').then((r) =>
      r.json(),
    )) as any
    await mkdir(resolve(root, mode))
    await save(mode + '/report.json', report)
    await save(mode + '/model-inputs.json', messages)
    await save(mode + '/page-requests.json', requests)
    const evidence = await downloadRunEvidence(base, report, resolve(root, mode, 'artifacts'))
    await save(mode + '/artifact-index.json', evidence.index)
    const original = report.uiScan?.inspection.items.find((i: any) => i.itemId === originalId)
    const events = report.events
    const checks = {
      contractRepair:
        !['contract-repair', 'contract-loop'].includes(mode) ||
        (events.filter((e: any) => e.type === 'execution:contract-repair').length === 1 &&
          (mode !== 'contract-loop' || turn <= 5)),
      navigationPreflight:
        mode !== 'navigation-contract' ||
        (JSON.stringify(events).includes('selected-navigation-requires-click') &&
          !events.some((e: any) => e.type === 'action:executing' && e.payload.type === 'navigate')),
      navigationExpectation:
        mode !== 'navigation-expectation' ||
        (JSON.stringify(events).includes('navigation-verification-is-separate') &&
          !report.uiScan.inspection.items.some((item: any) => item.status === 'failed')),
      sampling:
        mode !== 'sampling-cap' ||
        (JSON.stringify(events).includes('local-interaction-sampling-cap') &&
          !requests.some((r) => r.url === '/fourth-dispatched') &&
          Math.max(
            ...messages.map(
              (m) =>
                JSON.parse(m.body.messages.find((v: any) => v.role === 'user').content)
                  .localSampling.selected,
            ),
          ) === 3),
      bounded:
        mode !== 'covered-loop' ||
        (turn <= 9 &&
          events.filter((e: any) => e.type === 'execution:bounded-recovery').length === 1),
      healthyChecks:
        mode === 'unknown-replay' ||
        !report.uiScan.inspection.items.some((i: any) => i.status === 'failed'),
      labelPreflight:
        mode !== 'label-contract' || JSON.stringify(events).includes('verification-value-is-label'),
      terminal:
        mode === 'contract-loop'
          ? report.status !== 'completed' && original?.status === 'pending'
          : mode === 'unknown-replay'
            ? report.status !== 'completed' && original?.status === 'unverified'
            : report.status === 'completed' && original?.status === 'verified',
      proof: report.uiScan?.proofVerified === true,
      dispatched:
        clicks ===
        (mode === 'contract-loop' ? 0 : ['unknown-replay', 'sampling-cap'].includes(mode) ? 2 : 1),
      continuity: events.some(
        (e: any) => e.type === 'scope:candidate-reobserved' && e.payload.itemId === originalId,
      ),
      navigation:
        mode === 'contract-loop' ||
        report.uiScan?.inspection.items.find(
          (i: any) => i.itemId === selected.find((c) => c.category === 'navigation')?.itemId,
        )?.status === 'verified',
      preflight: ['program-preflight', 'wire-null'].includes(mode)
        ? JSON.stringify(events).includes('ambiguous-result-binding') &&
          report.hypotheses.length === 1
        : mode === 'action-preflight'
          ? JSON.stringify(events).includes('postcondition-required')
          : true,
      history:
        mode !== 'unknown-replay' ||
        events.some(
          (e: any) =>
            e.type === 'scope:item-updated' &&
            e.payload.itemId === originalId &&
            e.payload.status === 'unverified',
        ),
    }
    results.push({
      mode,
      runId,
      checks,
      passed: Object.values(checks).every(Boolean),
      clicks,
      turns: turn,
      status: report.status,
      eventIds: events.map((e: any) => e.id),
    })
    await save('results.json', results)
  }
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
  await save('server-log.json', log)
}
const db = createClient({ url: 'file:' + dbfile })
for (const row of results) {
  const count = await db.execute({
    sql: 'SELECT id FROM run_events WHERE run_id=? ORDER BY seq',
    args: [row.runId],
  })
  row.durable = JSON.stringify(count.rows.map((r) => r.id)) === JSON.stringify(row.eventIds)
  row.passed &&= row.durable
}
db.close()
await save('summary.json', {
  evidenceClass: 'B',
  selfTest: true,
  independentAcceptance: false,
  paidRequests: 0,
  passed: results.every((r) => r.passed),
  results,
})
console.log(
  JSON.stringify({ directory: root, results: results.map(({ eventIds, ...row }) => row) }),
)
if (results.some((r) => !r.passed)) process.exitCode = 1
