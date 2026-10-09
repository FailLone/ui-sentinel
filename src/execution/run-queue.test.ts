import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
vi.mock('../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    budget: { totalTimeoutMs: 30000, maxActions: 10, maxModelCalls: 10 },
  },
}))
import { getDbClient, initDatabase } from '../storage/database.ts'
import {
  createRun,
  updateRunStatus,
  appendEvent,
  registerActiveRun,
  removeActiveRun,
  getRun,
  getEvents,
} from './run-manager.ts'
import { createRunQueue } from './run-queue.ts'
import { verifyCompletionCommit } from './completion-integrity.ts'
import type { StopReason } from '../shared/types.ts'

function latch() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
beforeAll(initDatabase)
afterEach(() => vi.restoreAllMocks())
afterAll(() => getDbClient().close())
async function fixture() {
  const run = await createRun({
    goal: 'Inspect',
    environmentId: 'test',
    entryUrl: 'http://localhost/',
  })
  const active = registerActiveRun(run.id)
  await updateRunStatus(run.id, 'running')
  await appendEvent(run.id, 'run:started', {})
  await appendEvent(run.id, 'finish:accepted', { businessResult: 'success' })
  const queue = createRunQueue(async () => {})
  const commit = (proposed: StopReason = 'goal-reached') =>
    queue.commitRun(run.id, proposed, async (reason) => {
      const status =
        reason === 'cancelled'
          ? 'cancelled'
          : reason === 'reconciliation-required'
            ? 'interrupted'
            : 'completed'
      const businessResult = reason === 'reconciliation-required' ? 'unknown' : 'success'
      if (reason === 'reconciliation-required') queue.requireReconciliation()
      await updateRunStatus(run.id, status, { businessResult, stopReason: reason })
      const lastEvent = await appendEvent(run.id, 'run:completed', {
        status,
        businessResult,
        stopReason: reason,
      })
      await verifyCompletionCommit({
        runId: run.id,
        status,
        businessResult,
        stopReason: reason,
        lastEvent,
        eventIds: [...active.eventIds],
      })
      removeActiveRun(run.id)
      return reason
    })
  return { run, active, queue, commit }
}
it('orders accepted cancellation before a waiting stale completion, including persistence awaits', async () => {
  const { run, queue, commit } = await fixture()
  const entered = latch(),
    release = latch()
  const db = getDbClient(),
    original = db.execute.bind(db)
  vi.spyOn(db, 'execute').mockImplementation(async (stmt: any) => {
    if (stmt.sql?.startsWith('INSERT INTO run_events') && stmt.args[3] === 'run:cancel-requested') {
      entered.resolve()
      await release.promise
    }
    return original(stmt)
  })
  const cancellation = queue.cancelRunExecution(run.id)
  await entered.promise
  let submitted = false
  const terminal = commit().then((v) => {
    submitted = true
    return v
  })
  await Promise.resolve()
  expect(submitted).toBe(false)
  release.resolve()
  expect(await cancellation).toBe(true)
  expect(await terminal).toBe('cancelled')
  expect(await getRun(run.id)).toMatchObject({ status: 'cancelled', stopReason: 'cancelled' })
  expect(queue.requiresReconciliation()).toBe(false)
  const events = await getEvents(run.id)
  expect(events.at(-1)?.payload.status).toBe('cancelled')
  expect(events.filter((e) => e.type === 'run:completed')).toHaveLength(1)
})
it('holds the ordering boundary through terminal SQL and verification; stale cancellation is refused', async () => {
  const { run, queue, commit } = await fixture()
  const entered = latch(),
    release = latch()
  const db = getDbClient(),
    original = db.execute.bind(db)
  vi.spyOn(db, 'execute').mockImplementation(async (stmt: any) => {
    if (stmt.sql?.startsWith('UPDATE runs SET status') && stmt.args[0] === 'completed') {
      entered.resolve()
      await release.promise
    }
    return original(stmt)
  })
  const terminal = commit()
  await entered.promise
  expect((await getRun(run.id))?.status).toBe('running') // API may hold this stale snapshot.
  const cancel = queue.cancelRunExecution(run.id)
  release.resolve()
  expect(await terminal).toBe('goal-reached')
  expect(await cancel).toBe(false)
  expect((await getEvents(run.id)).some((e) => e.type === 'run:cancel-requested')).toBe(false)
  await expect(commit()).rejects.toThrow('run-terminal-already-owned')
})
it('coalesces concurrent cancellation acknowledgements into one durable request', async () => {
  const { run, queue, commit } = await fixture()
  expect(
    await Promise.all([queue.cancelRunExecution(run.id), queue.cancelRunExecution(run.id)]),
  ).toEqual([true, true])
  expect((await getEvents(run.id)).filter((e) => e.type === 'run:cancel-requested')).toHaveLength(1)
  expect(await commit()).toBe('cancelled')
})
it('keeps actual unknown business writes above accepted cancellation and never clears quarantine', async () => {
  const { run, queue, commit } = await fixture()
  expect(await queue.cancelRunExecution(run.id)).toBe(true)
  expect(await commit('reconciliation-required')).toBe('reconciliation-required')
  expect((await getRun(run.id))?.status).toBe('interrupted')
  expect(queue.requiresReconciliation()).toBe(true)
})
it('does not let cancellation overwrite a failed terminal owner or mask storage failure', async () => {
  const { run, queue } = await fixture()
  const entered = latch(),
    release = latch()
  const terminal = queue.commitRun(run.id, 'goal-reached', async () => {
    entered.resolve()
    await release.promise
    throw Error('injected-storage-failure')
  })
  const rejection = expect(terminal).rejects.toThrow('injected-storage-failure')
  await entered.promise
  const cancel = queue.cancelRunExecution(run.id)
  release.resolve()
  await rejection
  expect(await cancel).toBe(false)
  expect(queue.requiresReconciliation()).toBe(true)
  expect((await getEvents(run.id)).some((e) => e.type === 'run:cancel-requested')).toBe(false)
  removeActiveRun(run.id)
})
it('does not acknowledge cancellation when its durable request could not be saved', async () => {
  const { run, queue } = await fixture()
  const db = getDbClient(),
    original = db.execute.bind(db)
  vi.spyOn(db, 'execute').mockImplementation(async (stmt: any) => {
    if (stmt.args?.[3] === 'run:cancel-requested') throw Error('cancel-storage-failure')
    return original(stmt)
  })
  await expect(queue.cancelRunExecution(run.id)).rejects.toThrow('cancel-storage-failure')
  expect(queue.isCancellationRequested(run.id)).toBe(false)
  removeActiveRun(run.id)
})
it('serializes queued cancellation with startup and prevents late browser admission', async () => {
  const run = await createRun({
    goal: 'Inspect',
    environmentId: 'test',
    entryUrl: 'http://localhost/',
  })
  let started = false
  const queue = createRunQueue(async (id) =>
    queue.withRunLifecycle(id, async () => {
      if ((await getRun(id))?.status === 'queued') started = true
    }),
  )
  const cancel = queue.cancelRunExecution(run.id)
  const start = queue.startRunExecution(run.id)
  expect(await cancel).toBe(true)
  await start
  expect(started).toBe(false)
  expect((await getRun(run.id))?.status).toBe('cancelled')
})
it('serializes early terminal paths with cancellation and rechecks state after waiting', async () => {
  const run = await createRun({
    goal: 'Inspect',
    environmentId: 'test',
    entryUrl: 'http://localhost/',
  })
  const queue = createRunQueue(async () => {})
  const entered = latch(),
    release = latch()
  const early = queue.withRunLifecycle(run.id, async () => {
    entered.resolve()
    await release.promise
    await updateRunStatus(run.id, 'execution-error', { stopReason: 'execution-error' })
  })
  await entered.promise
  const cancel = queue.cancelRunExecution(run.id)
  release.resolve()
  await early
  expect(await cancel).toBe(false)
  expect((await getEvents(run.id)).length).toBe(0)
})
