import 'dotenv/config'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  startGateway,
  AGENT_MODEL,
  VISION_MODEL,
  REVIEW_MODEL,
} from '../../evaluation/support/model-gateway.ts'
import {
  assertExportIdle,
  assertTruth,
  exportControlRequest,
  resetAndVerifyExport,
  type ExportVariantId,
} from '../../evaluation/private/export/controller.ts'
import {
  scoreExportRun,
  verifyArtifactBytes,
  type ExportRunInput,
} from '../../evaluation/private/export/scorer.ts'
import { sequencingGaps } from '../../evaluation/private/export/diagnostic-sequencing.ts'
import { loadBatchDeclarations } from '../../evaluation/private/export/approval-source.ts'
import {
  REQUIRED_PROVIDERS,
  resolveProviders,
} from '../../evaluation/private/export/diagnostic-config.ts'
import { createClient } from '@libsql/client'

/**
 * G4: the real-model diagnostic.
 *
 * One smoke, then E0-E4 once each, with the real DeepSeek/Qwen gateway. This is a *diagnostic*, not
 * an acceptance run: it exists to find out whether the machinery survives a real model before a
 * 45-run matrix is spent on it. Its verdict comes from the private scorer, which reads the public
 * report, the arena's private truth and the downloaded artifact bytes - never the adapter's own
 * opinion of what the answer should have been.
 *
 * Every failure is kept. A diagnostic that dropped its failed variants would report a rate over
 * whatever survived, which is the thing the batch scorer refuses.
 */
const args = process.argv.slice(2).filter((a) => a !== '--')
if (args.length) throw Error('Usage: pnpm validate:business --diagnostic')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze clean commit before model calls')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')

// The baseline is pinned to named providers. An unset variable is not "the default" - it is no
// constraint at all, which is how an earlier diagnostic silently ran on DeepInfra and Sail Research
// and then exhausted the fixed 300s budget mid-inspection. The runner applies the pin itself so the
// documented command reproduces the baseline; an explicit *different* provider is refused, because
// that would be a different batch filed under this one's name.
const providers = resolveProviders(process.env)
if (!providers.ok)
  throw Error(
    `configuration-refused: this batch runs the ${JSON.stringify(REQUIRED_PROVIDERS)} baseline, ` +
      `but VALIDATION_AGENT_PROVIDER/VALIDATION_VISION_PROVIDER request another provider ` +
      `(${providers.reasonCodes.join(', ')}); unset them to run the baseline`,
  )

const dir = resolve('data/business-validation', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')

/** The campaign's shared budget. Diagnostic and formal draw on the same ceiling, never a fresh one. */
const maxCostUsd = Number(process.env.VALIDATION_MAX_COST_USD ?? '2')
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw Error('Invalid VALIDATION_MAX_COST_USD')

/** The frozen build this diagnostic authorises. A formal batch must name this same hash. */
const build = await buildIdentity()
await write('build-identity.json', build)
const builtServerHash = createHash('sha256')
  .update(await readFile('dist/server/index.js'))
  .digest('hex')

const pricing = (await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
}).then((r) => r.json())) as {
  data?: { id: string; pricing?: { prompt: string; completion: string } }[]
}
for (const model of [AGENT_MODEL, VISION_MODEL]) {
  const entry = pricing.data?.find((m) => m.id === model)
  if (
    !entry ||
    !Number.isFinite(Number(entry.pricing?.prompt)) ||
    !Number.isFinite(Number(entry.pricing?.completion))
  )
    throw Error(`Model price unavailable for ${model}`)
}
await write(
  'models.json',
  pricing.data?.filter((m) => [AGENT_MODEL, VISION_MODEL].includes(m.id)),
)

const gateway = await startGateway(key, dir, fetch, {
  limitUsd: maxCostUsd,
  estimateCost: (body) => {
    if (body.model === REVIEW_MODEL) return 0.001344
    const model = pricing.data?.find((m) => m.id === body.model)
    return (
      Buffer.byteLength(JSON.stringify(body)) * Number(model?.pricing?.prompt) +
      4096 * Number(model?.pricing?.completion)
    )
  },
})

