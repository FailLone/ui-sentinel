// No real model requests. Both native SDKs run against a deterministic local model server.
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@libsql/client'

const dir = resolve('data/native-fixture-check', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
let sequence = 0
let atomic = false
const bodies: any[] = []
const server = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.setHeader('content-type', 'text/html')
    res.end(
      '<!doctype html><html><head><title>Recovery fixture</title></head><body><h1>Recovery</h1><button disabled>Retry</button></body></html>',
    )
    return
  }
  let raw = ''
  for await (const chunk of req) raw += String(chunk)
  const body = JSON.parse(raw)
  bodies.push(body)
  const text = JSON.stringify(body.messages)
  const hypothesisId = text.match(/hyp-[a-f0-9-]+/g)?.at(-1)
  const qualityRef = text.match(/q\d+-\d+/g)?.at(-1)
  const legacyActions = [
    { name: 'quality_inspect', args: {} },
    {
      name: 'quality_hypothesis',
      args: {
        phenomenon: 'Recovery control remains disabled',
        basis: 'Visible disabled Retry',
        verificationPlan: 'Continuously sample actionability',
        eventType: 'retryable-failure',
        target: 'recovery',
        condition: 'element-actionable',
        timeoutMs: 500,
      },
    },
    { name: 'quality_measure', args: { hypothesisId, qualityRef } },
    {
      name: 'quality_resolve',
      args: {
        hypothesisId,
        status: 'supported',
        title: 'Recovery control remained disabled',
        expected: 'Actionable control within measurement window',
        actual: 'All observed samples were non-actionable',
        severity: 'error',
      },
    },
  ]
  const actions = atomic
    ? [
        { name: 'quality_inspect', args: {} },
        {
          name: 'quality_investigation',
          args: {
            phenomenon: 'Recovery control remains disabled',
            basis: 'Visible disabled Retry',
            trigger: 'always',
            qualityRef,
            target: 'recovery',
            condition: 'element-actionable',
            durationMs: 500,
            severity: 'error',
            freshWindowReason: '',
          },
        },
      ]
    : legacyActions
  let message: any,
    finish = 'stop'
  if (body.response_format) {
    const action = actions[sequence++]
    message = {
      role: 'assistant',
      content: JSON.stringify({
        evaluation_previous_goal: 'Deterministic fixture',
        memory: 'No real model used',
        next_goal: 'Continue fixture',
        action: [
          action
            ? { [action.name]: action.args }
            : { done: { data: { reason: 'observed-blocker' } } },
        ],
      }),
    }
  } else {
    const action = body.tools?.some((t: any) => t.function.name === 'done')
      ? {
          name: 'done',
          args: {
            reasoning: 'Inspection ended with a measured blocker',
            taskComplete: true,
            output: { reason: 'observed-blocker' },
          },
        }
      : actions[sequence++]
    if (action) {
      message = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: `call_${randomUUID()}`,
            type: 'function',
            function: { name: action.name, arguments: JSON.stringify(action.args) },
          },
        ],
      }
      finish = 'tool_calls'
    } else
      message = {
        role: 'assistant',
        content:
          'Inspection complete. The measured recovery control is unavailable; finish with the observed blocker.',
      }
  }
  res.setHeader('content-type', 'application/json')
  res.end(
    JSON.stringify({
      id: 'fake-model',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [{ index: 0, message, finish_reason: finish }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  )
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${(server.address() as any).port}`
const results: any[] = []
try {
  for (const profile of ['stagehand', 'browser-use', 'stagehand-atomic', 'browser-use-atomic']) {
    atomic = profile.endsWith('-atomic')
    const arm = profile.replace('-atomic', '')
    sequence = 0
    bodies.length = 0
    const output = join(dir, profile)
    await mkdir(output)
    const databaseUrl = `file:${output}/runs.db`
    const env = {
      ...process.env,
      NATIVE_ARM: arm,
      NATIVE_ATOMIC_INVESTIGATION: atomic ? '1' : '0',
      NATIVE_DIR: output,
      ARENA_URL: url,
      DATABASE_URL: databaseUrl,
      OPENAI_API_KEY: 'fake-local-model',
      OPENAI_BASE_URL: url + '/v1',
      OPENROUTER_API_KEY: '',
      ARENA_CONTROL_TOKEN: '',
      AGENT_MODEL: 'openai/deepseek/deepseek-v4.1-flash',
      VISION_API_KEY: '',
      VISION_MODEL: '',
      OTEL_SDK_DISABLED: 'true',
    }
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/experiments/native-worker.ts'],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let log = ''
    for (const stream of [child.stdout, child.stderr])
      stream!.on('data', (chunk) => {
        log += String(chunk)
      })
    const code = await new Promise<number>((accept, reject) => {
      const timer = setTimeout(() => child.kill('SIGTERM'), 45000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        accept(code ?? 1)
      })
    })
    await writeFile(join(output, 'parent.log'), log)
    await writeFile(join(output, 'mock-requests.json'), JSON.stringify(bodies, null, 2))
    const worker = await readFile(join(output, 'worker.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    const db = createClient({ url: databaseUrl })
    const findings = await db.execute('SELECT * FROM findings')
    const events = await db.execute('SELECT type FROM run_events')
    const artifacts = await db.execute('SELECT type FROM artifacts')
    const passed =
      code === 0 &&
      worker?.status === 'blocked' &&
      worker?.stopReason === 'blocked' &&
      findings.rows.some((f) => f.source === 'agent' && f.validation_status === 'supported') &&
      events.rows.some((e) => e.type === 'finish:accepted') &&
      artifacts.rows.filter((a) => a.type === 'measurement').length === 1 &&
      (!atomic ||
        (events.rows.filter((e) => e.type === 'investigation:completed').length === 1 &&
          findings.rows.filter((f) => f.source === 'agent').length === 1))
    db.close()
    results.push({
      profile,
      arm,
      atomic,
      passed,
      code,
      worker,
      requests: bodies.length,
      realModel: false,
    })
    console.log(
      `${profile}: ${passed ? 'native quality bridge passed' : 'native quality bridge FAILED'}; ${bodies.length} fake requests`,
    )
    if (!passed) process.exitCode = 1
  }
} finally {
  await writeFile(join(dir, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
  console.log(dir)
}
