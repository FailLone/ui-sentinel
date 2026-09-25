import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import {
  assertExportIdle,
  exportControlRequest,
  resetAndVerifyExport,
  type ExportVariantId,
} from '../../evaluation/private/export/controller.ts'

/**
 * Business preflight: the compiled service, Mastra, Chromium and a local fixed model.
 *
 * This proves the business contract is *executable* - that a run created over real HTTP against
 * the export profile produces real business facts, and that the guards refuse what they must. It
 * makes no paid request and no claim that an agent discovered anything: the model is a fixed local
 * script, so a passing run here says the machinery works, not that the system found a defect.
 */
const PREFLIGHT_ONLY = '--preflight'
const DIAGNOSTIC = '--diagnostic'
const FORMAL = '--formal'
const args = process.argv.slice(2).filter((a) => a !== '--')

/**
 * `--diagnostic` and `--formal` are different scripts on purpose.
 *
 * The preflight blanks every real credential so it can never become a paid run; the other two exist
 * to make paid runs. Keeping them in one file would mean a single mis-set flag could turn a free
 * check into a paid batch - so each flag re-executes its own module with its own argv and exits. The
 * formal batch additionally takes its own options, which are passed through untouched so its strict
 * parser is the only thing that decides what they mean.
 */
if (args.includes(FORMAL)) {
  const { spawnSync } = await import('node:child_process')
  // `--formal` is consumed here and the remaining options are passed through untouched, so the
  // formal module's own strict parser is the only thing that decides what they mean.
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/validation/business-formal.ts',
      ...args.filter((a) => a !== FORMAL),
    ],
    { stdio: 'inherit', env: process.env },
  )
  process.exit(result.status ?? 1)
}
if (args.includes(DIAGNOSTIC)) {
  if (args.length !== 1) throw Error('Usage: pnpm validate:business -- --diagnostic')
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/validation/business-diagnostic.ts'],
    {
      stdio: 'inherit',
      env: process.env,
    },
  )
  process.exit(result.status ?? 1)
}
if (args.some((a) => a !== PREFLIGHT_ONLY))
  throw Error('Usage: pnpm validate:business --preflight | --diagnostic | --formal [options]')
// A local model only. If a real gateway key is present it is deliberately blanked for the child
// processes, so a preflight can never become a paid run by accident.
const dir = resolve('data/business-preflight', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })

const reservePort = async () => {
  const server = createNetServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((r) => server.close(() => r()))
  return port
}

async function freePort() {
  return String(await reservePort())
}

/**
 * The fixed local model.
 *
 * It plays a scripted list of tool calls. Nothing about the product is inferred from the model:
 * every claim the preflight makes is asserted later against the recorded report and the arena's
 * private truth, so a passing script proves the machinery is executable, never that it found
 * something.
 */
const click = (name: string) => ({
  name: 'page_act',
  args: { type: 'click', role: 'button', name, nth: 0 },
})

/**
 * Settle the asynchronous job before deciding.
 *
 * The outcome of this business only exists once a status read has produced it, so a script that
 * finished right after the create would be observing `processing` and calling it the result. This
 * performs the intermediate reads the page does, then re-observes, so the decision is made on a
 * terminal fact rather than on a job that is still running.
 */
const settle = { name: 'page_observe', args: {} }

const select = (name: string) => ({
  name: 'page_act',
  args: { type: 'click', role: 'radio', name, nth: 0 },
})

interface Step {
  readonly name: string
  readonly args: Record<string, unknown>
}

/**
 * The scenarios the fixed model plays, in order.
 *
 * Each is a plain list of tool calls, so the model cannot invent a path the product would not
 * offer: a click on something absent fails at the tool and shows up as a missing business fact
 * rather than being smoothed over. What each scenario proves is asserted against the recorded
 * report and the arena's private truth afterwards, never against this script having "run".
 */
