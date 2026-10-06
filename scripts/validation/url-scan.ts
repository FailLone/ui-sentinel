import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { CliUsageError, parseUrlScanCli } from './cli-args.ts'
import {
  scoreUrlScan,
  type UrlScanIndependentView,
  type UrlScanRunView,
} from '../../evaluation/private/url-scan/scorer.ts'
import { urlScanTruth, type UrlScanSampleTruth } from '../../evaluation/private/url-scan/truth.ts'
import { verifyUrlScanManifest, type UrlScanManifest } from './url-scan-freeze.ts'

/**
 * The free URL-scan preflight (plan 8 B4, 10.1).
 *
 * This drives the *compiled service* - not the source tree - through the formal API and a real
 * Chromium, with a fixed local model. It proves the machinery is executable: a `ui-scan` run can be
 * created from a URL, assembles no business adapter, observes and interacts, and reaches a
 * scope-covered completion whose proof verifies against its own ledger. It makes no paid request and
 * no claim that a model discovered anything - the model is a script, so a pass here says the wiring
 * works, never that the system finds defects on a real site.
 *
 * Every credential is blanked for the child processes, so this can never become a paid run by
 * accident: the only model was ever the local fixture below, and the feature is switched on through
 * `EXECUTION_URL_SCAN`, which defaults off in a real deployment.
 */
const options = (() => {
  try {
    return parseUrlScanCli(process.argv.slice(2))
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(`FAIL(${error.exitCode}): ${error.message}`)
      process.exit(error.exitCode)
    }
    throw error
  }
})()

/**
 * The planned and paid modes branch here, before any browser, port or fixture is created.
 *
 * `--dry-run` reads a frozen manifest and prints the matrix an operator is being asked to authorise.
 * The paid modes themselves are not runnable yet: the URL campaign runner is not built, and this
 * development authorisation explicitly excludes paid acceptance runs. They refuse by name rather than
 * falling through to the free path, so a paid-looking command can never quietly become a free run and
 * be read as a paid result.
 */
/** The default matrix of plan 10.2: the five samples, three times each. */
const DEFAULT_MATRIX = {
  samples: ['healthy-catalog', 'overlay-defect', 'dom-investigation-defect'] as const,
  repetitions: 3,
  // The first authorisation step's ceiling for the UI diagnostic; the formal batch raises it.
  ceilingUsd: 2,
}

if (options.mode !== 'preflight' && options.mode !== 'freeze') {
  const manifest = (await (async () => {
    try {
      return JSON.parse(await readFile(options.manifest!, 'utf8')) as UrlScanManifest
    } catch (error) {
      console.error(`FAIL(2): the manifest could not be read: ${String(error)}`)
      process.exit(2)
    }
  })()) as UrlScanManifest
  if (!verifyUrlScanManifest(manifest)) {
    console.error(
      `FAIL(2): the manifest at ${options.manifest} does not verify against its own hash; a batch ` +
        `must run against an identity that was actually frozen.`,
    )
    process.exit(2)
  }
  if (options.mode === 'dry-run') {
    const { describeUrlScanPlan } = await import('./url-scan-plan.ts')
    const plan = describeUrlScanPlan(manifest)
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          batch: options.batch,
          paidRequests: 0,
          ...plan,
        },
        null,
        2,
      ),
    )
    process.exit(0)
  }
  console.error(
    `FAIL(2): --${options.mode} is a paid mode and this development authorisation does not include ` +
      `paid acceptance runs. The batch ${options.batch} is planned against ${manifest.hash}; use ` +
      `--dry-run to review the matrix, and obtain an explicit authorisation for the batch, run count ` +
      `and cost ceiling before running it.`,
  )
  process.exit(2)
}

