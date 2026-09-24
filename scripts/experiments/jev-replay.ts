import 'dotenv/config'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AGENT_MODEL, startGateway } from './openrouter-gateway.ts'
import {
  choiceSchema,
  completionQuestion,
  deepseekChoiceBody,
  jevAnswerSchema,
  sharedCompletionState,
} from './completion-choice.ts'

if (process.argv.length > 2) throw Error('No runtime protocol overrides')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('Missing OPENROUTER_API_KEY')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze clean commit before paid replay')
const source = resolve('data/completion-replay/2026-09-24T09-33-40-127Z')
const raw = await readFile(resolve(source, 'inputs.json'), 'utf8')
const originals: any[] = JSON.parse(raw).filter((item: any) => item.arm === 'full-low')
if (originals.length !== 10) throw Error('Expected ten frozen states')
const model = 'typesafe/jev-1.13'
const expectedJevSnapshot = 'typesafe/jev-1.13-20260917'
const frozen = originals.flatMap((item, index) => {
  const state = sharedCompletionState(item.body)
  const jev = { model, state, questions: { completion: completionQuestion } }
  if (Buffer.byteLength(JSON.stringify(jev)) + 1024 > 32000)
    throw Error('State exceeds conservative one-question context bound')
  const stateHash = createHash('sha256').update(JSON.stringify(state)).digest('hex')
  return (index % 2 ? ['jev', 'deepseek'] : ['deepseek', 'jev']).map((arm) => ({
    id: `${item.state.id}-${arm}`,
    stateId: item.state.id,
    synthetic: !!item.state.variant,
    criterion: item.state.criterion,
    arm,
    stateHash,
    body: arm === 'jev' ? jev : deepseekChoiceBody(AGENT_MODEL, state),
  }))
})
const dir = resolve('data/jev-replay', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
const [list, jevMetadata] = await Promise.all([
  fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) }).then((r) =>
    r.json(),
  ) as Promise<any>,
  fetch('https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints', {
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json()) as Promise<any>,
])
const deepseek = list.data.find((m: any) => m.id === AGENT_MODEL)
const jevEndpoint = jevMetadata.data?.endpoints?.find((e: any) => e.provider_name === 'TypeSafe')
if (
  !deepseek ||
  !jevEndpoint ||
  jevEndpoint.context_length !== 32000 ||
  Number(jevEndpoint.pricing?.prompt) !== 0.000000042 ||
  Number(jevEndpoint.pricing?.completion) !== 0
)
  throw Error('Frozen model/pricing contract changed')
if (
  !Number.isFinite(Number(deepseek.pricing?.prompt)) ||
  !Number.isFinite(Number(deepseek.pricing?.completion))
)
  throw Error('Missing DeepSeek pricing')
await save('models.json', { deepseek, jev: jevMetadata })
await save('inputs.json', frozen)
await save('manifest.json', {
  protocol: 'shared-completion-choice-1',
  source,
  sourceHash: createHash('sha256').update(raw).digest('hex'),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  maxRequests: 20,
  retries: 0,
  costLimitUsd: 0.2,
  deepseekLimitUsd: 0.18,
  jevLimitUsd: 0.02,
  deepseek: {
    model: AGENT_MODEL,
    provider: 'Wafer',
    reasoning: 'low',
    timeoutMs: 60000,
    maxOutputTokens: 4096,
  },
  jev: {
    model,
    expectedSnapshot: expectedJevSnapshot,
    provider: 'TypeSafe',
    timeoutMs: 15000,
    reservationPerRequestUsd: 0.001344,
  },
  assumptions:
    'One question per request, unchanged public facts and identical choice criteria. Ten states include three synthetic negatives. No browser or tool execution. No free-text rationale from either model. Criteria stored in this manifest are not sent to either model.',
  qualification:
    'No premature finish, preserve five exploration states, converge five admissible end states with domain-correct finish choice. Raw probabilities do not prove calibration. Retain all failures; no missing-cell replacement.',
  schedule: frozen.map(({ body, ...item }) => ({
    ...item,
    inputHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  })),
})
process.env.EXPERIMENT_AGENT_PROVIDER = 'Wafer'
const gateway = await startGateway(key, dir, fetch, {
  limitUsd: 0.18,
  estimateCost: (body) =>
    Buffer.byteLength(JSON.stringify(body)) * Number(deepseek.pricing.prompt) +
    4096 * Number(deepseek.pricing.completion),
})
const cancellation = new AbortController()
const stop = () => cancellation.abort(new Error('experiment-interrupted'))
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const records: any[] = []
let jevKnown = 0,
  jevUnknown = 0,
  jevUnknownCount = 0
