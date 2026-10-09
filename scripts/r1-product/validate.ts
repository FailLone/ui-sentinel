import { createHash } from 'node:crypto'
/** Normal product server + API + workbench + Chromium. The only provider always hands back partial. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { build as viteBuild } from 'vite'
import { chromium } from 'playwright'
import { strict as assert } from 'node:assert'
import { fixtures, documentFor, pathFor, fixtureAt } from './fixtures.ts'
const root = resolve('data/r1-product', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
const packets: any[] = [],
  requests: any[] = [],
  results: any[] = [],
  logs: string[] = []
const fixture = createServer((req, res) => {
  requests.push({ url: req.url, method: req.method })
  if (req.method !== 'GET') {
    res.writeHead(403).end()
    return
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204).end()
    return
  }
  const name = fixtureAt(req.url ?? '')
  res
    .writeHead(name ? 200 : 404, { 'content-type': 'text/html' })
    .end(name ? documentFor(name) : 'Not found')
})
const origin = await listen(fixture)
const provider = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw)
  packets.push(body)
  // No scenario, answer, action or candidate is supplied by this substitute.
  const calls = [
    {
      index: 0,
      id: 'partial-' + packets.length,
      type: 'function',
      function: { name: 'run_finish', arguments: JSON.stringify({ reason: 'unverified-scope' }) },
    },
  ]
  const base = {
    id: 'fixed-' + packets.length,
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res
    .writeHead(200, { 'content-type': 'text/event-stream' })
    .end(
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
    )
})
const endpoint = await listen(provider),
  port = createServer(),
  base = await listen(port)
await new Promise<void>((r) => port.close(() => r()))
await writeFile(resolve(root, 'empty.env'), '')
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
await save('identity.json', {
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  diff: execFileSync('git', ['diff'], { encoding: 'utf8' }),
  provider: 'local-fixed-partial-only',
  realCalls: 0,
})
const child = spawn(process.execPath, [resolve(root, 'server.mjs')], {
  cwd: process.cwd(),
  env: {
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
    URL_SCAN_DNS_MODE: 'system',
    URL_SCAN_TRUSTED_ORIGINS: origin,
    EXECUTION_BLOCKER_REVIEW: '0',
    EXECUTION_VISUAL_DISCOVERY: '0',
    EXECUTION_JOURNEYS: '0',
    MODEL_REQUEST_MAX_RETRIES: '0',
    RUN_TOTAL_TIMEOUT_MS: '180000',
    RUN_MAX_MODEL_CALLS: '8',
    RUN_MAX_ACTIONS: '6',
    MODEL_REQUEST_TIMEOUT_MS: '1000',
    TOOL_TIMEOUT_MS: '4000',
    OTEL_SDK_DISABLED: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout!.on('data', (b) => logs.push(String(b)))
child.stderr!.on('data', (b) => logs.push(String(b)))
const exited = new Promise((r) => child.once('exit', r)),
  browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
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
  const names = process.argv.slice(2).length
    ? process.argv.slice(2)
    : Object.keys(fixtures).filter((n) => n !== 'return-end')
  const denied = await fetch(base + '/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'ui-scan',
      entryUrl: origin + pathFor('fairness'),
      exploration: { mode: 'program', jev: true },
    }),
  })
  assert.equal(denied.status, 400, 'unconfigured Jev must reject before queue')
  for (const name of names) {
    let created: any
    const before = packets.length
    if (name === 'three-step-healthy') {
      await page.goto(base)
      await page
        .getByRole('radio', { name: '网址 UI 检查（匿名、有界，不需要业务适配器）', exact: true })
        .check()
      await page.getByRole('textbox', { name: '网址', exact: true }).fill(origin + pathFor(name))
      await page.getByRole('checkbox', { name: 'R1 有界探索', exact: false }).check()
      const response = page.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs',
      )
      await page.getByRole('button', { name: '开始检查', exact: true }).click()
      created = await (await response).json()
    } else
      created = await fetch(base + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'ui-scan',
          entryUrl: origin + pathFor(name),
          exploration: { mode: 'program', jev: false },
          ...(name === 'budget' ? { budget: { maxActions: 1 } } : {}),
          ...(name === 'view-context'
            ? { goal: 'Inspect "Read panel".' }
            : name === 'fairness'
              ? { goal: 'Inspect "Primary".' }
              : name === 'refresh' || name === 'refresh-unbindable'
                ? { goal: 'Refresh the page after inspecting its public controls.' }
                : name === 'return-start'
                  ? { goal: 'Return to the previous page after visiting details.' }
                  : {}),
        }),
      }).then((r) => r.json())
    assert(created.runId, JSON.stringify(created))
    let report: any
    for (let i = 0; i < 1800; i++) {
      const current: any = await fetch(base + `/api/runs/${created.runId}`).then((r) => r.json())
      if (!['queued', 'running'].includes(current.status)) {
        report = await fetch(base + `/api/runs/${created.runId}/report`).then((r) => r.json())
        if (!['running', 'queued'].includes(report.status)) break
      }
      if (i === 1799) throw Error('timeout')
      await new Promise((r) => setTimeout(r, 100))
    }
    await save(name + '-report.json', report)
    const evidenceDirectory = resolve(root, 'evidence', name)
    await mkdir(evidenceDirectory, { recursive: true })
    const evidence = []
    for (const artifact of report.artifacts) {
      const response = await fetch(base + artifact.url)
      assert(response.ok, 'original artifact exists')
      const bytes = Buffer.from(await response.arrayBuffer())
      await writeFile(resolve(evidenceDirectory, artifact.id), bytes)
      evidence.push({
        id: artifact.id,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
      if (name === 'boundary-input' && artifact.kind === 'generic-interaction') {
        const receipt = JSON.parse(bytes.toString())
        assert.deepEqual(receipt.nativeConstraint?.values, ['xxx', 'xxx'])
        assert.equal(receipt.nativeConstraint.maximum, 3)
      }
    }
    await save(name + '-evidence-index.json', evidence)
    const row = {
      name,
      runId: created.runId,
      status: report.status,
      actions: report.usage.actions,
      modelCalls: packets.length - before,
      checks: report.uiScan?.checkCounts,
      handoffs: report.events
        .filter((e: any) => e.type === 'r1:handoff')
        .map((e: any) => e.payload),
      progress: report.events.filter((e: any) => e.type === 'r1:progress').at(-1)?.payload,
    }
    results.push(row)
    console.log(
      JSON.stringify({
        ...row,
        handoffs: row.handoffs.map((h: any) => h.reason),
        progress: row.progress
          ? {
              attempts: row.progress.attempts?.length,
              paths: row.progress.paths?.map((p: any) => p.steps.length),
            }
          : null,
      }),
    )
    await save('results.json', results)
    assert.notEqual(report.status, 'execution-error', name)
    const exploration = report.uiScan.exploration,
      checks = report.uiScan.checkCounts
    const partial = ['ambiguous', 'recovery', 'budget', 'refresh-unbindable'].includes(name)
    assert.equal(report.status, partial ? 'blocked' : 'completed', name)
    const actionCounts: Record<string, number> = {
      'menu-healthy': 1,
      'layout-pair': 2,
      'three-step-defect': 3,
      'three-step-healthy': 3,
      'state-cycle': 2,
      'view-context': 3,
      fairness: 3,
      'boundary-input': 1,
      ambiguous: 0,
      recovery: 1,
      budget: 1,
      refresh: 3,
      'refresh-unbindable': 0,
      'return-start': 2,
      'repeat-defect': 2,
      'tabs-defect': 1,
    }
    assert.equal(report.usage.actions, actionCounts[name], name + ' actions')
    assert.equal(packets.length - before, partial ? 1 : 0, name + ' fixed-model count')
    const failures: Record<string, number> = {
      'three-step-defect': 1,
      fairness: 2,
      'repeat-defect': 1,
      'tabs-defect': 1,
      'view-context': 1,
    }
    assert.equal(checks.requiredEffectFailedCount, failures[name] ?? 0, name + ' effect failures')
    assert.equal(
      report.findings.filter((f: any) => f.validationStatus === 'supported').length,
      name === 'layout-pair' ? 1 : (failures[name] ?? 0),
      name + ' supported findings',
    )
    assert.equal(exploration.usage.jevCalls, 0)
    if (!partial) {
      assert(
        exploration.paths.some((p: any) => p.measured && p.actionIds.length === actionCounts[name]),
        name + ' original measured path',
      )
      assert(
        exploration.attempts.every((a: any) => a.measurement !== 'unverified'),
        name + ' measurements',
      )
    }
    if (name === 'fairness')
      assert.deepEqual(
        exploration.attempts.map((a: any) => a.label),
        ['Primary', 'Secondary', 'Quiet control'],
      )
    if (name === 'repeat-defect') assert.equal(checks.requiredEffectVerifiedCount, 1)
    if (name === 'three-step-healthy' || name === 'menu-healthy')
      assert.equal(checks.requiredEffectVerifiedCount, 1)
    assert(
      !report.events.some(
        (e: any) => e.type === 'rule:evaluated' && e.payload.ruleId === 'text-contrast',
      ),
      'D004 remains off',
    )
    if (name === 'layout-pair') {
      assert(
        report.findings.some(
          (f: any) => f.ruleId === 'control-text-clipping' && f.validationStatus === 'supported',
        ),
      )
      assert(
        !report.findings.some(
          (f: any) => f.ruleId === 'control-text-overlap' && f.validationStatus === 'supported',
        ),
      )
    }
    if (name === 'state-cycle' || name === 'refresh')
      assert.equal(
        new Set(
          exploration.attempts.filter((a: any) => a.action === 'click').map((a: any) => a.itemId),
        ).size,
        2,
        'new state/document needs original new check',
      )
    if (name === 'refresh' || name === 'return-start')
      assert(
        exploration.visitedStates
          .map((s: string) => JSON.parse(s)[1])
          .some((id: string) => id !== JSON.parse(exploration.visitedStates[0])[1]),
        'new document binding',
      )
    if (partial) assert.equal(report.uiScan.inspection.coverage, 'partial')
    if (name === 'three-step-healthy') {
      await page.goto(base + '/?run=' + encodeURIComponent(created.runId))
      await page.getByRole('region', { name: 'R1 路径与检查' }).waitFor()
      await page.reload()
      await page.getByRole('region', { name: 'R1 路径与检查' }).waitFor()
      await page
        .getByRole('region', { name: 'R1 路径与检查' })
        .screenshot({ path: resolve(root, 'workbench-history.png') })
      const history = await fetch(base + `/api/runs/${created.runId}/report`).then((r) => r.json())
      assert.deepEqual(history.uiScan.exploration, exploration, 'historical projection')
    }
  }
} finally {
  await save('packets.json', packets)
  await save('fixture-requests.json', requests)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
  await browser.close()
  child.kill('SIGTERM')
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
  await exited
  clearTimeout(killTimer)
  fixture.close()
  provider.close()
}
