import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const args = process.argv.slice(2).filter((arg) => arg !== '--')
const runId = args[args.indexOf('--run') + 1]
if (!args.includes('--run') || !runId || !/^[\w-]+$/.test(runId)) {
  console.error('Usage: pnpm report -- --run RUN_ID')
  process.exit(1)
}
try {
  const base = process.env.SERVER_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4111}`
  const response = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}/report`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Report unavailable: HTTP ${response.status}`)
  const report = await response.json()
  const dir = resolve('data/reports')
  await mkdir(dir, { recursive: true })
  const path = resolve(dir, `${runId}.json`)
  await writeFile(path, JSON.stringify(report, null, 2) + '\n')
  console.log(`Web: ${base}/?run=${encodeURIComponent(runId)}\nJSON: ${path}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Report export failed')
  process.exitCode = 1
}
