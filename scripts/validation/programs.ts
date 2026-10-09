import { scoreProgramReceipts } from '../../evaluation/private/program-score.ts'
import 'dotenv/config'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import {
  investigationCases,
  investigationHtml,
  inspectionGoal,
  type InvestigationCase,
} from '../../evaluation/fixtures/investigation.ts'
import { startGateway, AGENT_MODEL } from '../../evaluation/support/model-gateway.ts'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
import { replayProgramPair } from '../../evaluation/support/program-replay.ts'
import type { InvestigationProgram } from '../../src/execution/investigation/program.ts'

const args = process.argv.slice(2).filter((a) => a !== '--')
const real = args.includes('--real')
const caseAt = args.indexOf('--cases')
const selected =
  caseAt < 0 ? (real ? [...investigationCases] : ['menu-broken']) : args[caseAt + 1]?.split(',')
const flags = args.filter((_, i) => (i !== caseAt && i !== caseAt + 1) || caseAt < 0)
if (
  flags.some((a) => !['--real', '--preflight'].includes(a)) ||
  (real && args.includes('--preflight')) ||
  (caseAt >= 0 && !real) ||
  !selected?.length ||
  new Set(selected).size !== selected.length ||
  selected.some((c) => !investigationCases.includes(c as InvestigationCase))
)
  throw Error('Use --preflight or --real [--cases comma-separated case IDs]')
const selectedCases = selected as InvestigationCase[]
const replayFamilies = [
  ...new Set(selectedCases.filter((c) => c.endsWith('broken')).map((c) => c.split('-')[0]!)),
]
if (real && !process.env.OPENROUTER_API_KEY)
  throw Error('OPENROUTER_API_KEY required; no mock fallback')
const directory = resolve('data/program-validation', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(directory, { recursive: true })
const identity = await buildIdentity()
await writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      mode: real ? 'real' : 'fixed',
      identity,
      agentModel: real ? AGENT_MODEL : 'fixed-fixture',
      provider: real ? 'Alibaba' : 'fixed',
      totalTimeoutMs: real ? 300000 : 30000,
      maxModelCalls: real ? 30 : 6,
      goal: inspectionGoal,
      cases: selectedCases,
    },
    null,
    2,
  ),
)
let caseId: InvestigationCase = investigationCases[0],
  modelStep = 0
