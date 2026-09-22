import 'dotenv/config'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { startGateway, AGENT_MODEL, VISION_MODEL } from './openrouter-gateway.ts'

const args = process.argv.slice(2)
const repeats = Number(args.includes('--repeats') ? args[args.indexOf('--repeats') + 1] : 3)
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw Error('--repeats must be 1..3')
const arms = args.includes('--arms')
  ? args[args.indexOf('--arms') + 1].split(',')
  : ['current', 'stagehand']
if (arms.some((a) => !['current', 'stagehand'].includes(a))) throw Error('Unknown arm')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY (local .env)')
const dir = resolve('data/experiments', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
const models = (await fetch('https://openrouter.ai/api/v1/models').then((r) => r.json())) as any
const selected = models.data.filter((m: any) => [AGENT_MODEL, VISION_MODEL].includes(m.id))
if (selected.length !== 2) throw Error('Selected models unavailable; no automatic replacement')
await write('models.json', selected)
const gateway = await startGateway(key, dir)
const children: ChildProcess[] = []
const env: NodeJS.ProcessEnv = {
  ...process.env,
  AGENT_MODEL: `openai/${AGENT_MODEL}`,
  OPENAI_API_KEY: gateway.token,
  OPENAI_BASE_URL: gateway.url,
  VISION_MODEL: VISION_MODEL,
  VISION_API_KEY: gateway.token,
  VISION_BASE_URL: gateway.url,
  VISION_MODEL_FAMILY: 'qwen3',
  RUN_MAX_MODEL_CALLS: '30',
  RUN_MAX_ACTIONS: '40',
  RUN_TOTAL_TIMEOUT_MS: '300000',
  ARENA_STATIC: '1',
  DATABASE_URL: `file:${dir}/runs.db`,
  ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  BROWSERBASE_API_KEY: '',
  BROWSERBASE_PROJECT_ID: '',
  OTEL_SDK_DISABLED: 'true',
}
env.OPENROUTER_API_KEY = '' // prevent dotenv in children from reloading the real key
async function port() {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const p = (server.address() as any).port
  await new Promise<void>((r) => server.close(() => r()))
  return String(p)
}
for (const name of ['PORT', 'ARENA_PORT', 'ARENA_API_PORT', 'ARENA_CONTROL_PORT'])
  env[name] = await port()
const primaryPort = env.PORT!
let base = `http://127.0.0.1:${env.PORT}`
const arena = `http://127.0.0.1:${env.ARENA_PORT}`
env.ARENA_URL = arena
const goal =
  'Purchase exactly one item through the visible store UI. Verify the final payment result and visible order ID, then stop. Do not make another purchase or try to force other payment outcomes. Report any blocker and any unverified conditions honestly. Use only this application and normal UI interactions.'
await write('manifest.json', {
  createdAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  lockHash: createHash('sha256')
    .update(await readFile('pnpm-lock.yaml'))
    .digest('hex'),
  agent: AGENT_MODEL,
  vision: VISION_MODEL,
  agentProvider: process.env.EXPERIMENT_AGENT_PROVIDER ?? 'auto',
  visionProvider: process.env.EXPERIMENT_VISION_PROVIDER ?? 'auto',
  stagehand: '3.7.3',
  reasoning: { agent: 'low', vision: 'disabled' },
  maxOutputTokens: 4096,
  requestLimit: 30,
  totalTimeoutMs: 300000,
  goal,
  repeats,
  arms,
  case: 'C0',
  limitations: [
    'operation-only comparison, not quality/discovery evaluation',
    'current executor retains its existing inspection system prompt and rule overhead',
    'Stagehand action count uses framework steps; current executor counts page_act',
    'identical provider routing policy but backend provider availability may vary',
    'no replay caches; all trials use fresh browser and reset arena',
  ],
})
function launch(name: string, argv: string[], extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, argv, {
    env: { ...env, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  let log = ''
  for (const stream of [child.stdout, child.stderr])
    stream!.on('data', (b) => {
      log += gateway.redact(String(b))
      void writeFile(resolve(dir, `${name}.log`), log)
    })
  return child
}
function wait(child: ChildProcess, timeout: number) {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1500).unref()
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
async function api(path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw Error(`API ${path}: ${response.status}`)
  return response.json() as Promise<any>
}
async function control(path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${env.ARENA_CONTROL_PORT}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${env.ARENA_CONTROL_TOKEN}`,
      'content-type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw Error(`control HTTP ${response.status}`)
  return response.json() as Promise<any>
}
const trials: any[] = []
try {
  console.log(`Experiment artifacts: ${dir}`)
  gateway.begin('smoke', 6, 90000)
  const smokeCode = await wait(
    launch('smoke', ['--import', 'tsx', 'src/scripts/smoke-model.ts']),
    95000,
  )
  await write('smoke-requests.json', await gateway.end())
  if (smokeCode !== 0)
    throw Error('Model/vision smoke failed; inspect redacted smoke.log. Trials not started.')
  console.log('Real DeepSeek tool call and Qwen visual localization passed.')
  if (!args.includes('--smoke-only')) {
    launch('server', ['dist/server/index.js'])
    launch('arena', ['dist/arena/index.js'])
    let ready = false
    for (let n = 0; n < 100; n++) {
      try {
        if ((await fetch(base + '/api/health')).ok && (await fetch(arena)).ok) {
          ready = true
          break
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150))
    }
    if (!ready) throw Error('Isolated services did not start')
    // Private fixture verification is never included in model context.
    Object.assign(process.env, {
      PORT: env.PORT,
      ARENA_PORT: env.ARENA_PORT,
      ARENA_CONTROL_PORT: env.ARENA_CONTROL_PORT,
      ARENA_CONTROL_TOKEN: env.ARENA_CONTROL_TOKEN,
      ARENA_URL: arena,
    })
    const { resetAndVerify } = await import('../../evaluation/private/controller.ts')
    for (let repeat = 1; repeat <= repeats; repeat++)
      for (const arm of repeat % 2 ? arms : [...arms].reverse()) {
        const id = `${arm}-${repeat}`,
          record: any = { id, arm, repeat, case: 'C0' }
        console.log(`Starting ${id}`)
        const activePort = primaryPort
        base = `http://127.0.0.1:${activePort}`
        process.env.PORT = activePort
        record.fixture = await resetAndVerify('C0')
        gateway.begin(id)
        const start = Date.now()
        try {
          if (arm.startsWith('current')) {
            const run = await api('/api/runs', {
              goal,
              entryUrl: arena,
              environmentId: 'arena',
              viewport: { width: 1280, height: 720 },
              budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
            })
            record.runId = run.runId
            let terminal = false
            while (Date.now() - start < 310000) {
              const r = await api(`/api/runs/${run.runId}`)
              if (!['queued', 'running'].includes(r.status) && !r.active) {
                terminal = true
                record.run = r
                break
              }
              await new Promise((r) => setTimeout(r, 300))
            }
            if (!terminal) {
              await api(`/api/runs/${run.runId}/cancel`, {})
              throw Error('current executor did not settle')
            }
            record.report = await api(`/api/runs/${run.runId}/report`)
            const snapshots = record.report.artifacts.filter((a: any) => a.type === 'snapshot')
            record.finalSnapshot = snapshots.length
              ? await api(`/api/runs/${run.runId}/artifacts/${snapshots.at(-1).id}`)
              : null
            record.visibleText = record.finalSnapshot?.text ?? ''
            record.completed =
              record.run.status === 'completed' && record.run.businessResult === 'success'
          } else {
            const output = resolve(dir, `${id}-result.json`)
            const child = launch(
              id,
              ['--import', 'tsx', 'scripts/experiments/stagehand-worker.ts'],
              {
                EXPERIMENT_GOAL: goal,
                EXPERIMENT_OUTPUT: output,
                EXPERIMENT_DIR: dir,
                EXPERIMENT_ID: id,
              },
            )
            record.exitCode = await wait(child, 310000)
            record.result = JSON.parse(await readFile(output, 'utf8'))
            record.visibleText = record.result.visibleText ?? ''
            record.completed = record.exitCode === 0 && record.result.completed === true
          }
        } catch (error) {
          record.error = gateway.redact(String(error))
          record.completed = false
        } finally {
          record.elapsedMs = Date.now() - start
          record.requests = await gateway.end()
        }
        record.backend = await control('/__control/state')
        const orders = record.backend.orders
        record.backendCorrect =
          orders.length === 1 &&
          orders[0].status === 'paid' &&
          orders[0].items.reduce((n: number, item: any) => n + item.quantity, 0) === 1
        record.visibleOrderCorrect =
          record.backendCorrect &&
          record.visibleText.includes(orders[0].id) &&
          /confirm|success/i.test(record.visibleText)
        record.pass = record.completed && record.backendCorrect && record.visibleOrderCorrect
        record.inputTokens = record.requests.every((r: any) => r.usage?.prompt_tokens != null)
          ? record.requests.reduce((n: number, r: any) => n + r.usage.prompt_tokens, 0)
          : null
        record.outputTokens = record.requests.every((r: any) => r.usage?.completion_tokens != null)
          ? record.requests.reduce((n: number, r: any) => n + r.usage.completion_tokens, 0)
          : null
        record.cost = record.requests.every((r: any) => r.usage?.cost != null)
          ? record.requests.reduce((n: number, r: any) => n + r.usage.cost, 0)
          : null
        trials.push(record)
        await write(`${id}.json`, record)
        await write(
          'summary.json',
          trials.map(
            ({ report, result, backend, finalSnapshot, visibleText, requests, run, ...r }) => ({
              ...r,
              requests: requests.length,
            }),
          ),
        )
        console.log(
          `${id}: pass=${record.pass}, requests=${record.requests.length}, input=${record.inputTokens}, elapsed=${Math.round(record.elapsedMs / 1000)}s`,
        )
        const health = await api('/api/health')
        if (health.activeRuns || health.queuedRuns)
          throw Error('Current executor still busy or requires reconciliation; no further reset')
      }
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
          if (child.exitCode !== null) return r()
          child.once('exit', () => r())
          setTimeout(() => {
            child.kill('SIGKILL')
            r()
          }, 2000).unref()
        }),
    ),
  )
  await gateway.close()
}
