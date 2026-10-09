import { runVisualStage } from './visual-stage.ts'
import { AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'
import { executableCase } from '../../evaluation/support/execution-plan.ts'
import { readFile } from 'node:fs/promises'
import { CliUsageError, parseVisualCli } from './cli-args.ts'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import { scoreVisualEvidence } from '../../evaluation/private/visual-focus/scorer.ts'
import { VISUAL_TRUTH, VISUAL_VIEWPORTS, isVisualCaseId } from '../../evaluation/fixtures/visual.ts'
import { auditStoppedGroup } from '../../evaluation/support/campaign-evidence.ts'
import { buildArtifactIndex, buildManifest } from '../../evaluation/support/evidence-protocol.ts'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
import { chromium } from 'playwright'
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

// An invalid command line exits 2, not 1: "you asked for the wrong thing" is not "the product failed".
const options = (() => {
  try {
    return parseVisualCli(process.argv.slice(2))
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(`FAIL(${error.exitCode}): ${error.message}`)
      process.exit(error.exitCode)
    }
    throw error
  }
})()
/**
 * The modes are separate modules on purpose.
 *
 * The preflight blanks every real credential so it can never become a paid run; the smoke and the
 * diagnostic/formal runners exist to make real-model runs, and each re-executes its own module so a
 * single mis-set flag cannot turn a free check into a paid batch. Argument validity was already
 * decided by the strict parser above, before any credential is read or any request is sent.
 */
