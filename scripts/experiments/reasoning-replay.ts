import 'dotenv/config'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { startGateway, AGENT_MODEL } from './openrouter-gateway.ts'

// Replay a failed decision without instantiating any browser or tool implementation.
const source = resolve(process.argv[2] ?? 'data/efficiency/2026-09-23T14-35-30-102Z')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze a clean commit first')
const raw = await readFile(resolve(source, 'requests.jsonl'), 'utf8')
const request = raw
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
  .filter((r) => r.run === 'candidate-C2-1' && r.model === AGENT_MODEL)
  .at(-1)
if (!request) throw Error('missing failed C2 decision')
const input = JSON.parse(request.body.messages.find((m: any) => m.role === 'user').content)
if (!input.reusableFindings?.length) throw Error('Replay requires offered verified matches')
const dir = resolve('data/reasoning-replay', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
const response = await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(15000),
})
if (!response.ok) throw Error('model-list-unavailable')
const model = ((await response.json()) as any).data.find((m: any) => m.id === AGENT_MODEL)
if (
  !model ||
  model.reasoning?.mandatory ||
  !Number.isFinite(Number(model.pricing?.prompt)) ||
  !Number.isFinite(Number(model.pricing?.completion))
)
  throw Error('model/pricing/reasoning options unavailable')
await save('model.json', model)
await save('manifest.json', {
  protocol: 'reasoning-replay-1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source,
  sourceSeq: request.seq,
  sourceHash: createHash('sha256').update(raw).digest('hex'),
  schedule: ['low', 'disabled'],
  provider: 'Wafer',
  model: AGENT_MODEL,
  requestTimeoutMs: 60000,
  maxOutputTokens: 4096,
  maxCostUsd: 0.1,
  retries: 0,
  checks: [
    'same frozen input and tool schemas',
    'one valid offered hypothesis link',
    'no tools or browser executed',
  ],
})
process.env.EXPERIMENT_AGENT_PROVIDER = 'Wafer'
const records: any[] = []
console.log(`Two frozen decision replays, no side effects, estimated total cap $0.10: ${dir}`)
for (const mode of ['low', 'disabled'] as const) {
  const arm = resolve(dir, mode)
  await mkdir(arm)
  const gateway = await startGateway(
    key,
    arm,
    fetch,
    {
      limitUsd: 0.05,
      estimateCost: (b) =>
        Buffer.byteLength(JSON.stringify(b)) * Number(model.pricing.prompt) +
        4096 * Number(model.pricing.completion),
    },
    mode,
  )
  const record: any = { mode, passed: false }
  const start = Date.now()
  try {
    gateway.begin(mode, 1, 60000)
    const r = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) throw Error(`HTTP ${r.status}`)
    const text = await r.text()
    const events = text
      .split('\n')
      .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
      .map((l) => JSON.parse(l.slice(5).trim()))
    const calls = new Map<number, { name: string; arguments: string }>()
    let finish: string | undefined
    for (const event of events) {
      if (event.error) throw Error('stream-error')
      const choice = event.choices?.[0]
      if (choice?.finish_reason) finish = choice.finish_reason
      for (const call of choice?.delta?.tool_calls ?? []) {
        const value = calls.get(call.index) ?? { name: '', arguments: '' }
        value.name += call.function?.name ?? ''
        value.arguments += call.function?.arguments ?? ''
        calls.set(call.index, value)
      }
    }
    record.finishReason = finish
    record.calls = [...calls.values()].map((c) => ({
      name: c.name,
      arguments: JSON.parse(c.arguments),
    }))
    const call = record.calls[0]
    record.passed =
      finish === 'tool_calls' &&
      record.calls.length === 1 &&
      call.name === 'hypotheses_link_finding' &&
      typeof call.arguments.bindingReason === 'string' &&
      call.arguments.bindingReason.trim().length > 0 &&
      call.arguments.bindingReason.length <= 400 &&
      input.reusableFindings.some(
        (m: any) =>
          m.hypothesisId === call.arguments.hypothesisId &&
          m.findingId === call.arguments.findingId,
      )
  } catch (e) {
    record.error = gateway.redact(String(e))
  } finally {
    record.elapsedMs = Date.now() - start
    record.requests = await gateway.end()
    record.spending = gateway.spending()
    await gateway.close()
    records.push(record)
    await save('records.json', records)
    console.log(
      `${mode}: ${record.passed ? 'valid link' : 'not a valid link'}, ${record.elapsedMs}ms`,
    )
  }
}
await save('summary.json', { complete: records.length === 2, records })
console.log(`Reasoning replay records: ${dir}`)
