import { describe, it, expect, beforeAll } from 'vitest'
import { createRun, appendEvent, updateRunStatus } from '../../execution/run-manager.ts'
import { initDatabase } from '../../storage/database.ts'
import { buildUiContractSnapshot } from '../../inspection/contract.ts'
import { decideInspectionCompletion, type InspectionProof } from '../../inspection/completion.ts'
import { createInspectionScope } from '../../inspection/scope.ts'

/**
 * U10/U20: the report a `ui-scan` run produces (plan 6.3).
 *
 * The report is the only place a reader sees what a run actually checked, so these tests assert the
 * parts that would otherwise be invented: the scope is projected from the run's own persisted events,
 * an unverified item stays visibly unverified, the business dimension is reported as not-applicable
 * rather than as a missing value, and a completed UI run without a verified inspection proof is
 * reported as inconsistent instead of complete.
 */
const ENTRY = 'http://127.0.0.1:5055/catalog?x=1&x=2#panel'

function contract() {
  return buildUiContractSnapshot({
    entryUrl: ENTRY,
    origin: 'http://127.0.0.1:5055',
    goal: '检查目录',
    scope: { maxPages: 3, maxDepth: 1 },
    access: { resourceOrigins: [], dataOrigins: [] },
    budget: { totalTimeoutMs: 300_000, maxActions: 20, maxModelCalls: 30 },
  })
}

/** A run whose ledger holds one verified and one unverified item, as a real executor would leave it. */
async function partiallyCoveredRun() {
  const uiContract = contract()
  const run = await createRun({
    goal: uiContract.goal,
    kind: 'ui-scan',
    environmentId: 'default',
    entryUrl: uiContract.entryUrl,
    uiContract,
  })
  const scope = createInspectionScope({ goal: uiContract.goal, entryUrl: uiContract.entryUrl })
  const verified = scope.createItem({
    category: 'entry-observation',
    pageId: 'page-0',
    stateId: 'state-0',
    url: ENTRY,
    observationVersion: 'obs-1',
    basis: 'entry document',
    targetSource: 'executor',
  })
  scope.resolveItem(verified.itemId, {
    status: 'verified',
    evidenceRefs: ['artifact-1'],
    eventIds: [],
    detail: 'entry observed',
  })
  const gap = scope.createItem({
    category: 'local-interaction',
    pageId: 'page-0',
    stateId: 'state-0',
    url: ENTRY,
    observationVersion: 'obs-1',
    basis: 'filter control',
    targetSource: 'agent',
    selected: true,
    selectionBasis: 'visible filter',
  })
  scope.resolveItem(gap.itemId, {
    status: 'unverified',
    reasonCode: 'target-lost',
    evidenceRefs: [],
    eventIds: [],
    detail: 'the control was replaced by the time it was acted on',
  })
  for (const event of scope.events()) await appendEvent(run.id, event.type, event.payload)
  await appendEvent(run.id, 'finish:accepted', {
    reasonCode: 'unverified-scope',
    kind: 'ui-scan',
    businessResult: 'not-applicable',
    contractHash: uiContract.hash,
  })
  await updateRunStatus(run.id, 'blocked', {
    stopReason: 'blocked',
    businessResult: 'not-applicable',
  })
  await appendEvent(run.id, 'run:completed', {
    status: 'blocked',
    businessResult: 'not-applicable',
    stopReason: 'blocked',
  })
  return { runId: run.id, uiContract }
}

/** A completed run: covered scope, an accepted proof, and a persisted terminal row. */
async function coveredRun() {
  const uiContract = contract()
  const run = await createRun({
    goal: uiContract.goal,
    kind: 'ui-scan',
    environmentId: 'default',
    entryUrl: uiContract.entryUrl,
    uiContract,
  })
  const scope = createInspectionScope({ goal: uiContract.goal, entryUrl: uiContract.entryUrl })
  const item = scope.createItem({
    category: 'entry-observation',
    pageId: 'page-0',
    stateId: 'state-0',
    url: ENTRY,
    observationVersion: 'obs-1',
    basis: 'entry document',
    targetSource: 'executor',
  })
  scope.resolveItem(item.itemId, {
    status: 'verified',
    evidenceRefs: ['artifact-1'],
    eventIds: [],
    detail: 'entry observed',
  })
  for (const e of scope.events()) await appendEvent(run.id, e.type, e.payload)
  const decision = decideInspectionCompletion({
    reason: 'scope-covered',
    facts: {
      kind: 'ui-scan',
      featureEnabled: true,
      contractValid: true,
      contractHash: uiContract.hash,
      entryObserved: true,
      entryEvidenceRefs: ['artifact-1'],
      integrityEpoch: 0,
      scope,
      scopeEventIds: scope.events().map((e) => String(e.payload.itemId)),
      pendingRules: 0,
      openHypotheses: 0,
      unsupportedRecorded: [],
    },
  })
  if (!decision.accepted) throw new Error(`fixture did not reach coverage: ${decision.reasonCode}`)
  const proof = decision.proof as InspectionProof
  await appendEvent(run.id, 'finish:accepted', {
    reasonCode: 'scope-covered',
    kind: 'ui-scan',
    businessResult: 'not-applicable',
    contractHash: uiContract.hash,
    inspectionProof: proof,
  })
  await appendEvent(run.id, 'inspection:summary', {
    kind: 'ui-scan',
    coverage: 'covered',
    counts: scope.snapshot().counts,
    unsupported: [],
  })
  await updateRunStatus(run.id, 'completed', {
    stopReason: 'goal-reached',
    businessResult: 'not-applicable',
  })
  await appendEvent(run.id, 'run:completed', {
    status: 'completed',
    businessResult: 'not-applicable',
    stopReason: 'goal-reached',
  })
  return { runId: run.id, uiContract, proof }
}