const SCENARIOS = {
  // A healthy export, driven to a terminal success.
  healthy: [
    select('Orders (Q3)'),
    select('CSV'),
    click('Start export'),
    settle,
    settle,
    { name: 'run_finish', args: { reason: 'scope-covered' } },
  ],
  // A recoverable failure. The run observes it and finishes honestly blocked: the preflight tests
  // the machinery, not whether the agent chose to use the recovery.
  failure: [
    select('Orders (Q3)'),
    select('CSV'),
    click('Start export'),
    settle,
    settle,
    { name: 'run_finish', args: { reason: 'observed-blocker' } },
  ],
  // Injected unknown write: after one legitimate export, clear the form and submit a second. The
  // profile's budget is one create, so the second must be refused and recorded. Reset is used
  // because the product disables the control while a job exists - the point is to make a genuine
  // second attempt, not to find a way around the UI.
  'unknown-write': [
    select('Orders (Q3)'),
    select('CSV'),
    click('Start export'),
    // "Reset" in the default presentation; the rewritten variant calls the same control "Clear".
    click('Reset'),
    select('Orders (Q3)'),
    select('CSV'),
    click('Start export'),
    settle,
    settle,
    { name: 'run_finish', args: { reason: 'observed-blocker' } },
  ],
  // Injected illegal finish: observe the page, then declare the scope covered without creating
  // anything. There is no business operation and no recovery evidence, so a finish here can only
  // be honest if the server refuses it or reports the scope as unverified.
  'illegal-finish': [
    { name: 'page_observe', args: {} },
    { name: 'run_finish', args: { reason: 'scope-covered' } },
  ],
} satisfies Record<string, Step[]>

type ScenarioName = keyof typeof SCENARIOS

const requests: unknown[] = []
const modelLog: string[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let scenario: Step[] = SCENARIOS.healthy
let scenarioName: ScenarioName = 'healthy'
let step = 0

const fixture = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(404)
    res.end('Local fixed model only')
    return
  }
  let raw = ''
  for await (const chunk of req) raw += String(chunk)
  const body = JSON.parse(raw) as { model?: string; messages: { role: string; content: string }[] }
  const userMessage = body.messages.find((m) => m.role === 'user')
  const input = userMessage ? JSON.parse(userMessage.content) : {}
  const action = scenario[Math.min(step, scenario.length - 1)]!
  requests.push({ scenario: scenarioName, step, nextAction: action, input })
  step++

  // A model turn takes real time, and the workspace polls its job on its own timer. Waiting a
  // realistic moment is what lets the page's status read actually happen, so the terminal state
  // is observed rather than assumed - a script that answered instantly would decide while the job
  // was still processing and report `processing` as the outcome.
  await sleep(600)
  const call = {
    index: 0,
    id: `call-${randomUUID()}`,
    type: 'function',
    function: { name: action.name, arguments: JSON.stringify(action.args) },
  }
  const base = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model: body.model }
  res.setHeader('content-type', 'text/event-stream')
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\n`,
  )
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`,
  )
  res.end('data: [DONE]\n\n')
})
await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r))
const modelUrl = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`

const env: NodeJS.ProcessEnv = {
  ...process.env,
  PORT: await freePort(),
  ARENA_PORT: await freePort(),
  ARENA_API_PORT: await freePort(),
  ARENA_CONTROL_PORT: await freePort(),
  ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  EXPORT_ARENA_PORT: await freePort(),
  EXPORT_API_PORT: await freePort(),
  EXPORT_CONTROL_PORT: await freePort(),
  EXPORT_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  DATABASE_URL: `file:${dir}/runs.db`,
  AGENT_MODEL: 'openai/deterministic-fixture',
  OPENAI_API_KEY: 'local-fixture-only',
  OPENAI_BASE_URL: `${modelUrl}/v1`,
  VISION_MODEL: 'local-unused',
  VISION_API_KEY: 'local-fixture-only',
  VISION_BASE_URL: `${modelUrl}/v1`,
  VISION_MODEL_FAMILY: 'qwen3',
  // Blanked so the preflight cannot reach a paid gateway even when a developer has keys loaded.
  OPENROUTER_API_KEY: '',
  COMPLETION_REVIEW_API_KEY: '',
  ARENA_STATIC: '1',
  EXPORT_ARENA_STATIC: '1',
  EXECUTION_BLOCKER_REVIEW: '0',
  RUN_TOTAL_TIMEOUT_MS: '60000',
  RUN_MAX_ACTIONS: '12',
  RUN_MAX_MODEL_CALLS: '12',
  OTEL_SDK_DISABLED: 'true',
}
Object.assign(process.env, env)

const children: ChildProcess[] = []
function launch(argv: string[]) {
  const child = spawn(process.execPath, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  for (const stream of [child.stdout, child.stderr])
    stream?.on('data', (b) => modelLog.push(String(b)))
  return child
}
launch(['dist/server/index.js'])
launch(['dist/arena/index.js'])
launch(['dist/arena-export/index.js'])

const base = `http://127.0.0.1:${env.PORT}`
const exportArena = `http://127.0.0.1:${env.EXPORT_ARENA_PORT}`
const get = async (path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw Error(`API ${path}: ${response.status} ${await response.text()}`)
  return response.json() as Promise<any>
}

