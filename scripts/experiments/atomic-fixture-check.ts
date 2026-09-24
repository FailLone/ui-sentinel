// Actual server + Mastra + Chromium, deterministic local model; no paid requests.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const blockerReview = process.argv.includes('--blocker-review')
const dir = resolve('data/atomic-fixture-check', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const requests: any[] = []
const fixture = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.setHeader('content-type', 'text/html')
    res.end(
      blockerReview
        ? '<!doctype html><button style="position:absolute;left:40px;top:40px;width:200px;height:60px">Confirm</button><div style="position:fixed;inset:0;background:white;z-index:100">Notice</div>'
        : '<!doctype html><html><head><title>Export recovery</title></head><body><h1>Export failed</h1><button disabled>Resume export</button></body></html>',
    )
    return
  }
  let raw = ''
  for await (const chunk of req) raw += String(chunk)
  const body = JSON.parse(raw)
  if (blockerReview && req.url === '/decisions') {
    requests.push(body.state)
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        id: 'local-decision',
        model: 'typesafe/jev-1.13-20260917',
        provider: 'TypeSafe',
        answers: {
          completion: {
            type: 'choice',
            choice: 'observed-blocker',
            confidence: 0.8,
            probabilities: {
              'scope-covered': 0,
              'observed-blocker': 0.9,
              continue: 0.05,
              unknown: 0.05,
            },
          },
        },
        usage: { input_tokens: 123, output_tokens: 1, cost: 0 },
      }),
    )
    return
  }
  if (blockerReview) {
    res.writeHead(500)
    res.end('Unexpected explorer request')
    return
  }

  const input = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  requests.push(input)
  const target = input.observation.elements.find((e: any) => e.tag === 'button')
  const name = requests.length <= 2 ? 'investigation_check' : 'run_finish'
  const args =
    name === 'run_finish'
      ? { reason: 'observed-blocker' }
      : {
          phenomenon: 'The recovery control stays unavailable',
          basis: 'Observed disabled recovery control',
          trigger: 'always',
          elementRef: target.ref,
          target: 'Resume export',
          condition: 'element-actionable',
          durationMs: 500,
          severity: 'warning',
          freshWindowReason: '',
        }
  const call = {
    index: 0,
    id: `call-${randomUUID()}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  }
  const base = {
    id: 'fixture',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: body.model,
  }
  res.setHeader('content-type', 'text/event-stream')
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\n`,
  )
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`,
  )
  res.end('data: [DONE]\n\n')
})
await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${(fixture.address() as any).port}`
const reservation = createServer()
await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r))
const port = (reservation.address() as any).port
await new Promise<void>((r) => reservation.close(() => r()))
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['dist/server/index.js'], {
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${dir}/runs.db`,
    AGENT_MODEL: 'openai/deterministic-fixture',
    OPENAI_API_KEY: 'local-fixture-only',
    OPENAI_BASE_URL: url + '/v1',
    VISION_MODEL: 'local-unused',
    VISION_API_KEY: 'local-fixture-only',
    VISION_BASE_URL: url + '/v1',
    VISION_MODEL_FAMILY: 'qwen3',
    OPENROUTER_API_KEY: '',
    EXECUTION_ATOMIC_INVESTIGATION: '1',
    EXECUTION_BLOCKER_REVIEW: blockerReview ? '1' : '0',
    COMPLETION_REVIEW_URL: url + '/decisions',
    COMPLETION_REVIEW_API_KEY: 'local-only',
    EXECUTION_EVIDENCE_ANALYSIS: '0',
    ARENA_URL: url,
    ARENA_PORT: new URL(url).port,
    RUN_TOTAL_TIMEOUT_MS: '30000',
    RUN_MAX_MODEL_CALLS: '6',
    OTEL_SDK_DISABLED: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
server.stdout.on('data', (chunk) => {
  log += String(chunk)
})
server.stderr.on('data', (chunk) => {
  log += String(chunk)
})
const get = async (path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw Error(`API ${path}: ${response.status}`)
  return response.json() as Promise<any>
}
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      if ((await get('/api/health')).model.ready) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!ready) throw Error('fixture server unavailable')
  const run = await get('/api/runs', {
    goal: blockerReview
      ? 'Inspect access to the Confirm action; record any blocker.'
      : 'Inspect the recovery control without business writes.',
    entryUrl: url,
    environmentId: 'arena',
    budget: { totalTimeoutMs: 30000, maxActions: 5, maxModelCalls: 6 },
  })
  let terminal = false
  for (let i = 0; i < 200; i++) {
    const state = await get(`/api/runs/${run.runId}`)
    if (!['queued', 'running'].includes(state.status) && !state.active) {
      terminal = true
      break
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!terminal) {
    await get(`/api/runs/${run.runId}/cancel`, {})
    throw Error('fixture did not stop')
  }
  const report = await get(`/api/runs/${run.runId}/report`)
  await writeFile(`${dir}/report.json`, JSON.stringify(report, null, 2))
  const count = (type: string) => report.events.filter((e: any) => e.type === type).length
  const assertions = blockerReview
    ? {
        explicitFinish: count('finish:accepted') === 1,
        reviewCommitted: report.events.some(
          (e: any) => e.type === 'completion-review:commit' && e.payload.accepted,
        ),
        oneDecision: requests.length === 1 && report.usage.modelCalls === 1,
        knownUsage: report.usage.modelInputTokens === 123,
        closed: report.status === 'blocked' && report.businessResult === 'unknown',
        oneFinding:
          report.findings.length === 1 && report.findings[0].validationStatus === 'supported',
        noBusinessWrite: !count('business:response'),
      }
    : {
        explicitFinish: count('finish:accepted') === 1,
        oneWindow: count('transition:observed') === 1,
        reused: count('investigation:reused') === 1,
        oneHypothesis: report.hypotheses.length === 1,
        boundedHypothesis: report.hypotheses[0]?.phenomenon.includes('measurement window'),
        oneFinding:
          report.findings.length === 1 && report.findings[0].validationStatus === 'supported',
        closed: report.status === 'blocked' && report.stopReason === 'blocked',
        threeLocalDecisions: requests.length === 3,
        noBusinessWrite: !count('business:response'),
      }
  await writeFile(`${dir}/assertions.json`, JSON.stringify(assertions, null, 2))
  if (!Object.values(assertions).every(Boolean)) throw Error(JSON.stringify(assertions))
  for (const artifact of report.artifacts) {
    const response = await fetch(base + artifact.url)
    if (!response.ok || !(await response.arrayBuffer()).byteLength) throw Error('missing artifact')
  }
  console.log(JSON.stringify({ directory: dir, assertions, paidModelRequests: 0 }))
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exit = new Promise<void>((r) => server.once('exit', () => r()))
    server.kill('SIGTERM')
    const kill = setTimeout(() => server.kill('SIGKILL'), 3000)
    await exit
    clearTimeout(kill)
  }
  fixture.closeAllConnections()
  await new Promise<void>((r) => fixture.close(() => r()))
  await writeFile(`${dir}/server.log`, log)
  await writeFile(`${dir}/requests.json`, JSON.stringify(requests, null, 2))
}
