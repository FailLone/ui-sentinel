import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startGateway, AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
import {
  buildFreezeIdentity,
  type FreezeProtocol,
} from '../../evaluation/support/freeze-identity.ts'
import { FOCUS_WINDOW_MS, MAX_PROBE_CLICKS } from '../../src/execution/focus-constants.ts'
import {
  downloadRunEvidence,
  auditStoppedGroup,
  collectFullEventHistory,
} from '../../evaluation/support/campaign-evidence.ts'
import { resolveProviders } from '../../evaluation/private/export/diagnostic-config.ts'
import {
  openCampaignLedger,
  resolveLimit,
  LedgerError,
} from '../../evaluation/support/campaign-ledger.ts'
import { runBatch, type RowOutcome } from '../../evaluation/support/row-runner.ts'
import {
  visualDiagnosticPlan,
  visualFormalPlan,
  type OutcomeClass,
  type PlanRow,
} from '../../evaluation/support/execution-plan.ts'
import { readFormalSource } from '../../evaluation/support/formal-source.ts'
import { buildArtifactIndex, buildManifest } from '../../evaluation/support/evidence-protocol.ts'
import { buildBatchTiming } from '../../evaluation/support/batch-timing.ts'
import { installInterruptGuard } from '../../evaluation/support/interrupt-guard.ts'
import {
  scoreVisualEvidence,
  SCORER_VERSION,
} from '../../evaluation/private/visual-focus/scorer.ts'
import {
  VISUAL_VIEWPORTS,
  visualTruthFor,
  isVisualCaseId,
  type VisualCaseId,
} from '../../evaluation/fixtures/visual.ts'

/**
 * The paid visual diagnostic/formal runner (plan P3.2).
 *
 * It never runs from a free test: the mode, the campaign and - for formal - a passed real diagnostic
 * of the same build are required before a credential is read or a request is sent, and its manifest
 * records the mode and stage so a free run can never be mistaken for one that authorised spending.
 * The scheduling, classification and stop rules live in `row-runner.ts` and are covered by free tests;
 * this module is the browser/gateway plumbing around them.
 */
