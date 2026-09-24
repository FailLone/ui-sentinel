import { scoreBoundRecheck } from './efficiency-protocol.ts'
import 'dotenv/config'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, copyFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { chromium } from 'playwright'
import { startGateway, AGENT_MODEL, VISION_MODEL, REVIEW_MODEL } from './openrouter-gateway.ts'

const args = process.argv.slice(2).filter((a) => a !== '--')
const option = (name: string) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}
const revise = option('--revise'),
  previous = option('--previous')
const revisionReason = option('--revision-reason')
const recheck = option('--recheck')
const resume = option('--resume'),
  source = option('--source'),
  findingId = option('--finding')
const confirmation = option('--confirm-reason'),
  reviewer = option('--reviewer')
let approval = option('--approve')
const isRecheck = !!(resume || recheck)
if (
  [resume, revise, recheck].filter(Boolean).length > 1 ||
  (revisionReason && !revise) ||
  (resume
    ? !approval || !reviewer
    : recheck
      ? false
      : revise
        ? !previous
        : !source || !findingId || !confirmation)
)
  throw Error(
    'Prepare: --source <closed acceptance directory> --finding <id> --confirm-reason <explicit user confirmation>. Revise: --revise <learning directory> --previous <proposal id> [--revision-reason <human review feedback>]. After human review: --resume <learning directory> --approve <proposal id> --reviewer <human name>. Recheck an unchanged enabled rule with a new build: --recheck <closed learning directory>.',
  )
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze clean commit before model calls')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
const dir = resume
  ? resolve(resume)
  : resolve('data/learning', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
let prepared: any = isRecheck
  ? JSON.parse(await readFile(resolve(recheck ?? dir, 'prepared.json'), 'utf8'))
  : undefined
if (recheck) {
  if (approval && approval !== prepared.proposal.id)
    throw Error('Recheck must preserve approved proposal identity')
  approval = prepared.proposal.id
}
if (
  resume &&
  (await access(resolve(dir, 'recheck-environment.json')).then(
    () => true,
    () => false,
  ))
)
  throw Error('Recheck directory already used; use --recheck to preserve earlier results')
if (resume && prepared.proposal.id !== approval)
  throw Error('Approval must identify the exact prepared proposal')
if (!resume && !revise && !recheck) {
  const sourceDir = resolve(source!)
  const summary = JSON.parse(await readFile(resolve(sourceDir, 'minimum/summary.json'), 'utf8'))
  if (!summary.gatePassed) throw Error('Source must be a passed fixed minimum batch')
  // Only a stopped, checkpointed source is eligible; never edit the original acceptance DB.
  for (const suffix of ['-wal', '-journal']) {
    const exists = await access(resolve(sourceDir, 'runs.db' + suffix)).then(
      () => true,
      () => false,
    )
    if (exists) throw Error('Close and checkpoint source database before learning')
  }
  await copyFile(resolve(sourceDir, 'runs.db'), resolve(dir, 'runs.db'))
  await write('source.json', {
    directory: sourceDir,
    findingId,
    confirmation,
    databaseHash: createHash('sha256')
      .update(await readFile(resolve(sourceDir, 'runs.db')))
      .digest('hex'),
  })
}
if (revise) {
  const priorDir = resolve(revise)
  const priorSource = JSON.parse(await readFile(resolve(priorDir, 'source.json'), 'utf8'))
  for (const suffix of ['-wal', '-journal'])
    if (
      await access(resolve(priorDir, 'runs.db' + suffix)).then(
        () => true,
        () => false,
      )
    )
      throw Error('Close prior learning database before revision')
  await copyFile(resolve(priorDir, 'runs.db'), resolve(dir, 'runs.db'))
  await write('source.json', {
    ...priorSource,
    previousProposalId: previous,
    previousDirectory: priorDir,
    reviewerFeedback: revisionReason,
  })
}
if (recheck) {
  const priorDir = resolve(recheck)
  for (const suffix of ['-wal', '-journal'])
    if (
      await access(resolve(priorDir, 'runs.db' + suffix)).then(
        () => true,
        () => false,
      )
    )
      throw Error('Close prior database before recheck')
  await copyFile(resolve(priorDir, 'runs.db'), resolve(dir, 'runs.db'))
  for (const file of ['source.json', 'approval.json'])
    await copyFile(resolve(priorDir, file), resolve(dir, file))
  await write('prepared.json', prepared)
  await write('recheck-source.json', {
    directory: priorDir,
    proposalId: approval,
    databaseHash: createHash('sha256')
      .update(await readFile(resolve(priorDir, 'runs.db')))
      .digest('hex'),
    reason: 'Execution-only recheck; unchanged declaration and existing human approval retained.',
  })
}
const sourceMeta = JSON.parse(await readFile(resolve(dir, 'source.json'), 'utf8'))
const db = createClient({ url: `file:${dir}/runs.db` })
const active = await db.execute("SELECT id FROM runs WHERE status IN ('running','queued')")
if (active.rows.length)
  throw Error('Learning database contains unfinished runs; reconcile before resuming')
const selected = (
  await db.execute({ sql: 'SELECT * FROM findings WHERE id=?', args: [sourceMeta.findingId] })
).rows[0]
if (!selected || selected.source !== 'agent' || selected.validation_status !== 'supported')
  throw Error('Source must be a supported exploratory finding')
const baselineRow = (
  await db.execute({ sql: 'SELECT * FROM runs WHERE id=?', args: [selected.run_id!] })
).rows[0]!
const baselineSpec = JSON.parse(String(baselineRow.spec))
const ownedRefs = JSON.parse(String(selected.evidence_refs)) as string[]
const observations = (
  await db.execute({
    sql: "SELECT payload FROM run_events WHERE run_id=? AND type='transition:observed' ORDER BY seq",
    args: [selected.run_id!],
  })
).rows
  .map((r) => JSON.parse(String(r.payload)))
  .filter((o) => o.evidenceRefs?.some((r: string) => ownedRefs.includes(r)))
if (!observations.length) throw Error('No linked source measurements')
const sourceObservation = observations[0]
db.close()
const modelList = (await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
}).then((r) => r.json())) as any
const pricing = [AGENT_MODEL, VISION_MODEL].map((id) =>
  modelList.data?.find((m: any) => m.id === id),
)
if (
  pricing.some(
    (m) =>
      !m ||
      !Number.isFinite(Number(m.pricing?.prompt)) ||
      !Number.isFinite(Number(m.pricing?.completion)),
  )
)
  throw Error('Selected model prices unavailable')