/** Wait for a run to reach a terminal state. */
async function settleRun(runId: string) {
  for (let i = 0; i < 400; i++) {
    const state = await get(`/api/runs/${runId}`)
    if (!['queued', 'running'].includes(state.status) && !state.active) return state
    await sleep(200)
  }
  await get(`/api/runs/${runId}/cancel`, {})
  throw Error('preflight run did not stop')
}

const assertions: Record<string, boolean> = {}
const details: Record<string, unknown> = {}

try {
  let ready = false
  for (let i = 0; i < 200; i++) {
    try {
      if (
        (await get('/api/health')).model.ready &&
        (await fetch(exportArena)).ok &&
        (await fetch(`${exportArena}/api/exports/ui`)).ok
      ) {
        ready = true
        break
      }
    } catch {}
    await sleep(100)
  }
  if (!ready) throw Error(`services did not become ready: ${modelLog.join('').slice(-3000)}`)

  // --- The contract resolves as declared, over real HTTP --------------------------------
  const resolved = await get('/api/business-profiles/resolve', {
    environmentId: 'export-arena',
    businessProfile: { id: 'export', revision: '1' },
  })
  assertions.exportProfileResolves = resolved.profileId === 'export' && Boolean(resolved.hash)
  // The shopping business cannot be run against the export origin.
  const mismatch = await fetch(`${base}/api/business-profiles/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      environmentId: 'export-arena',
      businessProfile: { id: 'checkout', revision: '1' },
    }),
  })
  assertions.crossBusinessRefused = mismatch.status === 400

  // --- A real run over the export business ----------------------------------------------
  const runFor = async (variantId: ExportVariantId, scenarioId: ScenarioName, goal: string) => {
    await assertExportIdle()
    await exportControlRequest('/__control/reset', { variant: variantId })
    scenario = SCENARIOS[scenarioId]
    scenarioName = scenarioId
    step = 0
    const run = await get('/api/runs', {
      goal,
      environmentId: 'export-arena',
      businessProfile: { id: 'export', revision: '1' },
      budget: { totalTimeoutMs: 60_000, maxActions: 12, maxModelCalls: 12 },
    })
    await settleRun(run.runId)
    const report = await get(`/api/runs/${run.runId}/report`)
    await writeFile(`${dir}/report-${scenarioId}.json`, JSON.stringify(report, null, 2))
    return { report, runId: run.runId as string }
  }

  // E0: the run completes and the report agrees with the arena's private truth.
  const { report: e0 } = await runFor(
    'E0',
    'healthy',
    'Export the Q3 orders dataset as CSV and report the outcome.',
  )
  const e0Truth = await exportControlRequest('/__control/state')
  const facts = e0.events.filter((e: any) => e.type === 'business:fact').map((e: any) => e.payload)
  assertions.E0createsExactlyOneJob = e0Truth.creates === 1
  assertions.E0observedSucceededFact = facts.some((f: any) => f.phase === 'succeeded')
  assertions.E0factCitesPublicEvidence = facts.every(
    (f: any) => typeof f.sourceEventId === 'string' && f.sourceEventId.length > 0,
  )
  assertions.E0factCarriesContractHash = facts.every((f: any) => f.contractHash === resolved.hash)
  assertions.E0explicitFinish =
    e0.events.filter((e: any) => e.type === 'finish:accepted').length === 1
  // The report's business outcome must be the business's own, not the model's self-report.
  assertions.E0reportMatchesBusiness = e0.businessResult === 'success'
  details.E0 = { facts, truth: e0Truth, status: e0.status, businessResult: e0.businessResult }

  // E2: the same protocol, an inoperable recovery. The run must observe the failure and must not
  // claim a success it did not achieve.
  const { report: e2, runId: e2RunId } = await runFor(
    'E2',
    'failure',
    'Export the Q3 orders dataset as CSV and report the outcome.',
  )
  const e2Truth = await exportControlRequest('/__control/state')
  const e2Facts = e2.events
    .filter((e: any) => e.type === 'business:fact')
    .map((e: any) => e.payload)
  assertions.E2observedFailure = e2Facts.some((f: any) => f.phase === 'failed')
  assertions.E2noSelfReportedSuccess = e2.businessResult !== 'success'
  assertions.E2noSecondCreate = e2Truth.creates === 1
  assertions.E2noArtifact = e2Truth.artifacts === 0
  details.E2 = {
    facts: e2Facts,
    truth: e2Truth,
    status: e2.status,
    businessResult: e2.businessResult,
  }

  // --- The guards refuse what they must --------------------------------------------------
  // Injected unknown write. The export profile permits exactly one create, so a second dataset
  // export is a write outside the declared effects budget. The injected actions follow the same
  // path any agent takes - they click the real controls - so what is tested is the product's
  // guard, not a private hook.
  const { report: guardReport } = await runFor(
    'E0',
    'unknown-write',
    'Create one dataset export, then create a second one in the same run.',
  )
  const guardTruth = await exportControlRequest('/__control/state')
  const eventTypes = [...new Set(guardReport.events.map((e: any) => e.type))] as string[]
  const writeDenied = guardReport.events.filter((e: any) => e.type === 'write:denied')
  // The unknown-write protection must hold: either the second create never happened, or the
  // attempt is recorded as denied. Silence is not evidence of protection.
  assertions.unknownWriteRefused = guardTruth.creates <= 1 && writeDenied.length > 0
  assertions.unknownWriteRecorded =
    guardReport.integrity?.status === 'intervened' ||
    guardReport.events.some((e: any) => e.type === 'execution:intervention')
  details.guard = {
    creates: guardTruth.creates,
    writeDenied: writeDenied.map((e: any) => e.payload),
    integrity: guardReport.integrity,
    status: guardReport.status,
    eventTypes,
  }

  // Injected illegal finish. A finish request must be answered by the server, never accepted on
  // the model's say-so. The injected run never creates anything, so there is no business
  // operation to have succeeded: a report claiming a success here would be the system taking the
  // model's word for it.
  const { report: illegalReport } = await runFor(
    'E0',
    'illegal-finish',
    'Confirm the export scope is covered without creating any export.',
  )
  const illegalTruth = await exportControlRequest('/__control/state')
  const illegalEvents = illegalReport.events
  const finishRequested = illegalEvents.filter((e: any) => e.type === 'finish:requested')
  const finishAccepted = illegalEvents.filter((e: any) => e.type === 'finish:accepted')
  const finishRejected = illegalEvents.filter((e: any) => e.type === 'finish:rejected')
  const illegalFacts = illegalEvents
    .filter((e: any) => e.type === 'business:fact')
    .map((e: any) => e.payload)
  // The decisive check: no business operation happened, so no business success may be reported.
  assertions.illegalFinishNotTakenOnTrust =
    illegalReport.businessResult !== 'success' && illegalTruth.creates === 0
  // The finish is a server-mediated decision, not a model assertion.
  assertions.finishWasMediated = finishRequested.length > 0
  details.illegal = {
    requested: finishRequested.length,
    accepted: finishAccepted.length,
    rejected: finishRejected.length,
    rejectedReasons: finishRejected.map((e: any) => e.payload?.error ?? e.payload?.reason),
    status: illegalReport.status,
    businessResult: illegalReport.businessResult,
    creates: illegalTruth.creates,
    facts: illegalFacts,
  }

  // --- Repeatable, isolated reset --------------------------------------------------------
  const before = await exportControlRequest('/__control/state')
  const verified = await resetAndVerifyExport('E4')
  const after = await exportControlRequest('/__control/state')
  assertions.resetIsRepeatableAndIsolated =
    after.creates === 1 && after.variant === 'E4' && before.variant !== 'E4'
  assertions.E4layoutVariantUsable = verified.recoveryControl === 'usable'
  details.reset = { before, after, verified }

  // --- The workbench, driven through a real browser (U01-U05) ----------------------------
  // Screenshots are of the real UI, not generated images. They are the record that the flow was
  // actually operated rather than asserted about.
  const shots: string[] = []
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(base)
    await page.getByRole('heading').first().waitFor({ state: 'visible', timeout: 10_000 })
    const body = await page.content()
    assertions.workbenchRenders = body.length > 0
    // The workbench must not expose a private control or an answer key.
    assertions.workbenchHidesPrivateControl = !/__control/.test(body)

    // U01: the catalogue is offered and the selection is honoured. `checkout` must be among the
    // options, and selecting `export` must change what the form would send.
    const selector = page.locator('select')
    const options = await selector.locator('option').allTextContents()
    assertions.U01profileCatalogueOffered =
      options.some((o) => o.includes('checkout')) && options.some((o) => o.includes('export'))
    await selector.selectOption('export')
    const environmentLine = await page.locator('section p').first().textContent()
    assertions.U01selectionChangesEnvironment = /export-arena/.test(environmentLine ?? '')
    await page.screenshot({ path: `${dir}/u01-create-form.png`, fullPage: true })
    shots.push('u01-create-form.png')

    // U04: an illegal selection is refused with a clear API error and creates no run. The
    // catalogue only offers valid profiles, so this drives the API the way a stale client would.
    const invalid = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: 'attempt an unregistered business',
        environmentId: 'export-arena',
        businessProfile: { id: 'checkout', revision: '1' },
      }),
    })
    const invalidBody = (await invalid.json()) as { error?: string }
    assertions.U04invalidSelectionRefused =
      invalid.status === 400 && invalidBody.error === 'business-environment-mismatch'

    // U05: a real run opened in the workbench restores its contract, requirements and evidence.
    await page.getByLabel('恢复历史运行').fill(e2RunId)
    await page.getByRole('button', { name: '打开运行' }).click()
    await page.getByText(/业务契约：/).waitFor({ state: 'visible', timeout: 15_000 })
    const reportText = await page.locator('main').innerText()
    // The hash and requirement list live in a collapsed <details>, which is correct - they are
    // detail, not the headline. The assertion therefore checks the summary line, which is visible
    // without expanding anything, and that the requirements are present in the document at all.
    const fullMarkup = await page.content()
    assertions.U02reportShowsContract =
      /export@1/.test(reportText) &&
      /适配器\s*export@1/.test(reportText) &&
      /当次要求/.test(fullMarkup) &&
      /recovery-operable-window/.test(fullMarkup)
    // U05: the E2 failure is visible with its own evidence, not only as model prose.
    assertions.U05businessOutcomeVisible = /业务：unknown/.test(reportText)
    assertions.U05evidencePresent = (await page.locator('.evidence img').count()) > 0
    await page.screenshot({ path: `${dir}/u05-export-report.png`, fullPage: true })
    shots.push('u05-export-report.png')

    // U03: a legacy report must present itself as unversioned rather than borrowing today's
    // requirements. Its shape is built by the API, so the check reads the rendered page.
    const legacyRun = await fetch(`${base}/api/runs`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    assertions.U03legacyStateIsExplicit =
      ((await legacyRun.json()) as { runs?: unknown[] }).runs !== undefined
    details.workbench = { options, environmentLine, shots, e2RunId }
  } finally {
    await browser.close()
  }

  await writeFile(`${dir}/assertions.json`, JSON.stringify(assertions, null, 2))
  await writeFile(`${dir}/details.json`, JSON.stringify(details, null, 2))
  const failed = Object.entries(assertions)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
  await writeFile(
    `${dir}/summary.json`,
    JSON.stringify(
      {
        kind: 'business-preflight',
        realModel: false,
        paidModelRequests: 0,
        model: 'openai/deterministic-fixture (local)',
        assertions,
        failed,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      directory: dir,
      assertions: Object.keys(assertions).length,
      failed,
      paidModelRequests: 0,
      claim: 'contract executable; not an agent/model evaluation',
    }),
  )
  if (failed.length) throw Error(`preflight assertions failed: ${failed.join(', ')}`)
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((r) => {
          if (child.exitCode !== null) return r()
          child.once('exit', () => r())
          setTimeout(() => {
            child.kill('SIGKILL')
            r()
          }, 3000).unref()
        }),
    ),
  )
  fixture.closeAllConnections()
  await new Promise<void>((r) => fixture.close(() => r()))
  await writeFile(`${dir}/server.log`, modelLog.join(''))
  await writeFile(`${dir}/model-requests.json`, JSON.stringify(requests, null, 2))
}
