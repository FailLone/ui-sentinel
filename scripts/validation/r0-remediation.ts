/** A/B self-test only. All model traffic terminates on the local fixed server. */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import { chromium } from 'playwright'
import { hashTree } from './url-scan-freeze.ts'
import { execFileSync } from 'node:child_process'
const root = resolve('data/r0-remediation', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (p: string, v: unknown) =>
  writeFile(resolve(root, p), JSON.stringify(v, null, 2) + '\n')
await save('build-identity.json', {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dist: await hashTree('dist'),
  source: await hashTree('src'),
  evaluation: await hashTree('evaluation'),
  scripts: await hashTree('scripts'),
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (server.address() as any).port
}
const reserve = createServer()
const base = await listen(reserve)
await new Promise<void>((r) => reserve.close(() => r()))
let mode = '',
  turn = 0,
  release: (() => void) | undefined,
  savedRef = '',
  clicks = 0,
  requestLog: any[] = [],
  modelLog: any[] = [],
  runId = ''
const respond = () => {
  const pending = release
  release = undefined
  pending?.()
}
const fixture = createServer((req, res) => {
  requestLog.push({ method: req.method, path: req.url })
  if (req.url === '/status') {
    clicks++
    release = () => {
      if (res.writableEnded || res.destroyed) return
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ text: mode.includes('defect') ? 'Wrong' : 'Ready' }))
    }
    if (mode === 'direct-defect') respond()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(
    `<!doctype html><h1>Product catalog</h1><p>Refresh updates the status to Ready.</p><button type=button id=refresh>Refresh</button><div id=result><span>Idle</span></div><script>refresh.onclick=async()=>{result.innerHTML='';let d=await(await fetch('/status')).json();result.innerHTML='<span>'+d.text+'</span>'}</script>`,
  )
})
const origin = await listen(fixture)
const dbfile = resolve(root, 'runs.db')
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw),
    packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  modelLog.push({ mode, turn, body })
  let name = 'run_finish',
    args: any = { reason: 'scope-covered' }
  if (turn === 0) {
    name = 'page_act'
    args = {
      type: 'click',
      selector: '#refresh',
      verify: {
        selector: '#result span',
        condition: 'text-equals',
        expected: 'Ready',
        basis: 'Public page says Refresh updates status to Ready',
      },
    }
  } else if (mode === 'direct-defect') {
    // Finish from the original postcondition; no extra investigation may fabricate coverage.
  } else if (turn === 1) {
    savedRef = packet.recoverableInteractions?.[0]?.checkRef ?? ''
    if (
      ['healthy', 'defect', 'wrong-ref', 'tampered', 'wrong-target', 'stale-action'].includes(mode)
    ) {
      respond()
      await sleep(100)
    }
    if (mode === 'tampered') {
      const db = createClient({ url: 'file:' + dbfile })
      const row = (
        await db.execute({
          sql: "SELECT file_path FROM artifacts WHERE run_id=? AND type='interaction-measurement'",
          args: [runId],
        })
      ).rows[0]
      await writeFile(String(row!.file_path), '{}')
      db.close()
    }
    name = 'interaction_verify'
    args = { checkRef: mode === 'wrong-ref' ? randomUUID() : savedRef }
    if (mode === 'wrong-target')
      args = { checkRef: savedRef, selector: 'h1', expected: 'Product catalog' }
    if (mode === 'stale-action') {
      name = 'page_act'
      args = { type: 'scroll', scrollY: 50 }
    }
    if (['loop', 'new-evidence'].includes(mode)) {
      name = 'page_inspect'
      args = { selector: 'h1', offset: 0 }
    }
  } else if (mode === 'loop') {
    name = 'page_inspect'
    args = { selector: 'h1', offset: 0 }
  } else if (mode === 'new-evidence' && turn < 5) {
    if (turn === 4) {
      respond()
      await sleep(100)
    }
    name = 'page_inspect'
    args = { selector: 'h1', offset: 0 }
  } else if (mode === 'unrecoverable' && turn === 2) {
    name = 'interaction_verify'
    args = { checkRef: savedRef }
  } else if (mode === 'stale-action' && turn === 2) {
    name = 'interaction_verify'
    args = { checkRef: savedRef }
  } else if (!['healthy', 'defect', 'direct-defect', 'new-evidence'].includes(mode))
    args = { reason: 'unverified-scope' }
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
const modelOrigin = await listen(model)
const logs: string[] = []
const child = spawn(process.execPath, ['dist/server/index.js'], {
  env: {
    ...process.env,
    PORT: new URL(base).port,
    DATABASE_URL: 'file:' + dbfile,
    AGENT_MODEL: 'openai/fixed-local',
    OPENAI_BASE_URL: modelOrigin + '/v1',
    OPENAI_API_KEY: 'local-only',
    OPENROUTER_API_KEY: '',
    VISION_API_KEY: 'local-only',
    VISION_MODEL: 'qwen/fixed-local',
    VISION_MODEL_FAMILY: 'qwen3',
    VISION_BASE_URL: modelOrigin + '/v1',
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
child.stdout.on('data', (b) => logs.push(String(b)))
child.stderr.on('data', (b) => logs.push(String(b)))
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
    'healthy',
    'defect',
    'direct-defect',
    'wrong-ref',
    'wrong-target',
    'stale-action',
    'unrecoverable',
    'loop',
    'new-evidence',
    'tampered',
  ]) {
    turn = 0
    clicks = 0
    requestLog = []
    modelLog = []
    savedRef = ''
    release = undefined
    const created = await fetch(base + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'ui-scan',
        entryUrl: origin + '/catalog?category=books&sort=price',
        goal: 'Inspect the catalog UI and its controls within the allowed scope. Report evidence-backed issues and anything left unverified.',
      }),
    })
    if (created.status !== 202) throw Error('admission:' + (await created.text()))
    runId = ((await created.json()) as any).runId
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
    await save(mode + '/page-requests.json', requestLog)
    await save(mode + '/model-inputs.json', modelLog)
    const saved = await downloadRunEvidence(base, report, resolve(root, mode, 'artifacts'))
    await save(
      mode + '/artifact-index.json',
      saved.index.map((i) => ({ ...i, path: 'artifacts/' + encodeURIComponent(i.artifactId) })),
    )
    let historicalTamperRejected = true
    if (mode === 'direct-defect') {
      const seal = report.events.find((e: any) => e.type === 'interaction:finding-measured')
      const db = createClient({ url: 'file:' + dbfile })
      const row = (
        await db.execute({
          sql: 'SELECT file_path FROM artifacts WHERE run_id=? AND id=?',
          args: [runId, seal.payload.receiptRef],
        })
      ).rows[0]!
      const path = String(row.file_path),
        original = await readFile(path)
      try {
        await writeFile(path, '{}')
        const corrupted = (await fetch(base + '/api/runs/' + runId + '/report').then((r) =>
          r.json(),
        )) as any
        await save(mode + '/tampered-history-report.json', corrupted)
        historicalTamperRejected =
          !corrupted.uiScan.proofVerified &&
          corrupted.persistence.issues.includes('interaction-finding-unverified')
      } finally {
        await writeFile(path, original)
        db.close()
      }
    }
    const open = report.events.find((e: any) => e.type === 'interaction:verification-opened')
    const recovered = report.events.filter((e: any) => e.type === 'interaction:recovered')
    const seal = report.events.find((e: any) => e.type === 'interaction:finding-measured')
    const item = report.uiScan?.inspection.items.find(
      (i: any) => i.itemId === (open?.payload.itemId ?? seal?.payload.itemId),
    )
    const chain =
      !!open &&
      report.events.some(
        (e: any) =>
          e.type === 'scope:item-updated' &&
          e.payload.itemId === item?.itemId &&
          e.payload.status === 'unverified' &&
          e.seq < open.seq,
      )
    const complete = ['healthy', 'defect', 'direct-defect', 'new-evidence'].includes(mode)
    const checks = {
      historicalTamperRejected,
      oneAction: clicks === 1,
      negativeReason:
        mode === 'wrong-ref'
          ? report.events.some(
              (e: any) =>
                e.type === 'interaction:recovery-rejected' &&
                String(e.payload.reason).includes('reference-unavailable'),
            )
          : mode === 'stale-action'
            ? report.events.some(
                (e: any) =>
                  e.type === 'interaction:recovery-rejected' &&
                  String(e.payload.reason).includes('state-stale'),
              )
            : mode === 'wrong-target'
              ? recovered.length === 0 &&
                JSON.stringify(report.events).includes('Unrecognized keys') &&
                report.status === 'blocked' &&
                report.uiScan.proofVerified
              : mode === 'unrecoverable'
                ? recovered.length === 2 &&
                  recovered.every((e: any) => e.payload.outcome === 'unverified') &&
                  report.uiScan.proofVerified
                : mode === 'loop'
                  ? report.events.filter((e: any) => e.type === 'execution:bounded-recovery')
                      .length === 1 && report.uiScan.proofVerified
                  : mode === 'tampered'
                    ? report.stopReason === 'reconciliation-required' &&
                      report.persistence.issues.includes('recovery-artifact-unverified') &&
                      !report.uiScan.proofVerified
                    : true,

      originalUnknownRetained: mode === 'direct-defect' ? !open && !!seal : chain,
      expectedTerminal: complete
        ? report.status === 'completed' &&
          report.uiScan?.proofVerified &&
          report.uiScan.inspection.coverage === 'covered'
        : report.status !== 'completed' && report.uiScan?.inspection.coverage === 'partial',
      originalItem: complete
        ? item?.status === (mode.includes('defect') ? 'failed' : 'verified')
        : item?.status === 'unverified',
      defectFinding:
        !mode.includes('defect') ||
        (report.findings.filter(
          (f: any) =>
            f.validationStatus === 'supported' && f.hypothesisId === seal?.payload.hypothesisId,
        ).length === 1 &&
          !report.events.some((e: any) => e.type === 'program:measured')),
      bounded: mode !== 'loop' || turn <= 6,
      newEvidence:
        mode !== 'new-evidence' ||
        (report.events.some(
          (e: any) => e.type === 'execution:bounded-recovery' && e.payload.changed === true,
        ) &&
          turn >= 6),
      originalExpectation: recovered.every(
        (e: any) => JSON.stringify(e.payload.input) === JSON.stringify(open.payload.input),
      ),
    }
    results.push({
      mode,
      runId,
      checks,
      passed: Object.values(checks).every(Boolean),
      turns: turn,
      clicks,
      status: report.status,
      stopReason: report.stopReason,
    })
    await save('results.json', results)
    respond()
  }
  // Independent browser confirms the fixture's healthy and broken feedback, without production scoring.
  const browser = await chromium.launch({ headless: true })
  try {
    for (mode of ['healthy', 'defect']) {
      release = undefined
      const p = await browser.newPage()
      await p.goto(origin + '/catalog')
      await p.locator('#refresh').click()
      for (let i = 0; i < 20 && !release; i++) await sleep(10)
      respond()
      await p.waitForFunction(() => !!document.querySelector('#result span'))
      const text = await p.locator('#result span').innerText()
      await p.screenshot({ path: resolve(root, mode, 'independent.png') })
      await save(mode + '/independent.json', {
        text,
        expected: mode === 'healthy' ? 'Ready' : 'Wrong',
        passed: text === (mode === 'healthy' ? 'Ready' : 'Wrong'),
      })
      if (text !== (mode === 'healthy' ? 'Ready' : 'Wrong'))
        throw Error('Independent fixture replay failed: ' + mode)
      await p.close()
    }
  } finally {
    await browser.close()
  }
} finally {
  respond()
  child.kill('SIGTERM')
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
  fixture.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
  await save('server-log.json', logs)
}
const db = createClient({ url: 'file:' + dbfile })
try {
  for (const row of results) {
    const report = JSON.parse(await readFile(resolve(root, row.mode, 'report.json'), 'utf8'))
    const events = (
      await db.execute({
        sql: 'SELECT id FROM run_events WHERE run_id=? ORDER BY seq',
        args: [row.runId],
      })
    ).rows
    row.durable =
      JSON.stringify(events.map((e) => e.id)) ===
      JSON.stringify(report.events.map((e: any) => e.id))
    row.passed &&= row.durable
  }
} finally {
  db.close()
}
await save('results.json', results)
await save('summary.json', {
  evidenceClass: 'B',
  selfTest: true,
  independentAcceptance: false,
  paidRequests: 0,
  passed: results.length === 10 && results.every((r) => r.passed),
  results,
})
console.log(JSON.stringify({ directory: root, results, paidRequests: 0 }))
if (results.length !== 10 || results.some((r) => !r.passed)) process.exitCode = 1