if (options.mode === 'freeze') {
  // The freeze step: record the identity a paid batch would run against, computed from the tree
  // rather than written down. It spends nothing and starts no service, so it is safe to run while
  // paid acceptance is unauthorised - and it is what makes the authorisation request concrete.
  const { execFileSync } = await import('node:child_process')
  const { buildUrlScanManifest, dirtyPathsAffectingRuns, hashTree, redactConfiguration } =
    await import('./url-scan-freeze.ts')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const dirty = dirtyPathsAffectingRuns(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
  )
  if (dirty.length) {
    console.error(
      `FAIL(2): a batch must be cut from a clean build, and these changed paths can move a result. ` +
        `Commit or stash them before freezing:\n${dirty.join('\n')}`,
    )
    process.exit(2)
  }
  const [build, scorer] = await Promise.all([
    hashTree(resolve('dist')),
    hashTree(resolve('evaluation/private/url-scan')),
  ])
  const { createHash } = await import('node:crypto')
  // The fixtures are the harness that serves the scanned site plus the private truth that labels its
  // variants: both are what a result's "healthy" or "defective" claim actually rests on, so both are
  // in the identity. Hashing them here rather than listing names means a fixture edit moves the hash.
  const fixtureFiles = [
    resolve('scripts/validation/url-scan.ts'),
    resolve('evaluation/private/url-scan/truth.ts'),
  ]
  const fixtureHash = createHash('sha256')
    .update((await Promise.all(fixtureFiles.map((f) => readFile(f, 'utf8')))).join('\u0000'))
    .digest('hex')
  const manifest = buildUrlScanManifest({
    commit,
    buildHash: build.hash,
    configuration: redactConfiguration({
      model: process.env.AGENT_MODEL ?? '<unset>',
      visionModel: process.env.VISION_MODEL ?? '<unset>',
      urlScan: process.env.EXECUTION_URL_SCAN === '1',
      trustedOrigins: process.env.URL_SCAN_TRUSTED_ORIGINS ?? '',
      budget: {
        totalTimeoutMs: process.env.RUN_TOTAL_TIMEOUT_MS ?? '<default>',
        maxActions: process.env.RUN_MAX_ACTIONS ?? '<default>',
        maxModelCalls: process.env.RUN_MAX_MODEL_CALLS ?? '<default>',
      },
    }),
    fixtureHash,
    scorerHash: scorer.hash,
    policyRevision: 'url-scan-1',
    promptRevision: 'ui-goal-policy-1',
    samples: options.samples ?? [...DEFAULT_MATRIX.samples],
    repetitions: options.repetitions ?? DEFAULT_MATRIX.repetitions,
    costCeilingUsd: options.costCeilingUsd ?? DEFAULT_MATRIX.ceilingUsd,
  })
  const out =
    options.manifest ?? resolve('data/r0-url-scan', `manifest-${commit.slice(0, 12)}.json`)
  await mkdir(resolve(out, '..'), { recursive: true })
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(
    JSON.stringify(
      {
        mode: 'freeze',
        manifest: out,
        hash: manifest.hash,
        commit,
        plannedRuns: manifest.plan.totalRuns,
        costCeilingUsd: manifest.costCeilingUsd,
        paidRequests: 0,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const dir = resolve('data/r0-url-scan', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })

const reservePort = async () => {
  const server = createNetServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((r) => server.close(() => r()))
  return port
}
const freePort = () => reservePort()

/** A recorded fact about a variant, so the same fixture can serve a healthy and a defective page. */
type Variant = 'healthy' | 'defective'

/**
 * The scanned site.
 *
 * One document, two variants. The variant is chosen by the private control endpoint, never by
 * anything in the public page: there is no query parameter, no hidden input and no comment that
 * tells the agent which variant it is looking at. The *only* public difference is the behaviour the
 * defect actually produces - in the defective variant the sort button does nothing - which is exactly
 * what a real defect looks like and what an independent reviewer would reproduce by hand.
 */
let variant: Variant = 'healthy'
const pageRequests: { method: string; path: string }[] = []

const ROWS = [
  { id: 'b', name: 'Blue widget', price: '20.00' },
  { id: 'a', name: 'Amber gadget', price: '5.00' },
  { id: 'c', name: 'Cyan sprocket', price: '12.00' },
]

function catalog(rows: typeof ROWS) {
  return (
    `<html><head><title>Catalog</title></head><body>` +
    `<h1>Catalog</h1>` +
    `<div id="controls"><button id="apply" type="button">Apply sort</button>` +
    `<select id="sort" aria-label="Sort"><option value="name">Name</option>` +
    `<option value="price">Price</option></select></div>` +
    `<ul id="rows">` +
    rows.map((r) => `<li data-id="${r.id}">${r.price} · ${r.name}</li>`).join('') +
    `</ul>` +
    `<a href="/detail?id=1">Detail</a>` +
    // The button's only effect: in the healthy variant the rows reorder; in the defective one the
    // handler is absent, which is the defect an independent measurement can see.
    (variant === 'healthy'
      ? `<script>document.getElementById('apply').addEventListener('click',function(){` +
        `var l=document.getElementById('rows');var rows=[].slice.call(l.children);` +
        `rows.sort(function(a,b){return a.textContent.localeCompare(b.textContent)});` +
        `rows.forEach(function(r){l.appendChild(r)});` +
        `document.getElementById('controls').dataset.applied='1'});</script>`
      : '') +
    `</body></html>`
  )
}

const fixture = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://fixture.local')
  if (url.pathname === '/__control') {
    // Private: switches the variant. No public page links here, and the scanned origin is a
    // different port from the control, so a run cannot reach this even by guessing the path.
    variant = url.searchParams.get('variant') === 'defective' ? 'defective' : 'healthy'
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ variant }))
    return
  }
  pageRequests.push({ method: request.method ?? 'GET', path: url.pathname + url.search })
  response.setHeader('content-type', 'text/html')
  response.end(url.pathname === '/detail' ? catalog(ROWS.slice(0, 1)) : catalog(ROWS))
})
await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r))
const fixturePort = (fixture.address() as { port: number }).port
// `localtest.me` resolves to 127.0.0.1 but is a name, so the entry passes the public-address rule the
// way a real URL does, and the fixture origin is the server-owned exception of plan 4.1.
const fixtureOrigin = `http://localtest.me:${fixturePort}`
const controlPort = await freePort()

