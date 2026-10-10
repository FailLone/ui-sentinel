import { readFile, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { popupArtifactIssues } from '../../../src/inspection/popup-artifacts.ts'
import { popupReport } from '../../../src/server/reports/popup-report.ts'
const base = resolve('plans/parallel-check-tasks/semantic-purpose-20261010')
const index = JSON.parse(await readFile(base+'/free-artifact-index.json','utf8'))
const summary = JSON.parse(await readFile(base+'/free-summary.json','utf8'))
const db = new DatabaseSync(base+'/free-evidence/runs.db', {readOnly:true})
const checks = []
for (const run of summary.runs) {
  const report = JSON.parse(await readFile(base+'/free-evidence/'+(run.runId.startsWith('run-')?'P02-parent.json':'P02-'+run.runId+'.json'),'utf8'))
  const artifacts = index.filter((a:any)=>a.runId===run.runId).map((a:any)=>({...a,path:resolve(base,a.path)}))
  for (const a of artifacts) if (createHash('sha256').update(await readFile(a.path)).digest('hex')!==a.sha256) throw Error('archive-bytes-changed')
  const input:any = {spec:JSON.parse(String(db.prepare('SELECT spec FROM runs WHERE id=?').get(run.runId)!.spec))}
  const issues = await popupArtifactIssues(input,report.events,artifacts)
  if (issues.length) throw Error(JSON.stringify(issues))
  const popup = popupReport(input,report.events,new Set(artifacts.map((a:any)=>a.id)),issues)
  if (JSON.stringify(popup)!==JSON.stringify(report.uiScan.popupCheck)) throw Error('offline-report-mismatch')
  checks.push({runId:run.runId,ownedArtifacts:artifacts.length,issues,verdict:popup?.verdict??null,candidateCount:popup?.candidateGeometry?.length??0,offlinePopupReportMatches:true})
}
db.close()
await writeFile(base+'/offline-archive-checks.json',JSON.stringify({checks},null,2)+'\n')
console.log(JSON.stringify(checks))
