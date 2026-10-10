/** Normal HTTP/workbench/executor/history; only upstream models are in-process/local fixed fixtures. */
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { build as viteBuild } from 'vite'
import { chromium } from 'playwright'
import { strict as assert } from 'node:assert'
const root = resolve('data/popup-ui-contract', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
const documents: Record<string, string> = {
  direct: `<button onclick="setTimeout(()=>document.querySelectorAll('.panel').forEach(n=>n.hidden=false),150)">Open details</button><div class="panel" id="p" hidden style="position:fixed;left:20px;top:120px;width:240px;height:150px;background:white;border:1px solid">Details overview</div><div class="panel" id="notice" hidden style="position:fixed;left:320px;top:120px;width:200px;height:100px;background:white;border:1px solid">Unrelated notice</div>`,
  nested: `<button onclick="document.getElementById('next').hidden=false">More options</button><button id="next" hidden onclick="document.getElementById('p').hidden=false">Open details</button><div id="p" hidden style="position:fixed;left:20px;top:120px;width:400px;height:150px;background:white;border:1px solid">Details overview</div>`,
  wrong: `<button onclick="document.getElementById('p').showModal()">Open details</button><dialog id="p">Error</dialog>`,
  existing: `<button>Open details</button><div id="p" style="position:fixed;left:20px;top:120px;width:240px;height:150px;background:white;border:1px solid">Details overview</div>`,
}
const fixture = createServer((req, res) => {
  const name = req.url?.slice(1) ?? ''
  if (name === 'favicon.ico') return void res.writeHead(204).end()
  const html = documents[name]
  res
    .writeHead(html ? 200 : 404, { 'content-type': 'text/html' })
    .end(
      html
        ? `<!doctype html><html><head><title>Popup ${name}</title><style>button{margin:10px}dialog{position:fixed} [hidden]{display:none!important}</style></head><body><h1>Public controls</h1><button onclick="this.textContent='Unrelated clicked'">Sort alphabetically</button><button onclick="this.textContent='Unrelated clicked'">Change density</button>${html}</body></html>`
        : 'Not found',
    )
})
const origin = await listen(fixture),
  packets: any[] = [],
  logs: string[] = [],
  rows: any[] = []
const provider = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw)
  packets.push(body)
  const tool = { name: 'run_finish', args: { reason: 'unverified-scope' } }
  const call = {
    index: 0,
    id: 'partial-' + packets.length,
    type: 'function',
    function: { name: tool.name, arguments: JSON.stringify(tool.args) },
  }
  const base = {
    id: 'fixed-' + packets.length,
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res
    .writeHead(200, { 'content-type': 'text/event-stream' })
    .end(
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
    )
})
const endpoint = await listen(provider),
  socket = createServer(),
  base = await listen(socket)
