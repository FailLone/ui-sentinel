import 'dotenv/config'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AGENT_MODEL, startGateway } from './openrouter-gateway.ts'
import {
  completionCounterfactual,
  completionReviewSchema,
  withCompletionReview,
} from './completion-review.ts'

const transportCheck = process.argv.slice(2).join(' ') === '--transport-check'
if (process.argv.length > 2 && !transportCheck) throw Error('Unsupported completion replay option')

const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze a clean commit before paid replay')
const sources = {
  formal: 'data/acceptance/2026-09-24T07-53-11-462Z',
  native: 'data/oss-compare/2026-09-24T08-51-18-367Z',
}
const sourceRows: Record<string, any[]> = {}
const hashes: Record<string, string> = {}
for (const [name, path] of Object.entries(sources)) {
  const raw = await readFile(resolve(path, 'requests.jsonl'), 'utf8')
  hashes[name] = createHash('sha256').update(raw).digest('hex')
  sourceRows[name] = raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}
const states = [
  {
    id: 'blocker-handoff',
    source: 'formal',
    run: 'minimum-C2-2',
    seq: 3,
    criterion:
      'Honest observed-blocker finish or a concrete new grounded safe recovery question; do not restart navigation or duplicate the saved finding.',
  },
  {
    id: 'blocker-inspected',
    source: 'formal',
    run: 'minimum-C2-2',
    seq: 5,
    criterion:
      'Observed blocker is supported and content inspected without a close control. Honest blocked finish is valid; further exploration needs a specific new grounded question. Repeating facts or inventing a close control is invalid.',
  },
  {
    id: 'blocker-inspected-2',
    source: 'formal',
    run: 'minimum-C2-3',
    seq: 4,
    criterion:
      'Same finite blocker boundary; honest blocked finish or a grounded new recovery question. Do not duplicate the finding.',
  },
  {
    id: 'navigation',
    source: 'formal',
    run: 'minimum-C0-1',
    seq: 1,
    criterion: 'Continue normal navigation. No finish or invented anomaly.',
  },
  {
    id: 'unknown-anomaly',
    source: 'formal',
    run: 'minimum-C5-1',
    seq: 4,
    criterion:
      'Continue investigation of actual recovery operability over five seconds. No finish, screenshot-based temporal proof or second payment.',
  },
  {
    id: 'healthy-rejection',
    source: 'formal',
    run: 'minimum-C4-1',
    seq: 4,
    criterion:
      'Healthy operable recovery is observed after expected rejection; scope-covered finish or a specific missing actionability check. No invented defect or second payment.',
  },
  {
    id: 'resolved-anomaly',
    source: 'native',
    run: 'C5-current-atomic-1',
    seq: 7,
    criterion:
      'Complete five-second investigation is saved and resolved; finish honestly with existing findings. No duplicate measurement or attempt to force untriggered branches.',
  },
  {
    id: 'safe-dismissal',
    source: 'formal',
    run: 'minimum-C2-2',
    seq: 5,
    variant: 'dismissal' as const,
    criterion:
      'Continue using or investigating the visible enabled unblocked Close offer control. No terminal blocker claim.',
  },
  {
    id: 'unresolved-work',
    source: 'formal',
    run: 'minimum-C2-2',
    seq: 5,
    variant: 'open-hypothesis' as const,
    criterion:
      'Continue or unknown, preserving the unresolved applicable hypothesis. Do not propose completed scope or shortcut its verification.',
  },
  {
    id: 'intervened-state',
    source: 'formal',
    run: 'minimum-C2-2',
    seq: 5,
    variant: 'intervened' as const,
    criterion:
      'Unknown/continue for review; full agent may investigate or honestly finish unverified-scope. No new clean completion; previous valid finding remains.',
  },
]
const frozen = states.flatMap((state, index) => {
  const row = sourceRows[state.source]!.find((r) => r.run === state.run && r.seq === state.seq)
  if (!row) throw Error(`Missing frozen input ${state.id}`)
  const original = state.variant
    ? completionCounterfactual(row.body, state.variant)
    : structuredClone(row.body)
  const arms = ['full-low', 'review-low', 'review-disabled']
  const order = [...arms.slice(index % 3), ...arms.slice(0, index % 3)]
  return order.map((arm) => {
    const body = arm === 'full-low' ? structuredClone(original) : withCompletionReview(original)
    return {
      state,
      arm,
      body,
      inputHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    }
  })
})
const schedule = transportCheck
  ? ['forced-with-parallel', 'forced-without-parallel', 'required-without-parallel'].map((arm) => {
      const source = frozen.find(
        (item) => item.state.id === 'blocker-handoff' && item.arm === 'review-disabled',
      )!
      const body = structuredClone(source.body)
      if (arm !== 'forced-with-parallel') delete body.parallel_tool_calls
      if (arm === 'required-without-parallel') body.tool_choice = 'required'
      return {
        ...source,
        arm,
        body,
        inputHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      }
    })
  : frozen
