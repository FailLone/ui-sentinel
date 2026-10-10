import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadPackage, makePacket, baseline, dryRun } from './adapter.ts'
import { sha256 } from '../../../src/agent/decisions/jev-provider/profile.ts'
// This CLI has no transport and accepts no endpoint, secret, browser or executor flags.
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--output')
  throw new Error('usage: cli.ts --output <new-directory>')
const root = resolve('evaluation/fixtures/legacy-runs/r1-decision-pilot/r0-v2-intake'),
  out = resolve(args[1])
const loaded = loadPackage(join(root, 'source'))
const receipt = JSON.parse(readFileSync(join(root, 'RECEIPT.json'), 'utf8'))
for (const f of receipt.files) {
  const b = readFileSync(join(root, f.path))
  if (sha256(b) !== f.sha256 || b.length !== f.bytes) throw new Error('receipt-integrity')
}
mkdirSync(out, { recursive: false })
const files: { path: string; sha256: string; bytes: number }[] = []
function write(path: string, value: unknown, raw = false) {
  const text = raw ? String(value) : JSON.stringify(value, null, 2) + '\n'
  writeFileSync(join(out, path), text)
  files.push({ path, sha256: sha256(text), bytes: Buffer.byteLength(text) })
}
const rows = loaded.rows.map((v) => {
  const packet = makePacket(v),
    result = baseline(packet),
    dry = dryRun(packet)
  write(`${v.state.id}.facts.json`, packet)
  write(`${v.state.id}.baseline.json`, result)
  if (dry.request) write(`${v.state.id}.request.json`, dry.request.wire, true)
  write(`${v.state.id}.dry-run.json`, {
    ...dry,
    request: dry.request ? { ...dry.request, wire: undefined } : null,
  })
  return {
    stateId: v.state.id,
    observed: v.input.candidates.length,
    eligible: packet.eligible.length,
    choice: result.choice,
    ties: result.tiedPriorityGroups,
    executionPath: result.executionPath,
    verifiedProgress: false,
    dryRun: dry.disposition,
    questions: dry.request?.questionCount ?? 0,
  }
})
// Evaluator opens its reference only after all suggestions/requests have been fixed.
const referenceBytes = readFileSync(join(root, 'REFERENCE.json')),
  reference = JSON.parse(referenceBytes.toString())
const comparisons = rows.map((row) => {
  const ref = reference.states.find((r: { stateId: string }) => r.stateId === row.stateId)
  if (!ref) throw new Error('missing-reference')
  const legal =
    row.choice.kind === 'handoff'
      ? ref.handoffAllowed
      : ref.reasonableCandidateIds.includes(row.choice.candidateId)
  return {
    ...row,
    obligationRelevance: legal ? 'supported-development-reference' : 'mismatch',
    rankingSuperiority: 'unknown',
    completeExecutionPath: 'unknown',
    referenceStatus: reference.status,
  }
})
const report = {
  version: 'r1-v2-intake-report-1',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dependencyCommit: receipt.dependencyCommit,
  indexSha256: loaded.indexSha256,
  referenceSha256: sha256(referenceBytes),
  sourceDirectory: relative(process.cwd(), root),
  comparisons,
  denominators: {
    states: rows.length,
    adviceStates: rows.filter((r) => r.choice.kind === 'advice').length,
    multiCandidateStates: rows.filter((r) => r.eligible > 1).length,
    discriminatingPreferenceReferences: 0,
    executionPathsProven: 0,
  },
  httpRequests: 0,
  browserRuns: 0,
  newModelCostUsd: 0,
  futureRequestQuoteUsd: null,
  files,
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      output: relative(process.cwd(), out),
      denominators: report.denominators,
      rows: comparisons,
      httpRequests: 0,
    },
    null,
    2,
  ),
)
