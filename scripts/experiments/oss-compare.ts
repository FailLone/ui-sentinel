import 'dotenv/config'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createClient } from '@libsql/client'
import { startGateway, AGENT_MODEL, VISION_MODEL } from './openrouter-gateway.ts'
import { evaluateRun } from '../../evaluation/private/evaluator.ts'
import {
  evaluateRecoveryRun,
  recoveryProtocol,
} from '../../evaluation/private/recovery-protocol.ts'
import { resetAndVerify, controlRequest } from '../../evaluation/private/controller.ts'
import { inspectionGoal, efficiencyBudget } from './efficiency-protocol.ts'

const args = process.argv.slice(2)
const candidate = args.includes('--candidate') ? args[args.indexOf('--candidate') + 1] : undefined
const convergence = args.includes('--study') && args[args.indexOf('--study') + 1] === 'convergence'
if (args.includes('--study') && !convergence) throw Error('Unknown study')
if (convergence && candidate) throw Error('Study and candidate are separate protocols')
if (candidate && !['stagehand', 'browser-use'].includes(candidate)) throw Error('Invalid candidate')
if (
  args.some(
    (a) => !['--candidate', 'stagehand', 'browser-use', '--study', 'convergence'].includes(a),
  )
)
  throw Error('Unsupported arguments')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze clean commit before model calls')
const dir = resolve('data/oss-compare', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(join(dir, name), JSON.stringify(value, null, 2) + '\n')
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const response = await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
})
if (!response.ok) throw Error('Model list unavailable')
const allModels = ((await response.json()) as any).data
const models = [AGENT_MODEL, VISION_MODEL].map((id) => allModels.find((m: any) => m.id === id))
if (
  models.some(
    (m) =>
      !m ||
      !Number.isFinite(Number(m.pricing?.prompt)) ||
      !Number.isFinite(Number(m.pricing?.completion)),
  )
)
  throw Error('Missing fixed models or prices')
await save('models.json', models)
process.env.EXPERIMENT_AGENT_PROVIDER = 'Wafer'
process.env.EXPERIMENT_VISION_PROVIDER = 'Alibaba'
if (convergence && models[0].reasoning?.mandatory)
  throw Error('Fixed model cannot disable reasoning')
const maxCostUsd = candidate || convergence ? 3 : 2
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: maxCostUsd,
  estimateCost: (body) => {
    const m = models.find((m) => m.id === body.model)
    return (
      Buffer.byteLength(JSON.stringify(body)) * Number(m.pricing.prompt) +
      4096 * Number(m.pricing.completion)
    )
  },
})
const env: NodeJS.ProcessEnv = {
  ...process.env,
  AGENT_MODEL: `openai/${AGENT_MODEL}`,
  OPENAI_API_KEY: gateway.token,
  OPENAI_BASE_URL: gateway.url,
  VISION_MODEL,
  VISION_API_KEY: gateway.token,
  VISION_BASE_URL: gateway.url,
  VISION_MODEL_FAMILY: 'qwen3',
  OPENROUTER_API_KEY: '',
  RUN_MAX_MODEL_CALLS: '30',
  RUN_MAX_ACTIONS: '40',
  RUN_TOTAL_TIMEOUT_MS: '300000',
  MODEL_REQUEST_TIMEOUT_MS: '60000',
  MODEL_REQUEST_MAX_RETRIES: '1',
  TOOL_TIMEOUT_MS: '15000',
  EXECUTION_EVIDENCE_ANALYSIS: '0',
  ARENA_STATIC: '1',
  DATABASE_URL: `file:${dir}/runs.db`,
  ARENA_CONTROL_TOKEN: randomBytes(24).toString('hex'),
  OTEL_SDK_DISABLED: 'true',
}
async function freePort() {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = String((server.address() as any).port)
  await new Promise<void>((r) => server.close(() => r()))
  return port
}
for (const name of ['PORT', 'ARENA_PORT', 'ARENA_API_PORT', 'ARENA_CONTROL_PORT'])
  env[name] = await freePort()
