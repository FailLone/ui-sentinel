import 'dotenv/config'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AGENT_MODEL, startGateway } from './openrouter-gateway.ts'
import { withInvestigationDigest } from './decision-contract.ts'

const source = resolve('data/acceptance/2026-09-23T15-47-07-984Z')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze a clean commit before paid replay')
const raw = await readFile(resolve(source, 'requests.jsonl'), 'utf8')
const requests = raw
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
const states = [
  {
    case: 'C2',
    seq: 4,
    kind: 'retrieval',
    criterion:
      'Existing hit-test finding is supported. A grounded dismissal/access investigation or honest blocked finish is valid; redundant empty catalog search alone is not progress.',
  },
  {
    case: 'C5',
    seq: 4,
    kind: 'retrieval',
    criterion:
      'Retryable response and disabled control observed. Grounded hypothesis or missing target/rule inspection is valid; finishing with no investigation is not.',
  },
  {
    case: 'C2',
    seq: 6,
    kind: 'verification',
    criterion:
      'Probe error already shows pointer interception. Grounded recovery investigation or honest blocked finish is valid; rereading its raw error alone adds no evidence.',
  },
  {
    case: 'C5',
    seq: 5,
    kind: 'verification',
    criterion:
      'Disabled retry and catalog already inspected. Record a grounded recovery hypothesis, or a genuinely new investigation. Discrete re-observation alone cannot verify the duration requirement; do not finish.',
  },
  {
    case: 'C2',
    seq: 13,
    kind: 'finish',
    criterion:
      'Blocker confirmed and dismissal attempt made. Honest observed-blocker finish is valid; new exploration needs a specific uncovered concern.',
  },
  {
    case: 'C5',
    seq: 10,
    kind: 'finish',
    criterion:
      'Recovery finding already submitted from complete measurement. Scope-covered or observed-blocker finish is valid; do not repeat writes or measurement.',
  },
]
const dir = resolve('data/decision-replay', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
const r = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) })
if (!r.ok) throw Error(`Model list unavailable: ${r.status}`)
const model = ((await r.json()) as any).data.find((m: any) => m.id === AGENT_MODEL)
if (
  !model ||
  !Number.isFinite(Number(model.pricing?.prompt)) ||
  !Number.isFinite(Number(model.pricing?.completion))
)
  throw Error('Missing fixed model or prices')
await save('model.json', model)
const schedule = states.flatMap((state, index) =>
  [0, 1].flatMap((repeat) => {
    const order = (index + repeat) % 2 === 0 ? ['baseline', 'digest'] : ['digest', 'baseline']
    return order.map((arm) => ({ ...state, repeat: repeat + 1, arm }))
  }),
)
const frozen = schedule.map((trial) => {
  const request = requests.find(
    (q) => q.run === `diagnostic-${trial.case}-1` && q.seq === trial.seq,
  )
  if (!request) throw Error('Frozen input missing')
  const body =
    trial.arm === 'digest' ? withInvestigationDigest(request.body) : structuredClone(request.body)
  return { trial, body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex') }
})
await save('manifest.json', {
  protocol: 'investigation-digest-replay-1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source,
  sourceHash: createHash('sha256').update(raw).digest('hex'),
  model: AGENT_MODEL,
  provider: 'Wafer',
  reasoning: 'low',
  maxCostUsd: 0.75,
  maxRequests: 24,
  requestTimeoutMs: 60000,
  maxOutputTokens: 4096,
  retries: 0,
  sideEffects: 'No browser or tool execution; human evidence review required for semantic scoring.',
  failurePolicy:
    'Retain every failed request, continue remaining safe scheduled inputs; stop on spending limit or data-integrity failure.',
  schedule: frozen.map(({ trial, hash }) => ({ ...trial, inputHash: hash })),
})
process.env.EXPERIMENT_AGENT_PROVIDER = 'Wafer'
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: 0.75,
  estimateCost: (body) =>
    Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
    4096 * Number(model.pricing.completion),
})
const records: any[] = []
console.log(`24 frozen decisions; cap $0.75; no tool execution: ${dir}`)
try {
  for (const { trial, body, hash } of frozen) {
    const id = `${trial.case}-${trial.seq}-${trial.arm}-${trial.repeat}`
    const record: any = { ...trial, id, inputHash: hash, semanticReview: 'pending' }
    const start = Date.now()
    gateway.begin(id, 1, 60000)
    try {
      const response = await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) {
        const errorBody = await response.text()
        record.budgetExhausted = errorBody.includes('experiment-spending-limit')
        throw Error(`HTTP ${response.status}`)
      }
      const content = await response.text()
      const events = content
        .split('\n')
        .filter((line) => line.startsWith('data:') && !line.includes('[DONE]'))
        .map((line) => JSON.parse(line.slice(5)))
      const calls = new Map<number, { name: string; arguments: string }>()
      for (const event of events) {
        if (event.error) throw Error('stream-error')
        const choice = event.choices?.[0]
        if (choice?.finish_reason) record.finishReason = choice.finish_reason
        for (const call of choice?.delta?.tool_calls ?? []) {
          const value = calls.get(call.index) ?? { name: '', arguments: '' }
          value.name += call.function?.name ?? ''
          value.arguments += call.function?.arguments ?? ''
          calls.set(call.index, value)
        }
      }
      record.calls = [...calls.values()].map((c) => ({
        name: c.name,
        args: JSON.parse(c.arguments),
      }))
      record.transportValid =
        record.finishReason === 'tool_calls' &&
        record.calls.length > 0 &&
        record.calls.every((c: any) => body.tools.some((t: any) => t.function.name === c.name))
    } catch (error) {
      record.error = gateway.redact(String(error))
      record.transportValid = false
    } finally {
      record.elapsedMs = Date.now() - start
      record.requests = await gateway.end()
      records.push(record)
      await save('records.json', records)
      await save('spending.json', gateway.spending())
      console.log(
        `${id}: ${record.transportValid ? record.calls.map((c: any) => c.name).join(',') : (record.error ?? record.finishReason)}; ${record.elapsedMs}ms`,
      )
    }
    if (record.budgetExhausted) break
  }
} finally {
  await save('summary.json', {
    complete: records.length === schedule.length,
    semanticReview: 'pending',
    records,
    spending: gateway.spending(),
  })
  await gateway.close()
}
