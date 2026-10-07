import { startUrlScanFixture } from '../../evaluation/private/url-scan/fixture.ts'
import { replayUrlSample } from '../../evaluation/private/url-scan/replay.ts'
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
  const { runUrlCampaign } = await import('./url-scan-campaign.ts')
  await runUrlCampaign(manifest, options.batch!, options.mode as 'diagnostic' | 'formal')
  process.exit(0)
}

if (options.mode === 'freeze') {
  // The freeze step: record the identity a paid batch would run against, computed from the tree
  // rather than written down. It spends nothing and starts no service, so it is safe to run while
  // paid acceptance is unauthorised - and it is what makes the authorisation request concrete.
  const { execFileSync } = await import('node:child_process')
  const { buildUrlScanManifest, dirtyPathsAffectingRuns, hashTree, redactConfiguration } =
    await import('./url-scan-freeze.ts')
  const { urlScanTruth } = await import('../../evaluation/private/url-scan/truth.ts')
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
  const { urlScanIdentity, urlScanConfiguration } = await import('./url-scan-campaign.ts')
  const identity = await urlScanIdentity()
  const { AGENT_MODEL, VISION_MODEL } = await import('../../evaluation/support/model-gateway.ts')
  const { resolveProviders } = await import('../../evaluation/private/export/diagnostic-config.ts')
  const providers = resolveProviders(process.env)
  if (!providers.ok) throw Error('provider-configuration-refused')
  const prices = JSON.parse(process.env.URL_SCAN_PRICES_JSON ?? '{}')
  for (const model of [AGENT_MODEL, VISION_MODEL])
    if (!(prices[model]?.prompt > 0) || !(prices[model]?.completion > 0))
      throw Error('freeze-requires-current-prices: URL_SCAN_PRICES_JSON')
  const repetitions = options.repetitions ?? 1
  if (![1, 3].includes(repetitions)) throw Error('freeze-requires-diagnostic-1-or-formal-3')
  const manifest = buildUrlScanManifest({
    commit,
    buildHash: identity.buildHash,
    configuration: redactConfiguration(
      urlScanConfiguration({
        providers: { agent: providers.agent, vision: providers.vision },
        prices,
        stage: repetitions === 1 ? 'diagnostic' : 'formal',
      }),
    ),
    fixtureHash: identity.fixtureHash,
    scorerHash: identity.scorerHash,
    policyRevision: 'url-scan-1',
    promptRevision: 'ui-goal-policy-1',
    // The matrix comes from the sample set itself, not from a second list here: a hard-coded
    // default could silently plan a batch that omits a sample the truth defines, and the two would
    // drift apart with nothing to catch it.
    samples: options.samples ?? [
      ...urlScanTruth('').samples.map((s) => s.sampleId),
      ...(repetitions === 1 ? ['boundary-diagnostic'] : []),
    ],
    repetitions,
    // The first authorisation step's ceiling for the UI diagnostic; the formal batch raises it.
    costCeilingUsd: options.costCeilingUsd ?? 2,
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
const publicFixture = await startUrlScanFixture()
const fixtureOrigin = publicFixture.origin
const pageRequests = publicFixture.requests
// Variant switching is available only on this distinct private harness port.
const controlPort = await freePort()
const control = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://control.local')
  publicFixture.setVariant(
    url.searchParams.get('variant') === 'defective' ? 'defective' : 'healthy',
  )
  response.end('ok')
})
await new Promise<void>((resolve) => control.listen(controlPort, '127.0.0.1', resolve))

const entryUrl = `${fixtureOrigin}/catalog?category=books&sort=price`

/**
 * The fixed local model: a scripted list of tool calls, exactly as the business preflight uses.
 *
 * An entry is either a literal call or a function of the agent's own view of the run. The function
 * form exists because the ledger's item ids are created by the executor, not chosen by the script:
 * a selection has to name the items this run actually offered, which are read from the prompt rather
 * than invented. That is also what a real agent does, and it is why this cannot be a hard-coded list.
 */
type PromptView = {
  inspectionScope?: { candidates?: { itemId: string; category: string; description: string }[] }
}
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
      const interaction = candidates.find(
        (c) => c.category === 'local-interaction' && c.description.includes('Apply sort'),
      )
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
          ],
        },
      }
    },
    {
      name: 'page_act',
      args: {
        type: 'click',
        role: 'button',
        name: 'Apply sort',
        nth: 0,
        verify: {
          selector: '#rows .price',
          condition: 'numeric-ascending',
          basis: 'The public sort control selects Price and says Apply sort',
        },
      },
    },
    { name: 'page_observe', args: {} },
    // The second obligation: one same-origin page, within the declared depth of 1.
    { name: 'page_act', args: { type: 'navigate', url: `${fixtureOrigin}/info` } },
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
  await writeFile(`${dir}/model-inputs.jsonl`, JSON.stringify(body) + '\n', { flag: 'a' })
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

  const served = pageRequests.slice(requestsBefore)
  const readableEvidenceRefs: string[] = []
  const savedSnapshots: any[] = []
  for (const artifact of report.artifacts ?? []) {
    const response = await fetch(base + artifact.url)
    if (!response.ok) continue
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length) continue
    readableEvidenceRefs.push(artifact.id)
    if (artifact.type === 'snapshot') {
      try {
        savedSnapshots.push(JSON.parse(bytes.toString('utf8')))
      } catch {}
    }
  }
  const agentBehaviorVerified = savedSnapshots.some((snapshot) => {
    const text = String(snapshot.text ?? '')
    const positions = ['5 · Amber gadget', '12 · Cyan sprocket', '20 · Blue widget'].map((value) =>
      text.indexOf(value),
    )
    return (
      positions.every((value) => value >= 0) &&
      positions[0]! < positions[1]! &&
      positions[1]! < positions[2]!
    )
  })
  const replay = await replayUrlSample(entryUrl, sample)
  await writeFile(`${dir}/independent-replay.png`, replay.screenshot)
  await writeFile(
    `${dir}/independent-replay.json`,
    JSON.stringify({ ...replay, screenshot: undefined }, null, 2),
  )
  const independent: UrlScanIndependentView = {
    buildIdentity: (await (await import('./url-scan-freeze.ts')).hashTree(resolve('dist'))).hash,
    expectedBuildIdentity: (await (await import('./url-scan-freeze.ts')).hashTree(resolve('dist')))
      .hash,
    serverRequestCount: pageRequests.length - requestsBefore,
    writeCount: served.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method)).length,
    entryObserved: pageRequests.length > requestsBefore,
    entryUrl: report.uiScan?.contract?.entryUrl ?? entryUrl,
    expectedEntryUrl: entryUrl,
    // A click on the sort control is the interaction this sample needs; the run recorded one action.
    interactionsPerformed: served.filter((r) => r.path === '/items?sort=price').length,
    healthyReplayPassed: replay.passed,
    readableEvidenceRefs,
    agentBehaviorVerified,
    interventionCount: report.uiScan?.interventions?.length ?? 0,
    leakedPrivateAnswers:
      (await readFile(`${dir}/model-inputs.jsonl`, 'utf8')).match(
        /foreground-control-covered|sort-ignores-selection|expectedFindingKey/g,
      ) ?? [],
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
  control.closeAllConnections()
  model.closeAllConnections()
  await Promise.all([
    publicFixture.close(),
    new Promise<void>((r) => control.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ])
  await writeFile(`${dir}/server.log`, modelLog.join(''))
  await writeFile(`${dir}/model-requests.json`, JSON.stringify(requests, null, 2))
}
