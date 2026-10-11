/** Free product entry validation. No external model or historical local evidence is used. */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { documentFor } from '../../evaluation/fixtures/r2-product-acceptance/page.ts'
import { freezeProductSource } from '../../src/inspection/product-source.ts'

const root = resolve('data/r3-path-reuse', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
console.log(root)
const save = (name: string, data: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(data, null, 2))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (server.address() as any).port
}
const markdown = await readFile('evaluation/fixtures/r2-product-acceptance/product-spec.md', 'utf8')
const inputSource = { title: '轻阅目录', version: '1.0', markdown }
const source = freezeProductSource(inputSource)
const quote = (contains: string) => {
  const quote = markdown.split('\n\n').find((p) => p.includes(contains))!
  const start = markdown.indexOf(quote)
  return { start, end: start + quote.length, quote }
}
const draft = {
  sourceId: source.sourceId,
  contentHash: source.contentHash,
  title: '访客目录预览',
  rationale: '匿名本地两步路径，来源明确且可测。',
  assumptions: [],
  unchecked: ['登录后的收藏、同步和管理员维护；其他资料范围未检查。'],
  steps: [
    {
      title: '预览目录',
      targetName: '预览目录',
      citation: quote('访客点击“预览目录”'),
      certainty: 'explicit',
      action: 'click',
      timing: 'action-complete',
      expectation: { condition: 'text-equals', expected: '预览就绪' },
      preconditions: [
        {
          description: '目录可用',
          citation: quote('预览的前置条件'),
          expectation: { condition: 'text-equals', expected: '可用' },
        },
      ],
      review: { preconditionsComplete: true, predicatesDistinguishStates: true },
    },
    {
      title: '查看详情',
      targetName: '查看详情',
      citation: quote('只有预览状态'),
      certainty: 'explicit',
      action: 'click',
      timing: 'action-complete',
      expectation: { condition: 'text-equals', expected: '详情已就绪' },
      preconditions: [
        {
          description: '预览就绪',
          citation: quote('只有预览状态'),
          expectation: { condition: 'text-equals', expected: '预览就绪' },
        },
      ],
      review: { preconditionsComplete: true, predicatesDistinguishStates: true },
    },
  ],
}
const reviewOnly = process.argv.includes('--review-only')
let mode = 'baseline'
let currentRunId = ''
let cancellation: Promise<unknown> | undefined
let requests: any[] = [],
  calls: any[] = [],
  attemptReplay = false
const fixture = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url })
  if (req.url === '/slow') {
    cancellation = fetch(base + '/api/runs/' + currentRunId + '/cancel', { method: 'POST' })
      .then((r) => r.json())
      .then((r) => save('cancel-receipt.json', r))
    const timer = setTimeout(() => res.end('done'), 2000)
    timer.unref()
    return
  }
  let html = documentFor(mode === 'defect' ? 'defect' : 'healthy')
  if (mode === 'precondition')
    html = html.replace('id="availability">可用', 'id="availability">暂不可用')
  if (mode === 'ambiguous')
    html = html.replace(
      "document.querySelector('#next').append(button);",
      "document.querySelector('#next').append(button); document.querySelector('#next').append(button.cloneNode(true));",
    )
  if (mode === 'missing') html = html.replace("document.querySelector('#next').append(button);", '')
  if (mode === 'changed-target')
    html = html.replace(
      'id="preview" type="button"',
      'id="preview" type="button" aria-label="其他预览"',
    )
  if (mode === 'execution-error')
    html = html.replace(
      "document.querySelector('#preview-state').textContent='预览就绪';",
      "document.querySelector('#preview-state').remove();",
    )
  if (mode === 'cancel')
    html = html.replace(
      "document.querySelector('#preview-state').textContent='预览就绪';",
      "document.querySelector('#preview-state').textContent='预览就绪'; fetch('/slow');",
    )
  if (mode === 'network-write')
    html = html.replace(
      "document.querySelector('#preview-state').textContent='预览就绪';",
      "document.querySelector('#preview-state').textContent='预览就绪'; fetch('/write', {method:'POST'});",
    )
  if (mode.startsWith('dispatch-')) {
    const mutation =
      mode === 'dispatch-rename'
        ? "document.querySelector('#preview').textContent='其他预览'"
        : mode === 'dispatch-duplicate'
          ? "const duplicate=document.querySelector('#preview').cloneNode(true); duplicate.id='duplicate'; document.querySelector('main').append(duplicate)"
          : "document.querySelector('#availability').textContent='暂不可用'"
    html = html.replace(
      '</body>',
      `<script>(()=>{let r3Timing; Object.defineProperty(window,'__sentinelTiming',{configurable:true,get(){return r3Timing},set(value){r3Timing=value; ${mutation}; }});})();</script></body>`,
    )
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
const origin = await listen(fixture)
const reserve = createServer(),
  base = await listen(reserve)
await new Promise<void>((r) => reserve.close(() => r()))
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw),
      packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
    let name = 'run_finish',
      args: any = {
        reason: packet.pathReuse?.status === 'handoff' ? 'unverified-scope' : 'scope-covered',
      }
    const state = packet.productPath
    if (packet.pathReuse?.readOnly && !attemptReplay) {
      // Deliberately try to repeat an already-issued action. The product must refuse.
      attemptReplay = true
      name = 'page_act'
      args = { type: 'click', role: 'button', name: '预览目录' }
    } else if (!packet.pathReuse) {
      if (state.stage.phase === 'need-source') {
        name = 'product_source_read'
        args = { offset: 0 }
      } else if (state.stage.decisionRequired) {
        name = 'product_path_decide'
        args = { decision: { kind: 'draft', plan: draft } }
      } else if (state.stage.phase === 'act-bound-step') {
        name = 'page_act'
        args = state.nextAction.args
      } else if (['bind-next-step', 'inspect-binding'].includes(state.stage.phase)) {
        const i = state.stage.step
        const target = packet.inspectionScope.candidates.find((c: any) =>
          c.description.includes(draft.steps[i]!.targetName),
        )
        assert.ok(target, JSON.stringify(packet.inspectionScope.candidates))
        name = 'product_path_bind'
        args = {
          step: i,
          ref: target.ref,
          resultSelector: i === 0 ? '#preview-state' : '#details-state',
          preconditionSelectors: [i === 0 ? '#availability' : '#preview-state'],
        }
      }
    }
    calls.push({ packet, name, args, toolChoice: body.tool_choice })
    if (calls.length > 12) throw Error('unexpected-fixed-model-loop')
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
  } catch (error) {
    res.writeHead(500)
    res.end(String(error))
  }
})
const modelOrigin = await listen(model),
  logs: string[] = []