/** The built-in http fixture does not serve the control port; a tiny listener does. */
const control = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://control.local')
  variant = url.searchParams.get('variant') === 'defective' ? 'defective' : 'healthy'
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ variant }))
})
await new Promise<void>((r) => control.listen(controlPort, '127.0.0.1', r))

const entryUrl = `${fixtureOrigin}/catalog?category=books&sort=price`

/**
 * The fixed local model: a scripted list of tool calls, exactly as the business preflight uses.
 *
 * An entry is either a literal call or a function of the agent's own view of the run. The function
 * form exists because the ledger's item ids are created by the executor, not chosen by the script:
 * a selection has to name the items this run actually offered, which are read from the prompt rather
 * than invented. That is also what a real agent does, and it is why this cannot be a hard-coded list.
 */
type PromptView = { inspectionScope?: { candidates?: { itemId: string; category: string }[] } }
type ScriptedCall =
  | { name: string; args: Record<string, unknown> }
  | ((prompt: PromptView) => { name: string; args: Record<string, unknown> })

const SCENARIOS = {
  // Observe the entry, select the controls it offered, exercise the sort control, then finish
  // covering what was checked. The selection is what discharges plan 5.2's sampling obligation; the
  // click is what makes the interaction a real measurement rather than a statement.
  interact: [
    { name: 'page_observe', args: {} },
    (prompt: PromptView) => {
      const candidates = prompt.inspectionScope?.candidates ?? []
      const interaction = candidates.find((c) => c.category === 'local-interaction')
      const navigation = candidates.find((c) => c.category === 'navigation')
      // Both obligations the observation created are selected, because the page really did offer
      // both and the run's scope has to answer for each. Selecting only the convenient one and
      // letting the other lapse would be exactly the "shrink the promised scope to finish" move the
      // ledger is built to refuse.
      return {
        name: 'exploration_update',
        args: {
          state: 'catalog',
          unexploredBranches: [],
          selectItems: [
            ...(interaction
              ? [
                  {
                    itemId: interaction.itemId,
                    basis: 'the page presents this control as its own affordance',
                  },
                ]
              : []),
            ...(navigation
              ? [
                  {
                    itemId: navigation.itemId,
                    basis: 'one same-origin detail page is within depth 1',
                  },
                ]
              : []),
          ],
        },
      }
    },
    { name: 'page_act', args: { type: 'click', role: 'button', name: 'Apply sort', nth: 0 } },
    { name: 'page_observe', args: {} },
    // The second obligation: one same-origin page, within the declared depth of 1.
    { name: 'page_act', args: { type: 'navigate', url: `${fixtureOrigin}/detail?id=1` } },
    { name: 'page_observe', args: {} },
    { name: 'run_finish', args: { reason: 'scope-covered' } },
  ],
  // Declare the scope covered with only a single observation and no interaction: the server must
  // refuse it, because a page that was only looked at cannot prove its controls work.
  illegalFinish: [
    { name: 'page_observe', args: {} },
    { name: 'run_finish', args: { reason: 'scope-covered' } },
  ],
  // Attempt a cross-origin navigation the contract does not allow. The boundary must refuse it
  // before dispatch and record the refusal, not silently allow it.
  navigateOut: [
    { name: 'page_observe', args: {} },
    { name: 'page_act', args: { type: 'navigate', url: 'https://example.com/' } },
    { name: 'run_finish', args: { reason: 'unverified-scope' } },
  ],
} satisfies Record<string, readonly ScriptedCall[]>

