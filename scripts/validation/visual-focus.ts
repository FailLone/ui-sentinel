import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import { visualSmokeProblems } from '../../evaluation/preflight/visual-smoke-score.ts'
import { chromium } from 'playwright'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const args = process.argv.slice(2).filter((a) => a !== '--')
if (args[0] === '--p2-smoke') {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/validation/visual-focus-p2.ts', ...args.slice(1)],
    { stdio: 'inherit', env: process.env },
  )
  process.exit(result.status ?? 1)
}
if (args.length !== 1 || args[0] !== '--preflight')
  throw Error(
    'Expected --preflight or --p2-smoke [--cases D0,H0,H1]. Formal diagnostic/acceptance remains P3/P4.',
  )
const build = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status ?? 1)
const directory = resolve(
  'data/visual-focus-preflight',
  new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(directory, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const port = async () => {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const n = (s.address() as { port: number }).port
  await new Promise<void>((r) => s.close(() => r()))
  return String(n)
}
const logs: string[] = []
const requests: Record<string, unknown>[] = []
let step = 0,
  scenario = 'D0'
let binding: { candidateId: string; elementRef: string; bindingReason: string } | undefined
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const part of req) raw += part
    const body = JSON.parse(raw)
    if (body.model === 'fixed-vision') {
      const image = body.messages
        .flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
        .find((p: any) => p.type === 'image_url')?.image_url?.url
      assert.match(image ?? '', /^data:image\/png;base64,/)
      requests.push({
        scenario,
        kind: 'vision',
        imageSha: createHash('sha256')
          .update(Buffer.from(image.split(',')[1], 'base64'))
          .digest('hex'),
      })
      // The fixed model answers for the D0/H0 field. It echoes the field's real box as the private
      // fixture records it - but that echo is the reason this preflight cannot stand in for a real
      // model: it is handed the answer, so it cannot reveal that the page was undetectable. Real
      // Qwen, seeing a field that was 3/255 from the page background with no border, correctly
      // reported the inner input instead and the defect was never measured.
      const content = JSON.stringify({
        candidates: [
          {
            perceivedRegion: { x: 430, y: 133, width: 420, height: 50 },
            targetDescription: 'Search products input region',
            visualBasis: 'Continuous light background around the visible search field.',
            excludedRegions: [],
            confidence: 'high',
          },
        ],
      })
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          id: randomUUID(),
          model: body.model,
          object: 'chat.completion',
          created: 1,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
        }),
      )
      return
    }
    const message = body.messages.find((m: any) => m.role === 'user')
    const input = JSON.parse(message.content)
    let action: { name: string; args: Record<string, unknown> }
    if (step === 0) {
      assert(
        input.visualCandidates?.length === 1,
        'formal executor must provide the persisted visual candidate',
      )
      const target = input.observation.elements.find((e: any) => e.tag === 'input')
      assert(target, 'native input ref missing')
      binding = {
        candidateId: input.visualCandidates[0].id,
        elementRef:
          scenario === 'wrong-binding'
            ? input.observation.elements.find((e: any) => e.tag === 'button').ref
            : target.ref,
        bindingReason:
          'The visible Search products field is the unique input associated with this perceived region.',
      }
      action = { name: 'focus_probe', args: binding }
    } else if (step === 1) action = { name: 'focus_probe', args: binding! }
    else {
      const sequence = [
        { name: 'page_act', args: { type: 'click', role: 'button', name: 'Add to Cart', nth: 0 } },
        { name: 'page_act', args: { type: 'click', role: 'button', name: 'View Cart' } },
        { name: 'page_act', args: { type: 'click', role: 'button', name: 'Proceed to Checkout' } },
        { name: 'page_act', args: { type: 'click', role: 'button', name: 'Pay Now' } },
        { name: 'page_observe', args: {} },
        { name: 'run_finish', args: { reason: 'scope-covered' } },
      ]
      action = sequence[Math.min(step - 2, sequence.length - 1)]
    }
    if (action.name === 'page_act') {
      const target = input.observation.elements.find(
        (e: any) => e.tag === action.args.role && e.text.includes(action.args.name as string),
      )
      if (target)
        action = {
          ...action,
          args: { ...action.args, name: target.text.replace(/\s+/g, ' ').trim() },
        }
    }
    requests.push({ scenario, kind: 'agent', step, action, input })
    step++
    await sleep(150)
    const call = {
      index: 0,
      id: `call-${randomUUID()}`,
      type: 'function',
      function: { name: action.name, arguments: JSON.stringify(action.args) },
    }
    const base = {
      id: randomUUID(),
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
    }
    if (body.stream) {
      res.setHeader('content-type', 'text/event-stream')
      res.write(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\n`,
      )
      res.write(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`,
      )
      res.end('data: [DONE]\n\n')
    } else {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          ...base,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: null, tool_calls: [call] },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        }),
      )
    }
  } catch (error) {
    logs.push(String(error))
    res.writeHead(500)
    res.end(JSON.stringify({ error: { message: String(error) } }))
  }
})
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r))
const modelUrl = `http://127.0.0.1:${(model.address() as { port: number }).port}/v1`
const env = {
  ...process.env,
  PORT: await port(),
  ARENA_PORT: await port(),
  ARENA_API_PORT: await port(),
  ARENA_CONTROL_PORT: await port(),
  ARENA_CONTROL_TOKEN: randomBytes(20).toString('hex'),
  DATABASE_URL: `file:${directory}/runs.db`,
  AGENT_MODEL: 'openai/fixed-agent',
  OPENAI_API_KEY: 'fixed-local-only',
  OPENAI_BASE_URL: modelUrl,
  VISION_MODEL: 'fixed-vision',
  VISION_API_KEY: 'fixed-local-only',
  VISION_BASE_URL: modelUrl,
  VISION_MODEL_FAMILY: 'qwen3',
  OPENROUTER_API_KEY: '',
  COMPLETION_REVIEW_API_KEY: '',
  MIDSCENE_MODEL_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  GOOGLE_API_KEY: '',
  ARENA_STATIC: '1',
  EXECUTION_VISUAL_DISCOVERY: '1',
  EXECUTION_BLOCKER_REVIEW: '0',
  RUN_TOTAL_TIMEOUT_MS: '60000',
  RUN_MAX_ACTIONS: '20',
  RUN_MAX_MODEL_CALLS: '15',
  OTEL_SDK_DISABLED: 'true',
}
const children: ChildProcess[] = []
function launch(entry: string) {
  const child = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  for (const out of [child.stdout, child.stderr]) out?.on('data', (b) => logs.push(String(b)))
  return child
}
const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await new Promise<void>((r) => child.once('exit', () => r()))
}
let service = launch('dist/server/index.js')
launch('dist/arena/index.js')
const base = `http://127.0.0.1:${env.PORT}`
async function api(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) throw Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<any>
}
async function ready() {
  for (let i = 0; i < 150; i++) {
    try {
      if (
        (await api('/api/health')).model.ready &&
        (await fetch(`http://127.0.0.1:${env.ARENA_PORT}/api/variant-config`)).ok
      )
        return
    } catch {}
    await sleep(100)
  }
  throw Error('services not ready')
}
async function reset(presentation: string) {
  const r = await fetch(`http://127.0.0.1:${env.ARENA_CONTROL_PORT}/__control/reset`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.ARENA_CONTROL_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ variant: 'C0', visual: presentation }),
  })
  assert.equal(r.status, 200)
}
async function settled(id: string) {
  for (let i = 0; i < 350; i++) {
    const r = await api(`/api/runs/${id}`)
    if (!['queued', 'running'].includes(r.status) && !r.active) return
    await sleep(100)
  }
  throw Error('run did not settle')
}
const records: any[] = []
try {
  await ready()
  for (const row of [
    { id: 'D0', presentation: 'search-padded-narrow-input', expected: 'supported' },
    { id: 'H0', presentation: 'search-proxied-wide-region', expected: 'refuted' },
  ]) {
    scenario = row.id
    step = 0
    binding = undefined
    await reset(row.presentation)
    const run = await api('/api/runs', {
      goal: 'Inspect the shopping experience, complete one normal purchase, and report evidenced issues and unverified scope.',
      environmentId: 'arena',
      viewport: { width: 1280, height: 768 },
      budget: { totalTimeoutMs: 60000, maxActions: 20, maxModelCalls: 15 },
    })
    await settled(run.runId)
    const report = await api(`/api/runs/${run.runId}/report`)
    await writeFile(`${directory}/${row.id}.json`, JSON.stringify(report, null, 2))
    assert.equal(report.status, 'completed', `${row.id}: ${report.status}; see report`)
    assert.equal(report.businessResult, 'success')
    const measurement = report.focusMeasurements[0]
    assert(measurement?.receiptRef && measurement.annotatedRef)
    const receipt = (await (
      await fetch(base + `/api/runs/${run.runId}/artifacts/${measurement.receiptRef}`)
    ).json()) as any
    assert.equal(receipt.samples.length, row.expected === 'supported' ? 3 : 2)
    assert(receipt.actionCost <= 8)
    assert.equal(
      report.events.filter((e: any) => e.type === 'visual-focus:click-dispatched').length,
      receipt.actionCost,
    )
    assert.equal(report.usage.actions, receipt.actionCost + 4)
    assert.equal(report.usage.modelCalls, requests.filter((r) => r.scenario === row.id).length)
    assert.notDeepEqual([receipt.positiveControl.x, receipt.positiveControl.y], [0, 0])
    assert.equal(report.hypotheses.filter((h: any) => h.status === row.expected).length, 1)
    assert.equal(report.focusMeasurements.length, 1, 'duplicate call must reuse receipt')
    assert.equal(
      report.findings.filter(
        (f: any) => f.title === 'Sampled input-region clicks did not focus the input',
      ).length,
      row.expected === 'supported' ? 1 : 0,
    )
    const artifacts: any[] = []
    for (const a of report.artifacts) {
      const response = await fetch(base + a.url)
      assert.equal(response.status, 200)
      const bytes = Buffer.from(await response.arrayBuffer())
      artifacts.push({
        id: a.id,
        url: a.url,
        sha: createHash('sha256').update(bytes).digest('hex'),
      })
    }
    const downloaded = await downloadRunEvidence(base, report, `${directory}/${row.id}-artifacts`)
    assert.deepEqual(
      visualSmokeProblems(
        row.id as 'D0' | 'H0',
        report,
        downloaded.artifacts,
        requests
          .filter((r) => r.scenario === row.id && r.kind === 'vision')
          .map((r) => String(r.imageSha)),
      ),
      [],
    )
    records.push({
      id: row.id,
      runId: run.runId,
      status: report.status,
      businessResult: report.businessResult,
      artifacts,
      receipt,
      focusMeasurements: report.focusMeasurements,
    })
  }
  const boundaries = []
  for (const boundary of ['budget', 'cancel', 'wrong-binding']) {
    scenario = boundary
    step = 0
    binding = undefined
    await reset('search-padded-narrow-input')
    const run = await api('/api/runs', {
      goal: 'Inspect shopping, complete one normal purchase, and preserve unverified scope.',
      environmentId: 'arena',
      viewport: { width: 1280, height: 768 },
      budget: {
        totalTimeoutMs: 60000,
        maxActions: boundary === 'budget' ? 7 : 20,
        maxModelCalls: 15,
      },
    })
    if (boundary === 'cancel') {
      let clicked = false
      for (let i = 0; i < 150; i++) {
        const report = await api(`/api/runs/${run.runId}/report`)
        if (report.events.some((e: any) => e.type === 'visual-focus:click-dispatched')) {
          clicked = true
          break
        }
        await sleep(25)
      }
      assert(clicked, 'cancel must interrupt the actual probe after its first pointer dispatch')
      await api(`/api/runs/${run.runId}/cancel`, {})
    }
    await settled(run.runId)
    const report = await api(`/api/runs/${run.runId}/report`)
    await writeFile(`${directory}/${boundary}.json`, JSON.stringify(report, null, 2))
    assert.equal(report.focusMeasurements.length, 0)
    assert.equal(
      report.findings.filter(
        (f: any) => f.title === 'Sampled input-region clicks did not focus the input',
      ).length,
      0,
    )
    const clicks = report.events.filter((e: any) => e.type === 'visual-focus:click-dispatched')
    if (boundary === 'cancel') {
      assert.equal(report.status, 'cancelled')
      assert.equal(
        clicks.length,
        1,
        'no pointer action after cancellation during control measurement',
      )
      await sleep(600)
      const later = await api(`/api/runs/${run.runId}/report`)
      assert.equal(later.events.length, report.events.length, 'late callbacks must not commit')
    } else {
      assert.equal(clicks.length, 0)
      assert.equal(report.businessResult, 'success')
      assert.equal(
        report.status,
        'blocked',
        'unverified visual scope must prevent claiming complete inspection',
      )
      assert(report.hypotheses.some((h: any) => h.status === 'inconclusive'))
    }
    boundaries.push({
      scenario: boundary,
      runId: run.runId,
      status: report.status,
      clicks: clicks.length,
    })
  }
  await stop(service)
  service = launch('dist/server/index.js')
  await ready()
  for (const record of records) {
    const report = await api(`/api/runs/${record.runId}/report`)
    assert.deepEqual(report.focusMeasurements, record.focusMeasurements)
    for (const a of record.artifacts) {
      const bytes = Buffer.from(await (await fetch(base + a.url)).arrayBuffer())
      assert.equal(createHash('sha256').update(bytes).digest('hex'), a.sha)
    }
  }
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (const record of records) {
      await page.goto(`${base}/?run=${record.runId}`)
      await page.getByRole('heading', { name: '输入区域聚焦测量', exact: true }).waitFor()
      const section = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: '输入区域聚焦测量', exact: true }) })
      assert.equal(await section.locator('tbody tr').count(), record.receipt.samples.length)
      await section.scrollIntoViewIfNeeded()
      await section.locator('img').first().waitFor()
      await page.screenshot({ path: `${directory}/${record.id}-report.png`, fullPage: false })
      await page.reload()
      await page.getByRole('heading', { name: '输入区域聚焦测量', exact: true }).waitFor()
    }
  } finally {
    await browser.close()
  }
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        status: 'passed',
        scope: 'P1 fixed-local-model SDK/API integration only; not real-model discovery',
        records,
        boundaries,
      },
      null,
      2,
    ),
  )
  console.log(`P1 free integration passed: ${directory}`)
} finally {
  await writeFile(`${directory}/requests.json`, JSON.stringify(requests, null, 2))
  await writeFile(`${directory}/service.log`, logs.join('\n'))
  for (const child of children) await stop(child)
  await new Promise<void>((r) => model.close(() => r()))
}