function start() {
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: '/dev/null',
      PORT: new URL(base).port,
      DATABASE_URL: 'file:' + resolve(root, 'runs.db'),
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
async function api(path: string, body?: unknown) {
  const response = await fetch(
    base + path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  )
  return { status: response.status, body: (await response.json()) as any }
}
const reports: Record<string, any> = {},
  results: any[] = []
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await ready()
  let programId: string | undefined
  for (mode of reviewOnly
    ? [
        'baseline',
        'healthy',
        'defect',
        'dispatch-rename',
        'dispatch-duplicate',
        'dispatch-precondition',
      ]
    : [
        'baseline',
        'healthy',
        'defect',
        'source-changed',
        'ambiguous',
        'missing',
        'changed-target',
        'precondition',
        'execution-error',
        'network-write',
        'cancel',
      ]) {
    requests = []
    calls = []
    attemptReplay = false
    const created = await api('/api/runs', {
      kind: 'ui-scan',
      entryUrl: origin + '/',
      productSource: { ...inputSource, ...(mode === 'source-changed' ? { version: '2' } : {}) },
      ...(programId ? { pathProgramId: programId } : {}),
      viewport: { width: 1280, height: 1000 },
    })
    assert.equal(created.status, 202, JSON.stringify(created))
    const id = created.body.runId
    currentRunId = id
    for (let i = 0; i < 1200; i++) {
      const run = (await api('/api/runs/' + id)).body
      if (!['queued', 'running'].includes(run.status) && !run.active) break
      await sleep(100)
    }
    const report = (await api(`/api/runs/${id}/report`)).body
    await save(mode + '-report.json', report)
    await save(mode + '-model.json', calls)
    await save(mode + '-requests.json', requests)
    reports[mode] = report
    const r3 = report.uiScan?.pathReuse
    const row = {
      mode,
      runId: id,
      status: report.status,
      coverage: report.uiScan?.inspection.coverage,
      product: report.uiScan?.productSource?.state,
      modelRequests: calls.length,
      planningRequests: calls.filter(
        (c) => c.packet.productPath.execution.phase === 'registration-required',
      ).length,
      actions: report.usage.actions,
      reuse: r3?.status,
      reason: r3?.result?.reason,
    }
    results.push(row)
    await save('results.json', results)
    console.log(row)
    assert.equal(report.persistence.status, 'verified', JSON.stringify(report.persistence))
    assert.equal(requests.filter((r) => !['GET', 'HEAD'].includes(r.method)).length, 0)
    if (mode === 'baseline') {
      assert.equal(row.product, 'verified')
      assert.equal(row.coverage, 'covered')
      assert.equal(row.actions, 2)
      const saved = await api(`/api/runs/${id}/path-program`, {})
      await save('saved-program.json', saved)
      assert.equal(saved.status, 201, JSON.stringify(saved))
      programId = saved.body.program.id
      assert.equal((await api(`/api/path-programs/${programId}`)).body.program.id, programId)
    } else if (mode === 'healthy') {
      assert.equal(row.reuse, 'reused')
      assert.equal(row.product, 'verified')
      assert.equal(row.actions, 2)
      assert.equal(row.planningRequests, 0)
      assert.equal(row.coverage, 'covered')
      assert.notEqual(
        report.uiScan.productSource.steps[0].actionId,
        reports.baseline.uiScan.productSource.steps[0].actionId,
      )
      const old = new Set(
        reports.baseline.uiScan.productSource.steps.flatMap((s: any) => s.evidenceRefs),
      )
      assert.ok(
        report.uiScan.productSource.steps
          .flatMap((s: any) => s.evidenceRefs)
          .every((ref: string) => !old.has(ref)),
      )
    } else if (mode === 'defect') {
      assert.equal(row.reuse, 'measured-failure')
      assert.equal(row.product, 'failed')
      assert.equal(row.actions, 2)
      assert.ok(report.findings.some((f: any) => f.validationStatus === 'supported'))
      assert.equal((await api(`/api/runs/${id}/path-program`, {})).status, 409)
    } else {
      assert.notEqual(row.coverage, 'covered')
      assert.equal(
        row.actions,
        ['ambiguous', 'missing', 'execution-error', 'network-write', 'cancel'].includes(mode)
          ? 1
          : 0,
      )
      if (!['network-write', 'execution-error', 'cancel'].includes(mode))
        assert.equal(row.reuse, 'handoff')
      if (mode === 'cancel') {
        await cancellation
        assert.equal(row.status, 'cancelled')
        assert.equal(row.reuse, 'interrupted')
      }
      if (mode === 'execution-error') {
        assert.equal(row.status, 'execution-error')
        assert.equal(row.reuse, 'interrupted')
      }
      assert.equal((await api(`/api/runs/${id}/path-program`, {})).status, 409)
      if (['ambiguous', 'missing'].includes(mode)) {
        assert.equal(r3.result.actions.length, 1)
        assert.ok(calls.some((c) => c.packet.pathReuse?.readOnly))
      }
    }
  }
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  await page.goto(base)
  // Existing history entry and the shared report renderer are the product presentation path.
  const inputs = page.locator('input')
  await save(
    'workbench-inputs.json',
    await inputs.evaluateAll((ns) =>
      ns.map((n) => ({
        placeholder: n.getAttribute('placeholder'),
        value: (n as HTMLInputElement).value,
      })),
    ),
  )
  await page.goto(base + '/?run=' + reports.healthy.runId)
  await page.getByRole('region', { name: '路径复用报告' }).waitFor()
  await page.getByRole('button', { name: '保存可复用路径' }).click()
  await page.getByText('已保存路径 ID：', { exact: false }).waitFor()
  await page.screenshot({ path: resolve(root, 'workbench.png'), fullPage: true })
  for (const label of ['healthy', 'defect', reviewOnly ? 'dispatch-duplicate' : 'ambiguous']) {
    await page.goto(base + '/?run=' + reports[label].runId)
    await page
      .getByRole('region', { name: '路径复用报告' })
      .screenshot({ path: resolve(root, label + '-reuse.png') })
  }
  mode = 'healthy'
  calls = []
  requests = []
  await page.getByLabel('网址 UI 检查（匿名、有界，不需要业务适配器）').check()
  await page.getByPlaceholder('https://example.org/catalog?category=books#items').fill(origin + '/')
  await page.getByLabel('资料名称').fill(inputSource.title)
  await page.getByLabel('资料版本').fill(inputSource.version)
  await page.getByLabel('产品说明 / Markdown').fill(markdown)
  await page.getByLabel('复用路径 ID（可空）').fill(programId!)
  const submitted = page.waitForResponse(
    (r) => r.url() === base + '/api/runs' && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '开始检查', exact: true }).click()
  const response = await submitted
  assert.equal(response.status(), 202)
  const uiRunId = (await response.json()).runId
  for (let i = 0; i < 1200; i++) {
    const run = (await api('/api/runs/' + uiRunId)).body
    if (!['queued', 'running'].includes(run.status) && !run.active) break
    await sleep(100)
  }
  const uiReport = (await api(`/api/runs/${uiRunId}/report`)).body
  assert.equal(uiReport.uiScan.pathReuse.status, 'reused')
  assert.equal(uiReport.uiScan.inspection.coverage, 'covered')
  assert.equal(uiReport.usage.actions, 2)
  assert.equal(calls.length, 0)
  reports.workbench = uiReport
  await save('workbench-report.json', uiReport)

  child.kill('SIGTERM')
  await new Promise<void>((r) => child.once('exit', () => r()))
  child = start()
  await ready()
  for (const [name, original] of Object.entries(reports)) {
    const restored = (await api(`/api/runs/${original.runId}/report`)).body
    await save(name + '-restored.json', restored)
    assert.deepEqual(restored, original)
  }
  await save('summary.json', {
    free: true,
    realModelCalls: 0,
    results,
    restartReports: Object.keys(reports).length,
  })
} finally {
  await browser?.close()
  child.kill('SIGTERM')
  fixture.close()
  model.close()
  await writeFile(resolve(root, 'server.log'), logs.join(''))
}
