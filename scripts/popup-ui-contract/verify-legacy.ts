import { readFile, writeFile, mkdtemp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const base = resolve('plans/parallel-check-tasks/p02-semantic-real-result-20261010')
const scratch = await mkdtemp(join(tmpdir(), 'p02-semantic-verify-'))
await copyFile(base + '/evidence/runs.db', scratch + '/runs.db')
process.env.DATABASE_URL = 'file:' + scratch + '/runs.db'
const { getDbClient } = await import('../../src/storage/database.ts')
const { getRunSnapshot } = await import('../../src/execution/run-manager.ts')
const { completionIssues } = await import('../../src/execution/completion-integrity.ts')
const { checkTaskArtifactIssues } = await import('../../src/execution/check-tasks/report.ts')
const { popupArtifactIssues } = await import('../../src/inspection/popup-artifacts.ts')
const { popupReport } = await import('../../src/server/reports/popup-report.ts')
const summary = JSON.parse(await readFile(base + '/summary.json', 'utf8'))
const index = JSON.parse(await readFile(base + '/artifact-index.json', 'utf8'))
const checks = []
try {
  for (const r of summary.runs) {
    const snapshot = (await getRunSnapshot(r.runId))!
    const artifacts = index
      .filter((a: any) => a.runId === r.runId)
      .map((a: any) => ({ ...a, path: resolve(base, a.path) }))
    for (const a of artifacts) {
      const original = snapshot.artifactRows.rows.find((row) => row.id === a.id)!
      for (const path of [a.path, String(original.file_path)])
        if (
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex') !== a.sha256
        )
          throw Error('artifact-bytes-changed')
    }
    const completion = completionIssues(snapshot.run, snapshot.events)
    const child = await checkTaskArtifactIssues(snapshot.events, artifacts)
    const popup = await popupArtifactIssues(snapshot.run, snapshot.events, artifacts)
    const projection = popupReport(
      snapshot.run,
      snapshot.events,
      new Set(artifacts.map((a: any) => a.id)),
      [...completion, ...child, ...popup],
    )
    const report = JSON.parse(
      await readFile(
        base +
          '/evidence/' +
          (r.runId.startsWith('run-') ? 'P02-parent.json' : 'P02-' + r.runId + '.json'),
        'utf8',
      ),
    )
    checks.push({
      runId: r.runId,
      status: snapshot.run.status,
      completionIssues: completion,
      childArtifactIssues: child,
      popupArtifactIssues: popup,
      archivedArtifacts: artifacts.length,
      popupReportMatches: JSON.stringify(projection) === JSON.stringify(report.uiScan.popupCheck),
    })
  }
  await writeFile(
    resolve('plans/parallel-check-tasks/observable-contract-20261010/legacy-integrity.json'),
    JSON.stringify(
      {
        mode: 'No model/browser/server; DB scratch copy configured for every nested reader; archive and original owned artifact bytes both matched',
        checks,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(JSON.stringify(checks))
  if (
    checks.some(
      (c) =>
        c.completionIssues.length ||
        c.childArtifactIssues.length ||
        c.popupArtifactIssues.length ||
        !c.popupReportMatches,
    )
  )
    process.exitCode = 1
} finally {
  getDbClient().close()
  await rm(scratch, { recursive: true, force: true })
}
