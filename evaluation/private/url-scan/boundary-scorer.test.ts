import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { scoreBoundary } from './boundary-scorer.ts'

const canonical = (v: any): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',')}}`
      : JSON.stringify(v)
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
function base() {
  const event = (type: string, seq: number, payload: any) => ({
    id: 'e' + seq,
    runId: 'r',
    seq,
    type,
    payload,
  })
  const denial = event('network:decision', 0, {
    allow: false,
    reasonCode: 'write-denied',
    requestId: 'n',
    method: 'POST',
    url: 'https://example.org/write',
    policyRevision: '1',
  })
  const body = {
    version: 'inspection-proof-3',
    claim: 'observed-blocker',
    outcome: 'blocked',
    blockerEvidence: [{ eventId: denial.id, digest: hash(denial) }],
  }
  const proof = { ...body, hash: hash(body) }
  return {
    runId: 'r',
    status: 'blocked',
    stopReason: 'blocked',
    businessResult: 'not-applicable',
    persistence: { status: 'verified', issues: [] },
    findings: [],
    uiScan: {
      proofVerified: true,
      proof,
      inspection: { coverage: 'partial' },
      interventions: [{}],
    },
    events: [
      denial,
      event('execution:intervention', 1, {}),
      event('finish:accepted', 2, { inspectionProof: proof }),
      event('run:completed', 3, {
        status: 'blocked',
        stopReason: 'blocked',
        businessResult: 'not-applicable',
      }),
    ],
  } as any
}
it('requires an actual durable boundary ending, not just partial text or a scorer self-report', () => {
  expect(scoreBoundary(base(), [{ method: 'GET' }], 'r').passed).toBe(true)
  for (const mutate of [
    (r: any) => {
      r.status = 'interrupted'
      r.stopReason = 'reconciliation-required'
      r.persistence.status = 'not-final'
      r.uiScan.proofVerified = false
    },
    (r: any) => {
      r.status = 'cancelled'
    },
    (r: any) => {
      r.persistence.issues = ['bad-history']
    },
    (r: any) => {
      r.events.pop()
    },
    (r: any) => {
      r.events[3].payload.stopReason = 'execution-error'
    },
    (r: any) => {
      r.events[0].runId = 'other'
    },
    (r: any) => {
      r.events[0].seq = 3
    },
    (r: any) => {
      r.events[0].payload.requestId = 'other'
    },
    (r: any) => {
      r.uiScan.proof.blockerEvidence = [null]
    },
    (r: any) => {
      r.events[1].type = 'action:failed'
    },
    (r: any) => {
      r.uiScan.proof = undefined
    },
  ]) {
    const r = base()
    mutate(r)
    expect(scoreBoundary(r, [], 'r').passed).toBe(false)
  }
  expect(scoreBoundary(base(), [{ method: 'POST' }], 'r').passed).toBe(false)
  expect(scoreBoundary(base(), [], 'other').passed).toBe(false)
})
it('rejects an allowed or failed execution request even if all JSON hashes are recomputed', () => {
  for (const reason of ['allowed', 'transport-error', 'execution-stopped']) {
    const r = base()
    r.events[0].payload.allow = reason === 'allowed'
    r.events[0].payload.reasonCode = reason
    const proof = r.uiScan.proof
    proof.blockerEvidence[0].digest = hash(r.events[0])
    const { hash: _hash, ...body } = proof
    proof.hash = hash(body)
    expect(scoreBoundary(r, [], 'r').failures).toContain('blocker-invalid')
  }
})