describe('U10: a partial ui-scan run reports its scope, its gaps and its not-applicable business', () => {
  beforeAll(async () => {
    await initDatabase()
  })

  it('projects the ledger from persisted events and keeps the unverified item visible', async () => {
    const { runId, uiContract } = await partiallyCoveredRun()
    const { buildReport } = await import('./run-report.ts')
    const report = await buildReport(runId)

    expect(report!.uiScan).toBeDefined()
    const ui = report!.uiScan!
    expect(ui.kind).toBe('ui-scan')
    expect(ui.contract.integrity).toBe('verified')
    expect(ui.contract.hash).toBe(uiContract.hash)
    // The executed address keeps its full path, query and fragment; it is what ran, not a display URL.
    expect(ui.contract.entryUrl).toBe(ENTRY)
    expect(ui.contract.businessWrites).toBe('none')
    expect(ui.contract.session).toBe('anonymous')

    expect(ui.inspection.coverage).toBe('partial')
    const statuses = ui.inspection.items.map((i) => i.status).sort()
    expect(statuses).toEqual(['unverified', 'verified'])
    // The gap names its item and reason rather than disappearing into a count.
    expect(ui.inspection.gaps).toHaveLength(1)
    expect(ui.inspection.gaps[0]!.itemId).toBeTruthy()
    expect(ui.inspection.gaps[0]!.reasonCode).toBe('target-lost')
    // A selected item that resolved unverified is exactly the kind of thing that must not vanish.
    expect(ui.inspection.items.find((i) => i.status === 'unverified')!.selected).toBe(true)

    // Business is reported as inapplicable because the contract says so, not because a value is missing.
    expect(report!.businessResult).toBe('not-applicable')
    expect(ui.businessResult).toBe('not-applicable')
  })

  it('does not fabricate a business summary for a UI run', async () => {
    const { runId } = await partiallyCoveredRun()
    const { buildReport } = await import('./run-report.ts')
    const report = await buildReport(runId)
    // There is no business contract, but this is not "legacy unversioned business": it is a UI run,
    // which has no business dimension at all.
    expect(report!.business.status).toBe('ui-scan-not-applicable')
    expect(report!.business.requirements).toEqual([])
    expect(report!.business.profileId).toBeNull()
  })
})

describe('U09: a covered ui-scan run reports completion with a verified proof', () => {
  it('reports covered, a verified proof and a consistent terminal row', async () => {
    const { runId, proof } = await coveredRun()
    const { buildReport } = await import('./run-report.ts')
    const report = await buildReport(runId)
    expect(report!.status).toBe('completed')
    expect(report!.persistence.status).toBe('verified')
    expect(report!.persistence.issues).toEqual([])
    const ui = report!.uiScan!
    expect(ui.inspection.coverage).toBe('covered')
    expect(ui.inspection.counts.verified).toBe(1)
    expect(ui.inspection.gaps).toEqual([])
    expect(ui.proof).not.toBeNull()
    expect(ui.proof!.hash).toBe(proof.hash)
    expect(ui.proofVerified).toBe(true)
  })
})

describe('U16: a completed UI run whose proof does not verify is reported inconsistent', () => {
  it('flags a tampered proof rather than showing a completed scan', async () => {
    const { runId } = await coveredRun()
    const { getDbClient } = await import('../../storage/database.ts')
    // Tamper with the persisted proof: nothing about the ledger changed, only the recorded hash.
    const result = await getDbClient().execute({
      sql: "SELECT id, payload FROM run_events WHERE run_id = ? AND type = 'finish:accepted'",
      args: [runId],
    })
    const payload = JSON.parse(String(result.rows[0]!.payload))
    payload.inspectionProof.hash = 'f'.repeat(64)
    await getDbClient().execute({
      sql: 'UPDATE run_events SET payload = ? WHERE id = ?',
      args: [JSON.stringify(payload), String(result.rows[0]!.id)],
    })

    const { buildReport } = await import('./run-report.ts')
    const report = await buildReport(runId)
    expect(report!.status).toBe('execution-error')
    expect(report!.persistence.status).toBe('inconsistent')
    expect(report!.persistence.issues).toContain('inspection-proof-unverified')
    expect(report!.businessResult).toBe('unknown')
    // A UI run must not be reported as covered on an unverified proof.
    expect(report!.uiScan!.proofVerified).toBe(false)
    expect(report!.uiScan!.inspection.coverage).not.toBe('covered')
  })

  it('flags a completed UI run that claims a business result', async () => {
    const { runId } = await coveredRun()
    const { updateRunStatus: update } = await import('../../execution/run-manager.ts')
    await update(runId, 'completed', { stopReason: 'goal-reached', businessResult: 'success' })
    const { buildReport } = await import('./run-report.ts')
    const report = await buildReport(runId)
    expect(report!.persistence.issues).toContain('ui-business-result-invalid')
    expect(report!.persistence.status).toBe('inconsistent')
  })
})

describe('U14: a legacy business record is never reported as a UI scan', () => {
  it('leaves an unversioned business run without a uiScan projection', async () => {
    const run = await createRun({
      goal: 'legacy',
      environmentId: 'arena',
      entryUrl: 'http://localhost:4173',
    })
    const { buildReport } = await import('./run-report.ts')
    const report = await buildReport(run.id)
    expect(report!.uiScan).toBeUndefined()
    expect(report!.business.status).toBe('legacy-unversioned')
  })
})