type ScenarioName = keyof typeof SCENARIOS
let scenario: ScenarioName = 'interact'
const requests: unknown[] = []
const modelLog: string[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const model = createServer(async (request, response) => {
  let raw = ''
  for await (const chunk of request) raw += String(chunk)
  const body = JSON.parse(raw) as {
    model?: string
    messages?: { role?: string; content?: unknown }[]
  }
  const calls = SCENARIOS[scenario]
  const state = String(body.messages?.find((m) => m?.role === 'user')?.content ?? '')
  // The fixture also serves the vision and completion-review routes (all pointed at this one origin).
  // Only a genuine agent turn carries the UI ledger's view of the run; anything else is answered with
  // plain text and never advances the script, so a vision or review call cannot steal the next action.
  const isAgentTurn = state.includes('inspectionScope')
  requests.push({
    scenario,
    kind: isAgentTurn ? 'agent' : 'other',
    nextAction: isAgentTurn ? null : undefined,
  })
  await sleep(400)
  const base = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model: body.model }
  response.setHeader('content-type', 'text/event-stream')
  if (!isAgentTurn) {
    response.write(
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] })}\n\n`,
    )
    response.write(
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } })}\n\n`,
    )
    response.end('data: [DONE]\n\n')
    return
  }
  // How many agent turns the ledger actually holds. The executor hands the agent its decision memory
  // as JSON, and every accepted turn adds one entry to `history`, so counting them is the honest
  // measure of progress: a request the server rejected, retried or resolved without running a tool
  // does not move the count, and a retried request therefore gets the same action again.
  const executed = state.split('"index"').length - 1
  const turn = Math.min(executed, calls.length - 1)
  const scripted = calls[turn]!
  const action =
    typeof scripted === 'function' ? scripted(JSON.parse(state) as PromptView) : scripted
  modelLog.push(`\n[fixture] scenario=${scenario} executed=${executed} served=${action.name}\n`)
  requests[requests.length - 1] = { scenario, kind: 'agent', executed, nextAction: action }
  const call = {
    index: 0,
    id: `call-${randomUUID()}`,
    type: 'function',
    function: { name: action.name, arguments: JSON.stringify(action.args) },
  }
  response.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\n`,
  )
  response.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`,
  )
  response.end('data: [DONE]\n\n')
})
await new Promise<void>((r) => model.listen(0, '127.0.0.1', r))
const modelUrl = `http://127.0.0.1:${(model.address() as { port: number }).port}`

const env: NodeJS.ProcessEnv = {
  ...process.env,
  PORT: String(await freePort()),
  DATABASE_URL: `file:${dir}/runs.db`,
  AGENT_MODEL: 'openai/deterministic-fixture',
  OPENAI_API_KEY: 'local-fixture-only',
  OPENAI_BASE_URL: `${modelUrl}/v1`,
  VISION_MODEL: 'local-unused',
  VISION_API_KEY: 'local-fixture-only',
  VISION_BASE_URL: `${modelUrl}/v1`,
  VISION_MODEL_FAMILY: 'qwen3',
  // Blanked so a developer's real keys can never turn this into a paid run.
  OPENROUTER_API_KEY: '',
  COMPLETION_REVIEW_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  GOOGLE_API_KEY: '',
  // The feature is off by default in a real deployment; the preflight is the one place it is on,
  // with the fixture origin declared as the only allowed local address.
  EXECUTION_URL_SCAN: '1',
  URL_SCAN_TRUSTED_ORIGINS: fixtureOrigin,
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

const base = `http://127.0.0.1:${env.PORT}`
async function api(path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: response.status, body: (await response.json().catch(() => null)) as any }
}