const fixedProgram = (): InvestigationProgram => ({
  version: 1,
  phenomenon: 'Offered options may be clipped',
  basis: 'Published requirement: every offered time must be readable when open',
  targets: [{ name: 'option', selector: '[role="option"]:last-child' }],
  steps: [{ op: 'measure', name: 'opened' }],
  assertions: [
    {
      expectation: 'Offered option has no rectangular ancestor clipping',
      left: { sample: 'opened', target: 'option', metric: 'unclippedFraction' },
      operator: 'gte',
      right: { value: 1 },
    },
  ],
})
const requests: unknown[] = []
const fixture = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.setHeader('content-type', 'text/html')
    res.end(investigationHtml(caseId))
    return
  }
  if (real) {
    res.writeHead(503)
    res.end('This DOM-only validation has no local model fallback')
    return
  }
  let raw = ''
  for await (const c of req) raw += c
  const body = JSON.parse(raw)
  requests.push(body)
  const choices = [
    { name: 'page_act', arguments: { type: 'click', role: 'button', name: 'Delivery times' } },
    { name: 'page_inspect', arguments: { selector: '[role="option"]', offset: 0 } },
    { name: 'investigation_run', arguments: fixedProgram() },
    { name: 'run_finish', arguments: { reason: 'observed-blocker' } },
  ]
  const chosen = choices[Math.min(modelStep++, choices.length - 1)]!
  if (chosen.name === 'investigation_run') {
    const message = body.messages.findLast((m: any) => m.role === 'user')
    const context = JSON.parse(
      typeof message.content === 'string' ? message.content : message.content[0].text,
    )
    const inspected = context.latestToolResults?.tools?.find((t: any) => t.tool === 'page_inspect')
    const target = inspected?.elements?.find((e: any) => e.text === 'Evening')
    if (!target?.selector || typeof target.unclippedFraction !== 'number') {
      res.writeHead(500)
      res.end('Public inspection facts were lost in decision memory')
      return
    }
    ;(chosen.arguments as InvestigationProgram).targets[0]!.selector = target.selector
  }
  const base = {
    id: randomUUID(),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: body.model,
  }
  res.setHeader('content-type', 'text/event-stream')
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: randomUUID(), type: 'function', function: { name: chosen.name, arguments: JSON.stringify(chosen.arguments) } }] }, finish_reason: null }] })}\n\n`,
  )
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`,
  )
  res.end('data: [DONE]\n\n')
})
await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`
// Existing gateway enforces per-request timeout, model allowlist, accounting and request limits.
let price: { prompt: number; completion: number } | undefined
if (real) {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw Error('model-list-unavailable')
  const list = (await response.json()) as any
  const model = list.data?.find((m: any) => m.id === AGENT_MODEL)
  if (
    !model ||
    !Number.isFinite(Number(model.pricing.prompt)) ||
    !Number.isFinite(Number(model.pricing.completion))
  )
    throw Error('model-pricing-unavailable')
  price = { prompt: Number(model.pricing.prompt), completion: Number(model.pricing.completion) }
  await writeFile(`${directory}/model.json`, JSON.stringify(model, null, 2))
}
const gateway = real
  ? await startGateway(process.env.OPENROUTER_API_KEY!, directory, fetch, {
      limitUsd: 1,
      providers: { agent: 'Alibaba', vision: 'Alibaba' },
      estimateCost: (body) =>
        Buffer.byteLength(JSON.stringify(body)) * price!.prompt + 4096 * price!.completion,
    })
  : undefined
const reservation = createServer()
await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r))
const port = (reservation.address() as { port: number }).port
await new Promise<void>((r) => reservation.close(() => r()))
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['dist/server/index.js'], {
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${directory}/runs.db`,
    AGENT_MODEL: real ? `openai/${AGENT_MODEL}` : 'openai/fixed-fixture',
    OPENAI_API_KEY: gateway?.token ?? 'fixed-only',
    OPENAI_BASE_URL: gateway?.url ?? url + '/v1',
    OPENROUTER_API_KEY: '',
    VISION_MODEL: 'unused',
    VISION_API_KEY: 'unused',
    VISION_BASE_URL: url + '/v1',
    VISION_MODEL_FAMILY: 'qwen3',
    EXECUTION_VISUAL_DISCOVERY: '0',
    EXECUTION_BLOCKER_REVIEW: '0',
    EXECUTION_SHORT_FINISH: '1',
    ARENA_URL: url,
    ARENA_PORT: new URL(url).port,
    RUN_TOTAL_TIMEOUT_MS: real ? '300000' : '30000',
    RUN_MAX_MODEL_CALLS: real ? '30' : '6',
    AGENT_LENGTH_RECOVERY_WITHOUT_REASONING: '1',
    OTEL_SDK_DISABLED: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', (c) => {
  logs += String(c)
})
server.stderr.on('data', (c) => {
  logs += String(c)
})
async function api(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  })
  if (!r.ok) throw Error(`API ${path}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<any>
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const results: any[] = [],
  replayResults: any[] = []
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if ((await api('/api/health')).model.ready) {
        ready = true
        break
      }
    } catch {}
    await sleep(100)
  }
  if (!ready) throw Error('server unavailable')
  for (const id of selectedCases) {
    caseId = id
    modelStep = 0
    const run = await api('/api/runs', {
      goal: inspectionGoal,
      entryUrl: url,
      environmentId: 'arena',
      viewport: { width: 800, height: 600 },
      budget: {
        totalTimeoutMs: real ? 300000 : 30000,
        maxActions: 16,
        maxModelCalls: real ? 30 : 6,
      },
    })
    gateway?.begin(run.runId, 30, 300000)
    let terminal = false
    const until = Date.now() + (real ? 310000 : 40000)
    while (Date.now() < until) {
      const r = await api(`/api/runs/${run.runId}`)
      if (!['queued', 'running'].includes(r.status) && !r.active) {
        terminal = true
        break
      }
      await sleep(300)
    }
    if (!terminal) await api(`/api/runs/${run.runId}/cancel`, {})
    const modelRequests = await gateway?.end()
    const report = await api(`/api/runs/${run.runId}/report`)
    await writeFile(`${directory}/${id}.json`, JSON.stringify({ report, modelRequests }, null, 2))
    const completions = report.events
      .filter((e: any) => e.type === 'program:completed')
      .map((e: any) => e.payload)
    const receipts: any[] = []
    for (const completed of completions) {
      const a = report.artifacts.find((a: any) => a.id === completed.receiptRef)
      if (a) {
        const r = await fetch(base + a.url)
        receipts.push(await r.json())
      }
    }
    await writeFile(`${directory}/${id}-receipts.json`, JSON.stringify(receipts, null, 2))
    const scoringBrowser = await chromium.launch({ headless: true })
    let score
    try {
      const p = await scoringBrowser.newPage()
      await p.setContent(investigationHtml(id))
      score = await scoreProgramReceipts(
        p,
        id,
        receipts,
        report.events.filter((e: any) => e.type === 'action:executing').map((e: any) => e.payload),
      )
      if (
        id.endsWith('healthy') &&
        report.findings.some((f: any) => f.validationStatus === 'supported')
      )
        score.passed = false
    } finally {
      await scoringBrowser.close()
    }
    const row = {
      case: id,
      runId: run.runId,
      status: report.status,
      stopReason: report.stopReason,
      programs: receipts.length,
      verdicts: receipts.map((r) => r.verdict),
      matched: terminal && score.passed,
      score,
      explicitFinish: report.events.some((e: any) => e.type === 'finish:accepted'),
      modelCalls: report.usage.modelCalls,
    }
    results.push(row)
    console.log(JSON.stringify(row))
  }
  // Replay programs generated on each defective fixture against both sides, with no source edits.
  if (real) {
    const browser = await chromium.launch({ headless: true })
    try {
      for (const family of replayFamilies) {
        const receipts = JSON.parse(
          await readFile(`${directory}/${family}-broken-receipts.json`, 'utf8'),
        )
        const source = receipts.find((r: any) => r.verdict === 'fail')
        const replays: any[] = []
        if (source) {
          replays.push(...(await replayProgramPair(browser, source.program, family, directory)))
        }
        replayResults.push({
          family,
          passed:
            replays.length === 2 &&
            replays.every((r) => r.verdict === (r.healthy ? 'pass' : 'fail')),
        })
        await writeFile(`${directory}/replay-${family}.json`, JSON.stringify(replays, null, 2))
      }
    } finally {
      await browser.close()
    }
  }
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((r) => server.once('exit', () => r()))
    server.kill('SIGTERM')
    const timer = setTimeout(() => server.kill('SIGKILL'), 3000)
    await exited
    clearTimeout(timer)
  }
  await gateway?.close()
  fixture.closeAllConnections()
  await new Promise<void>((r) => fixture.close(() => r()))
  await writeFile(`${directory}/server.log`, gateway ? gateway.redact(logs) : logs)
  if (!real) await writeFile(`${directory}/fixed-requests.json`, JSON.stringify(requests, null, 2))
  const summary = {
    directory,
    mode: real ? 'real' : 'fixed',
    scope: real && selectedCases.length === 6 ? 'full-matrix' : 'targeted',
    results,
    replayResults,
    spending: gateway?.spending(),
    passed:
      results.length === selectedCases.length &&
      results.every((r) => r.matched && r.explicitFinish) &&
      (!real ||
        (replayResults.length === replayFamilies.length && replayResults.every((r) => r.passed))),
  }
  await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
  if (!summary.passed) process.exitCode = 1
}
