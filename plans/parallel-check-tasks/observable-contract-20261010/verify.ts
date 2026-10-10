/** Offline replay of the archived free product runs. Reads archives; mutates only a scratch DB. */
import { readFile, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
const base = resolve('plans/parallel-check-tasks/observable-contract-20261010')
const scratch = await mkdtemp(join(tmpdir(), 'observable-popup-'))
await copyFile(join(base, 'evidence/runs.db'), join(scratch, 'runs.db'))
process.env.DATABASE_URL = 'file:' + join(scratch, 'runs.db')
const { getDbClient } = await import('../../../src/storage/database.ts')
const { getRunSnapshot } = await import('../../../src/execution/run-manager.ts')
const { completionIssues } = await import('../../../src/execution/completion-integrity.ts')
const { defaultCheckArtifactIssues } = await import('../../../src/inspection/check-artifacts.ts')
const { popupReport } = await import('../../../src/server/reports/popup-report.ts')
const rows = JSON.parse(await readFile(join(base, 'evidence/result.json'), 'utf8')).rows
const index = JSON.parse(await readFile(join(base, 'artifact-index.json'), 'utf8'))
const checks = []
try {
  for (const row of rows) {
    const { run, events } = (await getRunSnapshot(row.runId))!
    const artifacts = index
      .filter((a: any) => a.runId === row.runId)
      .map((a: any) => ({ ...a, path: resolve(base, a.path) }))
    for (const a of artifacts)
      if (
        createHash('sha256')
          .update(await readFile(a.path))
          .digest('hex') !== a.sha256
      )
        throw Error('changed archived artifact: ' + a.id)
    const issues = [
      ...completionIssues(run, events),
      ...(await defaultCheckArtifactIssues(run, events, artifacts)),
    ]
    const popup = popupReport(run, events, new Set<string>(artifacts.map((a: any) => a.id)), issues)
    checks.push({
      name: row.name,
      runId: row.runId,
      issues,
      popupReportMatches: JSON.stringify(popup) === JSON.stringify(row.popup),
      artifacts: artifacts.length,
    })
  }
  await writeFile(
    join(base, 'offline-integrity.json'),
    JSON.stringify({ realCalls: 0, checks }, null, 2) + '\n',
  )
  console.log(JSON.stringify(checks))
  if (checks.some((c) => c.issues.length || !c.popupReportMatches)) process.exitCode = 1
} finally {
  getDbClient().close()
  await rm(scratch, { recursive: true, force: true })
}