const spending = () => ({
  deepseek: gateway.spending(),
  jev: {
    knownCostUsd: jevKnown,
    unknownReservedUsd: jevUnknown,
    unknownCosts: jevUnknownCount,
    limitUsd: 0.02,
  },
})
console.log(`20 frozen choices, cap $0.20; no execution: ${dir}`)
try {
  for (const trial of frozen) {
    if (cancellation.signal.aborted) break
    const record: any = {
      id: trial.id,
      stateId: trial.stateId,
      arm: trial.arm,
      synthetic: trial.synthetic,
      stateHash: trial.stateHash,
    }
    if (trial.arm === 'jev' && jevKnown + jevUnknown + 0.001344 > 0.02)
      throw Error('Jev spending cap')
    await save('inflight.json', {
      id: trial.id,
      startedAt: new Date().toISOString(),
      reservationUsd: trial.arm === 'jev' ? 0.001344 : null,
    })
    if (trial.arm === 'deepseek') gateway.begin(trial.id, 1, 60000)
    const started = Date.now()
    try {
      const response = await fetch(
        trial.arm === 'jev'
          ? 'https://openrouter.ai/api/alpha/decisions'
          : gateway.url + '/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${trial.arm === 'jev' ? key : gateway.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(trial.body),
          signal: AbortSignal.any([
            cancellation.signal,
            AbortSignal.timeout(trial.arm === 'jev' ? 15000 : 60000),
          ]),
        },
      )
      record.httpStatus = response.status
      const text = gateway.redact(await response.text())
      if (!response.ok) {
        record.httpError = text.slice(0, 4096)
        record.fatal =
          [400, 401, 403, 404, 422].includes(response.status) ||
          text.includes('experiment-spending-limit')
        throw Error(`HTTP ${response.status}`)
      }
      if (trial.arm === 'jev') {
        const result = JSON.parse(text)
        record.rawResponse = result
        if (result.model !== expectedJevSnapshot || result.provider !== 'TypeSafe') {
          record.fatal = true
          throw Error('Unexpected Jev model/provider')
        }
        const answer = jevAnswerSchema.parse(result.answers?.completion)
        record.choice = answer.choice
        record.confidence = answer.confidence
        record.probabilities = answer.probabilities
      } else {
        const events = text
          .split('\n')
          .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
          .map((l) => JSON.parse(l.slice(5)))
        const calls = new Map<number, { name: string; arguments: string }>()
        for (const event of events) {
          if (event.error) throw Error('stream-error')
          const choice = event.choices?.[0]
          if (choice?.finish_reason) record.finishReason = choice.finish_reason
          for (const c of choice?.delta?.tool_calls ?? []) {
            const value = calls.get(c.index) ?? { name: '', arguments: '' }
            value.name += c.function?.name ?? ''
            value.arguments += c.function?.arguments ?? ''
            calls.set(c.index, value)
          }
        }
        const call = [...calls.values()][0]
        if (
          record.finishReason !== 'tool_calls' ||
          calls.size !== 1 ||
          call?.name !== 'choose_completion'
        )
          throw Error('Invalid choice output')
        record.choice = choiceSchema.parse(JSON.parse(call.arguments)).choice
      }
      record.valid = true
    } catch (error) {
      record.valid = false
      record.error = gateway.redact(String(error))
    } finally {
      record.elapsedMs = Date.now() - started
      if (trial.arm === 'deepseek') record.requests = await gateway.end()
      else {
        const cost = record.rawResponse?.usage?.cost
        if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
          jevKnown += cost
          if (cost > 0.001344) record.fatal = true
        } else {
          jevUnknown += 0.001344
          jevUnknownCount++
        }
      }
      records.push(record)
      await save('records.json', records)
      await save('spending.json', spending())
      await save('inflight.json', null)
      console.log(
        `${trial.id}: ${record.valid ? record.choice : record.error}; ${record.elapsedMs}ms`,
      )
    }
    if (record.fatal) break
  }
} finally {
  await gateway.close()
  await save('summary.json', {
    complete: records.length === 20,
    semanticReview: 'pending',
    spending: spending(),
  })
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
}
