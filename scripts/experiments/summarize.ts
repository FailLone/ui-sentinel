import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const directory = process.argv[2]
if (!directory) throw Error('Usage: tsx scripts/experiments/summarize.ts data/experiments/<batch>')
const dir = resolve(directory),
  summary = JSON.parse(await readFile(resolve(dir, 'summary.json'), 'utf8')) as any[]
const rows = []
for (const item of summary) {
  const r = JSON.parse(await readFile(resolve(dir, `${item.id}.json`), 'utf8'))
  const knownInput = r.requests.reduce((n: number, q: any) => n + (q.usage?.prompt_tokens ?? 0), 0)
  const knownOutput = r.requests.reduce(
    (n: number, q: any) => n + (q.usage?.completion_tokens ?? 0),
    0,
  )
  const unknown = r.requests.filter(
    (q: any) => q.usage?.prompt_tokens == null || q.usage?.completion_tokens == null,
  ).length
  rows.push({
    id: r.id,
    pass: r.pass,
    completed: r.completed,
    backendCorrect: r.backendCorrect,
    visibleOrderCorrect: r.visibleOrderCorrect,
    requests: r.requests.length,
    failedRequests: r.requests.filter((q: any) => q.status !== 'success').length,
    knownInputTokens: knownInput,
    knownOutputTokens: knownOutput,
    unknownUsageRequests: unknown,
    seconds: Math.round(r.elapsedMs / 1000),
    stop: r.run?.stopReason ?? r.result?.result?.message ?? r.error ?? r.result?.error,
  })
}
const markdown = [
  '# Browser loop experiment results',
  '',
  `Batch: ${dir}`,
  '',
  'Operation task only; this is not a UI defect-discovery evaluation.',
  '',
  '| Trial | Pass | Requests | Known input tokens | Unknown usage requests | Seconds |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${r.id} | ${r.pass} | ${r.requests} | ${r.knownInputTokens} | ${r.unknownUsageRequests} | ${r.seconds} |`,
  ),
  '',
  'Known tokens are a lower bound when any request has unavailable usage. All failures are retained. Native prompts/tool schemas/retry behavior differ between frameworks; current-history changes history projection only.',
  '',
].join('\n')
await writeFile(resolve(dir, 'analysis.json'), JSON.stringify(rows, null, 2) + '\n')
await writeFile(resolve(dir, 'analysis.md'), markdown)
console.log(markdown)
