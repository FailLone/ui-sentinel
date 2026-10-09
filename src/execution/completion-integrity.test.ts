import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const state = vi.hoisted(() => ({ url: '' }))
vi.mock('../shared/config.ts', () => ({
  config: {
    get databaseUrl() {
      return state.url
    },
    budget: { totalTimeoutMs: 30000, maxActions: 10, maxModelCalls: 10 },
  },
}))
import { getDbClient, initDatabase } from '../storage/database.ts'
import {
  createRun,
  appendEvent,
  updateRunStatus,
  getRunSnapshot,
  registerActiveRun,
  removeActiveRun,
} from './run-manager.ts'
import { completionIssues, verifyCompletionCommit } from './completion-integrity.ts'
import { buildUiContractSnapshot } from '../inspection/contract.ts'
import { createInspectionScope } from '../inspection/scope.ts'
import { decideInspectionCompletion } from '../inspection/completion.ts'
let directory = ''
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'completion-integrity-'))
  state.url = `file:${directory}/runs.db`
  await initDatabase()
})
afterAll(async () => {
  getDbClient().close()
  await rm(directory, { recursive: true, force: true })
})
async function completed() {
  const run = await createRun({
    goal: 'Inspect purchase',
    environmentId: 'test',
    entryUrl: 'http://localhost:4173',
  })
  const active = registerActiveRun(run.id)
  await appendEvent(run.id, 'finish:accepted', { businessResult: 'success', blocked: false })
  await updateRunStatus(run.id, 'completed', {
    businessResult: 'success',
    stopReason: 'goal-reached',
  })
  await appendEvent(run.id, 'run:completed', {
    status: 'completed',
    businessResult: 'success',
    stopReason: 'goal-reached',
  })
  const lastEvent = await appendEvent(run.id, 'run:statistics', {})
  return {
    runId: run.id,
    status: 'completed' as const,
    businessResult: 'success' as const,
    stopReason: 'goal-reached' as const,
    lastEvent,
    eventIds: [...active.eventIds],
  }
}
it('reads a committed terminal row and its exact tail through a fresh file connection', async () => {
  const expected = await completed()
  await expect(verifyCompletionCommit(expected)).resolves.toBeUndefined()
  const snapshot = await getRunSnapshot(expected.runId)
  expect(snapshot?.events.at(-1)?.id).toBe(expected.lastEvent.id)
})
it('detects a lost event tail even when the row still claims completion', async () => {
  const expected = await completed()
  await getDbClient().execute({
    sql: 'DELETE FROM run_events WHERE id=?',
    args: [expected.lastEvent.id],
  })
  await expect(verifyCompletionCommit(expected)).rejects.toThrow('committed-tail-mismatch')
})
it('detects missing middle events and conflicting terminal data', async () => {
  const expected = await completed()
  await getDbClient().execute({
    sql: 'DELETE FROM run_events WHERE run_id=? AND seq=0',
    args: [expected.runId],
  })
  await getDbClient().execute({
    sql: "UPDATE runs SET business_result='rejected' WHERE id=?",
    args: [expected.runId],
  })
  const snapshot = (await getRunSnapshot(expected.runId))!
  expect(completionIssues(snapshot.run, snapshot.events)).toEqual(
    expect.arrayContaining([
      'event-sequence-incomplete',
      'terminal-event-mismatch',
      'accepted-finish-missing',
    ]),
  )
  await expect(verifyCompletionCommit(expected)).rejects.toThrow('expected-terminal-mismatch')
})

it('detects erased history even when later writes reuse a contiguous sequence and valid tail', async () => {
  const expected = await completed()
  const active = registerActiveRun(expected.runId)
  active.eventIds.push(...expected.eventIds)
  // Reproduce a database view losing writes, followed by new writes filling the sequence again.
  await appendEvent(expected.runId, 'business:observation', { operationId: 'owned-operation' })
  await getDbClient().execute({
    sql: 'DELETE FROM run_events WHERE run_id=? AND seq>=3',
    args: [expected.runId],
  })
  const lastEvent = await appendEvent(expected.runId, 'run:statistics', {})
  const snapshot = (await getRunSnapshot(expected.runId))!
  expect(completionIssues(snapshot.run, snapshot.events)).toEqual([])
  expect(snapshot.events.at(-1)?.id).toBe(lastEvent.id)
  await expect(
    verifyCompletionCommit({ ...expected, lastEvent, eventIds: [...active.eventIds] }),
  ).rejects.toThrow('committed-history-mismatch')
  removeActiveRun(expected.runId)
})

it('retains every acknowledged event while live report snapshots are repeatedly polled', async () => {
  const expected = await completed()
  const active = registerActiveRun(expected.runId)
  active.eventIds.push(...expected.eventIds)
  await Promise.all([
    (async () => {
      for (let i = 0; i < 150; i++)
        await appendEvent(expected.runId, 'test:acknowledged', { index: i })
    })(),
    ...Array.from({ length: 4 }, async () => {
      for (let i = 0; i < 60; i++) await getRunSnapshot(expected.runId)
    }),
  ])
  const lastEvent = await appendEvent(expected.runId, 'run:statistics', {})
  await expect(
    verifyCompletionCommit({ ...expected, lastEvent, eventIds: [...active.eventIds] }),
  ).resolves.toBeUndefined()
  removeActiveRun(expected.runId)
})

/**
 * The UI completion validator (plan 6.3).
 *
 * A `ui-scan` run is held to a different definition of "completed" than a business run: its business
 * result must be `not-applicable`, and its completion must be backed by an `inspection proof` that
 * matches the scope events actually persisted. The point of checking it here, on a fresh read, is
 * that a terminal row claiming `completed` is not by itself evidence - the plan says so explicitly,
 * and a run whose proof was never written must not pass.
 */