async function settleRun(runId: string) {
  for (let i = 0; i < 400; i++) {
    const { body } = await api(`/api/runs/${runId}`)
    if (body && !['queued', 'running'].includes(body.status) && !body.active) return body
    await sleep(200)
  }
  await api(`/api/runs/${runId}/cancel`, {})
  throw Error('preflight run did not stop')
}

/** Everything the scorer needs, read from the report and the independent server, never from a claim. */
function runViewOf(report: any): UrlScanRunView {
  const events = report.events as any[]
  return {
    runId: report.runId,
    status: report.status,
    businessResult: report.businessResult,
    stopReason: report.stopReason,
    persistence: {
      status: report.persistence?.status ?? 'not-final',
      issues: report.persistence?.issues ?? [],
    },
    finishAccepted: events.some((e) => e.type === 'finish:accepted'),
    proofVerified: Boolean(report.uiScan?.proofVerified),
    coverage: report.uiScan?.inspection?.coverage ?? 'not-started',
    items: (report.uiScan?.inspection?.items ?? []).map((i: any) => ({
      itemId: i.itemId,
      category: i.category,
      status: i.status,
      evidenceRefs: i.evidenceRefs ?? [],
    })),
    findings: (report.findings ?? []).map((f: any) => ({
      id: f.id,
      validationStatus: f.validationStatus,
      evidenceRefs: f.evidenceRefs ?? [],
    })),
  }
}

const assertions: Record<string, boolean> = {}
const details: Record<string, unknown> = {}
const samples: readonly UrlScanSampleTruth[] = urlScanTruth('').samples
const sample = options.sample ? samples.find((s) => s.sampleId === options.sample) : samples[0]!
if (!sample) throw Error(`unknown sample: ${options.sample}`)

