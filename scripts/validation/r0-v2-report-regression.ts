/** Read-only replay of the final report fix; never launches a model/browser or changes evidence. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { defaultCheckArtifactIssues } from '../../src/inspection/check-artifacts.ts'

if (!process.argv[2]) throw Error('Pass a retained free API evidence directory')
const root = resolve(process.argv[2])
const output = resolve(
  'data/r0-default-check-v2',
  'report-regression-' + new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(output, { recursive: true })
const rows = JSON.parse(
  execFileSync(
    'python3',
    [
      '-c',
      "import sqlite3,json,sys\nc=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);c.row_factory=sqlite3.Row\nprint(json.dumps([dict(r) for r in c.execute('select * from artifacts')]))",
      join(root, 'runs.db'),
    ],
    { encoding: 'utf8' },
  ),
)
const checks: any[] = []
for (const mode of ['explicit-fail', 'numeric-fail']) {
  const report = JSON.parse(await readFile(join(root, mode + '-report.json'), 'utf8'))
  const artifacts = rows
    .filter((a: any) => a.run_id === report.runId)
    .map((a: any) => ({
      id: a.id,
      type: a.type,
      path: a.file_path,
      metadata: JSON.parse(a.metadata),
    }))
  const genericSeq = report.events.find(
    (e: any) => e.type === 'interaction:generic-collected-v2',
  )?.seq
  const scope = report.events.find(
    (e: any) =>
      e.type === 'scope:item-updated' &&
      e.seq < genericSeq &&
      e.payload.checks?.effects.some((r: any) => r.state === 'failed'),
  )
  if (!scope) throw Error('Missing real pre-generic publication window')
  const prefix = report.events.filter((e: any) => e.seq <= scope.seq)
  const run: any = {
    id: report.runId,
    spec: { kind: 'ui-scan', uiContract: report.uiScan.contract },
    status: 'running',
  }
  const receipt = JSON.parse(
    await readFile(artifacts.find((a: any) => a.type === 'generic-interaction').path, 'utf8'),
  )
  const postRef = receipt.after[0].refs.find((ref: string) =>
    artifacts.some((a: any) => a.id === ref && a.type === 'check-source-observation'),
  )
  if (!postRef) throw Error('Missing baseline feedback sample')
  const cases = [
    { name: 'actual-active-publication', events: prefix, artifacts, expected: null },
    { name: 'actual-settled-publication', events: report.events, artifacts, expected: null },
    {
      name: 'forged-active-measurement-action',
      events: (() => {
        const events = structuredClone(prefix)
        const measured = events.find((e: any) => e.type === 'interaction:effect-measured-v2')
        const action = events.find(
          (e: any) => e.type === 'action:executing' && e.actionId === measured.actionId,
        )
        action.actionId = measured.actionId = 'forged-action'
        return events
      })(),
      artifacts,
      expected: 'v2-effect-receipt-invalid',
    },
    {
      name: 'active-generic-action-mismatch',
      events: (() => {
        const events = structuredClone(prefix)
        events.at(-1).payload.checks.generic.actionId = 'other-action'
        return events
      })(),
      artifacts,
      expected: 'v2-effect-receipt-invalid',
    },
    {
      name: 'missing-dispatch',
      events: report.events.filter((e: any) => e.type !== 'action:executing'),
      artifacts,
      expected: 'v2-generic-action-association-invalid',
    },
    {
      name: 'missing-generic-artifact',
      events: report.events,
      artifacts: artifacts.filter((a: any) => a.type !== 'generic-interaction'),
      expected: 'v2-artifact-unowned-or-intervened',
    },
    {
      name: 'missing-feedback-artifact',
      events: report.events,
      artifacts: artifacts.filter((a: any) => a.id !== postRef),
      expected: 'v2-feedback-sample-bytes-mismatch',
    },
    {
      name: 'missing-page-source-review',
      events: report.events.filter((e: any) => e.type !== 'interaction:page-sources-reviewed-v2'),
      artifacts,
      expected: 'v2-page-source-review-missing',
    },
  ]
  for (const test of cases) {
    const issues = await defaultCheckArtifactIssues(run, test.events, test.artifacts)
    checks.push({
      mode,
      case: test.name,
      expected: test.expected,
      issues,
      passed:
        test.expected === null
          ? issues.length === 0
          : issues.some((i) => i.startsWith(test.expected!)),
    })
  }
}
await writeFile(
  join(output, 'results.json'),
  JSON.stringify(
    {
      inputRoot: root,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      scope: 'production report association regression; not independent scoring',
      usesOriginalArtifactMetadata: true,
      checks,
      newRealModelCalls: 0,
      newPaidCostUsd: 0,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  JSON.stringify({ output, total: checks.length, passed: checks.filter((c) => c.passed).length }),
)
if (checks.some((c) => !c.passed)) process.exitCode = 1