const reservePort = async () => {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((r) => server.close(() => r()))
  return port
}
const env: NodeJS.ProcessEnv = {
  ...process.env,
  AGENT_MODEL: `openai/${AGENT_MODEL}`,
  OPENAI_API_KEY: gateway.token,
  OPENAI_BASE_URL: gateway.url,
  VISION_MODEL,
  VISION_API_KEY: gateway.token,
  VISION_BASE_URL: gateway.url,
  VISION_MODEL_FAMILY: 'qwen3',
  COMPLETION_REVIEW_API_KEY: gateway.token,
  COMPLETION_REVIEW_URL: gateway.url + '/decisions',
  PORT: String(await reservePort()),
  ARENA_PORT: String(await reservePort()),
  ARENA_API_PORT: String(await reservePort()),
  ARENA_CONTROL_PORT: String(await reservePort()),
  EXPORT_ARENA_PORT: String(await reservePort()),
  EXPORT_API_PORT: String(await reservePort()),
  EXPORT_CONTROL_PORT: String(await reservePort()),
  ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  EXPORT_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  ARENA_STATIC: '1',
  EXPORT_ARENA_STATIC: '1',
  // The plan's fixed baseline condition: atomic investigation on, bounded Jev review on, providers
  // pinned. The gateway turns the two provider names into OpenRouter's `provider.only`, so every
  // call in this batch is served by the same endpoints the accepted baseline was recorded on.
  EXECUTION_ATOMIC_INVESTIGATION: '1',
  EXECUTION_BLOCKER_REVIEW: '1',
  VALIDATION_AGENT_PROVIDER: providers.agent,
  VALIDATION_VISION_PROVIDER: providers.vision,
  DATABASE_URL: `file:${dir}/runs.db`,
  // The child processes never see the real key: every model call goes through the metering gateway.
  OPENROUTER_API_KEY: '',
  RUN_MAX_MODEL_CALLS: '30',
  RUN_MAX_ACTIONS: '40',
  RUN_TOTAL_TIMEOUT_MS: '300000',
  MODEL_REQUEST_TIMEOUT_MS: '60000',
  MODEL_REQUEST_MAX_RETRIES: '1',
  TOOL_TIMEOUT_MS: '15000',
  OTEL_SDK_DISABLED: 'true',
}
const children: ChildProcess[] = []
let log = ''
function launch(...argv: string[]) {
  const child = spawn(process.execPath, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  for (const stream of [child.stdout, child.stderr])
    stream?.on('data', (b) => {
      log += gateway.redact(String(b))
    })
  return child
}

/** Resolve a child's exit code, or kill it and report failure when it overruns its own budget. */
function wait(child: ChildProcess, timeoutMs: number) {
  return new Promise<number>((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      rejectExit(Error('child-timeout'))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      rejectExit(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code ?? 1)
    })
  })
}

// The private controller is a library the diagnostic itself calls, and it reads its port and token
// from the process environment - so the same values the child services get must be visible here too.
env.EXPORT_ARENA_URL = `http://127.0.0.1:${env.EXPORT_ARENA_PORT}`
Object.assign(process.env, env)

const base = `http://127.0.0.1:${env.PORT}`
const get = async (path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.ARENA_CONTROL_TOKEN}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(path === '/api/runs' ? 60000 : 15000),
  })
  if (!response.ok)
    throw Error(`${path}: ${response.status} ${gateway.redact(await response.text())}`)
  return response.json() as Promise<any>
}

