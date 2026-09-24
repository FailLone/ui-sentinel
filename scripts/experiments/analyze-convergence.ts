// Offline evidence index. No model calls and no semantic pass decisions.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

if (!process.argv[2]) throw Error('Provide an experiment directory')
const directory = resolve(process.argv[2])
const load = (name: string) => readFile(join(directory, name), 'utf8')
const [rawRecords, rawRequests, rawResponses, rawManifest] = await Promise.all(
  ['records.json', 'requests.jsonl', 'responses.jsonl', 'manifest.json'].map(load),
)
const lines = (raw: string) =>
  raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
const records = JSON.parse(rawRecords),
  requests = lines(rawRequests),
  responses = lines(rawResponses)
const key = (r: any) => `${r.run}:${r.seq}`
const inputs = new Map(requests.map((r: any) => [key(r), r]))
const outputs = new Map(responses.map((r: any) => [key(r), r]))
const audited = records.map((r: any) => ({
  id: r.id,
  arm: r.arm,
  variant: r.variant,
  runId: r.runId,
  automaticPass: r.passed,
  status: r.report?.status,
  stopReason: r.report?.stopReason,
  reportAvailableMs: r.reportAvailableMs ?? null,
  errors: r.score?.missingFindings ?? [r.error ?? 'missing score'],
  requests: (r.requests ?? []).map((q: any) => {
    const input = inputs.get(key(q)),
      output = outputs.get(key(q))
    const names = new Map<number, string>(),
      finishes = new Set<string>()
    let content = ''
    for (const event of output?.events ?? []) {
      for (const choice of event.choices ?? []) {
        if (choice.finish_reason) finishes.add(choice.finish_reason)
        const message = choice.message ?? choice.delta ?? {}
        if (typeof message.content === 'string') content += message.content
        for (const [i, call] of (message.tool_calls ?? []).entries()) {
          const index = call.index ?? i
          names.set(index, (names.get(index) ?? '') + (call.function?.name ?? ''))
        }
      }
    }
    let nativeActions: string[] = []
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed.action))
        nativeActions = parsed.action.flatMap((a: object) => Object.keys(a))
    } catch {
      /* Non-JSON prose/extraction is not an action. */
    }
    return {
      seq: q.seq,
      model: q.model,
      provider: q.provider,
      status: q.status,
      durationMs: q.durationMs,
      inputBytes: q.inputBytes,
      reasoningPolicy: input?.body?.reasoning,
      inputTokens: q.usage?.prompt_tokens ?? null,
      outputTokens: q.usage?.completion_tokens ?? null,
      reasoningTokens: q.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      costUsd: q.usage?.cost ?? null,
      finishes: [...finishes],
      tools: [...names.values()],
      nativeActions,
      error: q.error ?? null,
    }
  }),
}))
const arms = [...new Set(audited.map((r: any) => r.arm))].map((arm) => {
  const runs = audited.filter((r: any) => r.arm === arm),
    calls = runs.flatMap((r: any) => r.requests)
  const knownCosts = calls.filter((q: any) => typeof q.costUsd === 'number')
  const knownTimes = runs.filter((r: any) => typeof r.reportAvailableMs === 'number')
  return {
    arm,
    runs: runs.length,
    automaticPasses: runs.filter((r: any) => r.automaticPass).length,
    requests: calls.length,
    reportAvailableMs:
      knownTimes.length === runs.length
        ? runs.reduce((n: number, r: any) => n + r.reportAvailableMs, 0)
        : null,
    modelRequestMs: calls.reduce((n: number, q: any) => n + q.durationMs, 0),
    knownCostUsd: knownCosts.reduce((n: number, q: any) => n + q.costUsd, 0),
    unknownCosts: calls.length - knownCosts.length,
    lengthTerminations: calls.filter((q: any) => q.finishes.includes('length')).length,
    unexpectedReasoningWhenDisabled: calls
      .filter(
        (q: any) =>
          q.reasoningPolicy?.enabled === false &&
          typeof q.reasoningTokens === 'number' &&
          q.reasoningTokens > 0,
      )
      .map((q: any) => ({ seq: q.seq, model: q.model, reasoningTokens: q.reasoningTokens })),
    maxInputBytes: calls.length ? Math.max(...calls.map((q: any) => q.inputBytes)) : null,
  }
})
const result = {
  manifest: JSON.parse(rawManifest),
  sourceHashes: Object.fromEntries(
    [
      ['records.json', rawRecords],
      ['requests.jsonl', rawRequests],
      ['responses.jsonl', rawResponses],
      ['manifest.json', rawManifest],
    ].map(([name, value]) => [name, createHash('sha256').update(value).digest('hex')]),
  ),
  semanticReview:
    'Requires independent review of task, tools, measurements and recovery safety; this index does not grade semantics.',
  arms,
  runs: audited,
}
await writeFile(join(directory, 'decision-index.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(arms, null, 2))