/** The contract this fixture's run is created with, hashed the way the resolver hashes it. */
const uiContract = buildUiContractSnapshot({
  entryUrl: 'https://example.org/catalog',
  origin: 'https://example.org',
  goal: 'Inspect the catalog',
  scope: { maxPages: 3, maxDepth: 1 },
  access: { resourceOrigins: [], dataOrigins: [] },
  budget: { totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 },
})

/** A proof the executor would actually have produced for this fixture's scope. */
function realProof(spec: unknown) {
  const scope = createInspectionScope({
    goal: 'Inspect the catalog',
    entryUrl: uiContract.entryUrl,
  })
  const item = scope.createItem({
    category: 'entry-observation',
    pageId: 's1',
    stateId: 's1',
    url: uiContract.entryUrl,
    observationVersion: 'v1',
    basis: 'the entry document was navigated and observed',
    targetSource: 'executor',
  })
  scope.resolveItem(item.itemId, {
    status: 'verified',
    evidenceRefs: ['shot.png'],
    eventIds: [],
    detail: 'observed',
  })
  return {
    scope,
    proof: decideInspectionCompletion({
      reason: 'scope-covered',
      facts: {
        kind: 'ui-scan',
        spec,
        featureEnabled: true,
        contractValid: true,
        contractHash: uiContract.hash,
        entryObserved: true,
        entryEvidenceRefs: ['shot.png'],
        integrityEpoch: 0,
        scope,
        scopeEventIds: ['evt-1'],
        pendingRules: 0,
        openHypotheses: 0,
        unsupportedRecorded: [],
      },
    }).proof,
  }
}

async function completedUi(overrides: { proof?: unknown; reasonCode?: string } = {}) {
  const run = await createRun({
    goal: 'Inspect the catalog',
    environmentId: 'url-scan',
    entryUrl: 'https://example.org/catalog',
    kind: 'ui-scan',
    // A real contract, built the way the API builds one: `resolveRunKind` re-verifies the hash, so a
    // hand-written snapshot would be read as an invalid record rather than a UI run - which is the
    // behaviour the test below for an invalid contract relies on.
    uiContract,
  })
  const active = registerActiveRun(run.id)
  const { scope, proof } = realProof(run.spec)
  await appendEvent(run.id, 'page:observed', {}, { evidenceRefs: ['shot.png'] })
  for (const event of scope.events()) await appendEvent(run.id, event.type, event.payload)
  await appendEvent(run.id, 'finish:accepted', {
    kind: 'ui-scan',
    reasonCode: overrides.reasonCode ?? 'scope-covered',
    businessResult: 'not-applicable',
    contractHash: uiContract.hash,
    // A real proof, produced by the same decision function the executor calls: the verifier
    // recomputes its hash, so a hand-written one would be read as an unverified claim.
    inspectionProof: overrides.proof ?? proof,
  })
  await updateRunStatus(run.id, 'completed', {
    businessResult: 'not-applicable',
    stopReason: 'goal-reached',
  })
  await appendEvent(run.id, 'run:completed', {
    status: 'completed',
    businessResult: 'not-applicable',
    stopReason: 'goal-reached',
  })
  return { runId: run.id }
}

it('accepts a ui-scan completion that carries an inspection proof', async () => {
  const expected = await completedUi()
  const snapshot = (await getRunSnapshot(expected.runId))!
  expect(completionIssues(snapshot.run, snapshot.events)).toEqual([])
})

it('refuses a ui-scan terminal row whose completion has no proof', async () => {
  const expected = await completedUi({ proof: undefined })
  await getDbClient().execute({
    sql: `UPDATE run_events SET payload = json_remove(payload, '$.inspectionProof')
          WHERE run_id=? AND type='finish:accepted'`,
    args: [expected.runId],
  })
  const snapshot = (await getRunSnapshot(expected.runId))!
  // A completed UI run with no proof is inconsistent, exactly as a business completion with an
  // unknown outcome is: the row claims something the persisted evidence does not establish.
  expect(completionIssues(snapshot.run, snapshot.events)).toContain('inspection-proof-missing')
})

it('refuses a ui-scan completion whose business result is not not-applicable', async () => {
  const expected = await completedUi()
  await getDbClient().execute({
    sql: "UPDATE runs SET business_result='success' WHERE id=?",
    args: [expected.runId],
  })
  const snapshot = (await getRunSnapshot(expected.runId))!
  expect(completionIssues(snapshot.run, snapshot.events)).toEqual(
    expect.arrayContaining(['ui-business-result-invalid', 'terminal-event-mismatch']),
  )
})

it('rejects an intact proof after scope events are removed and the remaining sequence is renumbered', async () => {
  const { runId } = await completedUi()
  const snapshot = (await getRunSnapshot(runId))!
  const erased = snapshot.events
    .filter((e) => !e.type.startsWith('scope:'))
    .map((e, seq) => ({ ...e, seq }))
  expect(completionIssues(snapshot.run, erased)).toContain('inspection-proof-scope-mismatch')
})
it('rejects a completed UI row with cancelled stopReason even when the terminal event agrees', async () => {
  const { runId } = await completedUi()
  const { run, events } = (await getRunSnapshot(runId))!
  const modified = events.map((e) =>
    e.type === 'run:completed' ? { ...e, payload: { ...e.payload, stopReason: 'cancelled' } } : e,
  )
  expect(completionIssues({ ...run, stopReason: 'cancelled' }, modified)).toContain(
    'inspection-proof-outcome-mismatch',
  )
})
