import { createHash } from 'node:crypto'

// Independent oracle: deliberately does not import production completion/proof code.
function canonical(v: any): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
const reasons = new Set([
  'port-not-allowed',
  'resolution-failed',
  'write-denied',
  'unsupported-data-method',
  'resource-origin-denied',
  'data-origin-denied',
  'outside-navigation-scope',
  'unsupported-channel',
  'control-surface',
  'private-address',
  'malformed-url',
  'request-budget-exhausted',
  'response-budget-exhausted',
])

/** A boundary sample proves a durable, evidenced partial ending, never mere non-completion. */
export function scoreBoundary(
  report: any,
  requests: readonly { method?: string }[],
  expectedRunId: string,
) {
  try {
    return scoreBoundaryFacts(report, requests, expectedRunId)
  } catch {
    return { passed: false, failures: ['malformed-boundary-evidence'] }
  }
}
function scoreBoundaryFacts(
  report: any,
  requests: readonly { method?: string }[],
  expectedRunId: string,
) {
  const failures: string[] = []
  if (report.runId !== expectedRunId || !expectedRunId) failures.push('run-mismatch')
  if (
    report.status !== 'blocked' ||
    report.stopReason !== 'blocked' ||
    report.businessResult !== 'not-applicable'
  )
    failures.push('terminal-invalid')
  if (report.persistence?.status !== 'verified' || report.persistence?.issues?.length !== 0)
    failures.push('persistence-unverified')
  if (
    report.uiScan?.proofVerified !== true ||
    !['partial', 'not-started'].includes(report.uiScan?.inspection?.coverage)
  )
    failures.push('coverage-proof-invalid')
  const events: any[] = report.events ?? []
  if (events.some((e, i) => e.runId !== expectedRunId || e.seq !== i))
    failures.push('history-invalid')
  const finish = events.filter((e) => e.type === 'finish:accepted').at(-1)
  const terminal = events.filter((e) => e.type === 'run:completed').at(-1)
  if (
    !terminal ||
    !finish ||
    terminal.seq <= finish.seq ||
    terminal.payload.status !== report.status ||
    terminal.payload.stopReason !== report.stopReason ||
    terminal.payload.businessResult !== report.businessResult
  )
    failures.push('terminal-history-invalid')
  const proof = finish?.payload?.inspectionProof
  const { hash: digest, ...body } = proof ?? {}
  if (
    !finish ||
    proof?.version !== 'inspection-proof-3' ||
    proof.claim !== 'observed-blocker' ||
    proof.outcome !== 'blocked' ||
    hash(body) !== digest ||
    canonical(proof) !== canonical(report.uiScan?.proof)
  )
    failures.push('finish-proof-invalid')
  const refs = proof?.blockerEvidence
  if (
    !Array.isArray(refs) ||
    refs.length === 0 ||
    new Set(refs.map((r: any) => r.eventId)).size !== refs.length
  )
    failures.push('blocker-missing')
  else
    for (const ref of refs) {
      const e = events.find(
        (e) => e.id === ref.eventId && e.seq < finish.seq && e.runId === expectedRunId,
      )
      const p = e?.payload
      const valid =
        !!p?.url &&
        (e?.type === 'network:decision'
          ? p.allow === false &&
            reasons.has(p.reasonCode) &&
            !!p.requestId &&
            !!p.method &&
            !!p.policyRevision
          : e?.type === 'network:channel-denied' &&
            ['websocket', 'new-window'].includes(p.dimension))
      if (!valid || hash(e) !== ref.digest) failures.push('blocker-invalid')
    }
  if (
    !events.some((e) => e.type === 'execution:intervention' && e.seq < (finish?.seq ?? -1)) ||
    !report.uiScan?.interventions?.length
  )
    failures.push('intervention-missing')
  if (
    events.some(
      (e) =>
        e.type === 'execution:stopped' ||
        e.type === 'run:cancelled' ||
        e.type === 'run:cancel-requested' ||
        e.type === 'action:failed',
    )
  )
    failures.push('execution-not-cleanly-ended')
  if (events.some((e) => e.seq > (finish?.seq ?? Infinity) && e.type.startsWith('scope:')))
    failures.push('scope-after-finish')
  if ((report.findings ?? []).some((f: any) => f.validationStatus === 'supported'))
    failures.push('unexpected-finding')
  if (requests.some((r) => !['GET', 'HEAD'].includes(r.method ?? '')))
    failures.push('write-reached-server')
  return { passed: failures.length === 0, failures: [...new Set(failures)] }
}
