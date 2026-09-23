import 'dotenv/config'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import {
  shortFinishInput,
  legacyFinishInput,
  shortFinishInstructions,
} from '../../src/execution/finish-contract.ts'
import { startGateway, AGENT_MODEL } from './openrouter-gateway.ts'

// Private evaluation only. The replay never instantiates tools or a browser.
const source = resolve(process.argv[2] ?? 'data/efficiency/2026-09-23T10-52-28-448Z')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze a clean commit before replay')
process.env.EXPERIMENT_AGENT_PROVIDER = 'Wafer'
const dir = resolve('data/finish-replay', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const models = await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
}).then(async (r) => {
  if (!r.ok) throw Error(`model-list-http-${r.status}`)
  return (await r.json()) as any
})
const model = models.data.find((m: any) => m.id === AGENT_MODEL)
if (
  !model ||
  !Number.isFinite(Number(model.pricing.prompt)) ||
  !Number.isFinite(Number(model.pricing.completion))
)
  throw Error('model-pricing-unavailable')
await save('model.json', model)
const raw = await readFile(resolve(source, 'requests.jsonl'), 'utf8')
const requests = raw
  .trim()
  .split('\n')
  .map((s) => JSON.parse(s))
const samples = []
for (const profile of ['abnormal', 'healthy'])
  for (let repeat = 1; repeat <= 3; repeat++) {
    const name = `candidate-${profile}-${repeat}`
    const data = await readFile(resolve(source, `${name}.json`))
    const report = JSON.parse(data.toString()).report
    const finishTool = report.events.find(
      (e: any) => e.type === 'tool:started' && e.payload.tool === 'run_finish',
    )
    const attempt = report.events.find(
      (e: any) =>
        e.type === 'model:request-finished' && e.payload.attemptId === finishTool.payload.attemptId,
    )
    const request = requests.find((r: any) => r.run === name && r.seq === attempt.payload.seq)
    if (!request || request.model !== AGENT_MODEL) throw Error(`missing-source:${name}`)
    samples.push({ name, body: request.body, sourceHash: sha(data) })
  }
const manifest = {
  protocol: 'finish-replay-1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source,
  sourceRequestsHash: sha(raw),
  samples: samples.map(({ name, sourceHash }) => ({ name, sourceHash })),
  model: AGENT_MODEL,
  provider: 'Wafer',
  reasoning: 'low',
  maxOutputTokens: 4096,
  requestTimeoutMs: 60000,
  retries: 0,
  maxCostUsd: 0.5,
  stream: true,
  schedule: samples.flatMap((s, i) =>
    (i % 2 ? ['short', 'legacy'] : ['legacy', 'short']).map((arm) => ({ sample: s.name, arm })),
  ),
  checks: [
    'exactly one run_finish call',
    'schema valid',
    'legacy outcome matches saved facts',
    'no browser or business side effects',
  ],
}
await save('manifest.json', manifest)
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: 0.5,
  estimateCost: (body) =>
    Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
    4096 * Number(model.pricing.completion),
})
const records: any[] = []
console.log(
  `Finish replay: 12 requests, no tools executed, at most 12 request-minutes, estimate cap $0.50. ${dir}`,
)
try {
  for (const item of manifest.schedule) {
    const sourceSample = samples.find((s) => s.name === item.sample)!
    const body = structuredClone(sourceSample.body)
    body.stream = true
    if (item.arm === 'short') {
      body.messages[0].content += ' ' + shortFinishInstructions
      const tool = body.tools.find((t: any) => t.function.name === 'run_finish')
      tool.function.parameters = z.toJSONSchema(shortFinishInput, { target: 'draft-7' })
      delete tool.function.parameters.$schema
    }
    gateway.begin(`${item.sample}-${item.arm}`, 1, 65000)
    const start = Date.now()
    let passed = false
    let error: string | undefined
    let output: any
    try {
      const response = await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) throw Error(`request-http-${response.status}`)
      const text = await response.text()
      const events = text
        .split('\n')
        .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
        .map((l) => JSON.parse(l.slice(5).trim()))
      const calls = new Map<number, { name: string; arguments: string }>()
      let finish: string | null = null
      for (const event of events) {
        if (event.error) throw Error('upstream-stream-error')
        const choice = event.choices?.[0]
        if (choice?.finish_reason) finish = choice.finish_reason
        for (const call of choice?.delta?.tool_calls ?? []) {
          const c = calls.get(call.index) ?? { name: '', arguments: '' }
          if (call.function?.name) c.name += call.function.name
          c.arguments += call.function?.arguments ?? ''
          calls.set(call.index, c)
        }
      }
      const call = [...calls.values()][0]
      if (finish !== 'tool_calls' || calls.size !== 1 || call?.name !== 'run_finish')
        throw Error('not-one-valid-finish')
      output = (item.arm === 'short' ? shortFinishInput : legacyFinishInput).parse(
        JSON.parse(call.arguments),
      )
      if (item.arm === 'legacy' && (output.businessResult !== 'unknown' || output.blocked !== true))
        throw Error('legacy-outcome-mismatch')
      passed = true
    } catch (e) {
      error = gateway.redact(String(e))
    }
    const elapsedMs = Date.now() - start
    const actual = await gateway.end()
    records.push({ ...item, passed, elapsedMs, error, output, requests: actual })
    await save('records.json', records)
    console.log(`${item.sample} ${item.arm}: ${passed ? 'pass' : 'fail'} ${elapsedMs}ms`)
  }
} finally {
  await gateway.close()
  const totals = Object.fromEntries(
    ['legacy', 'short'].map((arm) => {
      const selected = records.filter((r) => r.arm === arm)
      const requests = selected.flatMap((r) => r.requests)
      return [
        arm,
        {
          count: selected.length,
          passed: selected.filter((r) => r.passed).length,
          elapsedMs: selected.reduce((n, r) => n + r.elapsedMs, 0),
          tokens:
            requests.length === selected.length &&
            requests.every((r) => typeof r.usage?.total_tokens === 'number')
              ? requests.reduce((n, r) => n + r.usage.total_tokens, 0)
              : null,
        },
      ]
    }),
  )
  await save('summary.json', {
    complete: records.length === 12,
    passed: records.length === 12 && records.every((r) => r.passed),
    totals,
    spending: gateway.spending(),
  })
  if (records.length !== 12 || records.some((r) => !r.passed)) process.exitCode = 1
  console.log(`Replay records: ${dir}`)
}
