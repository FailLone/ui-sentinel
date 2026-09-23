import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Offline only: never reads credentials, calls a model, or executes recorded tools.
const source = resolve(process.argv[2] ?? 'data/acceptance/2026-09-23T15-47-07-984Z')
const destination = resolve(process.argv[3] ?? 'data/decision-audit/default-2026-09-23')
await mkdir(destination, { recursive: true })
const hashes: Record<string, string> = {}
async function lines(file: string) {
  const raw = await readFile(resolve(source, file), 'utf8')
  hashes[file] = createHash('sha256').update(raw).digest('hex')
  return raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}
const requests = await lines('requests.jsonl')
const responses = await lines('responses.jsonl')
const ledger = await lines('ledger.jsonl')
const records = []
for (const request of requests) {
  if (!['diagnostic-C2-1', 'diagnostic-C5-1'].includes(request.run)) continue
  const match = (r: any) => r.run === request.run && r.seq === request.seq
  const response = responses.find(match)
  const usage = ledger.find(match)
  if (!response || !usage) throw Error(`Missing response/ledger: ${request.run}/${request.seq}`)
  const input = JSON.parse(request.body.messages.find((m: any) => m.role === 'user').content)
  const calls = new Map<number, { name: string; arguments: string }>()
  for (const event of response.events) {
    for (const choice of event.choices ?? []) {
      for (const call of (choice.delta ?? choice.message)?.tool_calls ?? []) {
        const value = calls.get(call.index ?? 0) ?? { name: '', arguments: '' }
        value.name += call.function?.name ?? ''
        value.arguments += call.function?.arguments ?? ''
        calls.set(call.index ?? 0, value)
      }
    }
  }
  const next = requests.find((r: any) => r.run === request.run && r.seq === request.seq + 1)
  const nextInput = next
    ? JSON.parse(next.body.messages.find((m: any) => m.role === 'user').content)
    : null
  const report = JSON.parse(
    await readFile(resolve(source, `diagnostic/${request.run.slice(11)}.json`), 'utf8'),
  ).report
  const modelEvents = report.events.filter((e: any) => e.type === 'model:request-finished')
  records.push({
    run: request.run,
    seq: request.seq,
    requestHash: createHash('sha256').update(JSON.stringify(request.body)).digest('hex'),
    model: request.model,
    provider: usage.provider,
    durationMs: usage.durationMs,
    headersMs: usage.firstByteMs,
    usage: usage.usage,
    timing: modelEvents[request.seq - 1]?.payload,
    snapshotId: input.inspection?.snapshotId,
    evidenceRefs: input.evidenceRefs,
    inputFacts: {
      inspection: input.inspection,
      ruleCatalog: input.ruleCatalog,
      knownRules: input.knownRules,
      observation: input.observation,
      task: input.task,
      businessOutcomeObserved: input.businessOutcomeObserved,
      finishReadiness: input.finishReadiness,
      submittedFindings: input.submittedFindings,
      latestToolResults: input.latestToolResults,
      history: input.history,
      historyWindow: input.historyWindow,
    },
    calls: [...calls.values()].map((c) => ({ name: c.name, args: JSON.parse(c.arguments) })),
    returnedFacts: nextInput?.latestToolResults ?? null,
    nextSnapshotId: nextInput?.inspection?.snapshotId ?? null,
    terminalEvents: next ? [] : report.events.filter((e: any) => e.type.startsWith('finish:')),
  })
}
if (records.length !== 23) throw Error(`Expected 23 audited requests; found ${records.length}`)
await writeFile(
  resolve(destination, 'audit.json'),
  JSON.stringify({ source, hashes, count: records.length, records }, null, 2) + '\n',
)
console.log(`Audited ${records.length} requests without model calls: ${destination}`)
