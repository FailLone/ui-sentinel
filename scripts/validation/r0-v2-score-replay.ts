import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { defaultCheckArtifactIssues } from '../../src/inspection/check-artifacts.ts'
import {
  auditUiDefaultChecksV2,
  UI_V2_PUBLIC_MATRIX,
  type V2PublicRow,
} from '../../evaluation/ui-default-checks-v2.ts'
const root = resolve(process.argv[2] ?? '')
if (!process.argv[2])
  throw Error('Pass the actual free API evidence directory. No browser/model is launched.')
const output = resolve(
  'data/r0-default-check-v2',
  'score-' + new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(output, { recursive: true })
const rows = JSON.parse(
  execFileSync(
    'python3',
    [
      '-c',
      `import sqlite3,json,sys\nc=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);c.row_factory=sqlite3.Row\nprint(json.dumps([dict(r) for r in c.execute('select id,run_id,type,file_path from artifacts')]))`,
      join(root, 'runs.db'),
    ],
    { encoding: 'utf8' },
  ),
)
const results: any[] = [],
  attacks: any[] = []
const activeReportChecks: any[] = []
const modes: { name: string; row: V2PublicRow }[] = [
  { name: 'neutral-change', row: UI_V2_PUBLIC_MATRIX[0]! },
  { name: 'neutral-no-change', row: UI_V2_PUBLIC_MATRIX[0]! },
  { name: 'explicit-pass', row: UI_V2_PUBLIC_MATRIX[2]! },
  { name: 'explicit-fail', row: { ...UI_V2_PUBLIC_MATRIX[2]!, kind: 'anomaly' } },
  { name: 'numeric-pass', row: UI_V2_PUBLIC_MATRIX[1]! },
  { name: 'numeric-fail', row: UI_V2_PUBLIC_MATRIX[3]! },
]
for (const mode of modes) {
  let report: any
  try {
    report = JSON.parse(await readFile(join(root, mode.name + '-report.json'), 'utf8'))
  } catch {
    continue
  }
  const artifacts = rows
    .filter((a: any) => a.run_id === report.runId)
    .map((a: any) => ({ id: a.id, type: a.type, path: a.file_path }))
  const result = await auditUiDefaultChecksV2({ row: mode.row, report, artifacts })
  results.push({ mode: mode.name, ...result })
  if (!result.accepted)
    throw Error('independent base rejection ' + mode.name + ':' + result.issues.join(','))
  // Separate production-validator regression, using a REAL pre-generic publication window.
  if (mode.row.kind === 'anomaly') {
    const genericSeq = report.events.find(
      (e: any) => e.type === 'interaction:generic-collected-v2',
    )?.seq
    const effectScope = report.events
      .filter(
        (e: any) =>
          e.type === 'scope:item-updated' &&
          e.payload.checks?.effects.some((r: any) => r.state === 'failed'),
      )
      .find((e: any) => e.seq < genericSeq)
    if (!effectScope) throw Error('actual pre-generic effect publication window missing')
    const prefix = report.events.filter((e: any) => e.seq <= effectScope.seq)
    const run: any = {
      id: report.runId,
      spec: {
        kind: 'ui-scan',
        uiContract: { ...report.uiScan.contract, checkPolicy: report.uiScan.contract.checkPolicy },
      },
      status: 'running',
    }
    const audited = await defaultCheckArtifactIssues(
      run,
      prefix,
      artifacts.map((a: any) => ({
        ...a,
        metadata: { evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] } },
      })),
    )
    activeReportChecks.push({ mode: mode.name, cutoffSeq: effectScope.seq, issues: audited })
    if (audited.length) throw Error('active report prematurely failed:' + audited.join(','))
  }
  const item = (r: any) =>
    r.events
      .filter(
        (e: any) =>
          e.type === 'scope:item-updated' &&
          e.payload.checks &&
          e.payload.checks.generic.state === 'collected',
      )
      .at(-1)
  const planned = [
    {
      name: 'omit-selected-item',
      mutate: (r: any) => {
        const id = item(r).payload.itemId
        r.events = r.events.filter((e: any) => e.payload.itemId !== id)
      },
    },
    {
      name: 'forged-generic-receipt',
      mutate: (r: any) => {
        item(r).payload.checks.generic.receiptRef = 'invented.json'
      },
    },
    {
      name: 'all-generic-unknown',
      mutate: (r: any) => {
        for (const e of r.events)
          if (e.payload.checks) e.payload.checks.generic.state = 'unverified'
      },
    },
    {
      name: 'fake-smaller-denominator',
      mutate: (r: any) => {
        const frozen = r.events.find((e: any) => e.type === 'scope:sampling-frozen')
        frozen.payload.pool = []
        frozen.payload.candidates = []
        frozen.payload.count = 0
      },
    },
    ...(mode.row.requiredEffectMinimum
      ? [
          {
            name: 'omit-known-effect',
            mutate: (r: any) => {
              for (const e of r.events) if (e.payload.checks) e.payload.checks.effects = []
            },
          },
          {
            name: 'all-effects-unknown',
            mutate: (r: any) => {
              for (const e of r.events)
                for (const req of e.payload.checks?.effects ?? []) req.state = 'unverified'
            },
          },
        ]
      : []),
    ...(mode.row.kind === 'healthy'
      ? [
          {
            name: 'healthy-false-positive',
            mutate: (r: any) => r.findings.push({ id: 'fake', validationStatus: 'supported' }),
          },
        ]
      : []),
    ...(mode.row.kind === 'anomaly'
      ? [
          {
            name: 'invalid-finding',
            mutate: (r: any) => {
              r.findings = []
            },
          },
        ]
      : []),
  ]
  for (const plan of planned) {
    const changed = structuredClone(report)
    plan.mutate(changed)
    const audited = await auditUiDefaultChecksV2({ row: mode.row, report: changed, artifacts })
    attacks.push({
      mode: mode.name,
      attack: plan.name,
      rejected: !audited.accepted,
      issues: audited.issues,
    })
    if (audited.accepted) throw Error('accepted attack ' + mode.name + '/' + plan.name)
  }
}
await writeFile(
  join(output, 'results.json'),
  JSON.stringify(
    {
      inputRoot: root,
      protocol: 'ui-default-checks-3',
      base: results,
      attacks,
      activeReportChecks,
      newPaidCostUsd: 0,
      realModelCalls: 0,
      importsProductionVerifier: false,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  JSON.stringify({
    output,
    base: results.length,
    attacks: attacks.length,
    allRejected: attacks.every((r) => r.rejected),
  }),
)
