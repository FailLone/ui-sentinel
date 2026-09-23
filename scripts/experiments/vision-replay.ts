import 'dotenv/config'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { startGateway, VISION_MODEL } from './openrouter-gateway.ts'
import { visualReviewSchema } from '../../src/execution/evidence-analysis/types.ts'

const source = process.argv[2]
if (!source) throw Error('Usage: tsx scripts/experiments/vision-replay.ts <frozen batch directory>')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('Missing OPENROUTER_API_KEY')
const requestText = await readFile(resolve(source, 'requests.jsonl'), 'utf8')
const request = requestText
  .split('\n')
  .filter(Boolean)
  .map((s) => JSON.parse(s))
  .find((r) => r.run === 'baseline-C2-1' && r.body?.model === VISION_MODEL)
if (!request) throw Error('Missing frozen baseline C2 vision request')
const selected = JSON.parse(await readFile(resolve(source, 'models.json'), 'utf8'))
const model = (Array.isArray(selected) ? selected : selected.data).find(
  (m: any) => m.id === VISION_MODEL,
)
if (!model?.pricing?.prompt || !model?.pricing?.completion)
  throw Error('Missing recorded model price')
const directory = resolve('data/vision-replay', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(directory, { recursive: true })
const write = (name: string, data: unknown) =>
  writeFile(resolve(directory, name), JSON.stringify(data, null, 2) + '\n')
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const gateway = await startGateway(key, directory, fetch, {
  limitUsd: 0.15,
  estimateCost: (body) =>
    Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
    4096 * Number(model.pricing.completion),
})
const results: any[] = []
await write('manifest.json', {
  protocol: 'vision-media-replay-1',
  source: resolve(source),
  sourceHash: hash(requestText),
  model: VISION_MODEL,
  provider: process.env.EXPERIMENT_VISION_PROVIDER,
  requests: 2,
  timeoutMs: 60000,
  retry: 0,
  maxOutputTokens: 4096,
  budgetUsd: 0.15,
})
try {
  for (const label of ['original-label', 'png-label']) {
    const body = structuredClone(request.body)
    if (label === 'png-label')
      for (const message of body.messages) {
        if (Array.isArray(message.content))
          for (const part of message.content) {
            if (part.type === 'image_url')
              part.image_url.url = part.image_url.url.replace(
                /^data:image\/jpeg;base64,/,
                'data:image/png;base64,',
              )
          }
      }
    await write(`${label}-request.json`, body)
    gateway.begin(label, 1, 60000)
    const record: any = { label, bodyHash: hash(JSON.stringify(body)) }
    try {
      const response = await fetch(`${gateway.url}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const text = await response.text()
      let args = ''
      for (const line of text.split('\n'))
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          const item = JSON.parse(line.slice(6))
          if (item.error) throw Error(JSON.stringify(item.error))
          for (const choice of item.choices ?? [])
            for (const call of choice.delta?.tool_calls ?? [])
              args += call.function?.arguments ?? ''
        }
      record.review = visualReviewSchema.parse(JSON.parse(args))
    } catch (error) {
      record.error = gateway.redact(String(error))
    }
    record.requests = await gateway.end()
    results.push(record)
    await write(`${label}.json`, record)
    console.log(
      `${label}: ${record.error ?? record.review.candidates.map((c: any) => c.kind).join(',')}`,
    )
  }
} finally {
  await gateway.end()
  await gateway.close()
  await write('summary.json', { results, spending: gateway.spending() })
  console.log(`Vision replay records: ${directory}`)
}
