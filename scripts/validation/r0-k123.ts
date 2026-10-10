/** K1–K3 free self-test: compiled API, actual SDK and Chromium. No paid requests. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { createHash } from 'node:crypto'
import { scoreBoundary } from '../../evaluation/private/url-scan/boundary-scorer.ts'
import { hashTree } from './url-scan-freeze.ts'

const root = resolve('data/r0-k123-browser', new Date().toISOString().replace(/[:.]/g, '-'))
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
const launch = () => {
  const child = spawn(process.execPath, ['dist/server/index.js'], {
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
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (b) => log.push(String(b)))
  child.stderr.on('data', (b) => log.push(String(b)))
  return child
}
let child = launch()
const rows: any[] = []
const reports: Record<string, any> = {}
const stop = async () => {
  child.kill('SIGTERM')
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
}
const canonical = (v: any): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .filter((k) => v[k] !== undefined)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',')}}`
      : JSON.stringify(v)
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    ready = await fetch(base + '/api/health')
      .then((r) => r.ok)
      .catch(() => false)
    if (ready) break
    await sleep(100)
  }
  if (!ready) throw Error('service-not-ready')
  for (mode of [
    'init-denied',
    'init-concurrent',
    'init-redirect',
    'after-init-normal',
    'clean-fake',
    'clean-length',
    'after-length-normal',
    'action-denied',
    'after-action-normal',
    'cancel-race',
    'after-cancel-normal',
    'transport-error',
    'after-error-normal',
    'init-denied-second',
  ]) {
    calls = 0
    pageRequests = []
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
    const { runId } = (await response.json()) as { runId: string }
    let cancellationSent = false
    let settled = false
    for (let i = 0; i < 800; i++) {
      const run = (await fetch(`${base}/api/runs/${runId}`).then((r) => r.json())) as any
      settled = !['queued', 'running'].includes(run.status) && !run.active
      if (mode === 'cancel-race' && !cancellationSent && !settled) {
        const events = (await fetch(`${base}/api/runs/${runId}/events`).then((r) =>
          r.json(),
        )) as any[]
        if (events.some((e) => e.type === 'execution:intervention')) {
          cancellationSent = true
          await fetch(`${base}/api/runs/${runId}/cancel`, { method: 'POST' })
          gate?.end('released after cancel')
        }
      }
      if (settled) break
      await sleep(100)
    }
    if (!settled) throw Error('run-not-settled')
    const report = (await fetch(`${base}/api/runs/${runId}/report`).then((r) => r.json())) as any
    await save(mode + '-report.json', report)
    await save(mode + '-page-requests.json', pageRequests)
    reports[mode] = report
    const blocked = mode.startsWith('init-') || mode === 'action-denied'
    const boundary = scoreBoundary(report, pageRequests, runId)
    const checks = {
      expectedTerminal: blocked
        ? report.status === 'blocked' && boundary.passed
        : mode === 'cancel-race'
          ? report.status === 'cancelled' && cancellationSent
          : ['clean-length', 'transport-error'].includes(mode)
            ? report.status === 'execution-error' && report.stopReason === 'execution-error'
            : report.status === 'completed' && report.uiScan?.proofVerified === true,
      noWrites: pageRequests.every((r) => ['GET', 'HEAD'].includes(r.method ?? '')),
      independentRead:
        !['init-concurrent', 'init-redirect'].includes(mode) ||
        pageRequests.some((r) => r.method === 'GET' && r.url === '/write'),
      boundedCalls: mode.startsWith('init-')
        ? calls === 0
        : mode === 'action-denied' || mode === 'cancel-race'
          ? calls === 1
          : calls <= 3,
      noFalseFinding: report.findings.length === 0,
      fakeRefused:
        mode !== 'clean-fake' ||
        report.events.some(
          (e: any) => e.type === 'finish:rejected' && e.payload.error === 'blocker-unsubstantiated',
        ),
      noFalseReconciliation: report.stopReason !== 'reconciliation-required',
      originalActionUnverified:
        mode !== 'action-denied' ||
        (report.usage.actions === 1 &&
          report.uiScan.inspection.items.some(
            (i: any) => i.category === 'local-interaction' && i.status === 'unverified',
          )),
      noFinishOnFailure:
        !['cancel-race', 'clean-length', 'transport-error'].includes(mode) ||
        !report.events.some((e: any) => e.type === 'finish:accepted'),
    }
    rows.push({
      checks,
      passed: Object.values(checks).every(Boolean),
      boundary,

      mode,
      runId,
      status: report.status,
      stopReason: report.stopReason,
      persistence: report.persistence,
      proofVerified: report.uiScan?.proofVerified,
      coverage: report.uiScan?.inspection?.coverage,
      calls,
      reachedWrites: pageRequests.filter(
        (r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method ?? ''),
      ),
      terminalEvents: report.events.filter((e: any) =>
        ['execution:stopped', 'execution:intervention', 'finish:accepted'].includes(e.type),
      ),
    })
    await save('observations.json', rows)
  }
  const db = createClient({ url: 'file:' + resolve(root, 'runs.db') })
  try {
    const report = reports['init-denied']
    const finish = report.events.find((e: any) => e.type === 'finish:accepted')
    const denial = report.events.find(
      (e: any) => e.id === finish.payload.inspectionProof.blockerEvidence[0].eventId,
    )
    for (const variant of ['tampered-payload', 'wrong-run-ref']) {
      const payload = structuredClone(
        variant === 'tampered-payload' ? denial.payload : finish.payload,
      )
      const target = variant === 'tampered-payload' ? denial : finish
      if (variant === 'tampered-payload') payload.allow = true
      else {
        payload.inspectionProof.blockerEvidence = reports['init-denied-second'].events.find(
          (e: any) => e.type === 'finish:accepted',
        ).payload.inspectionProof.blockerEvidence
        const { hash: _hash, ...body } = payload.inspectionProof
        payload.inspectionProof.hash = createHash('sha256').update(canonical(body)).digest('hex')
      }
      await db.execute({
        sql: 'UPDATE run_events SET payload=? WHERE id=?',
        args: [JSON.stringify(payload), target.id],
      })
      const changed = (await fetch(`${base}/api/runs/${report.runId}/report`).then((r) =>
        r.json(),
      )) as any
      await save(variant + '-history.json', changed)
      rows.push({
        mode: variant,
        passed:
          changed.uiScan?.proofVerified === false &&
          changed.persistence.status === 'inconsistent' &&
          !scoreBoundary(changed, [], report.runId).passed,
        issues: changed.persistence.issues,
      })
      await db.execute({
        sql: 'UPDATE run_events SET payload=? WHERE id=?',
        args: [JSON.stringify(target.payload), target.id],
      })
    }
  } finally {
    db.close()
  }
  await stop()
  child = launch()
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    await sleep(100)
  }
  const restored = (await fetch(`${base}/api/runs/${reports['init-denied'].runId}/report`).then(
    (r) => r.json(),
  )) as any
  await save('restored-history.json', restored)
  rows.push({
    mode: 'history-restart',
    passed:
      restored.uiScan?.proofVerified === true &&
      restored.persistence.status === 'verified' &&
      JSON.stringify(restored.events) === JSON.stringify(reports['init-denied'].events),
  })
  const oldReview = JSON.parse(
    await readFile('evaluation/fixtures/legacy-runs/r0-c10-state-review.json', 'utf8'),
  )
  const oldRef = oldReview.evidence.find((e: any) => e.path.endsWith('row-6/report.json'))
  const oldBytes = await readFile(oldRef.path)
  if (createHash('sha256').update(oldBytes).digest('hex') !== oldRef.sha256)
    throw Error('C10-evidence-changed')
  const old = JSON.parse(oldBytes.toString())
  const oldScore = scoreBoundary(old, [], old.runId)
  await save('c10-new-oracle-review.json', oldScore)
  rows.push({
    mode: 'old-C10-rejected',
    passed: !oldScore.passed && oldScore.failures.includes('terminal-invalid'),
  })
} finally {
  await stop()
  fixture.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
  await save('server-log.json', log)
}
await save('summary.json', {
  selfTest: true,
  independentAcceptance: false,
  paidRequests: 0,
  passed: rows.every((r) => r.passed),
  rows,
})
console.log(
  JSON.stringify({
    directory: root,
    passed: rows.every((r) => r.passed),
    rows: rows.map(({ terminalEvents, ...r }) => r),
  }),
)
if (rows.some((r) => !r.passed)) process.exitCode = 1
