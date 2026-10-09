/** Fixed free local provider -> normal API/executor/Chromium/workbench; never a real model. */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { build as viteBuild } from 'vite'
import { chromium } from 'playwright'
import { strict as assert } from 'node:assert'
import { imagePng } from '../../evaluation/fixtures/image-shape.ts'
const root = resolve('data/rules-scan-integration', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`
}
let mode = '',
  turn = 0
const packets: unknown[] = [],
  requests: unknown[] = [],
  results: unknown[] = [],
  logs: string[] = []
const style =
  '<style>html{background:white}body{margin:20px}button{appearance:none;border:0;border-radius:0;padding:8px;width:180px;height:40px;background:white;color:white;font:16px Arial}img{width:80px;height:40px}</style>'
const fixture = createServer((req, res) => {
  requests.push({ mode, url: req.url, method: req.method })
  if (req.url === '/missing.png') {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('missing')
    return
  }
  if (req.url === '/ok.png') {
    res.writeHead(200, { 'content-type': 'image/png' }).end(imagePng)
    return
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204).end()
    return
  }
  const button = `<button id="control" style="${mode === 'healthy' ? 'color:black' : mode === 'unsupported' ? 'text-shadow:1px 1px black' : ''}">${mode === 'updated' ? 'Switch' : 'Continue'}</button>`
  let body = button
  if (mode === 'budget')
    body =
      Array.from({ length: 20 }, (_, i) => `<button>Choice ${i}</button>`).join('') +
      Array.from({ length: 1030 }, () => '<div></div>').join('')
  if (mode === 'workbench')
    body += '<section><img src="/missing.png"><span>Public nearby name</span></section>'
  if (mode === 'healthy') body += '<img src="/ok.png">'
  if (mode === 'intervened')
    body +=
      '<img src="http://127.0.0.1:54321/denied.png"><script>fetch("/write",{method:"POST"}).catch(()=>{})</script>'
  if (mode === 'updated')
    body +=
      '<script>document.querySelector("button").onclick=()=>{const old=document.querySelector("button"),next=old.cloneNode(true);next.style.color="black";old.replaceWith(next)}</script>'
  res
    .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    .end('<!doctype html><title>Synthetic ordinary scan; not Jira</title>' + style + body)
})
const origin = await listen(fixture)
const provider = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const part of req) raw += part
    const body = JSON.parse(raw),
      message = body.messages.filter((m: any) => m.role === 'user').at(-1),
      input = JSON.parse(message.content)
    packets.push({ mode, turn, input })
    let calls: any[]
    if (mode === 'updated' && turn === 0) {
      const candidate = input.inspectionScope.candidates.find(
        (c: any) => c.category === 'local-interaction' && c.description.includes('Switch'),
      )
      assert(candidate)
      calls = [{ name: 'page_act', args: { type: 'click', ref: candidate.ref } }]
    } else calls = [{ name: 'run_finish', args: { reason: 'unverified-scope' } }]
    turn++
    assert(turn <= 5, 'fixed provider unexpectedly looped')
    const chunk = {
      id: 'local-' + turn,
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
    }
    res
      .writeHead(200, { 'content-type': 'text/event-stream' })
      .end(
        `data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls.map((c, i) => ({ index: i, id: 'call-' + turn + '-' + i, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
      )
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
})
const endpoint = await listen(provider),
  portServer = createServer(),
  base = await listen(portServer)
await new Promise<void>((r) => portServer.close(() => r()))
await build({
  entryPoints: ['src/server/index.ts'],
  outfile: resolve(root, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
})
await viteBuild({ configFile: 'src/web/vite.config.ts' })
const child = spawn(process.execPath, [resolve(root, 'server.mjs')], {
  cwd: process.cwd(),
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
    URL_SCAN_DNS_MODE: 'system',
    URL_SCAN_TRUSTED_ORIGINS: origin,
    EXECUTION_MODEL_STREAMING: '1',
    EXECUTION_SHORT_FINISH: '1',
    EXECUTION_BLOCKER_REVIEW: '0',
    EXECUTION_VISUAL_DISCOVERY: '0',
    RUN_TOTAL_TIMEOUT_MS: '45000',
    RUN_MAX_MODEL_CALLS: '6',
    RUN_MAX_ACTIONS: '3',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout!.on('data', (b) => logs.push(String(b)))
child.stderr!.on('data', (b) => logs.push(String(b)))
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const uiErrors: string[] = []
page.on('pageerror', (e) => uiErrors.push(String(e)))
const completed = new Promise((r) => child.once('exit', r))
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    if (i === 99) throw Error('server unavailable')
    await new Promise((r) => setTimeout(r, 100))
  }
  for (mode of ['workbench', 'healthy', 'unsupported', 'budget', 'intervened', 'updated']) {
    turn = 0
    const start = performance.now()
    let created: any
    if (mode === 'workbench') {
      await page.goto(base)
      await page
        .getByRole('radio', { name: '网址 UI 检查（匿名、有界，不需要业务适配器）', exact: true })
        .check()
      await page.getByRole('textbox', { name: '网址', exact: true }).fill(origin + '/')
      const response = page.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs',
      )
      await page.getByRole('button', { name: '开始检查', exact: true }).click()
      created = await (await response).json()
    } else
      created = await fetch(base + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'ui-scan', entryUrl: origin + '/' }),
      }).then((r) => r.json())
    assert(created.runId, JSON.stringify(created))
    const runId = created.runId
    let report: any
    for (let i = 0; i < 500; i++) {
      report = await fetch(base + `/api/runs/${runId}/report`).then((r) => r.json())
      if (['completed', 'blocked', 'cancelled'].includes(report.status)) break
      if (i === 499) throw Error('run did not finish')
      await new Promise((r) => setTimeout(r, 100))
    }
    await save(mode + '-report.json', report)
    const views = report.uiRules.filter((r: any) => r.available).map((r: any) => r.body)
    assert(
      views.length > 0,
      mode +
        ': ordinary rule reports missing ' +
        JSON.stringify(report.events.filter((e: any) => e.type === 'execution:stopped')),
    )
    const evaluations = report.evaluations.filter(
      (e: any) => e.ruleId === 'control-text-disappearance',
    )
    const rows = views.flatMap((v: any) => v.controls.rows)
    if (mode === 'workbench') {
      assert(evaluations.some((e: any) => e.verdict === 'fail'))
      assert(report.findings.some((f: any) => f.ruleId === 'control-text-disappearance'))
      assert(
        views.some((v: any) => v.images.rows.some((r: any) => r.disposition === 'review-needed')),
      )
      assert(!report.findings.some((f: any) => f.ruleId === 'image-fallback-review'))
      await page.goto(base + '/?run=' + runId)
      await page.getByRole('heading', { name: '文字与缺图检查', exact: true }).waitFor()
      assert(
        (await page.getByRole('region', { name: '文字与缺图检查' }).innerText()).includes(
          'Public nearby name',
        ),
      )
      await page
        .getByRole('region', { name: '文字与缺图检查' })
        .screenshot({ path: resolve(root, 'workbench-rules.png') })
      await page.screenshot({ path: resolve(root, 'workbench-history.png'), fullPage: true })
      const restored = await fetch(base + `/api/runs/${runId}/report`).then((r) => r.json())
      assert.deepEqual(restored.uiRules, report.uiRules)
    }
    if (mode === 'healthy') assert(rows.some((r: any) => r.verdict === 'pass'))
    if (mode === 'unsupported') assert(rows.every((r: any) => r.verdict === 'unknown'))
    if (mode === 'budget') {
      assert(views[0].controls.total === 20)
      assert(views[0].controls.enumerated === 16)
      assert(views[0].controls.omitted === 4)
      assert(views[0].controls.unknown === 16)
    }
    if (mode === 'intervened') {
      assert(evaluations.every((r: any) => r.verdict === 'unknown'))
      assert(views.every((v: any) => v.images.rows.every((r: any) => r.disposition === 'unknown')))
      assert(!report.findings.some((f: any) => f.ruleId === 'control-text-disappearance'))
    }
    if (mode === 'updated') {
      assert(evaluations.some((r: any) => r.verdict === 'fail'))
      assert(evaluations.some((r: any) => r.verdict === 'pass'))
      assert(new Set(views.map((v: any) => v.screenshotRef)).size >= 2)
    }
    for (const ref of new Set(views.flatMap((v: any) => v.evidenceRefs) as string[])) {
      const response = await fetch(base + `/api/runs/${runId}/artifacts/${encodeURIComponent(ref)}`)
      assert(response.ok)
      await writeFile(resolve(root, runId + '-' + ref), Buffer.from(await response.arrayBuffer()))
    }
    results.push({
      mode,
      runId,
      status: report.status,
      stopReason: report.stopReason,
      providerTurns: turn,
      elapsedMs: performance.now() - start,
      observations: views.map((v: any) => ({
        timing: v.timing,
        controls: {
          total: v.controls.total,
          enumerated: v.controls.enumerated,
          unknown: v.controls.unknown,
          omitted: v.controls.omitted,
        },
        images: { total: v.images.total, unknown: v.images.unknown },
      })),
      evaluations: evaluations.map((e: any) => e.verdict),
    })
    console.log(JSON.stringify(results.at(-1)))
  }
  assert.equal(uiErrors.length, 0)
  assert(!requests.some((r: any) => r.method !== 'GET'))
  await save('results.json', { root, results, uiErrors, realModelCalls: 0, publicVisits: 0 })
} finally {
  await save('provider-packets.json', packets)
  await save('fixture-requests.json', requests)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
  await browser.close()
  child.kill('SIGTERM')
  await completed
  fixture.closeAllConnections()
  provider.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => provider.close(() => r())),
  ])
  console.log('Evidence: ' + root)
}
