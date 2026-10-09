import { expect, it } from 'vitest'
import { collectUiBlockers, blockerHistoryIssues } from './blocker-evidence.ts'
import { inspectionHistoryIssues } from './proof-history.ts'
import { decideInspectionCompletion, proofDigest } from './completion.ts'
import { createInspectionScope } from './scope.ts'
import { buildUiContractSnapshot } from './contract.ts'
import type { RunEvent, Run } from '../shared/types.ts'

function event(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    id: 'denial',
    runId: 'run-a',
    seq: 0,
    type: 'network:decision',
    timestamp: '2026-10-07',
    stepId: null,
    actionId: null,
    evidenceRefs: [],
    payload: {
      allow: false,
      reasonCode: 'write-denied',
      url: 'https://example.org/write',
      requestId: 'cdp-1',
      method: 'POST',
      policyRevision: 'url-scan-network-1',
    },
    ...overrides,
  }
}
function fixture() {
  const contract = buildUiContractSnapshot({
    entryUrl: 'https://example.org/',
    origin: 'https://example.org',
    goal: 'Inspect',
    scope: { maxPages: 3, maxDepth: 1 },
    access: { resourceOrigins: [], dataOrigins: [] },
    budget: { totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 },
  })
  const run = {
    id: 'run-a',
    spec: { kind: 'ui-scan', uiContract: contract },
    status: 'blocked',
    stopReason: 'blocked',
    businessResult: 'not-applicable',
  } as Run
  const denied = event()
  const proof = decideInspectionCompletion({
    reason: 'observed-blocker',
    facts: {
      kind: 'ui-scan',
      featureEnabled: true,
      spec: run.spec,
      contractValid: true,
      contractHash: contract.hash,
      entryObserved: false,
      entryEvidenceRefs: [],
      integrityEpoch: 1,
      scope: createInspectionScope(),
      scopeEventIds: [],
      pendingRules: 0,
      openHypotheses: 0,
      unsupportedRecorded: [],
      blockerEvidence: collectUiBlockers(run.id, [denied]),
    },
  }).proof!
  const finish = event({
    id: 'finish',
    seq: 1,
    type: 'finish:accepted',
    payload: { reasonCode: 'observed-blocker', inspectionProof: proof },
  })
  return { run, denied, proof, finish }
}
it('accepts only a same-run real refusal, not allowed traffic, stopped work or execution failures', () => {
  const denied = event()
  expect(collectUiBlockers('run-a', [denied])).toHaveLength(1)
  for (const payload of [
    { ...denied.payload, allow: true, reasonCode: 'allowed' },
    { ...denied.payload, reasonCode: 'transport-error' },
    { ...denied.payload, reasonCode: 'execution-stopped' },
    { ...denied.payload, reasonCode: 'invented' },
    { ...denied.payload, requestId: '' },
  ])
    expect(collectUiBlockers('run-a', [event({ payload })])).toEqual([])
  expect(collectUiBlockers('other-run', [denied])).toEqual([])
})
it('binds full blocker identity and payload; duplicate or same-URL different requests cannot substitute', () => {
  const e = event(),
    refs = collectUiBlockers('run-a', [e])
  expect(blockerHistoryIssues('run-a', [e], refs, true)).toEqual([])
  for (const changed of [
    event({ id: 'other' }),
    event({ runId: 'other' }),
    event({ seq: 9 }),
    event({ payload: { ...e.payload, requestId: 'cdp-2' } }),
    event({ payload: { ...e.payload, allow: true } }),
  ])
    expect(blockerHistoryIssues('run-a', [changed], refs, true)).toContain('blocker-proof-mismatch')
  expect(blockerHistoryIssues('run-a', [e], [...refs, ...refs], true)).toContain(
    'blocker-proof-mismatch',
  )
})
it('rechecks actual history ordering, terminal status and missing/tampered blocker in reports', () => {
  const { run, denied, finish } = fixture()
  expect(inspectionHistoryIssues(run, [denied, finish])).toEqual([])
  for (const events of [
    [finish],
    [event({ seq: 2 }), finish],
    [event({ runId: 'other' }), finish],
    [event({ payload: { ...denied.payload, allow: true } }), finish],
  ])
    expect(inspectionHistoryIssues(run, events)).toContain('blocker-proof-mismatch')
  expect(inspectionHistoryIssues({ ...run, status: 'cancelled' }, [denied, finish])).toContain(
    'inspection-proof-outcome-mismatch',
  )
  expect(
    inspectionHistoryIssues(run, [
      denied,
      finish,
      event({ id: 'cancel', seq: 2, type: 'run:cancel-requested', payload: {} }),
    ]),
  ).toContain('inspection-cancelled')
  expect(
    inspectionHistoryIssues(run, [
      denied,
      event({ id: 'failed', seq: 0.5, type: 'action:failed', payload: {} }),
      finish,
    ]),
  ).toContain('inspection-execution-failed')
})
it('does not certify a legacy blocker lacking the sealed facts, even with a recomputed JSON hash', () => {
  const { run, denied, finish, proof } = fixture()
  const { hash: _hash, blockerEvidence: _refs, ...body } = proof
  const legacy = { ...body, version: 'inspection-proof-2' }
  finish.payload.inspectionProof = { ...legacy, hash: proofDigest(legacy) }
  expect(inspectionHistoryIssues(run, [denied, finish])).toContain('blocker-proof-missing')
})