if (process.env.EXECUTION_BLOCKER_REVIEW === '1') {
  const metadata = (await fetch('https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints', {
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json())) as any
  const endpoint = metadata.data?.endpoints?.find((e: any) => e.provider_name === 'TypeSafe')
  if (
    !endpoint ||
    endpoint.context_length !== 32000 ||
    Number(endpoint.pricing?.prompt) !== 0.000000042 ||
    Number(endpoint.pricing?.completion) !== 0
  )
    throw Error('Frozen Jev model/price changed')
  pricing.push({ id: REVIEW_MODEL, pricing: endpoint.pricing, metadata })
}
await write('models.json', pricing)
const maxCostUsd = 1
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: maxCostUsd,
  estimateCost: (body) => {
    if (body.model === REVIEW_MODEL) return 0.001344
    const model = pricing.find((m) => m.id === body.model)
    return (
      Buffer.byteLength(JSON.stringify(body)) * Number(model?.pricing?.prompt) +
      4096 * Number(model?.pricing?.completion)
    )
  },
})
const children: ChildProcess[] = []
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
  DATABASE_URL: `file:${dir}/runs.db`,
  ARENA_STATIC: '1',
  ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  OPENROUTER_API_KEY: '',
  RUN_MAX_MODEL_CALLS: '30',
  RUN_MAX_ACTIONS: '40',
  RUN_TOTAL_TIMEOUT_MS: '300000',
  MODEL_REQUEST_TIMEOUT_MS: '60000',
  MODEL_REQUEST_MAX_RETRIES: '1',
  TOOL_TIMEOUT_MS: '15000',
  OTEL_SDK_DISABLED: 'true',
}
async function port() {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const p = String((s.address() as { port: number }).port)
  await new Promise<void>((r) => s.close(() => r()))
  return p
}
for (const k of ['PORT', 'ARENA_PORT', 'ARENA_API_PORT', 'ARENA_CONTROL_PORT'])
  env[k] = await port()