const argv = process.argv.slice(2).filter((a) => a !== '--')
const flag = (name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const mode = flag('--mode')
const campaignDir = flag('--campaign')
const diagnosticSource = flag('--diagnostic-source')
if (mode !== 'diagnostic' && mode !== 'formal')
  throw Error('configuration-error: runner needs --mode diagnostic|formal --campaign <dir>')
if (!campaignDir) throw Error('configuration-error: --campaign is required')

const exit = (code: number, reason?: string): never => {
  if (reason) console.error(`FAIL(${code}): ${reason}`)
  process.exit(code)
}

// Pre-spend refusals. None of these reads a credential or sends a request.
const key = process.env.OPENROUTER_API_KEY
if (!key) exit(2, 'configuration-missing: OPENROUTER_API_KEY; no mock fallback')
const providers = resolveProviders(process.env)
if (!providers.ok) exit(2, `Pinned provider mismatch: ${providers.reasonCodes.join(',')}`)
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  exit(2, 'Freeze clean commit before a paid run')

let limitUsd = 0
try {
  limitUsd = resolveLimit(process.env.VALIDATION_MAX_COST_USD).limitUsd
} catch (error) {
  exit(2, error instanceof LedgerError ? error.message : String(error))
}

const buildResult = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
if (buildResult.status !== 0) exit(2, 'build-failed')
const build = await buildIdentity()
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const campaignId =
  JSON.parse(await readFile(resolve(campaignDir, 'campaign-id.json'), 'utf8').catch(() => 'null'))
    ?.campaignId ?? resolve(campaignDir).split('/').slice(-1)[0]!

// The identity this process is about to run under. It is checked against the diagnostic's own freeze
// identity, so a moved window/model/provider/budget/scorer/target is refused even when the build hash
// is unchanged - the whole point of pinning the protocol rather than just the bundle.
const freeze = buildFreezeIdentity({
  commit,
  buildHash: build.hash,
  buildFiles: build.files,
  protocol: currentFreezeProtocol(),
  fixtureRevision: 'visual-regression-1',
  fixtureHash: 'f'.repeat(64),
  scorerVersion: SCORER_VERSION,
  target: { tag: 'input', type: 'search', id: 'product-search-input' },
})

// Formal inherits its right to spend only from a passed real diagnostic of the same build/campaign.
if (mode === 'formal') {
  if (!diagnosticSource) exit(2, 'formal requires --diagnostic-source')
  const source = await readFormalSource(
    resolve(diagnosticSource!),
    { buildHash: build.hash, campaignId },
    freeze,
  )
  if (!source.ok) exit(2, `formal-source-refused: ${source.reason}`)
}

const ledger = await openCampaignLedger({ campaignId, directory: campaignDir, limitUsd })
const holder = `runner-${process.pid}-${randomUUID().slice(0, 8)}`
const lease = await ledger.acquireLease(holder)
if (!lease.ok) {
  ledger.close()
  exit(1, `campaign lease held by ${lease.holder}`)
}

const plan = mode === 'diagnostic' ? visualDiagnosticPlan() : visualFormalPlan()
const stage = mode === 'diagnostic' ? 'diagnostic' : 'formal'
const directory = resolve(campaignDir, stage, new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(directory, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n')
console.log(`visual ${stage} evidence: ${directory}`)

// Persist the whole plan before a single request is made.
await write('plan.json', { campaignId, stage, mode: 'real', buildHash: build.hash, commit, plan })

const models = (await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
}).then((r) => {
  if (!r.ok) throw Error('model-list-unavailable')
  return r.json()
})) as any
const prices = [AGENT_MODEL, VISION_MODEL].map((id) => models.data?.find((m: any) => m.id === id))
if (
  !prices.every(
    (m) =>
      m &&
      Number.isFinite(Number(m.pricing?.prompt)) &&
      Number.isFinite(Number(m.pricing?.completion)),
  )
)
  exit(2, 'model-pricing-unavailable')
await write('models.json', prices)

const gateway = await startGateway(key!, directory, fetch, {
  limitUsd,
  phase: stage,
  estimateCost: (body) => {
    const model = prices.find((m) => m.id === body.model)
    return (
      Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
      4096 * Number(model.pricing.completion)
    )
  },
  ledger: {
    reserve: (i) => ledger.reserve({ ...i, runId: i.runId ?? 'unattributed' }),
    settle: (id, usd) => ledger.settle(id, usd),
    markUnknown: (id, reason) => ledger.markUnknown(id, reason),
    release: (id, reason) => ledger.release(id, reason),
  },
})

const port = async () => {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const n = (s.address() as { port: number }).port
  await new Promise<void>((r) => s.close(() => r()))
  return String(n)
}
const env: NodeJS.ProcessEnv = {
  ...process.env,
  PORT: await port(),
  ARENA_PORT: await port(),
  ARENA_API_PORT: await port(),
  ARENA_CONTROL_PORT: await port(),
  ARENA_CONTROL_TOKEN: randomBytes(24).toString('hex'),
  DATABASE_URL: `file:${directory}/runs.db`,
  ARENA_STATIC: '1',
  AGENT_MODEL: `openai/${AGENT_MODEL}`,
  OPENAI_API_KEY: gateway.token,
  OPENAI_BASE_URL: gateway.url,
  VISION_MODEL,
  VISION_API_KEY: gateway.token,
  VISION_BASE_URL: gateway.url,
  VISION_MODEL_FAMILY: 'qwen3',
  OPENROUTER_API_KEY: '',
  EXECUTION_VISUAL_DISCOVERY: '1',
  EXECUTION_ATOMIC_INVESTIGATION: '1',
  EXECUTION_BLOCKER_REVIEW: '0',
  RUN_TOTAL_TIMEOUT_MS: '300000',
  RUN_MAX_ACTIONS: '40',
  RUN_MAX_MODEL_CALLS: '30',
  MODEL_REQUEST_TIMEOUT_MS: '60000',
  TOOL_TIMEOUT_MS: '15000',
  OTEL_SDK_DISABLED: 'true',
}
const base = `http://127.0.0.1:${env.PORT}`
const children: ChildProcess[] = []
let logs = ''
function launch(entry: string) {
  const p = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(p)
  for (const out of [p.stdout, p.stderr])
    out?.on('data', (b) => (logs += gateway.redact(String(b))))
}
async function stop(p: ChildProcess) {
  if (p.exitCode !== null || p.signalCode !== null) return
  await new Promise<void>((done) => {
    const t = setTimeout(() => p.kill('SIGKILL'), 3000)
    p.once('exit', () => {
      clearTimeout(t)
      done()
    })
    p.kill('SIGTERM')
  })
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function json(url: string, body?: unknown, token?: string): Promise<any> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw Error(`HTTP ${response.status}: ${gateway.redact(await response.text())}`)
  return response.json()
}
const control = (path: string, body?: unknown) =>
  json(
    `http://127.0.0.1:${env.ARENA_CONTROL_PORT}/__control/${path}`,
    body,
    env.ARENA_CONTROL_TOKEN,
  )
const goal =
  'Inspect the shopping experience, complete one normal purchase, and report evidenced issues and unverified scope.'

/** Every downloaded artifact across every row, indexed once at the top level (plan P3.4). */
const indexedEvidence: (ReturnType<typeof buildArtifactIndex>[number] & {
  case: string
  repeat: number
})[] = []

/** What each completed row reported, kept so the post-shutdown audit compares rather than trusts. */
const auditRecords: {
  runId: string
  report: any
  artifactIndex: any[]
  dir: string
}[] = []

/**
 * The protocol this runner executes under, in one place.
 *
 * Every value here is a knob that could change an answer, so all of them are pinned together and
 * written into the diagnostic's manifest; a formal run then refuses a source whose protocol moved.
 */
function currentFreezeProtocol(): FreezeProtocol {
  return {
    algorithmVersion: 'visual-focus-3',
    focusWindowMs: FOCUS_WINDOW_MS,
    maxProbeClicks: MAX_PROBE_CLICKS,
    models: { agent: AGENT_MODEL, vision: VISION_MODEL, review: 'typesafe/jev-1.13' },
    providers: {
      agent: process.env.VALIDATION_AGENT_PROVIDER ?? 'unknown',
      vision: process.env.VALIDATION_VISION_PROVIDER ?? 'unknown',
    },
    budgets: { seconds: 300, actions: 40, modelCalls: 30 },
  }
}

/** A recorded duration, or `null` when the run never recorded one. Never a zero standing in for it. */
function durationOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Requests the gateway sent for one row, split by model, plus the ones with no usable usage. */
function requestCounts(
  lines: readonly any[],
  caseId: string,
): { visionRequests: number; agentRequests: number; unknownUsage: number; failedAttempts: number } {
  const mine = lines.filter((r) => String(r.run).startsWith(caseId))
  const finished = mine.filter((r) => r.status !== 'pending')
  return {
    visionRequests: mine.filter((r) => r.model === VISION_MODEL).length,
    agentRequests: mine.filter((r) => r.model === AGENT_MODEL).length,
    // A request that finished with no usage was still sent: it is counted, not dropped.
    unknownUsage: finished.filter((r) => !r.usage).length,
    failedAttempts: finished.filter((r) => r.status === 'error' || r.httpStatus >= 400).length,
  }
}

async function executeRow(row: PlanRow): Promise<RowOutcome> {
  const id = row.case as VisualCaseId
  if (!isVisualCaseId(id)) return { runId: null, outcome: 'not-run', reasons: ['non-visual-row'] }
  const dir = resolve(directory, row.case, String(row.repeat))
  await mkdir(dir, { recursive: true })
  await control('reset', { variant: 'C0', visual: visualTruthFor(id).presentation })
  const before = await control('state')
  assert.equal(before.visualPresent, visualTruthFor(id).presentation)
  gateway.begin(`${row.case}-${row.repeat}`, 30, 300000)
  const started = Date.now()
  try {
    const run = await json(base + '/api/runs', {
      environmentId: 'arena',
      goal,
      viewport: VISUAL_VIEWPORTS[id],
      budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
    })
    for (;;) {
      const state = await json(`${base}/api/runs/${run.runId}`)
      if (!['queued', 'running'].includes(state.status) && !state.active) break
      if (Date.now() - started > 330000) {
        await json(`${base}/api/runs/${run.runId}/cancel`, {})
        throw Error('run-did-not-settle')
      }
      await pause(250)
    }
    const report = await json(`${base}/api/runs/${run.runId}/report`)
    const downloaded = await downloadRunEvidence(base, report, resolve(dir, 'artifacts'))
    await write(`${row.case}/${row.repeat}/report.json`, report)
    // Paths are stored relative to this directory so the index still resolves after a move.
    await write(
      `${row.case}/${row.repeat}/artifact-index.json`,
      buildArtifactIndex(downloaded.index, { base: dir }),
    )
    indexedEvidence.push(
      ...buildArtifactIndex(downloaded.index, { base: directory }).map((e) => ({
        ...e,
        case: row.case,
        repeat: row.repeat,
      })),
    )
    // Read the whole history through the paged endpoint and require it to equal what the report
    // returned: a paginated API reader that silently stopped at a page bound is exactly the lost-tail
    // shape E01 names, and the report is not evidence that the API agrees with itself.
    const paged = await collectFullEventHistory(base, run.runId)
    if (paged.length !== report.events.length)
      return {
        runId: run.runId,
        outcome: 'evidence-invalid',
        reasons: ['api-history-incomplete'],
      }
    // Kept for the post-shutdown audit, which compares what the API reported against a fresh read of
    // the stopped database.
    auditRecords.push({ runId: run.runId, report, artifactIndex: downloaded.index, dir })
    if (report.inspectionIntegrity?.status === 'intervened')
      return { runId: run.runId, outcome: 'side-effect-unknown', reasons: ['intervention'] }
    // The independent scorer recomputes the conclusion from raw evidence and the private truth.
    const lines = (await readFile(resolve(directory, 'requests.jsonl'), 'utf8').catch(() => ''))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => String(r.run).startsWith(row.case))
    const sentVision = lines
      .filter((r) => r.model === VISION_MODEL)
      .flatMap((r) =>
        r.body.messages
          .flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
          .filter((p: any) => p.type === 'image_url')
          .map((p: any) => ({
            sha256: createHash('sha256')
              .update(Buffer.from(p.image_url.url.split(',')[1], 'base64'))
              .digest('hex'),
            raw: (() => {
              try {
                return JSON.parse(
                  r.body.messages
                    .flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
                    .find((p: any) => p.type === 'text')?.text ?? '{}',
                )
              } catch {
                return {}
              }
            })(),
          })),
      )
    const verdict = report.findings.find((f: any) =>
      f.evidenceRefs?.some((ref: string) => downloaded.artifacts[ref]?.type === 'focus-receipt'),
    )
    const score = scoreVisualEvidence({
      case: id,
      fixtureRevision: 'visual-regression-1',
      fixtureHash: 'f'.repeat(64),
      target: {
        tag: 'input',
        type: 'search',
        id: 'product-search-input',
        selector: visualTruthFor(id).targetSelector,
      },
      run: {
        runId: report.runId,
        status: report.status,
        businessResult: report.businessResult,
        stopReason: report.stopReason,
        usage: report.usage,
        budget: report.budget,
        coverage: report.coverage,
        events: report.events,
        findings: report.findings.map((f: any) => ({ ...f, candidateId: f.candidateId ?? null })),
        hypotheses: report.hypotheses,
        focusMeasurements: report.focusMeasurements ?? [],
      },
      artifacts: downloaded.artifacts,
      sentVision,
      gatewayCalls: [],
      declaredVerdict: verdict?.validationStatus ?? 'inconclusive',
    })
    await write(`${row.case}/${row.repeat}/score.json`, score)
    const outcome: OutcomeClass = score.passed ? 'passed' : 'quality-failure'
    const counts = requestCounts(lines, row.case)
    return {
      runId: run.runId,
      outcome,
      reasons: score.failedAssertions,
      timing: {
        elapsedMs: Date.now() - started,
        // The product persists token usage, not per-kind durations, so these stay unknown unless a
        // run really recorded them - a 0 here would claim the model took no measurable time.
        modelMs: durationOrNull(report.usage?.modelMs),
        toolMs: durationOrNull(report.usage?.toolMs),
        ...counts,
      },
    }
  } catch (error) {
    const counts = requestCounts(
      (await readFile(resolve(directory, 'requests.jsonl'), 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
      row.case,
    )
    return {
      runId: null,
      outcome: 'evidence-invalid',
      reasons: [gateway.redact(String(error))],
      // A row that failed mid-flight still spent time and requests; dropping them would understate
      // the batch and shrink the denominator E04 requires to be complete.
      timing: { elapsedMs: Date.now() - started, modelMs: null, toolMs: null, ...counts },
    }
  } finally {
    await gateway.end()
    await write('spending.json', gateway.spending())
  }
}

/**
 * Wrap up on Ctrl-C: stop the services, mark the stage incomplete and release the lease. The batch
 * loop is not resumed and no row is retried, so a half-finished stage stays half-finished and cannot
 * be re-read as a pass. The lease release matters most - a killed process leaving it held would block
 * every later run against a campaign whose owner is long gone.
 */
let interrupted = false
const guard = installInterruptGuard({
  signals: process,
  exit: (code) => {
    interrupted = true
    process.exit(code)
  },
  wrapUp: async () => {
    for (const p of children) await stop(p)
    await write('manifest.json', {
      ...buildManifest({
        stage,
        mode: 'real',
        identity: { campaignId, buildHash: build.hash, commit },
      }),
      interrupted: true,
      // Not a pass: the batch never finished, and the acceptance says an interrupted stage is
      // incomplete rather than silently resumable.
      passed: false,
      rows:
        report?.rows ??
        plan.map((row) => ({ ...row, runId: null, outcome: 'not-run', reasons: [] })),
      stopReason: 'interrupted',
    }).catch(() => {})
    await gateway.close().catch(() => {})
    await ledger.releaseLease(holder).catch(() => {})
    ledger.close()
  },
})

let report: Awaited<ReturnType<typeof runBatch>> | null = null
try {
  launch('dist/server/index.js')
  launch('dist/arena/index.js')
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (await json(base + '/api/health')).model.ready &&
        (await json(`http://127.0.0.1:${env.ARENA_PORT}/api/variant-config`))
      ) {
        ready = true
        break
      }
    } catch {}
    await pause(100)
  }
  assert(ready, 'services-not-ready')

  const batchStartedAt = Date.now()
  report = await runBatch({
    plan,
    stopOnSameMechanismTwice: mode === 'diagnostic',
    execute: executeRow,
    onRow: async (_row, rows) => {
      await writeFile(
        resolve(directory, 'runs.jsonl'),
        rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
      )
    },
  })

  // Stop the service first: the audit opens its own connection and must not race a live writer.
  for (const p of children) await stop(p)
  const audit = await auditStoppedGroup(env.DATABASE_URL!, auditRecords, undefined).catch(
    (error) => ({ passed: false, error: gateway.redact(String(error)), runs: [] }),
  )
  await write('persistence-audit.json', audit)
  // One index over every sample's evidence, written even when a row produced none - an empty index
  // over a batch that recorded artifacts is a failure, not a pass, so the count is stated too.
  await write('artifact-index.json', indexedEvidence)

  const passed = report.verdict.passed && (audit as any)?.passed === true
  await write('manifest.json', {
    ...buildManifest({
      stage,
      mode: 'real',
      identity: { campaignId, buildHash: build.hash, commit },
    }),
    plan,
    rows: report.rows,
    stoppedEarly: report.stoppedEarly,
    stopReason: report.stopReason,
    passed,
    // The batch's own count of what it sent, so a reader need not recompute it from requests.jsonl.
    paidRequests: report.rows.filter((r) => r.runId).length,
    timing: buildBatchTiming({
      startedAtMs: batchStartedAt,
      endedAtMs: Date.now(),
      rows: report.rows,
    }),
    fixtureRevision: {
      revision: 'visual-regression-1',
      hash: 'f'.repeat(64),
      purpose: 'regression',
      reviewedBy: null,
      reviewedAt: null,
    },
    // Carried so a later formal run can refuse this diagnostic if any pinned knob moved.
    freezeIdentity: freeze,
    spending: await ledger.spending(),
  })
  await writeFile(resolve(directory, 'server.log'), logs)
  console.log(`${passed ? 'PASS' : 'FAIL'}: ${directory}`)
  process.exitCode = report.verdict.exitCode
} finally {
  // A normal finish stops listening, so a late signal cannot drag a completed run into the interrupt
  // path and rewrite its manifest as interrupted.
  guard.dispose()
  if (!interrupted) {
    for (const p of children) await stop(p)
    await gateway.close()
    await ledger.releaseLease(holder)
    ledger.close()
  }
}
