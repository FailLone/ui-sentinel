/** Free diagnostic only: compare terminal attribution on an unchanged compiled candidate.
 * It records failures, does not grant acceptance, and must never call a remote model.
 */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hashTree } from './url-scan-freeze.ts'

const root = resolve('data/r0-state-contract', new Date().toISOString().replace(/[:.]/g, '-'))
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
let pageRequests: { method?: string; url?: string }[] = []
const fixture = createServer((req, res) => {
  pageRequests.push({ method: req.method, url: req.url })
  res.setHeader('content-type', 'text/html')
  res.end(
    `<h1>Public information</h1><p>Service information.</p>${mode.startsWith('denied') ? "<script>fetch('/write',{method:'POST'}).catch(()=>{})</script>" : ''}`,
  )
})
const origin = await listen(fixture)
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw)
  calls++
  const finish = mode.endsWith('-finish')
  const common = {
    id: `probe-${calls}`,
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', ...(finish ? { tool_calls: [{ index: 0, id: `tool-${calls}`, type: 'function', function: { name: 'run_finish', arguments: JSON.stringify({ reason: 'observed-blocker' }) } }] } : { content: '' }) }, finish_reason: null }] })}\n\n` +
      `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: finish ? 'tool_calls' : 'length' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
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
const rows: unknown[] = []
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
  // Put the deliberate unknown-write attribution last: it may quarantine later admissions.
  // The final clean run records that quarantine instead of treating it as an execution sample.
  for (mode of [
    'clean-finish',
    'clean-length',
    'denied-finish',
    'denied-length',
    'after-denied-clean',
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
    let settled = false
    for (let i = 0; i < 800; i++) {
      const run = (await fetch(`${base}/api/runs/${runId}`).then((r) => r.json())) as any
      settled = !['queued', 'running'].includes(run.status) && !run.active
      if (settled) break
      await sleep(100)
    }
    if (!settled) throw Error('run-not-settled')
    const report = (await fetch(`${base}/api/runs/${runId}/report`).then((r) => r.json())) as any
    await save(mode + '-report.json', report)
    await save(mode + '-page-requests.json', pageRequests)
    rows.push({
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
console.log(
  JSON.stringify({
    directory: root,
    paidRequests: 0,
    acceptanceGranted: false,
    rows: rows.map((r: any) => ({
      ...r,
      terminalEvents: r.terminalEvents.map((e: any) => ({ type: e.type, payload: e.payload })),
    })),
  }),
)
