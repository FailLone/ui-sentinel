import 'dotenv/config'
import { createServer } from 'node:http'
import { createServer as createPortServer } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { AGENT_MODEL, startGateway } from './openrouter-gateway.ts'

const arm = process.argv[2]
if (!['stagehand', 'browser-use'].includes(arm)) throw Error('Expected stagehand or browser-use')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze a clean commit first')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing')
const dir = resolve(
  'data/oss-preflight',
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${arm}`,
)
await mkdir(dir, { recursive: true })
const save = (name: string, data: unknown) =>
  writeFile(join(dir, name), JSON.stringify(data, null, 2) + '\n')
const response = await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
})
if (!response.ok) throw Error('Model list unavailable')
const model = ((await response.json()) as any).data.find((m: any) => m.id === AGENT_MODEL)
if (
  !model ||
  !Number.isFinite(Number(model.pricing?.prompt)) ||
  !Number.isFinite(Number(model.pricing?.completion))
)
  throw Error('Missing model/prices')
await save('model.json', model)
const dependencies =
  arm === 'stagehand'
    ? await readFile('pnpm-lock.yaml', 'utf8')
    : execFileSync(
        resolve('data/venvs/browser-use/bin/python'),
        [
          '-c',
          'from importlib.metadata import distributions; print("\\n".join(sorted(d.metadata["Name"] + "==" + d.version for d in distributions())))',
        ],
        { encoding: 'utf8' },
      )
const installedVersion =
  arm === 'stagehand'
    ? JSON.parse(await readFile('node_modules/@browserbasehq/stagehand/package.json', 'utf8'))
        .version
    : execFileSync(
        resolve('data/venvs/browser-use/bin/python'),
        ['-c', 'from importlib.metadata import version; print(version("browser-use"))'],
        { encoding: 'utf8' },
      ).trim()
if (installedVersion !== (arm === 'stagehand' ? '3.7.3' : '0.13.10'))
  throw Error('Unexpected installed framework version')
await writeFile(join(dir, 'dependencies.txt'), dependencies)
await save('manifest.json', {
  protocol: 'oss-native-preflight-1',
  arm,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  version: installedVersion,
  dependenciesHash: createHash('sha256').update(dependencies).digest('hex'),
  model: AGENT_MODEL,
  provider: 'Wafer',
  reasoning: 'low',
  maxRequests: 3,
  maxCostUsd: 0.15,
  timeoutMs: 90000,
  requestTimeoutMs: 60000,
  scope:
    'Native loop, DOM observation, structured completion and gateway compatibility; no arena or quality claim.',
})
process.env.EXPERIMENT_AGENT_PROVIDER = 'Wafer'
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: 0.15,
  estimateCost: (body) =>
    Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
    4096 * Number(model.pricing.completion),
})
const web = createServer((_, res) => {
  res.setHeader('content-type', 'text/html')
  res.end(
    '<!doctype html><html><head><title>Compatibility</title></head><body><h1>Sentinel compatibility page</h1></body></html>',
  )
})
await new Promise<void>((r) => web.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${(web.address() as any).port}`
const portServer = createPortServer()
await new Promise<void>((r) => portServer.listen(0, '127.0.0.1', r))
const cdpPort = (portServer.address() as any).port
await new Promise<void>((r) => portServer.close(() => r()))
const profile = await mkdtemp(join(tmpdir(), 'sentinel-oss-preflight-'))
let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined
console.log(`Native ${arm} preflight, <=3 requests, cap $0.15: ${dir}`)
try {
  browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 768 },
    serviceWorkers: 'block',
    args: [`--remote-debugging-port=${cdpPort}`],
  })
  await browser.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === url) await route.continue()
    else await route.abort()
  })
  const page = browser.pages()[0] ?? (await browser.newPage())
  await page.goto(url)
  const cdp = (await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json())) as any
  const output = join(dir, 'worker.json')
  const env = {
    ...process.env,
    OPENROUTER_API_KEY: '',
    OPENAI_API_KEY: gateway.token,
    OPENAI_BASE_URL: gateway.url,
    EXPERIMENT_CDP: cdp.webSocketDebuggerUrl,
    EXPERIMENT_ORIGIN: url,
    EXPERIMENT_OUTPUT: output,
    EXPERIMENT_FILES: join(dir, 'files'),
    ANONYMIZED_TELEMETRY: 'false',
    BROWSER_USE_CLOUD_SYNC: 'false',
    BROWSER_USE_LOGGING_LEVEL: 'error',
    OTEL_SDK_DISABLED: 'true',
  }
  gateway.begin(arm, 3, 90000)
  const child =
    arm === 'stagehand'
      ? spawn(process.execPath, ['--import', 'tsx', 'scripts/experiments/stagehand-preflight.ts'], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(
          resolve('data/venvs/browser-use/bin/python'),
          ['scripts/experiments/browser-use-preflight.py'],
          { env, stdio: ['ignore', 'pipe', 'pipe'] },
        )
  let log = ''
  for (const stream of [child.stdout, child.stderr])
    stream!.on('data', (chunk) => {
      log += gateway.redact(String(chunk))
    })
  const code = await new Promise<number>((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1500).unref()
    }, 95000)
    child.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      accept(code ?? 1)
    })
  })
  await writeFile(join(dir, 'worker.log'), log)
  const requests = await gateway.end()
  const worker = await readFile(output, 'utf8')
    .then(JSON.parse)
    .catch(() => ({ completed: false, error: 'worker-output-missing' }))
  let heading: unknown
  if (arm === 'stagehand') heading = worker.result?.output?.observed_heading
  else {
    try {
      heading = JSON.parse(worker.result).observed_heading
    } catch {}
  }
  const passed =
    code === 0 &&
    worker.completed &&
    heading === 'Sentinel compatibility page' &&
    requests.length > 0 &&
    requests.every((r) => r.status === 'success' && r.provider === 'Wafer')
  await save('result.json', { passed, code, worker, requests, spending: gateway.spending() })
  console.log(
    `${arm}: ${passed ? 'native loop compatible' : 'preflight failed'} (${requests.length} requests)`,
  )
  if (!passed) process.exitCode = 1
} finally {
  await gateway.end()
  await gateway.close()
  await browser?.close().catch(() => {})
  web.closeAllConnections()
  await new Promise<void>((r) => web.close(() => r()))
  await rm(profile, { recursive: true, force: true })
}