/** Wait for a run to settle. The run's own budget is the only thing that ends it early. */
async function settle(runId: string) {
  const deadline = Date.now() + 330_000
  while (true) {
    const state = await get(`/api/runs/${runId}`)
    if (!['queued', 'running'].includes(state.status) && !state.active) return state
    if (Date.now() > deadline) {
      await get(`/api/runs/${runId}/cancel`, {})
      throw Error('Run exceeded its own budget without stopping; cancellation requested')
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}

const GOAL =
  'Use a public dataset to produce a CSV export and inspect that flow and the recovery experience it actually triggers. Respect the public requirements and operation limits, report with evidence and finish.'

/**
 * The semantic target the run declared for its own recovery measurement, if it made one.
 *
 * Taken from the run's declaration rather than from the control's visible text: R02 requires the
 * samples to carry the declared semantic key, and the key is the run's own binding. This is what the
 * scorer measures a discovery run against, since that group has no approved rule to inherit.
 */
function declaredRecoveryTarget(
  events: readonly { type: string; payload: unknown }[],
): string | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== 'investigation:declared') continue
    const target = (event.payload as { target?: unknown }).target
    if (typeof target === 'string' && target) return target
  }
  return undefined
}

const results: Record<string, unknown>[] = []
let paidFailures = 0

