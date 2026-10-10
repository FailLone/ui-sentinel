/** Free deterministic product contract test: real SDK/server/browser, loopback model only. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { hashTree } from './url-scan-freeze.ts'
const dynamicOnly = process.argv.includes('--dynamic-only')
const dynamicModes = [
  'dynamic-healthy',
  'dynamic-defect',
  'dynamic-missing',
  'dynamic-duplicate',
  'dynamic-extra',
  'dynamic-pending',
]
const root = resolve('data/r2-product-sources', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (p: string, v: unknown) =>
  writeFile(resolve(root, p), JSON.stringify(v, null, 2) + '\n')
await save('identity.json', {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source: await hashTree('src'),
  dist: await hashTree('dist'),
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(s: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
const reserve = createServer(),
  base = await listen(reserve)
await new Promise<void>((r) => reserve.close(() => r()))
let mode = '',
  turn = 0,
  source: any,
  plan: any,
  calls: any[] = [],
  requests: any[] = [],
  runId = ''
const fixture = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url })
  res.writeHead(200, { 'content-type': 'text/html' })
  const dynamic = mode.startsWith('dynamic-')
  const reveal = dynamic
    ? `
    ${
      mode === 'dynamic-missing'
        ? ''
        : `
    const details = document.createElement('button'); details.id='details'; details.type='button'; details.textContent='Details';
    details.onclick=()=>{document.querySelector('#detail-result').textContent='${mode === 'dynamic-defect' ? 'Wrong details' : 'Details ready'}'};
    document.body.append(details);
    ${mode === 'dynamic-duplicate' ? "const duplicate=details.cloneNode(true); duplicate.id='duplicate'; document.body.append(duplicate);" : ''}`
    }
    const extra=document.createElement('button'); extra.type='button'; extra.textContent='Extra'; extra.id='extra';
    extra.onclick=()=>{document.body.dataset.extra='clicked'}; document.body.append(extra);
  `
    : ''
  res.end(
    `<!doctype html><html><head><title>Catalog preview</title></head><body><h1>Catalog preview</h1><p id=availability>${mode === 'missing' ? 'Unavailable' : 'Available'}</p><button type=button id=preview>Preview</button><div role=status id=result>Idle</div>${dynamic ? '<div id=detail-result role=region>Closed</div>' : ''}${mode === 'dynamic-pending' ? '<button type=button id=pending>Other default</button>' : ''}${mode === 'two-step' || mode === 'pending' ? '<button type=button id=details>Details</button><div id=detail-result role=region>Closed</div>' : ''}<script>preview.onclick=()=>{result.textContent='${['defect', 'async-wrong'].includes(mode) ? 'Wrong' : 'Ready'}';document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1);${reveal}};if(document.querySelector('#details'))details.onclick=()=>{document.querySelector('#detail-result').textContent='Details ready'}</script></body></html>`,
  )
})
const origin = await listen(fixture)
function setup(m: string) {
  mode = m
  turn = 0
  calls = []
  requests = []
  const quote =
    m === 'ambiguous'
      ? 'Click Preview to see a suitable result.'
      : m === 'async-wrong'
        ? 'Click Preview: show Ready in the status area.'
        : 'Click Preview: immediately show Ready in the status area.'
  const pre = 'Prerequisite: availability must be Available.'
  const second = 'Click Details: immediately show Details ready in the details area.'
  const markdown =
    '# Preview\n' +
    pre +
    '\n' +
    quote +
    '\n# Additional scope\n' +
    second +
    '\nSaving requires login and is outside the anonymous path.'
  source = { title: 'Catalog product brief', markdown }
  const cite = (q: string) => ({
    start: markdown.indexOf(q),
    end: markdown.indexOf(q) + q.length,
    quote: q,
  })
  plan = {
    title: 'Preview catalog',
    rationale: 'Primary anonymous preview path; no business write required.',
    unchecked: [
      'Saving and login are not checked.',
      'Other document sections are not claimed as covered.',
    ],
    assumptions: [],
    steps: [
      {
        title: 'Preview',
        citation: cite(quote),
        certainty: m === 'ambiguous' ? 'ambiguous' : 'explicit',
        action: 'click',
        ...(m === 'ambiguous'
          ? {}
          : { expectation: { condition: 'text-equals', expected: 'Ready' } }),
        timing: ['ambiguous', 'async-wrong'].includes(m) ? 'unspecified' : 'action-complete',
        preconditions: [
          {
            description: 'Availability is Available',
            citation: cite(pre),
            expectation: { condition: 'text-equals', expected: 'Available' },
          },
        ],
      },
    ],
  }
  if (m === 'two-step' || m.startsWith('dynamic-'))
    plan.steps.push({
      title: 'Details',
      citation: cite(second),
      certainty: 'explicit',
      action: 'click',
      expectation: { condition: 'text-equals', expected: 'Details ready' },
      timing: 'action-complete',
      preconditions: [],
    })
}
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw),
    packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  let name = 'run_finish',
    args: any = {
      reason: [
        'ambiguous',
        'missing',
        'pending',
        'async-wrong',
        'dynamic-missing',
        'dynamic-duplicate',
        'dynamic-extra',
        'dynamic-pending',
      ].includes(mode)
        ? 'unverified-scope'
        : 'scope-covered',
    }
  if (mode === 'legacy') {
    if (turn === 0) {
      name = 'page_act'
      args = { type: 'click', role: 'button', name: 'Preview' }
    }
  } else if (turn === 0) {
    name = 'product_source_overview'
    args = {}
  } else if (turn === 1) {
    name = 'product_source_search'
    args = { keyword: 'Preview', offset: 0 }
  } else if (turn === 2) {
    name = 'product_source_read'
    args = { offset: 0 }
  } else if (turn === 3) {
    assert.equal(packet.latestToolResults.tools[0].text, source.markdown)
    name = 'product_path_register'
    args = {
      ...plan,
      sourceId: packet.productPath.source.sourceId,
      contentHash: packet.productPath.source.contentHash,
    }
  } else if (turn === 4 && mode !== 'ambiguous') {
    name = 'product_path_bind'
    args = {
      step: 0,
      ref: packet.inspectionScope.candidates.find((c: any) => c.description.includes('Preview'))
        .ref,
      resultSelector: '#result',
      preconditionSelectors: ['#availability'],
    }
  } else if (turn === 5 && !['ambiguous', 'missing'].includes(mode)) {
    name = 'page_act'
    args = { type: 'click', role: 'button', name: 'Preview' }
  } else if ((mode === 'two-step' || mode.startsWith('dynamic-')) && turn === 6) {
    name = 'product_path_bind'
    args = {
      step: 1,
      ref:
        packet.inspectionScope.candidates.find((c: any) =>
          c.description.includes(mode === 'dynamic-extra' ? 'Extra' : 'Details'),
        )?.ref ?? 'missing-target',
      resultSelector: '#detail-result',
      preconditionSelectors: [],
    }
  } else if (
    ['two-step', 'dynamic-healthy', 'dynamic-defect', 'dynamic-pending'].includes(mode) &&
    turn === 7
  ) {
    name = 'page_act'
    args = { type: 'click', role: 'button', name: 'Details' }
  } else if (mode === 'dynamic-extra' && turn === 7) {
    name = 'exploration_update'
    args = {
      state: 'Inspecting extra control boundary',
      unexploredBranches: [],
      selectItems: [
        {
          itemId: packet.inspectionScope.candidates.find((c: any) =>
            c.description.includes('Extra'),
          ).itemId,
          basis: 'Extra is not in the frozen path',
        },
      ],
    }
  } else if (mode === 'dynamic-extra' && turn === 8) {
    name = 'page_act'
    args = { type: 'click', role: 'button', name: 'Extra' }
  } else if ((turn === 6 && mode === 'pending') || (turn === 8 && mode === 'dynamic-pending')) {
    name = 'run_finish'
    args = { reason: 'scope-covered' }
  }
  calls.push({ turn: turn++, name, args, packet })
  if (turn > 13) {
    res.writeHead(500)
    res.end('fixed-model-unexpected-loop')
    return
  }
  const common = {
    id: randomUUID(),
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const dynamic = mode.startsWith('dynamic-')
  const reveal = dynamic
    ? `
    ${
      mode === 'dynamic-missing'
        ? ''
        : `
    const details = document.createElement('button'); details.id='details'; details.type='button'; details.textContent='Details';
    details.onclick=()=>{document.querySelector('#detail-result').textContent='${mode === 'dynamic-defect' ? 'Wrong details' : 'Details ready'}'};
    document.body.append(details);
    ${mode === 'dynamic-duplicate' ? "const duplicate=details.cloneNode(true); duplicate.id='duplicate'; document.body.append(duplicate);" : ''}`
    }
    const extra=document.createElement('button'); extra.type='button'; extra.textContent='Extra'; extra.id='extra';
    extra.onclick=()=>{document.body.dataset.extra='clicked'}; document.body.append(extra);
  `
    : ''
  res.end(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
  )
})
const modelOrigin = await listen(model),
  dbfile = resolve(root, 'runs.db'),
  logs: string[] = []
function start() {
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: '/dev/null',
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
      EXECUTION_PRODUCT_SOURCES: '1',
      URL_SCAN_TRUSTED_ORIGINS: origin,
      EXECUTION_OBSERVATION_REUSE: '1',
      EXECUTION_RULE_ROUTING: '1',
      EXECUTION_SHORT_FINISH: '1',
      EXECUTION_MODEL_STREAMING: '1',
      EXECUTION_BLOCKER_REVIEW: '0',
      EXECUTION_POPUP_JEV: '0',
      EXECUTION_VISUAL_DISCOVERY: '0',
      RUN_TOTAL_TIMEOUT_MS: '120000',
      RUN_MAX_MODEL_CALLS: '20',
      RUN_MAX_ACTIONS: '8',
      OTEL_SDK_DISABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (b) => logs.push(String(b)))
  child.stderr.on('data', (b) => logs.push(String(b)))
  return child
}
let child = start()
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
  throw Error('server-not-ready')
}
const report = async (id = runId) => {
  const r = await fetch(base + '/api/runs/' + id + '/report')
  if (!r.ok) throw Error('report:' + (await r.text()))
  return r.json() as Promise<any>
}
async function settled() {
  for (let i = 0; i < 1200; i++) {
    const r = (await fetch(base + '/api/runs/' + runId).then((r) => r.json())) as any
    if (!['running', 'queued'].includes(r.status) && !r.active) return
    await sleep(100)
  }
  throw Error('run-not-settled')
}
const results: any[] = [],
  ids: Record<string, string> = {}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await ready()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  for (const m of [
    ...(dynamicOnly
      ? []
      : [
          'healthy',
          'defect',
          'ambiguous',
          'missing',
          'two-step',
          'pending',
          'async-wrong',
          'legacy',
        ]),
    ...dynamicModes,
  ]) {
    setup(m)
    if (m === 'healthy') {
      await page.goto(base)
      await page.getByLabel('网址 UI 检查（匿名、有界，不需要业务适配器）').check()
      await page
        .getByPlaceholder('https://example.org/catalog?category=books#items')
        .fill(origin + '/catalog')
      await page.getByLabel('资料名称').fill(source.title)
      await page.getByLabel('产品说明 / Markdown').fill(source.markdown)
      const created = page.waitForResponse(
        (r) => r.url() === base + '/api/runs' && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: '开始检查', exact: true }).click()
      const response = await created
      assert.equal(response.status(), 202)
      runId = (await response.json()).runId
    } else {
      const created = await fetch(base + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'ui-scan',
          entryUrl: origin + '/catalog',
          ...(m === 'legacy' ? {} : { productSource: source }),
        }),
      })
      assert.equal(created.status, 202, await created.clone().text())
      runId = ((await created.json()) as any).runId
    }
    ids[m] = runId
    await settled()
    const r = await report()
    await save(m + '-report.json', r)
    await save(m + '-calls.json', calls)
    await save(m + '-requests.json', requests)
    const events = (await fetch(base + '/api/runs/' + runId + '/events').then((r) =>
      r.json(),
    )) as any[]
    await save(m + '-events.json', events)
    const state = r.uiScan?.productSource?.state
    results.push({
      mode: m,
      runId,
      status: r.status,
      coverage: r.uiScan?.inspection.coverage,
      state,
      issues: r.persistenceIssues ?? r.inspection?.persistenceIssues,
      actions: events.filter((e) => e.type === 'action:executing').length,
    })
    await save('results.json', results)
    console.log(JSON.stringify(results.at(-1)))
    if (m === 'legacy') {
      assert.equal(r.uiScan.productSource, undefined)
      assert.equal(r.uiScan.inspection.coverage, 'covered')
    } else if (['healthy', 'two-step', 'defect', 'dynamic-healthy', 'dynamic-defect'].includes(m)) {
      assert.equal(state, ['defect', 'dynamic-defect'].includes(m) ? 'failed' : 'verified')
      assert.equal(r.uiScan.inspection.coverage, 'covered')
      assert.equal(
        events.filter((e) => e.type === 'action:executing').length,
        m === 'two-step' || m.startsWith('dynamic-') ? 2 : 1,
      )
    } else {
      assert.equal(r.uiScan.inspection.coverage, 'partial')
      assert.equal(state, ['pending', 'dynamic-pending'].includes(m) ? 'verified' : 'unverified')
      if (['ambiguous', 'missing'].includes(m))
        assert.equal(events.filter((e) => e.type === 'action:executing').length, 0)
    }
    if (m.startsWith('dynamic-')) {
      const bindings = events.filter((e) => e.type === 'product:bound')
      const second = bindings.find((e) => e.payload.step === 1)
      const admitted = ['dynamic-healthy', 'dynamic-defect', 'dynamic-pending'].includes(m)
      assert.equal(!!second, admitted)
      assert.equal(events.filter((e) => e.type === 'action:executing').length, admitted ? 2 : 1)
      if (second) {
        assert.equal(second.payload.targetWasSelected, false)
        assert.equal(second.payload.admission.remaining.actions, 7)
        assert.ok(
          events
            .filter((e) => e.type === 'scope:sampling-frozen')
            .every((e) => !JSON.stringify(e.payload).includes(second.payload.itemId)),
        )
        assert.ok(
          events
            .filter((e) => e.type === 'scope:sampling-default-selected')
            .every((e) => !e.payload.itemIds.includes(second.payload.itemId)),
        )
      }
      if (m === 'dynamic-pending') assert.ok(events.some((e) => e.type === 'finish:rejected'))
      if (m === 'dynamic-extra') {
        assert.equal(events.filter((e) => e.type === 'scope:admission-refused').length, 2)
        const extra = calls.find((c) => c.name === 'exploration_update').args.selectItems[0].itemId
        assert.ok(
          !events.some(
            (e) =>
              e.type === 'scope:item-updated' && e.payload.itemId === extra && e.payload.selected,
          ),
        )
        assert.ok(calls.some((c) => c.name === 'product_path_bind' && c.args.step === 1))
        assert.ok(calls.some((c) => c.name === 'page_act' && c.args.name === 'Extra'))
      }
    }
    if (m === 'healthy') {
      await page.locator('[aria-label="产品资料路径报告"]').waitFor()
      await page.screenshot({ path: resolve(root, 'workbench.png'), fullPage: true })
    }
  }
  // Restart and recover through both HTTP and the ordinary workbench history input.
  child.kill('SIGTERM')
  await new Promise((r) => child.once('exit', r))
  child = start()
  await ready()
  for (const m of dynamicModes) {
    const recovered = await report(ids[m])
    assert.equal(recovered.uiScan.productSource.state, results.find((r) => r.mode === m).state)
    await save(m + '-restarted-report.json', recovered)
  }
  // Admission identity/budget records are required original evidence, also on historical replay.
  const admissionDb = createClient({ url: 'file:' + dbfile })
  const admissionRows = (
    await admissionDb.execute({
      sql: "SELECT file_path FROM artifacts WHERE run_id=? AND type='product-binding'",
      args: [ids['dynamic-healthy']!],
    })
  ).rows
  const admissionPath = (
    await Promise.all(
      admissionRows.map(async (row) => {
        const path = String(row.file_path)
        return { path, bytes: await readFile(path) }
      }),
    )
  ).find((row) => JSON.parse(row.bytes.toString()).admission)!
  assert.ok(admissionPath)
  const invalidBinding = JSON.parse(admissionPath.bytes.toString())
  invalidBinding.admission.identity = 'substituted-node'
  await writeFile(admissionPath.path, JSON.stringify(invalidBinding))
  const invalidAdmission = await report(ids['dynamic-healthy'])
  await save('admission-corrupt-report.json', invalidAdmission)
  assert.equal(invalidAdmission.uiScan.productSource.state, 'unverified')
  assert.equal(invalidAdmission.uiScan.inspection.coverage, 'partial')
  await writeFile(admissionPath.path, admissionPath.bytes)
  admissionDb.close()
  if (!dynamicOnly) {
    await page.reload()
    await page.getByLabel('恢复历史运行').fill(ids.healthy!)
    await page.getByRole('button', { name: '打开运行', exact: true }).click()
    await page.locator('[aria-label="产品资料路径报告"]').waitFor()
    assert.equal((await report(ids.healthy)).uiScan.productSource.state, 'verified')
    await page.screenshot({ path: resolve(root, 'history.png'), fullPage: true })
    const db = createClient({ url: 'file:' + dbfile })
    // Evidence corruption is applied only to this isolated test database/artifact set, then restored.
    const artifact = (
      await db.execute({
        sql: "SELECT file_path FROM artifacts WHERE run_id=? AND type='product-preconditions'",
        args: [ids.healthy!],
      })
    ).rows[0]!
    const path = String(artifact.file_path),
      original = await readFile(path)
    await writeFile(path, '[]\ncorrupted')
    const corrupted = await report(ids.healthy)
    await save('evidence-corrupt-report.json', corrupted)
    assert.equal(corrupted.uiScan.productSource.state, 'unverified')
    assert.equal(corrupted.uiScan.inspection.coverage, 'partial')
    await writeFile(path, original)
    const originalEvents = (await fetch(base + '/api/runs/' + ids.healthy + '/events').then((r) =>
      r.json(),
    )) as any[]
    const effectEvent = originalEvents.find((e) => e.type === 'interaction:effect-measured-v2')
    const screenshotRef = effectEvent.evidenceRefs.find((ref: string) => ref.endsWith('.png'))
    const shotRow = (
      await db.execute({ sql: 'SELECT file_path FROM artifacts WHERE id=?', args: [screenshotRef] })
    ).rows[0]!
    const shotPath = String(shotRow.file_path),
      shotBytes = await readFile(shotPath)
    await writeFile(shotPath, 'changed screenshot')
    const shotChanged = await report(ids.healthy)
    await save('screenshot-corrupt-report.json', shotChanged)
    assert.equal(shotChanged.uiScan.productSource.state, 'unverified')
    await writeFile(shotPath, shotBytes)
    const sourceEvent = originalEvents.find((e) => e.type === 'interaction:sources-reviewed-v2')
    const missingRef = Object.keys(sourceEvent.payload.evidenceHashes)[0]!
    const missingRow = (
      await db.execute({ sql: 'SELECT file_path FROM artifacts WHERE id=?', args: [missingRef] })
    ).rows[0]!
    const missingPath = String(missingRow.file_path)
    await rename(missingPath, missingPath + '.held')
    const missingReport = await report(ids.healthy)
    await save('evidence-missing-report.json', missingReport)
    assert.equal(missingReport.uiScan.productSource.state, 'unverified')
    await rename(missingPath + '.held', missingPath)
    // A new version is a new run, never a silent update of the old frozen contract.
    const stored = (
      await db.execute({ sql: 'SELECT spec FROM runs WHERE id=?', args: [ids.healthy!] })
    ).rows[0]!
    const spec = JSON.parse(String(stored.spec))
    spec.uiContract.productSource.markdown += '\nChanged source'
    await db.execute({
      sql: 'UPDATE runs SET spec=? WHERE id=?',
      args: [JSON.stringify(spec), ids.healthy!],
    })
    const changed = await report(ids.healthy)
    await save('source-corrupt-report.json', changed)
    assert.notEqual(changed.uiScan?.productSource?.state, 'verified')
    assert.notEqual(changed.uiScan?.inspection.coverage, 'covered')
    await db.execute({
      sql: 'UPDATE runs SET spec=? WHERE id=?',
      args: [String(stored.spec), ids.healthy!],
    })
    db.close()
  }
  await save('acceptance.json', {
    passed: true,
    results,
    historyRestart: true,
    admissionCorruptionRejected: true,
    sourceCorruptionRejected: !dynamicOnly,
    evidenceCorruptionRejected: !dynamicOnly,
    missingEvidenceRejected: !dynamicOnly,
    screenshotCorruptionRejected: !dynamicOnly,
    model: 'fixed-local',
    paidCalls: 0,
  })
  console.log('R2 FREE ACCEPTANCE PASSED ' + root)
} catch (error) {
  await save('failure.json', { error: String(error), stack: (error as Error).stack })
  throw error
} finally {
  await save('server-log.json', logs)
  await browser?.close()
  child.kill('SIGTERM')
  model.closeAllConnections()
  model.close()
  fixture.closeAllConnections()
  fixture.close()
}