await new Promise<void>((r) => socket.close(() => r()))
await writeFile(resolve(root, 'empty.env'), '')
await build({
  entryPoints: ['scripts/popup-ui-contract/fixed.ts'],
  outfile: resolve(root, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
})
await viteBuild({ configFile: 'src/web/vite.config.ts' })
await save('identity.json', {
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  diff: execFileSync('git', ['diff'], { encoding: 'utf8' }),
  realCalls: 0,
})
const serverEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  DOTENV_CONFIG_PATH: resolve(root, 'empty.env'),
  PORT: new URL(base).port,
  DATABASE_URL: 'file:' + resolve(root, 'runs.db'),
  AGENT_MODEL: 'openai/local-fixed',
  OPENAI_BASE_URL: endpoint + '/v1',
  OPENAI_API_KEY: 'local-only',
  VISION_MODEL: 'qwen/local-fixed',
  VISION_BASE_URL: endpoint + '/v1',
  VISION_API_KEY: 'local-only',
  VISION_MODEL_FAMILY: 'qwen3',
  EXECUTION_URL_SCAN: '1',
  EXECUTION_POPUP_JEV: '1',
  URL_SCAN_DNS_MODE: 'system',
  URL_SCAN_TRUSTED_ORIGINS: origin,
  EXECUTION_BLOCKER_REVIEW: '0',
  EXECUTION_VISUAL_DISCOVERY: '0',
  EXECUTION_JOURNEYS: '0',
  MODEL_REQUEST_MAX_RETRIES: '0',
  RUN_TOTAL_TIMEOUT_MS: '120000',
  RUN_MAX_MODEL_CALLS: '12',
  RUN_MAX_ACTIONS: '6',
  TOOL_TIMEOUT_MS: '15000',
  OTEL_SDK_DISABLED: 'true',
}
function boot() {
  const c = spawn(process.execPath, [resolve(root, 'server.mjs')], {
    cwd: process.cwd(),
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  c.stdout!.on('data', (b) => logs.push(String(b)))
  c.stderr!.on('data', (b) => logs.push(String(b)))
  return c
}
let child = boot(),
  exited = new Promise((r) => child.once('exit', r))
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage()
console.log(root)
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    if (i === 99) throw Error('startup')
    await new Promise((r) => setTimeout(r, 100))
  }
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(documents)
  const rejected = await fetch(base + '/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'ui-scan',
      entryUrl: origin + '/normal',
      popupCheck: { mode: 'popup-viewport' },
      exploration: { mode: 'program', jev: false },
    }),
  })
  assert.equal(rejected.status, 400, 'mutually exclusive planners rejected before queue')
  for (const name of names) {
    const created: any = await fetch(base + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'ui-scan',
        entryUrl: origin + '/' + name,
        popupCheck: { mode: 'popup-viewport' },
        viewport: { width: name === 'nested' ? 320 : 640, height: 480 },
        goal: 'After clicking "Open details", show popup "Details overview".',
      }),
    }).then((r) => r.json())
    assert(created.runId, JSON.stringify(created))
    let report: any
    for (let i = 0; i < 1500; i++) {
      const current: any = await fetch(base + `/api/runs/${created.runId}`).then((r) => r.json())
      if (!['queued', 'running'].includes(current.status)) {
        report = await fetch(base + `/api/runs/${created.runId}/report`).then((r) => r.json())
        if (
          !['queued', 'running'].includes(report.status) &&
          report.persistence?.status !== 'not-final'
        )
          break
        report = undefined
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    assert(report, 'run timed out')
    await save(name + '.json', report)
    const popup = report.uiScan?.popupCheck
    console.log(name, report.status, popup?.verdict, popup?.reason, popup?.attempts?.length)
    assert(popup, 'popup report absent')
    assert.equal(popup.revision, 'popup-viewport-2')
    assert.equal(popup.verdict, name === 'nested' ? 'fail' : 'pass', JSON.stringify(popup))
    assert.equal(popup.attempts.length, name === 'nested' ? 2 : name === 'existing' ? 0 : 1)
    assert.equal(popup.uiChecks.length, name === 'direct' ? 2 : 1)
    assert(
      !report.events.some((e: any) => e.type === 'popup:decision' && e.payload.stage === 'target'),
    )
    const functional = report.uiScan.functionalChecks
    if (name === 'direct' || name === 'nested')
      assert(
        functional.some((e: any) => e.state === 'verified'),
        JSON.stringify(functional),
      )
    else assert(!functional.some((e: any) => e.state === 'verified'), JSON.stringify(functional))
    if (name === 'wrong') assert(functional.some((e: any) => e.state === 'unverified'))
    assert(
      !report.events.some(
        (e: any) =>
          e.type === 'action:executing' &&
          /Sort alphabetically|Change density/.test(JSON.stringify(e.payload)),
      ),
      'unrelated controls clicked',
    )
    assert.equal(
      report.uiScan.inspection.coverage,
      'partial',
      'subtask must not discharge remaining default obligations',
    )
    const restored: any = await fetch(base + `/api/runs/${created.runId}/report`).then((r) =>
      r.json(),
    )
    assert.deepEqual(restored.uiScan.popupCheck, popup)
    assert.equal(report.persistence.status, 'verified', JSON.stringify(report.persistence))
    if (name === 'direct' || name === 'wrong') {
      await page.goto(base + '/?run=' + encodeURIComponent(created.runId))
      const panel = page.locator('section[aria-label="弹窗视口检查"]')
      await panel.getByText('功能预期：', { exact: false }).waitFor()
      await panel.screenshot({ path: resolve(root, name + '-report.png') })
    }
    rows.push({
      name,
      runId: created.runId,
      status: report.status,
      popup,
      functionalChecks: functional,
      coverage: report.uiScan.inspection.coverage,
      historyMatches: true,
    })
  }
  child.kill('SIGTERM')
  await exited
  child = boot()
  exited = new Promise((r) => child.once('exit', r))
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    await new Promise((r) => setTimeout(r, 100))
  }
  for (const row of rows) {
    const report: any = await fetch(base + `/api/runs/${row.runId}/report`).then((r) => r.json())
    assert.deepEqual(report.uiScan.popupCheck, row.popup, 'restart must restore historical result')
    assert.deepEqual(report.uiScan.functionalChecks, row.functionalChecks)
  }
  const measured = rows.find((r) => r.popup.verdict === 'pass')
  if (measured) {
    const db = new DatabaseSync(resolve(root, 'runs.db'), { readOnly: true })
    const artifact = db
      .prepare('SELECT file_path FROM artifacts WHERE id=?')
      .get(measured.popup.receiptRef)!
    db.close()
    const path = String(artifact.file_path),
      bytes = await readFile(path)
    try {
      await writeFile(path, '{invalid-json')
      const damaged: any = await fetch(base + `/api/runs/${measured.runId}/report`).then((r) =>
        r.json(),
      )
      assert.equal(damaged.uiScan.popupCheck.verdict, 'unknown')
      assert.equal(damaged.persistence.status, 'inconsistent')
      await save('corruption-check.json', {
        verdict: damaged.uiScan.popupCheck.verdict,
        issues: damaged.persistence.issues,
      })
    } finally {
      await writeFile(path, bytes)
    }
  }
  await save('result.json', {
    realCalls: 0,
    rows,
    modelRequests: packets.length,
    restartRestored: true,
    damagedReceiptRefusesPass: !!measured,
  })
} finally {
  await save('packets.json', packets)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
  await browser.close()
  child.kill('SIGTERM')
  await exited
  await new Promise<void>((r) => fixture.close(() => r()))
  await new Promise<void>((r) => provider.close(() => r()))
}