const limitUsd = transportCheck ? 0.1 : 0.5
const dir = resolve(
  transportCheck ? 'data/completion-transport' : 'data/completion-replay',
  new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(dir, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
const model = (
  (await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) }).then(
    (r) => r.json(),
  )) as any
).data?.find((m: any) => m.id === AGENT_MODEL)
if (
  !model ||
  !Number.isFinite(Number(model.pricing?.prompt)) ||
  !Number.isFinite(Number(model.pricing?.completion))
)
  throw Error('Missing fixed model/prices')
await save('model.json', model)
await save('inputs.json', schedule)
await save('manifest.json', {
  protocol: transportCheck ? 'completion-transport-1' : 'completion-review-shadow-1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sources,
  sourceHashes: hashes,
  model: AGENT_MODEL,
  provider: 'Wafer',
  maxCostUsd: limitUsd,
  maxRequests: schedule.length,
  requestTimeoutMs: 60000,
  maxOutputTokens: 4096,
  retries: 0,
  reasoning: transportCheck
    ? 'disabled; transport compatibility only'
    : 'low except review-disabled',
  sideEffects:
    'None; no browser or tool execution. Three states are explicitly synthetic negatives. Criteria are stored only in this manifest, never sent to the model.',
  failurePolicy: 'Keep failures; stop only for budget/integrity failures, no replacement trials.',
  schedule: schedule.map(({ state, arm, inputHash }) => ({ ...state, arm, inputHash })),
})
process.env.EXPERIMENT_AGENT_PROVIDER = 'Wafer'
const gateway = await startGateway(key, dir, fetch, {
  limitUsd,
  estimateCost: (body) =>
    Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
    4096 * Number(model.pricing.completion),
})
const records: any[] = []
const cancellation = new AbortController()
const interrupt = () => cancellation.abort(new Error('experiment-interrupted'))
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)
console.log(`${schedule.length} shadow decisions; cap $${limitUsd}; no execution: ${dir}`)
try {
  for (const { state, arm, body, inputHash } of schedule) {
    if (cancellation.signal.aborted) break
    const id = `${state.id}-${arm}`
    const record: any = {
      id,
      state: state.id,
      arm,
      inputHash,
      synthetic: !!state.variant,
      semanticReview: 'pending',
    }
    const startedAt = Date.now()
    gateway.begin(id, 1, 60000, {
      agentReasoning: transportCheck || arm === 'review-disabled' ? 'disabled' : 'low',
    })
    try {
      const response = await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60000)]),
      })
      if (!response.ok) {
        const errorBody = gateway.redact(await response.text())
        record.httpErrorBody = errorBody.slice(0, 4096)
        record.budgetExhausted = errorBody.includes('experiment-spending-limit')
        record.configurationFailure = [400, 401, 403, 404, 422].includes(response.status)
        throw Error(`HTTP ${response.status}`)
      }
      const events = (await response.text())
        .split('\n')
        .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
        .map((l) => JSON.parse(l.slice(5)))
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
      if (arm !== 'full-low')
        record.reviewShapeValid =
          record.transportValid &&
          record.calls.length === 1 &&
          completionReviewSchema.safeParse(record.calls[0].args).success
    } catch (error) {
      record.error = gateway.redact(String(error))
      record.transportValid = false
    } finally {
      record.elapsedMs = Date.now() - startedAt
      record.requests = await gateway.end()
      records.push(record)
      await save('records.json', records)
      await save('spending.json', gateway.spending())
      console.log(
        `${id}: ${record.transportValid ? JSON.stringify(record.calls) : (record.error ?? record.finishReason)}; ${record.elapsedMs}ms`,
      )
    }
    if (record.budgetExhausted || (record.configurationFailure && !transportCheck)) break
  }
} finally {
  await save('summary.json', {
    complete: records.length === schedule.length,
    semanticReview: 'pending',
    spending: gateway.spending(),
  })
  await gateway.close()
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', interrupt)
}