try {
  await write('manifest.json', {
    campaignId: dir,
    kind: 'business-diagnostic',
    realModel: true,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    builtServerHash,
    buildHash: build.hash,
    agentModel: AGENT_MODEL,
    visionModel: VISION_MODEL,
    // The plan requires the actual model/provider/snapshot to be recorded, not assumed. The
    // provider names are the pinned ones the gateway sends as `provider.only`; the ledger in this
    // directory records which endpoint served each call, so the pin is checkable after the fact.
    agentProvider: providers.agent,
    visionProvider: providers.vision,
    providerSource: providers.source,
    atomicInvestigation: true,
    blockerReview: true,
    limitUsd: maxCostUsd,
    plan: ['smoke', ...(['E0', 'E1', 'E2', 'E3', 'E4'] as const)],
  })
  launch('dist/server/index.js')
  launch('dist/arena/index.js')
  launch('dist/arena-export/index.js')
  let ready = false
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok && (await fetch(env.EXPORT_ARENA_URL!)).ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!ready) throw Error('Services failed to start')

  // --- smoke -----------------------------------------------------------------------------
  // The plan names this task as the project's "真实 DeepSeek/Qwen smoke", and the project already
  // has one: `smoke-model.ts` asserts positively that the agent invoked a schema tool exactly once
  // and that a vision coordinate landed on the requested control, then exits non-zero if not.
  //
  // The earlier version of this file invented a *full business run* as its smoke and gated the
  // variants on a rejection list. Both parts were wrong. The rejection list let a run that ended
  // `blocked`/`no-progress` - an agent that concluded nothing - pass as a green smoke, and using a
  // 300s business run for a connectivity check spent a sixth of the campaign budget proving
  // something the five variants prove anyway. The gate now checks the smoke's own positive
  // assertion (its exit code) and its recorded artifact, so a model or vision failure stops the
  // batch instead of being laundered into a variant failure.
  gateway.begin('smoke', 6, 90_000)
  const smokeStartedAt = Date.now()
  let smokeExit: number
  try {
    smokeExit = await wait(launch('--import', 'tsx', 'scripts/cli/smoke-model.ts'), 95_000)
  } finally {
    await write('smoke-requests.json', await gateway.end())
  }
  const smokeReport = await readFile('data/smoke/model.json', 'utf8')
    .then((text) => JSON.parse(text) as Record<string, unknown>)
    .catch(() => null)
  // The smoke writes to a shared `data/smoke/model.json`, so a report from an earlier run could
  // still be sitting there. Its `at` must fall inside this smoke's own window, otherwise a crashed
  // smoke would be read as a passing one.
  const smokeReportedAt = Date.parse(String(smokeReport?.at ?? ''))
  const smokeFresh = Number.isFinite(smokeReportedAt) && smokeReportedAt >= smokeStartedAt
  const smoke = { exitCode: smokeExit, report: smokeReport, fresh: smokeFresh }
  await write('smoke.json', smoke)
  const smokePassed =
    smokeExit === 0 &&
    smokeFresh &&
    smokeReport?.hit === 'Confirm purchase' &&
    smokeReport?.toolCalls === 1
  results.push({ case: 'smoke', passed: smokePassed, detail: smoke })
  if (!smokePassed) throw Error(`smoke failed: ${JSON.stringify(smoke)}`)

  // The smoke is the gate: variants are not attempted through a gateway that just refused
  // everything, because five identical failures would say nothing about the variants.

  // --- the five variants ------------------------------------------------------------------
  for (const variant of ['E0', 'E1', 'E2', 'E3', 'E4'] as ExportVariantId[]) {
    const record: Record<string, unknown> = { case: variant }
    try {
      // The fixture is verified through a real browser *before* the run, so a variant whose public
      // behaviour does not match its declared truth is reported as an unusable fixture rather than
      // as a product failure.
      const verified = await resetAndVerifyExport(variant)
      // The verification drives its own browser through the whole flow, which *uses* the arena's one
      // permitted create. Without a second reset the agent's run starts against a spent arena: its
      // own click is answered `409 export-already-created`, no business fact is ever decoded, and the
      // run ends blocked with zero findings - which is exactly what the second paid diagnostic
      // produced on all five variants, twice, before this line existed. The verified fixture state is
      // recorded as the fixture's, and the run must begin from a fresh one.
      const fixture = { jobId: verified.jobId, truth: verified.truth, requests: verified.requests }
      // An unusable fixture must be reported as a broken fixture, not graded as a product result.
      assertTruth(variant, verified.truth)
      await exportControlRequest('/__control/reset', { variant })
      const preconditions = [
        'fixture-verified',
        'arena-reset-after-verification',
        'truth-asserted',
      ] as const
      if (sequencingGaps(preconditions).length)
        throw Error(`diagnostic-sequencing-incomplete: ${sequencingGaps(preconditions).join(', ')}`)
      record.fixture = fixture
      record.preconditions = preconditions
      // The gateway meters per run: without an open window every model call is refused, which is how
      // the first diagnostic produced five instant failures that looked like product defects.
      gateway.begin(variant, 30, 300_000)
      const run = await get('/api/runs', {
        goal: GOAL,
        environmentId: 'export-arena',
        businessProfile: { id: 'export', revision: '1' },
        budget: { totalTimeoutMs: 300_000, maxActions: 40, maxModelCalls: 30 },
      })
      record.runId = run.runId
      await settle(run.runId)
      const report = await get(`/api/runs/${run.runId}/report`)
      const truth = await exportControlRequest('/__control/state')

      // Download the evidence through the public API and hash the real bytes: the report's own
      // "available" flag is the claim under test, not the check.
      const artifacts: Record<
        string,
        { type: string; exists: boolean; sha256?: string; data?: unknown }
      > = {}
      for (const artifact of report.artifacts as {
        id: string
        type: string
        available: boolean
      }[]) {
        const url = `${base}/api/runs/${run.runId}/artifacts/${encodeURIComponent(artifact.id)}`
        const bytes = new Uint8Array(
          await fetch(url, { signal: AbortSignal.timeout(15000) })
            .then((r) => (r.ok ? r.arrayBuffer() : new ArrayBuffer(0)))
            .catch(() => new ArrayBuffer(0)),
        )
        const check = verifyArtifactBytes(artifact.id, artifact.type, bytes, {
          available: artifact.available,
        })
        let data: unknown
        if (check.exists && !artifact.type.includes('screenshot')) {
          try {
            data = JSON.parse(Buffer.from(bytes).toString('utf8'))
          } catch {
            /* a non-JSON artifact has no parsed payload */
          }
        }
        artifacts[artifact.id] = {
          type: artifact.type,
          exists: check.exists,
          sha256: check.sha256,
          data,
        }
      }

      // The enabled declarations this batch actually holds, read from its own database - the
      // scorer is handed the rule set rather than reading it, so this is that argument.
      const client = createClient({ url: `file:${dir}/runs.db` })
      const declarations = await loadBatchDeclarations(client)
      client.close()

      const scorerInput: ExportRunInput = {
        truth: {
          creates: truth.creates,
          retries: truth.retries,
          jobs: truth.jobs,
          artifacts: truth.artifacts,
          // The controller's truth snapshot has no per-attempt list; only request counts. The
          // scorer treats it as optional, so it is omitted rather than synthesised from the counts
          // - inventing attempt numbers would be asserting something the arena never reported.
          attempts: undefined,
          artifactContents: truth.artifactContents,
        },
        requests: truth.requests,
        report,
        artifacts,
        contract: {
          profileId: report.business.profileId,
          revision: report.business.revision,
          hash: report.business.hash,
          retryAvailabilityMs: 5000,
          adapter: report.business.adapter,
          environment: {
            id: report.business.environment.id,
            origin: report.business.environment.publicOrigin,
          },
          effects: report.business.effects,
        },
        selection: truth.requests.find((r: any) => r.method === 'POST' && r.path === '/api/exports')
          ?.selection ?? { datasetId: '', format: '' },
        rules: declarations,
        // The semantic target the run itself declared for its recovery measurement, read from the
        // run's own declaration. A discovery group has no approved rule to inherit, so without this
        // the scorer would measure against a target the run could not read and discard a complete
        // measurement as unproven.
        declaredTarget: declaredRecoveryTarget(report.events),
      }
      const score = scoreExportRun(variant, scorerInput)
      record.report = {
        status: report.status,
        businessResult: report.businessResult,
        stopReason: report.stopReason,
        persistence: report.persistence.status,
        usage: report.usage,
      }
      record.score = {
        passed: score.passed,
        classification: score.classification,
        failedAssertions: score.failedAssertions,
        details: score.details,
      }
      record.passed = score.passed
      await write(`${variant}-report.json`, report)
      await write(`${variant}-truth.json`, truth)
      await write(`${variant}-score.json`, score)
    } catch (error) {
      // Kept, never dropped: a variant that could not be run is part of the result.
      record.passed = false
      record.error = gateway.redact(String(error))
      paidFailures++
    } finally {
      // Always closed, so a failed variant cannot leave the window open and stall the next one.
      record.modelRequests = (await gateway.end()).length
    }
    results.push(record)
    await write(`${String(record.case)}-record.json`, record)
    await write('spending.json', gateway.spending())
    console.log(`${String(record.case)}: ${record.passed ? 'pass' : 'fail'}`)
    if (gateway.spending().accountedUsd >= maxCostUsd) {
      console.error('Campaign budget reached; stopping rather than overspending.')
      break
    }
  }
  const planned = ['smoke', 'E0', 'E1', 'E2', 'E3', 'E4']
  const summary = {
    kind: 'business-diagnostic',
    realModel: true,
    builtServerHash,
    buildHash: build.hash,
    planned,
    results: results.map((r) => ({ case: r.case, passed: r.passed, runId: r.runId ?? null })),
    notRun: planned.filter((p) => !results.some((r) => r.case === p)),
    spending: gateway.spending(),
  }
  await write('diagnostic-summary.json', summary)
  const passed = results.length === planned.length && results.every((r) => r.passed === true)
  await write('diagnostic-reference.json', {
    directory: dir,
    builtServerHash,
    buildHash: build.hash,
    passed,
    at: new Date().toISOString(),
  })
  console.log(JSON.stringify({ ...summary, passed, paidFailures }, null, 2))
  if (!passed) process.exitCode = 1
} catch (error) {
  await write('diagnostic-failure.json', {
    error: gateway.redact(String(error)),
    at: new Date().toISOString(),
  })
  console.error(gateway.redact(String(error)))
  process.exitCode = 1
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((r) => {
          if (child.exitCode !== null || child.signalCode !== null) return r()
          child.once('exit', () => r())
          setTimeout(() => {
            child.kill('SIGKILL')
            r()
          }, 3000).unref()
        }),
    ),
  )
  await write('server.log', log)
  await write('spending.json', gateway.spending())
  await gateway.close()
  // The queue must be idle, so a partial diagnostic is not left holding the arena.
  await assertExportIdle().catch(() => {})
}