if (options.mode !== 'preflight') {
  const entry =
    options.mode === 'p2-smoke'
      ? 'scripts/validation/visual-focus-p2.ts'
      : 'scripts/validation/visual-focus-runner.ts'
  const passthrough =
    options.mode === 'p2-smoke'
      ? [
          ...(options.cases ? ['--cases', options.cases.join(',')] : []),
          ...(options.spendingSource ? ['--spending-source', options.spendingSource] : []),
        ]
      : [
          '--mode',
          options.mode,
          '--campaign',
          options.campaign!,
          ...(options.diagnosticSource ? ['--diagnostic-source', options.diagnosticSource] : []),
        ]
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry, ...passthrough], {
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
}
const build = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status ?? 1)
const directory = resolve(
  'data/visual-focus-preflight',
  new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(directory, { recursive: true })
// The preflight writes the same manifest shape as every other stage, stamped `fixed`: it blanks every
// real credential, so it must never be readable as a run that authorised spending.
const identity = await buildIdentity()
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
await writeFile(
  resolve(directory, 'manifest.json'),
  JSON.stringify(
    buildManifest({
      stage: 'preflight',
      mode: 'fixed',
      identity: {
        campaignId: `preflight-${commit.slice(0, 12)}`,
        buildHash: identity.hash,
        commit,
      },
    }),
    null,
    2,
  ) + '\n',
)
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
const indexedEvidence: {
  runId: string
  artifactId: string
  type: string
  sha256: string
  bytes: number
  path: string
}[] = []
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
      const caseId = isVisualCaseId(scenario) ? scenario : 'D0'
      const truth = VISUAL_TRUTH[caseId],
        vp = VISUAL_VIEWPORTS[caseId]
      const content = JSON.stringify({
        coordinateSpace: 'normalized-1000',
        candidates: [
          {
            perceivedRegion: {
              x: (truth.region.x / vp.width) * 1000,
              y: (truth.region.y / vp.height) * 1000,
              width: (truth.region.width / vp.width) * 1000,
              height: (truth.region.height / vp.height) * 1000,
            },
            targetDescription: 'Search products input region',
            visualBasis: 'Continuous light background around the visible search field.',
            excludedRegions: truth.excludedRegions.map((b) => ({
              x: (b.x / vp.width) * 1000,
              y: (b.y / vp.height) * 1000,
              width: (b.width / vp.width) * 1000,
              height: (b.height / vp.height) * 1000,
            })),
            confidence: 'high',
          },
        ],
      })
      requests.at(-1)!.raw = JSON.parse(content)
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
const auditRecords: any[] = []
try {
  await ready()
  for (const truth of Object.values(VISUAL_TRUTH)) {
    const row = {
      id: truth.id,
      presentation: truth.presentation,
      expected: truth.expectSupported ? 'supported' : 'refuted',
    }
    scenario = row.id
    step = 0
    binding = undefined
    await reset(row.presentation)
    const run = await api('/api/runs', {
      goal: 'Inspect the shopping experience, complete one normal purchase, and report evidenced issues and unverified scope.',
      environmentId: 'arena',
      viewport: VISUAL_VIEWPORTS[truth.id],
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
    const truthState = (await (
      await fetch(`http://127.0.0.1:${env.ARENA_CONTROL_PORT}/__control/state`, {
        headers: { authorization: `Bearer ${env.ARENA_CONTROL_TOKEN}` },
      })
    ).json()) as any
    assert.equal(truthState.orders.length, 1)
    assert.equal(truthState.orders[0].status, 'paid')
    const downloaded = await downloadRunEvidence(base, report, `${directory}/${row.id}-artifacts`)
    const score = scoreVisualEvidence({
      case: truth.id,
      fixtureRevision: 'known-regression',
      fixtureHash: identity.hash,
      target: {
        tag: 'input',
        type: 'search',
        id: 'product-search-input',
        selector: truth.targetSelector,
      },
      run: report,
      artifacts: downloaded.artifacts,
      sentVision: requests
        .filter((r) => r.scenario === row.id && r.kind === 'vision')
        .map((r) => ({ sha256: String(r.imageSha), raw: r.raw })),
      gatewayCalls: requests
        .filter((r) => r.scenario === row.id && r.kind === 'agent')
        .map((r: any) => ({
          model: 'fixed-agent',
          runId: report.runId,
          tool: r.action.name,
          body: r.action.args,
        })),
      declaredVerdict: row.expected,
    })
    await writeFile(`${directory}/${row.id}-score.json`, JSON.stringify(score, null, 2))
    assert.deepEqual(score.failedAssertions, [], row.id + ' independent score')
    auditRecords.push({ report, artifactIndex: downloaded.index })

    records.push({
      id: row.id,
      runId: run.runId,
      status: report.status,
      businessResult: report.businessResult,
      artifacts,
      receipt,
      focusMeasurements: report.focusMeasurements,
    })
    // The top-level index covers every sample's evidence, with paths relative to this directory so
    // it still resolves after a move (plan P3.4).
    indexedEvidence.push(...buildArtifactIndex(downloaded.index, { base: directory }))
  }
  await writeFile(
    resolve(directory, 'artifact-index.json'),
    JSON.stringify(buildArtifactIndex(indexedEvidence, { base: directory }), null, 2) + '\n',
  )
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
  const audit = await auditStoppedGroup(env.DATABASE_URL, auditRecords, undefined)
  await writeFile(`${directory}/persistence-audit.json`, JSON.stringify(audit, null, 2))
  assert(audit.passed, 'stopped evidence audit')
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
        scope:
          'P3 six-case fixed-local-model SDK/API + independent scoring; not real-model discovery',
        records,
        boundaries,
      },
      null,
      2,
    ),
  )
  // Exercise the production orchestration through its import-only fixed transport. No external fetch
  // is reachable: even the price list comes from this test. Fixed evidence cannot authorize P4.
  for (const child of children) await stop(child)
  const campaignDir = resolve(directory, 'runner-campaign')
  const stageDirectories: string[] = []
  const upstream: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/models'))
      return Response.json({
        data: [AGENT_MODEL, VISION_MODEL].map((id) => ({
          id,
          pricing: { prompt: '0.000001', completion: '0.000001' },
        })),
      })
    assert(String(url).endsWith('/chat/completions'), 'no unexpected upstream endpoint')
    const body = JSON.parse(String(init!.body))
    assert.deepEqual(body.provider.only, ['Alibaba'])
    body.model = body.model === VISION_MODEL ? 'fixed-vision' : 'fixed-agent'
    return fetch(modelUrl + '/chat/completions', { ...init, body: JSON.stringify(body) })
  }
  const transport = {
    mode: 'fixed' as const,
    fetch: upstream,
    skipBuild: true,
    onDirectory: (d: string) => stageDirectories.push(d),
    beforeRow: (row: any) => {
      scenario = executableCase(row)!
      step = 0
      binding = undefined
    },
  }
  assert.equal(
    await runVisualStage({ mode: 'diagnostic', campaignDir }, transport),
    0,
    'real runner with fixed upstream',
  )
  const successful = JSON.parse(
    await readFile(resolve(stageDirectories[0]!, 'manifest.json'), 'utf8'),
  )
  assert.equal(successful.mode, 'fixed')
  assert.equal(successful.paidRequests, 0)
  assert.equal(successful.rows.length, 4)
  assert.equal(successful.passed, true)
  const interrupted = new AbortController()
  const failing: typeof fetch = async () => {
    throw Error('injected-pricing-failure')
  }
  assert.equal(
    await runVisualStage({ mode: 'diagnostic', campaignDir }, { ...transport, fetch: failing }),
    1,
  )
  const failed = JSON.parse(await readFile(resolve(stageDirectories[1]!, 'manifest.json'), 'utf8'))
  assert(failed.rows.every((r: any) => r.outcome === 'not-run'))
  assert.equal(failed.spending.accountedUsd, successful.spending.accountedUsd)
  // The lease was released after failed setup; the next stage can acquire it, then cancel cleanly.
  assert.equal(
    await runVisualStage(
      { mode: 'diagnostic', campaignDir },
      {
        ...transport,
        signal: interrupted.signal,
        beforeRow: (row) => {
          transport.beforeRow(row)
          setTimeout(() => interrupted.abort(), 1200)
        },
      },
    ),
    130,
  )
  const cancelled = JSON.parse(
    await readFile(resolve(stageDirectories[2]!, 'manifest.json'), 'utf8'),
  )
  assert.equal(cancelled.rows[0].outcome, 'cancelled')
  assert(cancelled.rows[0].runId)
  assert(cancelled.rows.slice(1).every((r: any) => r.outcome === 'not-run'))
  await writeFile(
    resolve(directory, 'runner-results.json'),
    JSON.stringify({ mode: 'fixed', stageDirectories, passed: true }, null, 2),
  )
  console.log(`P3 free integration passed: ${directory}`)
} finally {
  await writeFile(`${directory}/requests.json`, JSON.stringify(requests, null, 2))
  await writeFile(`${directory}/service.log`, logs.join('\n'))
  for (const child of children) await stop(child)
  await new Promise<void>((r) => model.close(() => r()))
}
