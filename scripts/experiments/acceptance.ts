import 'dotenv/config'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startGateway, AGENT_MODEL, VISION_MODEL } from './openrouter-gateway.ts'

const args = process.argv.slice(2).filter((a) => a !== '--')
const minimumOnly = args.includes('--minimum-only')
if (args.some((a) => !['--minimum', '--minimum-only'].includes(a)) || args.length > 1)
  throw Error('Usage: pnpm experiment:acceptance [--minimum | --minimum-only]')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
const dir = resolve('data/acceptance', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
const maxCostUsd = Number(process.env.EXPERIMENT_MAX_COST_USD ?? '2')
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw Error('Invalid EXPERIMENT_MAX_COST_USD')
let pricing: any[] = []
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: maxCostUsd,
  estimateCost: (body) => {
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
  RUN_MAX_MODEL_CALLS: '30',
  RUN_MAX_ACTIONS: '40',
  RUN_TOTAL_TIMEOUT_MS: '300000',
  MODEL_REQUEST_TIMEOUT_MS: '60000',
  MODEL_REQUEST_MAX_RETRIES: '1',
  TOOL_TIMEOUT_MS: '15000',
  ARENA_STATIC: '1',
  DATABASE_URL: `file:${dir}/runs.db`,
  ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  OPENROUTER_API_KEY: '',
  OTEL_SDK_DISABLED: 'true',
}
async function port() {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const value = String((server.address() as { port: number }).port)
  await new Promise<void>((r) => server.close(() => r()))
  return value
}
for (const name of ['PORT', 'ARENA_PORT', 'ARENA_API_PORT', 'ARENA_CONTROL_PORT'])
  env[name] = await port()
env.SERVER_URL = `http://127.0.0.1:${env.PORT}`
env.ARENA_URL = `http://127.0.0.1:${env.ARENA_PORT}`
function launch(name: string, argv: string[]) {
  const child = spawn(process.execPath, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  let log = ''
  let writes = Promise.resolve()
  for (const stream of [child.stdout, child.stderr])
    stream!.on('data', (b) => {
      log += gateway.redact(String(b))
      const snapshot = log
      writes = writes.then(() => writeFile(resolve(dir, `${name}.log`), snapshot))
    })
  return child
}
function wait(child: ChildProcess, timeout: number) {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(Error('child-timeout'))
    }, timeout)
    child.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code ?? 1)
    })
  })
}
try {
  console.log(`Acceptance artifacts: ${dir}`)
  const models = (await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json())) as {
    data: { id: string; pricing?: { prompt?: string; completion?: string } }[]
  }
  const selected = models.data.filter((m) => [AGENT_MODEL, VISION_MODEL].includes(m.id))
  if (selected.length !== 2) throw Error('Selected models unavailable; no replacement')
  if (
    selected.some(
      (m) =>
        !Number.isFinite(Number(m.pricing?.prompt)) ||
        !Number.isFinite(Number(m.pricing?.completion)),
    )
  )
    throw Error('Selected model prices unavailable; no assumed free requests')
  pricing = selected
  await write('models.json', selected)
  console.log(
    `Workload: real DeepSeek/Qwen smoke${minimumOnly ? ' + fixed 18-run acceptance' : ' + six diagnostic runs' + (args.includes('--minimum') ? ' + fixed 18-run acceptance' : '')}; estimated budget limit $${maxCostUsd}.`,
  )
  const sourceDiff = execFileSync('git', ['diff', 'HEAD'], { encoding: 'utf8' })
  await writeFile(resolve(dir, 'runner.patch'), sourceDiff)
  const metadata = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    mode: minimumOnly
      ? 'minimum-only'
      : args.includes('--minimum')
        ? 'diagnostic-and-minimum'
        : 'diagnostic',
    atomicInvestigation: env.EXECUTION_ATOMIC_INVESTIGATION === '1',
    agentProvider: process.env.EXPERIMENT_AGENT_PROVIDER ?? 'auto',
    visionProvider: process.env.EXPERIMENT_VISION_PROVIDER ?? 'auto',
    reasoning: { agent: 'low', vision: 'disabled' },
    maxOutputTokens: 4096,
    maxCostUsd,
    requestPolicy: { timeoutMs: 60000, retries: 1, finalizingMaxCalls: 2, toolTimeoutMs: 15000 },
    builtServerHash: createHash('sha256')
      .update(await readFile('dist/server/index.js'))
      .digest('hex'),
    sourceDiffHash: createHash('sha256').update(sourceDiff).digest('hex'),
  }
  await write('environment.json', {
    ...metadata,
    ports: Object.fromEntries(
      ['PORT', 'ARENA_PORT', 'ARENA_API_PORT', 'ARENA_CONTROL_PORT'].map((k) => [k, env[k]]),
    ),
  })
  gateway.begin('smoke', 6, 90000)
  const smoke = await wait(
    launch('smoke', ['--import', 'tsx', 'src/scripts/smoke-model.ts']),
    95000,
  )
  await write('smoke-requests.json', await gateway.end())
  if (smoke !== 0) throw Error('Real model/vision smoke failed; no evaluation started')
  console.log('Real DeepSeek + Qwen smoke passed.')
  launch('server', ['dist/server/index.js'])
  launch('arena', ['dist/arena/index.js'])
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      const health = await fetch(`${env.SERVER_URL}/api/health`, {
        signal: AbortSignal.timeout(1000),
      })
      const arena = await fetch(env.ARENA_URL!, { signal: AbortSignal.timeout(1000) })
      if (health.ok && arena.ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  if (!ready) throw Error('Isolated services failed to start')
  // Only the private controller sees the variant identifiers. Never send answers to the agent.
  Object.assign(process.env, env)
  const { runEvaluation } = await import('../../src/scripts/evaluate.ts')
  const options = (suite: 'diagnostic' | 'minimum', repeats: number) => ({
    suite,
    repeats,
    directory: resolve(dir, suite),
    metadata,
    beforeRun: (id: string) => {
      gateway.begin(`${suite}-${id}`, 30, 300000)
    },
    afterRun: () => gateway.end(),
  })
  const diagnostic = minimumOnly ? undefined : await runEvaluation(options('diagnostic', 1))
  if (diagnostic) await write('diagnostic-result.json', diagnostic)
  if (diagnostic && (!('allPassed' in diagnostic) || !diagnostic.allPassed)) {
    await write('next-stage.json', {
      minimum: 'not-started',
      learning: 'not-started',
      reason: 'Diagnostic failures need investigation before the fixed 18-run batch.',
    })
    process.exitCode = 1
  } else if (minimumOnly || args.includes('--minimum')) {
    const minimum = await runEvaluation(options('minimum', 3))
    await write('minimum-result.json', minimum)
    if (!minimum.gatePassed) process.exitCode = 1
  }
} catch (error) {
  await write('failure.json', {
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
  await gateway.close()
  await write('spending.json', gateway.spending())
}
