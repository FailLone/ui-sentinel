import 'dotenv/config'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile, symlink, copyFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { createClient } from '@libsql/client'
import { chromium } from 'playwright'
import { startGateway, AGENT_MODEL, VISION_MODEL } from './openrouter-gateway.ts'
import {
  efficiencyOptions,
  efficiencySchedule,
  efficiencyBudget,
  inspectionGoal,
  visualInspectionGoal,
  efficiencyMetrics,
  efficiencyTotals,
  scoreBoundRecheck,
  performanceThresholds,
} from './efficiency-protocol.ts'
import { scoreVisualAnalysis } from './visual-protocol.ts'
import { evaluateRun } from '../../evaluation/private/evaluator.ts'
import { resetAndVerify } from '../../evaluation/private/controller.ts'

const options = efficiencyOptions(process.argv.slice(2))
const root = process.cwd()
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
const sha = (ref: string) =>
  execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim()
const refs = { baseline: sha(options.baseline), candidate: sha(options.candidate) }
const visual = options.phase === 'visual-compare'
const learning = ['learning-diagnostic', 'compare'].includes(options.phase)
const goal = visual ? visualInspectionGoal : inspectionGoal
if (visual && refs.baseline !== refs.candidate)
  throw Error('Visual comparison requires the same immutable revision for both modes')
const dir = resolve('data/efficiency', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const write = (name: string, data: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(data, null, 2) + '\n')
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  )
process.env.EXPERIMENT_AGENT_PROVIDER ??= 'Wafer'
const provider = process.env.EXPERIMENT_AGENT_PROVIDER
const models = (await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
}).then((r) => {
  if (!r.ok) throw Error(`Model list: HTTP ${r.status}`)
  return r.json()
})) as any
const selected = [AGENT_MODEL, VISION_MODEL].map((id) => models.data.find((m: any) => m.id === id))
if (
  selected.some(
    (m) =>
      !m ||
      !Number.isFinite(Number(m.pricing?.prompt)) ||
      !Number.isFinite(Number(m.pricing?.completion)),
  )
)
  throw Error('Selected model/pricing unavailable; no replacement or assumed free requests')
await write('models.json', selected)
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: options.maxCostUsd,
  estimateCost: (body) => {
    const m = selected.find((m) => m.id === body.model)
    return (
      Buffer.byteLength(JSON.stringify(body)) * Number(m.pricing.prompt) +
      4096 * Number(m.pricing.completion)
    )
  },
})
const children: ChildProcess[] = []
const logs: Promise<unknown>[] = []
const arms = new Map<
  string,
  {
    cwd: string
    env: NodeJS.ProcessEnv
    base: string
    arena: string
    control: string
    lease?: string
  }
