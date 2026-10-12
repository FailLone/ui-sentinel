import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { digest } from '../../../src/agent/exploration/integration/host.ts'
import { validPathProgram } from '../../../src/execution/path-reuse/library.ts'
import { hashTree } from '../../validation/url-scan-freeze.ts'
import {
  policy as originalPolicy,
  manifest as originalManifest,
  htmlFor,
  publicInput,
  assess,
  quoteUrl,
  validateQuote,
} from '../../acceptance/path-reuse/policy.ts'
export { htmlFor, publicInput, assess, quoteUrl, validateQuote }
export const seed = 'data/r3-path-acceptance/real-2026-10-12T0111Z'
export const policy = {
  ...originalPolicy,
  revision: 'r3-handoff-recheck-1',
  maxRuns: 1,
  maxRequests: 12,
  maxCostUsd: 0.96,
  authorRequests: 0,
} as const
export const rows = [
  {
    id: 'handoff',
    scenario: 'ambiguous',
    mode: 'program',
    maxAgentRequests: 12,
    maxJevRequests: 0,
  },
] as const
export const freeRows = [
  { ...rows[0]!, id: 'handoff-direct' },
  { ...rows[0]!, id: 'handoff-denied-batch' },
  { ...rows[0]!, id: 'reuse', scenario: 'healthy', maxAgentRequests: 0 },
  { ...rows[0]!, id: 'defect', scenario: 'defect', maxAgentRequests: 0 },
  { ...rows[0]!, id: 'source-mismatch', scenario: 'healthy' },
]
export function verifySeed() {
  const read = (p: string) => JSON.parse(readFileSync(join(seed, p), 'utf8'))
  const saved = read('saved-program.json'),
    program = saved.program,
    author = read('author/report.json')
  if (
    !validPathProgram(program) ||
    program.provenance.runId !== author.runId ||
    !assess('author', author).ok
  )
    throw Error('historical-real-author-invalid')
  if (
    program.id !== 'path-e4372d907490158d284d7fc85ab6fc235f6cb27566b3ed6ca0302f1a12c84133' ||
    program.entryUrl !== 'http://127.0.0.1:59228/'
  )
    throw Error('historical-candidate-substitution')
  if (existsSync(join(seed, 'runs.db-wal'))) throw Error('historical-database-not-sealed')
  const hashes = [
    'saved-program.json',
    'runs.db',
    'author/request.json',
    'author/report.json',
    'author/events.json',
    'author/artifact-index.json',
    'requests.jsonl',
    'responses.jsonl',
    'accounting.json',
  ].map((p) => ({
    path: join(seed, p),
    sha256: createHash('sha256')
      .update(readFileSync(join(seed, p)))
      .digest('hex'),
  }))
  for (const a of read('author/artifact-index.json')) {
    for (const path of [a.file, join('data/artifacts', author.runId, a.id)]) {
      const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
      if (sha256 !== a.sha256) throw Error('historical-author-evidence-changed')
      hashes.push({ path, sha256 })
    }
  }
  return { saved, program, author, hashes }
}
export async function manifest() {
  const previous = await originalManifest()
  const history = verifySeed()
  return {
    ...previous,
    revision: policy.revision,
    policy,
    rows,
    sourceCommit: execFileSync(
      'git',
      ['log', '-1', '--format=%H', '--', 'src', 'scripts/research/path-handoff'],
      { encoding: 'utf8' },
    ).trim(),
    runner: await hashTree('scripts/research/path-handoff'),
    originalRunner: previous.runner,
    historicalProtocol: previous.protocol,
    protocol: digest(readFileSync('evaluation/archive/protocols/path-handoff.md', 'utf8')),
    historical: {
      hashes: history.hashes,
      programId: history.program.id,
      provenance: history.program.provenance,
    },
    input: { ...publicInput(history.program.origin), pathProgramId: history.program.id },
    pages: [{ id: 'handoff', sha256: digest(htmlFor('ambiguous')) }],
    retainedEvidence:
      'Prior real A/B/C only; this is a single D regression, not a new four-row pass.',
  }
}
export function authorize(frozen: unknown, approval: any, current: unknown) {
  if (digest(frozen) !== digest(current)) throw Error('frozen-input-or-build-changed')
  if (
    approval?.manifestHash !== digest(frozen) ||
    approval.maxRuns !== 1 ||
    approval.maxRequests !== 12 ||
    approval.maxCostUsd !== 0.96 ||
    !approval.approvedBy?.trim() ||
    !approval.approvalReference?.trim() ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) <= Date.now()
  )
    throw Error('new-d-specific-approval-required')
}
/** Operator stop gate; free fault-injection rows deliberately exercise refused calls. */
export function executionFailure(events: any[]) {
  for (const event of events) {
    const p = event.payload
    if (event.type === 'execution:intervention') return 'safety-intervention'
    if (['tool:finished', 'model:request-finished'].includes(event.type) && p.status === 'error')
      return 'model-or-tool-error'
    if (event.type === 'finish:rejected') return 'finish-rejected'
    if (
      event.type === 'agent:response' &&
      p.toolResults?.some((t: any) => t.type === 'tool-error' || t.payload?.result?.error)
    )
      return 'tool-call-refused'
  }
  return undefined
}