env.ARENA_URL = `http://127.0.0.1:${env.ARENA_PORT}`
const base = `http://127.0.0.1:${env.PORT}`
const python = resolve('data/venvs/browser-use/bin/python')
const installed = execFileSync(
  python,
  ['-c', 'from importlib.metadata import version; print(version("browser-use"))'],
  { encoding: 'utf8' },
).trim()
if (installed !== '0.13.10') throw Error('Unexpected Browser Use version')
const dependencies = execFileSync(
  python,
  [
    '-c',
    'from importlib.metadata import distributions; print("\\n".join(sorted(d.metadata["Name"] + "==" + d.version for d in distributions())))',
  ],
  { encoding: 'utf8' },
)
await writeFile(join(dir, 'python-dependencies.txt'), dependencies)
const cases = ['C0', 'C2', 'C5'] as const
const schedule = candidate
  ? cases.flatMap((variant, index) =>
      [1, 2, 3].flatMap((repeat) =>
        ((index + repeat) % 2 ? ['current', candidate] : [candidate, 'current']).map((arm) => ({
          variant,
          repeat,
          arm,
        })),
      ),
    )
  : cases.flatMap((variant, index) => {
      const arms = convergence
        ? [
            'current-low',
            'current-off',
            'stagehand-low',
            'stagehand-off',
            'browser-use-off',
            'browser-use-flash',
          ]
        : ['current', 'stagehand', 'browser-use']
      return [...arms.slice(index), ...arms.slice(0, index)].map((arm) => ({
        variant,
        repeat: 1,
        arm,
      }))
    })
function profile(arm: string) {
  return {
    framework: arm.startsWith('current')
      ? 'current'
      : arm.startsWith('stagehand')
        ? 'stagehand'
        : 'browser-use',
    agentReasoning: (convergence && !arm.endsWith('-low') ? 'disabled' : 'low') as
      | 'disabled'
      | 'low',
    flash: arm === 'browser-use-flash',
  }
}
const manifest = {
  protocol: convergence
    ? 'architecture-convergence-screen-1'
    : candidate
      ? 'oss-quality-confirm-1'
      : 'oss-quality-screen-1',
  evaluationProtocol: convergence ? recoveryProtocol : 'historical-minimum',
  profiles: Object.fromEntries(
    [...new Set(schedule.map((s) => s.arm))].map((arm) => [arm, profile(arm)]),
  ),
  candidate: candidate ?? null,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  models: [AGENT_MODEL, VISION_MODEL],
  providers: ['Wafer', 'Alibaba'],
  reasoning: convergence
    ? { agent: 'per frozen profile', vision: 'disabled' }
    : ['low', 'disabled'],
  budget: efficiencyBudget,
  requestTimeoutMs: 60000,
  maxOutputTokens: 4096,
  maxCostUsd,
  viewport: { width: 1280, height: 768 },
  goal: inspectionGoal,
  stagehand: JSON.parse(
    await readFile('node_modules/@browserbasehq/stagehand/package.json', 'utf8'),
  ).version,
  browserUse: installed,
  pythonDependenciesHash: hash(dependencies),
  lockHash: hash(await readFile('pnpm-lock.yaml')),
  serverHash: hash(await readFile('dist/server/index.js')),
  evaluatorHash: hash(await readFile('evaluation/private/evaluator.ts')),
  recoveryEvaluatorHash: convergence
    ? hash(await readFile('evaluation/private/recovery-protocol.ts'))
    : undefined,
  schedule,
  stopPolicy:
    'Complete safe scheduled samples including ordinary failures; stop for uncertain writes, leak/evidence integrity, service failure or spending cap. One separately frozen implementation correction at most.',
  quality:
    'Existing independent evaluator, plus explicit native finish, complete artifact retrieval and semantic report review; no speed-only passes.',
  scope:
    'Whole agent execution stacks; native observation/history/tools differ. Physical input count for native arms, executor action count for current; purchase cases use clicks. All models including native nested calls share gateway limits.',
  thresholds: {
    wallTimeReduction: 0.15,
    requestsIncrease: 0,
    costIncrease: 0,
    quality: 'all scheduled runs pass',
  },
}
if (manifest.stagehand !== '3.7.3') throw Error('Unexpected Stagehand version')
await save('manifest.json', manifest)
const children: ChildProcess[] = [],
  records: any[] = []