>()
const records: any[] = []
let sourceHash: string | undefined
let approved: any
let sourceDb: string | undefined
const manifest: any = {
  protocol: options.protocol,
  performanceThresholds: performanceThresholds(options.protocol),
  options,
  refs,
  budget: efficiencyBudget,
  goal,
  provider,
  visionProvider: process.env.EXPERIMENT_VISION_PROVIDER ?? 'auto',
  model: AGENT_MODEL,
  visionModel: VISION_MODEL,
  reasoning: { agent: 'low', vision: 'disabled' },
  maxOutputTokens: 4096,
  viewport: { width: 1280, height: 720 },
  schedule: efficiencySchedule(options.phase),
  runnerCommit: sha('HEAD'),
  evaluatorHash: hash(await readFile('evaluation/private/evaluator.ts')),
  learningEvaluatorHash: hash(await readFile('scripts/experiments/efficiency-protocol.ts')),
  runnerHash: hash(await readFile('scripts/experiments/efficiency.ts')),
  startedAt: new Date().toISOString(),
  arms: {},
}
async function port() {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const p = String((s.address() as { port: number }).port)
  await new Promise<void>((r) => s.close(() => r()))
  return p
}
async function request(
  arm: NonNullable<ReturnType<typeof arms.get>>,
  path: string,
  body?: unknown,
  privateControl = false,
): Promise<any> {
  const r = await fetch((privateControl ? arm.control : arm.base) + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${arm.env.ARENA_CONTROL_TOKEN}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw Error(`${path}: HTTP ${r.status}`)
  return r.json()
}
function launch(cwd: string, env: NodeJS.ProcessEnv, name: string, script: string) {
  const child = spawn(process.execPath, [script], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  let tail = Promise.resolve()
  let log = ''
  for (const stream of [child.stdout, child.stderr])
    stream!.on('data', (b) => {
      log += gateway.redact(String(b))
      const value = log
      tail = tail.then(() => writeFile(resolve(dir, `${name}.log`), value))
      logs.push(tail)
    })
}
async function learningFixture(arm: NonNullable<ReturnType<typeof arms.get>>, healthy: boolean) {
  const reset = () =>
    request(arm, '/__control/reset', { variant: 'C5', learningRetryAvailable: healthy }, true)
  await reset()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: manifest.viewport })
    await page.goto(arm.arena)
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click()
    await page.getByRole('link', { name: /Cart/ }).click()
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click()
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/checkout') && r.request().method() === 'POST',
    )
    await page.getByTestId('pay-button').click()
    const business = await (await response).json()
    await page.locator('.payment-result').waitFor()
    if (business.status !== 'failed' || business.canRetry !== true)
      throw Error('Learning fixture business mismatch')
    const retry = page.getByTestId('retry-button'),
      start = Date.now()
    do {
      if ((await retry.isEnabled()) !== healthy) throw Error('Learning fixture retry mismatch')
      await page.waitForTimeout(200)
    } while (Date.now() - start < 5250)
    if (healthy) await retry.click({ trial: true, timeout: 2000 })
    return { valid: true, measuredMs: Date.now() - start, business, healthy }
  } finally {
    await browser.close()
    await reset()
    const state = await request(arm, '/__control/state', undefined, true)
    if (state.orderCount !== 0 || state.cartSize !== 0)
      throw Error('Verification side effects not cleared')
  }
}
try {
  if (learning) {
    const source = resolve(options.learningSource!)
    sourceDb = resolve(source, 'runs.db')
    for (const suffix of ['-wal', '-journal'])
      if (await exists(sourceDb + suffix)) throw Error('Close source database before copying')
    const prepared = JSON.parse(await readFile(resolve(source, 'prepared.json'), 'utf8'))
    const approval = JSON.parse(await readFile(resolve(source, 'approval.json'), 'utf8'))
    if (approval.proposalId !== prepared.proposal.id || !approval.reviewedBy)
      throw Error('Missing exact human approval')
    sourceHash = hash(await readFile(sourceDb))
    // Inspect a private copy so source access cannot migrate or journal the original.
    await copyFile(sourceDb, resolve(dir, 'source.db'))
    const db = createClient({ url: `file:${resolve(dir, 'source.db')}` })
    try {
      const active = await db.execute(
        "SELECT id FROM runs WHERE status IN ('running','queued') OR stop_reason='reconciliation-required'",
      )
      const enabled = await db.execute("SELECT * FROM rule_proposals WHERE status='enabled'")
      approved = prepared.proposal
      if (
        active.rows.length ||
        enabled.rows.length !== 1 ||
        enabled.rows[0]!.id !== approved.id ||
        !enabled.rows[0]!.reviewed_by ||
        JSON.stringify(JSON.parse(String(enabled.rows[0]!.rule_config))) !==
          JSON.stringify(approved.ruleConfig)
      )
        throw Error(
          'Source must contain one unchanged, enabled approved rule and no unresolved runs',
        )
    } finally {
      db.close()
    }
    manifest.approval = {
      ...approval,
      declaration: approved.ruleConfig,
      sourceHash,
      sourceDirectory: source,
    }
  }
  console.log(
    `Efficiency ${options.phase}: ${manifest.schedule.length} runs, ${manifest.schedule.length * 30} maximum requests, up to ${manifest.schedule.length * 5} run minutes plus build/reset. Estimated budget limit $${options.maxCostUsd}; unknown billed costs remain reserved.`,
  )
  for (const name of (options.phase === 'learning-diagnostic'
    ? ['candidate']
    : ['baseline', 'candidate']) as ('baseline' | 'candidate')[]) {
    const cwd = resolve(dir, name)
    await mkdir(cwd)
    const archive = execFileSync('git', ['archive', refs[name]], { maxBuffer: 64 * 1024 * 1024 })
    execFileSync('tar', ['-xf', '-', '-C', cwd], { input: archive })
    const lockHash = hash(await readFile(resolve(cwd, 'pnpm-lock.yaml')))
    if (lockHash !== hash(await readFile(resolve(root, 'pnpm-lock.yaml'))))
      throw Error('Dependency lock differs; install isolated locked dependencies before comparing')
    await symlink(resolve(root, 'node_modules'), resolve(cwd, 'node_modules'), 'dir')
    await symlink(
      resolve(root, 'arena/checkout/node_modules'),
      resolve(cwd, 'arena/checkout/node_modules'),
      'dir',
    )
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      AGENT_MODEL: `openai/${AGENT_MODEL}`,
      OPENAI_API_KEY: gateway.token,
      OPENAI_BASE_URL: gateway.url,
      VISION_MODEL,
      VISION_API_KEY: gateway.token,
      VISION_BASE_URL: gateway.url,
      VISION_MODEL_FAMILY: 'qwen3',
      ARENA_STATIC: '1',
      ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
      DATABASE_URL: `file:${resolve(cwd, 'runs.db')}`,
      RUN_MAX_MODEL_CALLS: '30',
      RUN_MAX_ACTIONS: '40',
      RUN_TOTAL_TIMEOUT_MS: '300000',
      MODEL_REQUEST_TIMEOUT_MS: '60000',
      MODEL_REQUEST_MAX_RETRIES: '1',
      TOOL_TIMEOUT_MS: '15000',
      OTEL_SDK_DISABLED: 'true',
      ...(visual
        ? {
            EXECUTION_EVIDENCE_ANALYSIS: '1',
            EXECUTION_ANALYSIS_MODE: name === 'baseline' ? 'serial' : 'parallel',
          }
        : {}),
    }
    for (const field of ['PORT', 'ARENA_PORT', 'ARENA_API_PORT', 'ARENA_CONTROL_PORT'])
      env[field] = await port()
    const build = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build.ts'], {
      cwd,
      env,
      timeout: 60000,
      encoding: 'utf8',
    })
    await writeFile(resolve(dir, `${name}-build.log`), gateway.redact(build))
    if (sourceDb) await copyFile(resolve(dir, 'source.db'), resolve(cwd, 'runs.db'))
    const arm = {
      cwd,
      env,
      base: `http://127.0.0.1:${env.PORT}`,
      arena: `http://127.0.0.1:${env.ARENA_PORT}`,
      control: `http://127.0.0.1:${env.ARENA_CONTROL_PORT}`,
      lease: undefined as string | undefined,
    }
    arms.set(name, arm)
    manifest.arms[name] = {
      commit: refs[name],
      archiveHash: hash(archive),
      lockHash,
      environment: Object.fromEntries(Object.entries(env).filter(([k]) => !/(KEY|TOKEN)$/.test(k))),
      executorHash: hash(await readFile(resolve(cwd, 'src/execution/executor.ts'))),
      configurationHash: hash(await readFile(resolve(cwd, 'src/shared/config.ts'))),
      serverHash: hash(await readFile(resolve(cwd, 'dist/server/index.js'))),
      ports: [env.PORT, env.ARENA_PORT, env.ARENA_API_PORT, env.ARENA_CONTROL_PORT],
    }
    launch(cwd, env, `${name}-server`, 'dist/server/index.js')
    launch(cwd, env, `${name}-arena`, 'dist/arena/index.js')
    let ready = false
    for (let i = 0; i < 100; i++) {
      try {
        if (
          (await request(arm, '/api/health')).model.ready &&
          (await fetch(arm.arena, { signal: AbortSignal.timeout(1000) })).ok
        ) {
          ready = true
          break
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150))
    }
    if (!ready) throw Error(`Services not ready: ${name}`)
    const lease = await request(arm, '/api/evaluation/lease', {})
    arm.lease = lease.lease
    manifest.arms[name].rules = lease.rules
    if (!learning && lease.rules.some((r: any) => r.category === 'transition'))
      throw Error('Discovery requires no learned rules')
  }
  await write('manifest.json', manifest)
  for (const item of manifest.schedule) {
    const arm = arms.get(item.arm)!
    Object.assign(process.env, {
      PORT: arm.env.PORT,
      ARENA_PORT: arm.env.ARENA_PORT,
      ARENA_URL: arm.arena,
      ARENA_CONTROL_PORT: arm.env.ARENA_CONTROL_PORT,
      ARENA_CONTROL_TOKEN: arm.env.ARENA_CONTROL_TOKEN,
    })
    const id = `${item.arm}-${item.profile}-${item.repeat}`
    const record: any = { ...item, passed: false }
    let begun = false
    try {
      const health = await request(arm, '/api/health')
      if (health.activeRuns || health.queuedRuns) throw Error('Queue not idle')
      record.fixture = learning
        ? await learningFixture(arm, item.profile === 'healthy')
        : await resetAndVerify(item.profile)
      gateway.begin(id, 30, 300000)
      begun = true
      const run = await request(arm, '/api/runs', {
        goal,
        environmentId: 'arena',
        entryUrl: arm.arena,
        budget: efficiencyBudget,
        viewport: manifest.viewport,
      })
      record.runId = run.runId
      const deadline = Date.now() + 330000
      while (true) {
        const state = await request(arm, `/api/runs/${run.runId}`)
        if (!['queued', 'running'].includes(state.status) && !state.active) break
        if (Date.now() >= deadline) {
          await request(arm, `/api/runs/${run.runId}/cancel`, {})
          throw Error('Run timeout; cancelled')
        }
        await new Promise((r) => setTimeout(r, 250))
      }
      const report = (record.report = await request(arm, `/api/runs/${run.runId}/report`))
      manifest.arms[item.arm].runtime = report.events.find(
        (e: any) => e.type === 'run:started',
      )?.payload
      const backend = (record.backend = await request(arm, '/__control/state', undefined, true))
      const artifacts: Record<string, any> = {}
      await mkdir(resolve(dir, id))
      for (const artifact of report.artifacts) {
        const r = await fetch(
          `${arm.base}/api/runs/${run.runId}/artifacts/${encodeURIComponent(artifact.id)}`,
          { signal: AbortSignal.timeout(15000) },
        )
        const bytes = Buffer.from(await r.arrayBuffer())
        const valid =
          r.ok &&
          artifact.available &&
          (artifact.type === 'screenshot'
            ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : bytes.length > 0)
        artifacts[artifact.id] = {
          type: artifact.type,
          exists: valid,
          sha256: hash(bytes),
          ...(valid && artifact.type !== 'screenshot'
            ? { data: JSON.parse(bytes.toString()) }
            : {}),
        }
        if (valid) await writeFile(resolve(dir, id, encodeURIComponent(artifact.id)), bytes)
      }
      record.artifacts = artifacts
      record.score = learning
        ? scoreBoundRecheck(
            report,
            backend,
            Object.values(artifacts),
            approved.id,
            approved.ruleConfig.expectation.timeoutMs,
            item.profile === 'healthy',
          )
        : evaluateRun(report, item.profile, item.repeat, {
            fixtureValid: record.fixture.valid,
            backend,
            artifacts,
            events: report.events,
            budget: efficiencyBudget,
            hypotheses: report.hypotheses,
          })
      record.passed = record.score.passed ?? record.score.overallPass
      if (visual) {
        record.visualScore = scoreVisualAnalysis(report, item.profile, artifacts)
        record.passed &&= record.visualScore.passed
      }
    } catch (error) {
      record.error = gateway.redact(String(error))
    } finally {
      record.requests = begun ? await gateway.end() : []
    }
    record.metrics = {
      ...efficiencyMetrics(record.report, record.requests, {
        [AGENT_MODEL]: provider!,
        [VISION_MODEL]: process.env.EXPERIMENT_VISION_PROVIDER ?? '',
      }),
      orders: record.backend?.orders?.length ?? null,
    }
    // A vision request routed to another provider is declared separately; this batch is not silently comparable.
    if (record.report && record.requests.length !== record.report.usage.modelCalls)
      record.passed = false
    records.push(record)
    await write(`${id}.json`, record)
    await write(
      'progress.json',
      records.map(({ report, artifacts, ...r }) => r),
    )
    console.log(
      `${id}: ${record.passed ? 'pass' : 'fail'}, ${record.metrics.requests} requests, ${record.metrics.elapsedMs ?? 'unknown'}ms`,
    )
    if (!record.passed) break
  }
} catch (error) {
  await write('failure.json', { error: gateway.redact(String(error)) })
  process.exitCode = 1
} finally {
  await gateway.end()
  for (const arm of arms.values())
    if (arm.lease)
      await request(arm, '/api/evaluation/release', { lease: arm.lease }).catch(() => {})
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((r) => {
          if (child.exitCode !== null || child.signalCode !== null) return r()
          const timer = setTimeout(() => {
            child.kill('SIGKILL')
            r()
          }, 2000)
          child.once('exit', () => {
            clearTimeout(timer)
            r()
          })
        }),
    ),
  )
  await Promise.allSettled(logs)
  await gateway.close()
  const complete = records.length === manifest.schedule.length
  const qualityPassed = complete && records.every((r) => r.passed)
  const comparable =
    complete &&
    records.every(
      (r) =>
        r.metrics.comparableProvider &&
        r.metrics.inputTokens !== null &&
        r.metrics.outputTokens !== null,
    )
  const baseline = efficiencyTotals(records, 'baseline'),
    candidate = efficiencyTotals(records, 'candidate')
  const performancePassed =
    ['compare', 'visual-compare'].includes(options.phase) &&
    qualityPassed &&
    comparable &&
    candidate.elapsedMs !== null &&
    baseline.elapsedMs !== null &&
    candidate.tokens !== null &&
    baseline.tokens !== null &&
    candidate.requests <= baseline.requests * manifest.performanceThresholds.requestRatio &&
    candidate.elapsedMs <= baseline.elapsedMs * manifest.performanceThresholds.elapsedRatio &&
    candidate.tokens <= baseline.tokens * manifest.performanceThresholds.tokenRatio
  const sourceUnchanged = !sourceDb || hash(await readFile(sourceDb)) === sourceHash
  await write('manifest.json', { ...manifest, endedAt: new Date().toISOString(), sourceUnchanged })
  await write('summary.json', {
    complete,
    qualityPassed,
    comparable,
    performancePassed,
    sourceUnchanged,
    baseline,
    candidate,
    spending: gateway.spending(),
    records: records.map((r) => ({
      arm: r.arm,
      profile: r.profile,
      repeat: r.repeat,
      runId: r.runId,
      passed: r.passed,
      metrics: r.metrics,
    })),
  })
  if (
    !qualityPassed ||
    !sourceUnchanged ||
    (['compare', 'visual-compare'].includes(options.phase) && !performancePassed)
  )
    process.exitCode = 1
  console.log(`Efficiency records: ${dir}`)
}