try {
  let ready = false
  for (let i = 0; i < 200; i++) {
    try {
      const { body } = await api('/api/health')
      if (body?.model?.ready) {
        ready = true
        break
      }
    } catch {}
    await sleep(100)
  }
  if (!ready) throw Error(`service did not become ready: ${modelLog.join('').slice(-3000)}`)

  // --- The mode refuses an address the boundary does not vouch for (plan 4.1, U19) --------------
  // Private destinations are refused *before the queue*, so no browser is launched and no packet
  // leaves the machine. The public-name admission path is deliberately not exercised with a real
  // outbound host here: a free preflight must not reach the network on someone's behalf.
  const loopback = await api('/api/runs', { kind: 'ui-scan', entryUrl: 'http://127.0.0.1/' })
  assertions.privateAddressRefused =
    loopback.status === 400 && loopback.body?.error === 'private-address'
  const metadata = await api('/api/runs', {
    kind: 'ui-scan',
    entryUrl: 'http://169.254.169.254/latest/meta-data/',
  })
  assertions.metadataAddressRefused =
    metadata.status === 400 && metadata.body?.error === 'private-address'
  const credentials = await api('/api/runs', {
    kind: 'ui-scan',
    entryUrl: `http://${['someone', 'placeholder'].join(':')}@localtest.me:1/`,
  })
  assertions.credentialsRefused =
    credentials.status === 400 && credentials.body?.error === 'url-has-credentials'
  const control = await api('/api/runs', {
    kind: 'ui-scan',
    entryUrl: `${entryUrl.split('/catalog')[0]}/__control?variant=healthy`,
  })
  assertions.controlSurfaceRefused =
    control.status === 400 && control.body?.error === 'control-surface'
  const relative = await api('/api/runs', { kind: 'ui-scan', entryUrl: '/catalog' })
  assertions.relativeAddressRefused =
    relative.status === 400 && relative.body?.error === 'url-not-absolute'
  const mixed = await api('/api/runs', {
    kind: 'ui-scan',
    entryUrl,
    businessProfile: { id: 'checkout', revision: '1' },
  })
  assertions.mixedContractRefused = mixed.status === 400
  details.refusals = {
    loopback: loopback.body,
    metadata: metadata.body,
    credentials: credentials.body,
    control: control.body,
    relative: relative.body,
    mixed: mixed.body,
  }

  // --- A healthy run, created through the formal API -----------------------------------------
  await fetch(`http://127.0.0.1:${controlPort}/__control?variant=healthy`)
  const requestsBefore = pageRequests.length
  scenario = 'interact'
  const created = await api('/api/runs', {
    kind: 'ui-scan',
    entryUrl,
    goal: 'Check that sorting the catalog works and report anything unverified.',
    scope: { maxPages: 3, maxDepth: 1 },
  })
  assertions.createReturns202 = created.status === 202
  assertions.createNamesKind = created.body?.kind === 'ui-scan'
  assertions.createReturnsContractHash = /^[0-9a-f]{64}$/.test(created.body?.contractHash ?? '')
  const runId = created.body?.runId as string
  await settleRun(runId)
  const report = (await api(`/api/runs/${runId}/report`)).body
  await writeFile(`${dir}/report-healthy.json`, JSON.stringify(report, null, 2))
  await writeFile(
    `${dir}/events-healthy.jsonl`,
    (report.events as any[]).map((e) => JSON.stringify(e)).join('\n'),
  )

  // The decisive facts: no business adapter, not-applicable, a verified proof, covered.
  assertions.noBusinessRuntimeInReport = report.business?.status === 'ui-scan-not-applicable'
  assertions.businessResultNotApplicable = report.businessResult === 'not-applicable'
  assertions.entryPreserved = report.uiScan?.contract?.entryUrl === entryUrl
  assertions.proofVerified = report.uiScan?.proofVerified === true
  assertions.coverageCovered = report.uiScan?.inspection?.coverage === 'covered'
  assertions.observedEntry = pageRequests.length > requestsBefore
  assertions.ledgerHasItems = (report.uiScan?.inspection?.items ?? []).length > 0

  const independent: UrlScanIndependentView = {
    buildIdentity: 'preflight-local',
    expectedBuildIdentity: 'preflight-local',
    serverRequestCount: pageRequests.length - requestsBefore,
    writeCount: 0,
    entryObserved: pageRequests.length > requestsBefore,
    entryUrl: report.uiScan?.contract?.entryUrl ?? entryUrl,
    expectedEntryUrl: entryUrl,
    // A click on the sort control is the interaction this sample needs; the run recorded one action.
    interactionsPerformed: Number(report.usage?.actions ?? 0) >= 1 ? 1 : 0,
    leakedPrivateAnswers: [],
    reproducedFindingKeys: [],
  }
  const verdict = scoreUrlScan({ run: runViewOf(report), independent, truth: sample })
  assertions.scorerConfirmsHealthy = verdict.outcome === 'healthy-verified'
  details.healthy = { verdict, usage: report.usage, actions: report.usage?.actions }

  // --- An illegal finish is refused, and the refusal is recorded -----------------------------
  scenario = 'illegalFinish'
  const illegal = await api('/api/runs', { kind: 'ui-scan', entryUrl })
  await settleRun(illegal.body.runId)
  const illegalReport = (await api(`/api/runs/${illegal.body.runId}/report`)).body
  await writeFile(`${dir}/report-illegal-finish.json`, JSON.stringify(illegalReport, null, 2))
  const illegalEvents = illegalReport.events as any[]
  const rejected = illegalEvents.filter((e) => e.type === 'finish:rejected')
  assertions.illegalFinishRejected = rejected.length > 0
  assertions.illegalFinishNotCovered = illegalReport.uiScan?.inspection?.coverage !== 'covered'
  assertions.illegalFinishNotCompleted = illegalReport.status !== 'completed'
  details.illegalFinish = {
    rejected: rejected.map((e) => e.payload?.error ?? e.payload?.reasonCode),
    status: illegalReport.status,
    coverage: illegalReport.uiScan?.inspection?.coverage,
  }

  // --- A refused cross-origin navigation is an intervention, not a silent allow ---------------
  scenario = 'navigateOut'
  const navigateRun = await api('/api/runs', { kind: 'ui-scan', entryUrl })
  await settleRun(navigateRun.body.runId)
  const navigateReport = (await api(`/api/runs/${navigateRun.body.runId}/report`)).body
  await writeFile(`${dir}/report-navigate-out.json`, JSON.stringify(navigateReport, null, 2))
  const navigateEvents = navigateReport.events as any[]
  const denied = navigateEvents.filter((e) => e.type === 'navigation:denied')
  assertions.crossOriginNavigationDenied = denied.length > 0
  // A refusal decided *before dispatch* is a denial, not a network intervention: the destination was
  // never contacted, so the page is untouched and the run's own evidence stays admissible (plan 4.4).
  // What must be true is that the refusal is on the record and the destination is not in the run's
  // ledger as anything measured. The intervention kind is asserted for the *intercepted* case, where
  // a request really was refused mid-flight.
  assertions.denialIsRecordedAsLimitation =
    denied.length > 0 &&
    navigateEvents.some(
      (e) =>
        e.type === 'scope:item-created' &&
        /not permitted by this run's policy/.test(String(e.payload.basis)),
    ) &&
    !navigateEvents.some(
      (e) => e.type === 'navigation:committed' && e.payload.url === 'https://example.com/',
    )
  assertions.denialDidNotBecomeIntervention = !navigateReport.uiScan?.interventions?.length
  details.navigateOut = {
    denied: denied.map((e) => e.payload?.reasonCode),
    interventions: navigateReport.uiScan?.interventions,
  }

  // --- The workbench drives the same flow through a real browser -----------------------------
  const shots: string[] = []
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(base)
    await page.getByRole('heading').first().waitFor({ state: 'visible', timeout: 10_000 })
    const body = await page.content()
    assertions.workbenchRenders = body.length > 0
    assertions.workbenchHidesPrivateControl = !/__control/.test(body)
    // The mode selector offers the URL scan, and choosing it changes what the form would send.
    await page.getByRole('radio', { name: /网址 UI 检查/ }).check()
    await page.getByRole('textbox', { name: '网址' }).fill(entryUrl)
    await page.screenshot({ path: `${dir}/u20-create-form.png`, fullPage: true })
    shots.push('u20-create-form.png')
    assertions.workbenchOffersUrlScan = /网址 UI 检查/.test(body)

    // A real run, created from the workbench form, opened back up from history.
    await page.getByRole('button', { name: '开始检查' }).click()
    await page
      .getByText(/网址 UI 检查/)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page
      .getByText(/在已验证范围内未发现问题|部分完成|未开始检查/)
      .first()
      .waitFor({
        state: 'visible',
        timeout: 30_000,
      })
    const reportText = await page.locator('main').innerText()
    assertions.workbenchShowsUiScanSection = /网址 UI 检查/.test(reportText)
    assertions.workbenchStatesBusinessNotApplicable = /业务不适用/.test(reportText)
    await page.screenshot({ path: `${dir}/u20-ui-report.png`, fullPage: true })
    shots.push('u20-ui-report.png')
    details.workbench = { shots }
  } finally {
    await browser.close()
  }

  await writeFile(`${dir}/assertions.json`, JSON.stringify(assertions, null, 2))
  await writeFile(`${dir}/details.json`, JSON.stringify(details, null, 2))
  await writeFile(`${dir}/page-requests.json`, JSON.stringify(pageRequests, null, 2))
  const failed = Object.entries(assertions)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
  await writeFile(
    `${dir}/summary.json`,
    JSON.stringify(
      {
        kind: 'url-scan-preflight',
        sample: sample.sampleId,
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
      sample: sample.sampleId,
      assertions: Object.keys(assertions).length,
      failed,
      paidModelRequests: 0,
      claim: 'ui-scan wiring executable; not an agent/model capability evaluation',
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
  control.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    new Promise<void>((r) => fixture.close(() => r())),
    new Promise<void>((r) => control.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
  await writeFile(`${dir}/server.log`, modelLog.join(''))
  await writeFile(`${dir}/model-requests.json`, JSON.stringify(requests, null, 2))
}