const base = `http://127.0.0.1:${env.PORT}`,
  arena = `http://127.0.0.1:${env.ARENA_PORT}`,
  control = `http://127.0.0.1:${env.ARENA_CONTROL_PORT}`
async function request(path: string, body?: unknown, privateControl = false) {
  const r = await fetch((privateControl ? control : base) + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.ARENA_CONTROL_TOKEN}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(path === '/api/rule-proposals' ? 70000 : 15000),
  })
  if (!r.ok) throw Error(`${path}: ${r.status} ${gateway.redact(await r.text())}`)
  return r.json() as Promise<any>
}
function launch(name: string, path: string) {
  const child = spawn(process.execPath, [path], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  let log = '',
    tail = Promise.resolve()
  for (const stream of [child.stdout, child.stderr])
    stream!.on('data', (b) => {
      log += gateway.redact(String(b))
      const snapshot = log
      tail = tail.then(() =>
        writeFile(resolve(dir, `${isRecheck ? 'recheck-' : ''}${name}.log`), snapshot),
      )
    })
}
async function reset(healthy: boolean) {
  const health = await request('/api/health')
  if (health.activeRuns !== 0 || health.queuedRuns !== 0) throw Error('Queue not idle')
  await request('/__control/reset', { variant: 'C5', learningRetryAvailable: healthy }, true)
}
async function observeHealthy() {
  await reset(true)
  const browser = await chromium.launch({ headless: true }),
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  try {
    await page.goto(arena)
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click()
    await page.getByRole('link', { name: /Cart/ }).click()
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click()
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/checkout') && r.request().method() === 'POST',
    )
    await page.getByTestId('pay-button').click()
    const business = await (await response).json()
    if (business.status !== 'failed' || business.canRetry !== true)
      throw Error('Healthy counterexample must retain the same retryable processing failure')
    await page.locator('.payment-result').waitFor()
    const retry = page.getByTestId('retry-button')
    await retry.click({ trial: true, timeout: 3000 })
    const startedAtMs = Date.now(),
      samples: { atMs: number; target: string; value: boolean }[] = []
    do {
      const value = await retry.evaluate((el: HTMLButtonElement) => {
        const box = el.getBoundingClientRect(),
          hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return (
          !el.disabled &&
          box.width > 0 &&
          box.height > 0 &&
          (hit === el || (hit !== null && el.contains(hit)))
        )
      })
      samples.push({ atMs: Date.now(), target: sourceObservation.samples[0].target, value })
      if (Date.now() - startedAtMs >= 5250) break
      await page.waitForTimeout(200)
    } while (true)
    const observedUntilMs = Date.now()
    await page.screenshot({ path: resolve(dir, 'healthy-counterexample.png') })
    const backend = await request('/__control/state', undefined, true)
    if (backend.orders.length !== 1 || !samples.every((s) => s.value))
      throw Error('Healthy fixture verification failed')
    const observation = {
      eventType: sourceObservation.eventType,
      condition: 'element-actionable',
      fromState: 'retryable-failure',
      toState: 'retry-actionable',
      startedAtMs,
      observedUntilMs,
      samples,
      evidenceRefs: ['healthy-counterexample.png', 'healthy-counterexample.json'],
    }
    await write('healthy-counterexample.json', {
      observation,
      business,
      backend,
      method:
        'Independent browser trial click (no dispatch), DOM hit testing and timed sampling; not a model-generated fixture.',
    })
    return observation
  } finally {
    await browser.close()
    await reset(false)
  }
}
const stage = isRecheck ? 'recheck' : 'prepare'
try {
  console.log(`Learning artifacts: ${dir}`)
  const metadata = {
    stage,
    recheckGate: 'bound-rule-1',
    maxCostUsd,
    atomicInvestigation: env.EXECUTION_ATOMIC_INVESTIGATION === '1',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    builtServerHash: createHash('sha256')
      .update(await readFile('dist/server/index.js'))
      .digest('hex'),
    agentModel: AGENT_MODEL,
    visionModel: VISION_MODEL,
    blockerReview: env.EXECUTION_BLOCKER_REVIEW === '1',
    completionReviewModel: env.EXECUTION_BLOCKER_REVIEW === '1' ? REVIEW_MODEL : null,
    completionExpectedModel:
      env.EXECUTION_BLOCKER_REVIEW === '1' ? 'typesafe/jev-1.13-20260917' : null,
    agentProvider: process.env.EXPERIMENT_AGENT_PROVIDER ?? 'auto',
    ports: Object.fromEntries(
      ['PORT', 'ARENA_PORT', 'ARENA_API_PORT', 'ARENA_CONTROL_PORT'].map((k) => [k, env[k]]),
    ),
  }
  await write(`${stage}-environment.json`, metadata)
  if (resume && metadata.builtServerHash !== prepared.builtServerHash)
    throw Error('Prepared candidate and recheck must use the same frozen build')
  launch('server', 'dist/server/index.js')
  launch('arena', 'dist/arena/index.js')
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok && (await fetch(arena)).ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  if (!ready) throw Error('Services failed to start')
  if (!isRecheck) {
    const healthy = await observeHealthy()
    const feedback = await request(`/api/findings/${sourceMeta.findingId}/feedback`, {
      verdict: 'confirmed',
      reason: sourceMeta.confirmation,
    })
    await write('feedback.json', feedback)
    gateway.begin('proposal-generation', 1, 70000)
    let proposal: any
    try {
      proposal = await request('/api/rule-proposals', {
        findingId: sourceMeta.findingId,
        previousProposalId: sourceMeta.previousProposalId,
        reviewerFeedback: sourceMeta.reviewerFeedback,
      })
    } finally {
      await write('proposal-requests.json', await gateway.end())
    }
    const validation = await request(`/api/rule-proposals/${proposal.id}/validate`, {
      positiveInputs: observations.map((o) => JSON.stringify(o)),
      negativeInputs: [JSON.stringify(healthy)],
    })
    proposal = await request(`/api/rule-proposals/${proposal.id}`)
    prepared = {
      proposal,
      validation,
      feedback,
      source: sourceMeta,
      baseline: { runId: baselineRow.id, usage: JSON.parse(String(baselineRow.usage)) },
      builtServerHash: metadata.builtServerHash,
    }
    await write('prepared.json', prepared)
    if (![...validation.positiveResults, ...validation.negativeResults].every((r: any) => r.passed))
      throw Error('Candidate validation failed; preserve the draft and evidence for review')
    console.log(
      `Candidate ${proposal.id} validated; waiting for human review. No approval or enable call was made.`,
    )
  } else {
    const current = await request(`/api/rule-proposals/${approval}`)
    if (JSON.stringify(current.ruleConfig) !== JSON.stringify(prepared.proposal.ruleConfig))
      throw Error('Candidate changed after preparation')
    if (recheck) {
      if (current.status !== 'enabled' || !current.reviewedBy)
        throw Error('Recheck requires an already approved and enabled unchanged rule')
      await write('approval-inherited.json', {
        proposalId: approval,
        reviewedBy: current.reviewedBy,
        sourceDirectory: resolve(recheck),
      })
    } else {
      await request(`/api/rule-proposals/${approval}/review`, {
        action: 'approve',
        reviewedBy: reviewer,
      })
      await write('approval.json', {
        proposalId: approval,
        reviewedBy: reviewer,
        at: new Date().toISOString(),
      })
      await request(`/api/rule-proposals/${approval}/enable`, {})
    }
    const records: any[] = []
    for (const healthy of [false, true])
      for (let repeat = 1; repeat <= 3; repeat++) {
        await reset(healthy)
        const id = `${healthy ? 'healthy' : 'abnormal'}-${repeat}`
        gateway.begin(id, 30, 300000)
        const record: any = { profile: healthy ? 'healthy' : 'abnormal', repeat }
        try {
          const run = await request('/api/runs', {
            ...baselineSpec,
            entryUrl: arena,
            budget: { totalTimeoutMs: 300000, maxModelCalls: 30, maxActions: 40 },
          })
          record.runId = run.runId
          const deadline = Date.now() + 330000
          while (true) {
            const status = await request(`/api/runs/${run.runId}`)
            if (!['queued', 'running'].includes(status.status) && !status.active) break
            if (Date.now() > deadline) {
              await request(`/api/runs/${run.runId}/cancel`, {})
              throw Error('Run timeout; cancellation requested')
            }
            await new Promise((r) => setTimeout(r, 250))
          }
          const report = await request(`/api/runs/${run.runId}/report`),
            backend = await request('/__control/state', undefined, true)
          record.report = report
          record.backend = backend
          const artifactChecks = []
          await mkdir(resolve(dir, id), { recursive: true })
          for (const artifact of report.artifacts) {
            const response = await fetch(
              `${base}/api/runs/${run.runId}/artifacts/${encodeURIComponent(artifact.id)}`,
              { signal: AbortSignal.timeout(15000) },
            )
            const bytes = Buffer.from(await response.arrayBuffer())
            const exists =
              response.ok &&
              artifact.available &&
              (artifact.type === 'screenshot'
                ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                : bytes.length > 0)
            artifactChecks.push({
              id: artifact.id,
              type: artifact.type,
              exists,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            })
            if (exists) await writeFile(resolve(dir, id, encodeURIComponent(artifact.id)), bytes)
          }
          record.artifactChecks = artifactChecks
          const score = scoreBoundRecheck(
            report,
            backend,
            artifactChecks,
            approval!,
            current.ruleConfig.expectation.timeoutMs,
            healthy,
          )
          record.bindingAssertions = score.assertions
          record.passed = score.passed
          record.expectedRuleVerdict = score.expected
        } catch (error) {
          record.passed = false
          record.error = gateway.redact(String(error))
        } finally {
          record.modelRequests = await gateway.end()
        }
        records.push(record)
        await write(`${id}.json`, record)
        await write('spending.json', gateway.spending())
        console.log(`${id}: ${record.passed ? 'pass' : 'fail'}`)
        if (
          record.report?.stopReason === 'reconciliation-required' ||
          gateway.integrityViolations().length ||
          gateway.spending().accountedUsd >= maxCostUsd
        )
          throw Error('Integrity or spending stop')
      }
    await write('recheck-summary.json', {
      proposalId: approval,
      gate: 'bound-rule-1',
      records: records.map((r) => ({
        profile: r.profile,
        repeat: r.repeat,
        runId: r.runId,
        passed: r.passed,
        usage: r.report?.usage,
      })),
      passed: records.length === 6 && records.every((r) => r.passed),
      baseline: prepared.baseline,
    })
    if (!records.every((r) => r.passed)) process.exitCode = 1
  }
} catch (error) {
  await write(`${stage}-failure.json`, {
    error: gateway.redact(String(error)),
    at: new Date().toISOString(),
  })
  console.error(gateway.redact(String(error)))
  process.exitCode = 1
} finally {
  await gateway.end()
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
          }, 2000).unref()
        }),
    ),
  )
  await write('spending.json', gateway.spending())
  await gateway.close()
}
