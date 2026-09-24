import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { createServer as createPortServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { z } from 'zod'
import { createRun, updateRunStatus, appendEvent } from '../../src/execution/run-manager.ts'
import {
  createNativeInspection,
  nativeTask,
  nativeInstructions,
  nativeAtomicInstructions,
} from './native-inspection.ts'

const arm = process.env.NATIVE_ARM
if (!['stagehand', 'browser-use'].includes(arm ?? '')) throw Error('Unknown native arm')
const dir = resolve(process.env.NATIVE_DIR!)
await mkdir(dir, { recursive: true })
const startedAt = Date.now()
const run = await createRun({
  goal: nativeTask,
  environmentId: 'arena',
  entryUrl: process.env.ARENA_URL!,
  budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
  viewport: { width: 1280, height: 768 },
})
await writeFile(join(dir, 'run.json'), JSON.stringify({ runId: run.id }) + '\n')
await updateRunStatus(run.id, 'running')
await appendEvent(run.id, 'run:started', { goal: nativeTask, native: arm, budget: run.spec.budget })
const abort = new AbortController()
const profile = await mkdtemp(join(tmpdir(), 'sentinel-native-'))
let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined
let inspection: Awaited<ReturnType<typeof createNativeInspection>> | undefined
let rpcServer: ReturnType<typeof createServer> | undefined
let driver: ChildProcess | undefined
let exit: {
  status: 'completed' | 'blocked' | 'timed-out' | 'execution-error' | 'interrupted'
  businessResult: 'success' | 'rejected' | 'unknown'
  stopReason:
    | 'goal-reached'
    | 'blocked'
    | 'execution-error'
    | 'budget-exhausted'
    | 'reconciliation-required'
    | 'finish-incomplete'
} = { status: 'execution-error', businessResult: 'unknown', stopReason: 'execution-error' }
const stop = (reason: string) => {
  if (!abort.signal.aborted) abort.abort(Error(reason))
  void inspection?.close()
  driver?.kill('SIGTERM')
  setTimeout(() => driver?.kill('SIGKILL'), 1000).unref()
  void browser?.close().catch(() => {})
}
const timer = setTimeout(() => stop('budget-exhausted'), 300000)
process.on('SIGTERM', () => stop('cancelled'))
const record: any = { arm, runId: run.id }
let acceptedFinish:
  | Awaited<ReturnType<Awaited<ReturnType<typeof createNativeInspection>>['finish']>>
  | undefined
try {
  const portServer = createPortServer()
  await new Promise<void>((r) => portServer.listen(0, '127.0.0.1', r))
  const port = (portServer.address() as any).port
  await new Promise<void>((r) => portServer.close(() => r()))
  browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: run.spec.viewport,
    serviceWorkers: 'block',
    args: [`--remote-debugging-port=${port}`],
  })
  const page = browser.pages()[0] ?? (await browser.newPage())
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(15000)
  inspection = await createNativeInspection(page, run.id, abort.signal, run.spec.entryUrl, {
    atomic: process.env.NATIVE_ATOMIC_INVESTIGATION === '1',
  })
  await page.goto(run.spec.entryUrl, { waitUntil: 'domcontentloaded' })
  await inspection.observe()
  const token = randomBytes(24).toString('hex')
  rpcServer = createServer(async (req, res) => {
    const reply = (code: number, value: unknown) => {
      if (!res.destroyed) {
        res.writeHead(code, { 'content-type': 'application/json' })
        res.end(JSON.stringify(value))
      }
    }
    if (req.headers.authorization !== `Bearer ${token}` || req.method !== 'POST')
      return reply(403, { error: 'Denied' })
    if (abort.signal.aborted) return reply(410, { error: 'Run ended' })
    const toolTimer = setTimeout(() => {
      stop('tool-timeout')
      reply(408, { error: 'tool-timeout' })
    }, 15000)
    try {
      let body = ''
      for await (const chunk of req) {
        body += String(chunk)
        if (body.length > 65536) throw Error('oversized-tool-input')
      }
      const input = JSON.parse(body)
      let result: unknown
      if (req.url === '/tool') result = await inspection!.invoke(input.name, input.args)
      else if (req.url === '/step') result = await inspection!.afterStep()
      else if (req.url === '/finish') {
        if (acceptedFinish) throw Error('finish-already-accepted')
        result = acceptedFinish = await inspection!.finish(input)
        await inspection!.close()
      } else return reply(404, { error: 'Unknown endpoint' })
      reply(200, result)
    } catch (error) {
      reply(400, { error: String(error) })
    } finally {
      clearTimeout(toolTimer)
    }
  })
  await new Promise<void>((r) => rpcServer!.listen(0, '127.0.0.1', r))
  const catalog = join(dir, 'catalog.json')
  await writeFile(
    catalog,
    JSON.stringify(
      {
        goal: nativeTask,
        instructions:
          nativeInstructions +
          (process.env.NATIVE_ATOMIC_INVESTIGATION === '1' ? ' ' + nativeAtomicInstructions : ''),
        tools: Object.entries(inspection.tools).map(([name, tool]) => ({
          name,
          description: tool.description,
          schema: z.toJSONSchema(tool.schema),
        })),
      },
      null,
      2,
    ),
  )
  const cdp = (await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json())) as any
  const env = {
    ...process.env,
    NATIVE_CDP: cdp.webSocketDebuggerUrl,
    NATIVE_CATALOG: catalog,
    NATIVE_RPC: `http://127.0.0.1:${(rpcServer.address() as any).port}`,
    NATIVE_TOKEN: token,
    NATIVE_DRIVER_OUTPUT: join(dir, 'driver.json'),
    NATIVE_FILES: join(dir, 'files'),
    OPENROUTER_API_KEY: '',
    ARENA_CONTROL_TOKEN: '',
    ANONYMIZED_TELEMETRY: 'false',
    BROWSER_USE_CLOUD_SYNC: 'false',
    BROWSER_USE_LOGGING_LEVEL: 'error',
    OTEL_SDK_DISABLED: 'true',
  }
  driver =
    arm === 'stagehand'
      ? spawn(process.execPath, ['--import', 'tsx', 'scripts/experiments/native-stagehand.ts'], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(
          resolve('data/venvs/browser-use/bin/python'),
          ['scripts/experiments/native-browser-use.py'],
          { env, stdio: ['ignore', 'pipe', 'pipe'] },
        )
  let log = ''
  for (const stream of [driver.stdout, driver.stderr])
    stream!.on('data', (chunk) => {
      log += String(chunk)
        .split(token)
        .join('[local-token]')
        .split(process.env.OPENAI_API_KEY ?? 'not-a-real-key')
        .join('[gateway-token]')
    })
  record.driverExit = await new Promise<number>((accept, reject) => {
    driver!.once('error', reject)
    driver!.once('exit', (code) => accept(code ?? 1))
  })
  await writeFile(join(dir, 'driver.log'), log)
  abort.signal.throwIfAborted()
  const output = JSON.parse(await readFile(join(dir, 'driver.json'), 'utf8'))
  record.driver = output
  if (record.driverExit !== 0 || !output.completed)
    throw Error(output.error ?? 'native-agent-did-not-complete')
  if (!acceptedFinish || !output.acceptedFinish) throw Error('native-finish-not-accepted')
  exit = acceptedFinish
} catch (error) {
  record.error = String(error)
  const stats = inspection?.stats()
  const reason = String(abort.signal.reason ?? error)
  exit = {
    businessResult: stats?.businessResult ?? 'unknown',
    status:
      stats?.uncertainWrite || stats?.pendingWrites
        ? 'interrupted'
        : reason.includes('budget-exhausted')
          ? 'timed-out'
          : 'execution-error',
    stopReason:
      stats?.uncertainWrite || stats?.pendingWrites
        ? 'reconciliation-required'
        : reason.includes('budget-exhausted')
          ? 'budget-exhausted'
          : reason.includes('finish-incomplete')
            ? 'finish-incomplete'
            : 'execution-error',
  }
  await appendEvent(run.id, 'execution:stopped', { reason: exit.stopReason, error: record.error })
} finally {
  clearTimeout(timer)
  await inspection?.close()
  driver?.kill('SIGTERM')
  if (rpcServer) {
    rpcServer.closeAllConnections()
    await new Promise<void>((r) => rpcServer!.close(() => r()))
  }
  await browser?.close().catch(() => {})
  // Actual nested model usage is finalized by the parent gateway before scoring.
  const usage = {
    actions: inspection?.stats().actions ?? 0,
    elapsedMs: Date.now() - startedAt,
    modelCalls: 0,
    modelInputTokens: null,
    modelOutputTokens: null,
  }
  await updateRunStatus(run.id, exit.status, { ...exit, usage })
  await appendEvent(run.id, 'run:completed', {
    ...exit,
    usage,
    modelAccounting: 'pending-parent-gateway',
  })
  await writeFile(
    join(dir, 'worker.json'),
    JSON.stringify({ ...record, ...exit, usage }, null, 2) + '\n',
  )
  await rm(profile, { recursive: true, force: true })
}