const logWrites: Promise<unknown>[] = []
function launch(name: string, argv: string[], extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, argv, {
    env: { ...env, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  let log = '',
    writes = Promise.resolve()
  for (const stream of [child.stdout, child.stderr])
    stream!.on('data', (chunk) => {
      log += gateway.redact(String(chunk))
      const text = log
      writes = writes.then(() => writeFile(join(dir, `${name}.log`), text))
      logWrites.push(writes)
    })
  return child
}
async function request(path: string, body?: unknown): Promise<any> {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.ARENA_CONTROL_TOKEN}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw Error(`API ${path}: ${r.status}`)
  return r.json()
}
function waitChild(child: ChildProcess, timeout: number) {
  return new Promise<number>((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }, timeout)
    child.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      accept(code ?? 1)
    })
  })
}
const db = createClient({ url: env.DATABASE_URL! })
let lease: any
try {
  console.log(`Frozen ${schedule.length}-run quality comparison; cap $${maxCostUsd}: ${dir}`)
  launch('server', ['dist/server/index.js'])
  launch('arena', ['dist/arena/index.js'])
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request('/api/health')).model.ready && (await fetch(env.ARENA_URL!)).ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  if (!ready) throw Error('Services unavailable')
  lease = await request('/api/evaluation/lease', {})
  if (lease.rules.some((r: any) => r.category === 'transition'))
    throw Error('Discovery must not use learned rules')
  await save('rules.json', lease.rules)
  Object.assign(process.env, {
    PORT: env.PORT,
    ARENA_URL: env.ARENA_URL,
    ARENA_PORT: env.ARENA_PORT,
    ARENA_CONTROL_PORT: env.ARENA_CONTROL_PORT,
    ARENA_CONTROL_TOKEN: env.ARENA_CONTROL_TOKEN,
  })
  for (const item of schedule) {
    const executionProfile = profile(item.arm)
    const id = `${item.variant}-${item.arm}-${item.repeat}`
    const record: any = { ...item, id, passed: false }
    let started = false
    try {
      record.fixture = await resetAndVerify(item.variant)
      const start = Date.now()
      gateway.begin(id, 30, 300000, { agentReasoning: executionProfile.agentReasoning })
      started = true
      console.log(`Starting ${id}`)
      if (executionProfile.framework === 'current') {
        const run = await request('/api/runs', {
          goal: inspectionGoal,
          entryUrl: env.ARENA_URL,
          environmentId: 'arena',
          budget: efficiencyBudget,
          viewport: manifest.viewport,
        })
        record.runId = run.runId
        while (true) {
          const run = await request(`/api/runs/${record.runId}`)
          if (!['queued', 'running'].includes(run.status) && !run.active) break
          if (Date.now() - start > 315000) {
            await request(`/api/runs/${record.runId}/cancel`, {})
            throw Error('Unsettled execution after deadline')
          }
          await new Promise((r) => setTimeout(r, 200))
        }
      } else {
        // Opaque worker paths prevent fixture names leaking through native filesystem context.
        const nativeDir = join(dir, 'workers', randomUUID())
        await mkdir(nativeDir, { recursive: true })
        record.nativeDirectory = nativeDir
        const code = await waitChild(
          launch(
            `worker-${records.length}`,
            ['--import', 'tsx', 'scripts/experiments/native-worker.ts'],
            {
              NATIVE_ARM: executionProfile.framework,
              NATIVE_DIR: nativeDir,
              ARENA_CONTROL_TOKEN: '',
              NATIVE_FLASH_MODE: executionProfile.flash ? '1' : '0',
            },
          ),
          310000,
        )
        record.workerExit = code
        const output = JSON.parse(await readFile(join(nativeDir, 'worker.json'), 'utf8'))
        record.runId = output.runId
        record.native = output
      }
      record.requests = await gateway.end()
      started = false
      if (executionProfile.framework !== 'current') {
        const rows = await db.execute({
          sql: 'SELECT usage FROM runs WHERE id=?',
          args: [record.runId],
        })
        const usage = JSON.parse(String(rows.rows[0].usage))
        usage.modelCalls = record.requests.length
        const known = record.requests.every(
          (r: any) =>
            typeof r.usage?.prompt_tokens === 'number' &&
            typeof r.usage?.completion_tokens === 'number',
        )
        usage.modelInputTokens = known
          ? record.requests.reduce((sum: number, r: any) => sum + r.usage.prompt_tokens, 0)
          : null
        usage.modelOutputTokens = known
          ? record.requests.reduce((sum: number, r: any) => sum + r.usage.completion_tokens, 0)
          : null
        await db.execute({
          sql: 'UPDATE runs SET usage=? WHERE id=?',
          args: [JSON.stringify(usage), record.runId],
        })
      }
      const report = await request(`/api/runs/${record.runId}/report`)
      record.reportAvailableMs = Date.now() - start
      record.report = report
      const artifacts: any = {}
      for (const artifact of report.artifacts) {
        const r = await fetch(base + artifact.url, { signal: AbortSignal.timeout(15000) })
        const bytes = Buffer.from(await r.arrayBuffer())
        const exists =
          r.ok &&
          artifact.available &&
          (artifact.type === 'screenshot'
            ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : bytes.length > 0)
        artifacts[artifact.id] = {
          type: artifact.type,
          exists,
          ...(exists && artifact.type !== 'screenshot'
            ? { data: JSON.parse(bytes.toString()) }
            : {}),
        }
      }
      record.evidence = {
        fixtureValid: record.fixture.valid === true,
        backend: await controlRequest('/__control/state'),
        artifacts,
        events: report.events,
        budget: efficiencyBudget,
        hypotheses: report.hypotheses,
      }
      record.score = evaluateRun(report, item.variant, item.repeat, record.evidence)
      if (convergence) {
        record.historicalScore = record.score
        record.score = evaluateRecoveryRun(report, item.variant, item.repeat, record.evidence)
      }
      record.explicitFinish = report.events.some((e: any) => e.type === 'finish:accepted')
      record.providerMatched = record.requests.every(
        (r: any) =>
          r.provider === (r.model === AGENT_MODEL ? 'Wafer' : 'Alibaba') || r.status !== 'success',
      )
      record.passed = record.score.overallPass && record.explicitFinish && record.providerMatched
      record.costKnownUsd = record.requests.reduce(
        (sum: number, r: any) => sum + (r.usage?.cost ?? 0),
        0,
      )
      record.unknownCosts = record.requests.filter(
        (r: any) => typeof r.usage?.cost !== 'number',
      ).length
      record.modelWaitMs = record.requests.reduce((sum: number, r: any) => sum + r.durationMs, 0)
      console.log(
        `${id}: ${record.passed ? 'pass' : 'fail'}; ${report.status}; ${record.reportAvailableMs}ms; ${record.requests.length} model requests`,
      )
    } catch (error) {
      record.error = gateway.redact(String(error))
      console.log(`${id}: ${record.error}`)
    } finally {
      if (started) record.requests = await gateway.end()
      records.push(record)
      await save(`${id}.json`, record)
      await save('records.json', records)
      await save('spending.json', gateway.spending())
    }
    if (
      record.report?.stopReason === 'reconciliation-required' ||
      record.score?.noAnswerLeak === false ||
      record.evidence?.backend?.orders?.length > 1 ||
      record.error?.includes('Unsettled')
    )
      throw Error('Integrity/side-effect stop; preserve batch')
    if (gateway.spending().accountedUsd >= maxCostUsd) throw Error('spending-limit')
  }
} catch (error) {
  await save('failure.json', { error: gateway.redact(String(error)) })
  process.exitCode = 1
} finally {
  const arms = [...new Set(schedule.map((s) => s.arm))].map((arm) => {
    const runs = records.filter((r) => r.arm === arm)
    return {
      arm,
      total: runs.length,
      passed: runs.filter((r) => r.passed).length,
      requests: runs.reduce((n, r) => n + (r.requests?.length ?? 0), 0),
      reportAvailableMs: runs.reduce((n, r) => n + (r.reportAvailableMs ?? 0), 0),
      knownCostUsd: runs.reduce((n, r) => n + (r.costKnownUsd ?? 0), 0),
      unknownCosts: runs.reduce((n, r) => n + (r.unknownCosts ?? 0), 0),
    }
  })
  await save('summary.json', {
    complete: records.length === schedule.length,
    arms,
    spending: gateway.spending(),
    semanticReview: 'pending',
    adoption: 'not-decided',
  })
  if (lease) await request('/api/evaluation/release', { lease: lease.lease }).catch(() => {})
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
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
  await Promise.all(logWrites)
  await gateway.end()
  await gateway.close()
  db.close()
}
