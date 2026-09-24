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
import { createRun, appendEvent, updateRunStatus, getRunSnapshot } from './run-manager.ts'
import { completionIssues, verifyCompletionCommit } from './completion-integrity.ts'
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
