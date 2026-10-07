import {
  getRun,
  updateRunStatus,
  appendEvent,
  getActiveRun,
  reconcileInterruptedRuns as reconcileStoredRuns,
} from './run-manager.ts'
import { getDbClient } from '../storage/database.ts'
import type { StopReason } from '../shared/types.ts'

/** Single-writer queue shared by the HTTP API and trusted evaluation controller. */
export function createRunQueue(executeRun: (runId: string) => Promise<void>) {
  let requiresReconciliation = false
  async function reconcileInterruptedRuns(): Promise<void> {
    await reconcileStoredRuns()
    const rows = await getDbClient().execute(
      "SELECT id FROM runs WHERE stop_reason='reconciliation-required'",
    )
    requiresReconciliation = rows.rows.length > 0
  }
  async function acknowledgeReconciliation(): Promise<void> {
    if (pending.size) throw new Error('cannot reconcile while tasks remain queued or active')
    // Called only by the trusted controller after independent backend verification/reset.
    await getDbClient().execute(
      "UPDATE runs SET stop_reason='queue-empty' WHERE status='interrupted' AND stop_reason='reconciliation-required'",
    )
    requiresReconciliation = false
  }
  // Single-process execution already has one queue. Every lifecycle writer for a run
  // shares this gate; acquire BEFORE reading status, not after an asynchronous snapshot.
  const lifecycleTails = new Map<string, Promise<void>>()
  const terminalOwners = new Set<string>()
  async function withRunLifecycle<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = lifecycleTails.get(runId) ?? Promise.resolve()
    let release!: () => void
    const tail = new Promise<void>((resolve) => {
      release = resolve
    })
    lifecycleTails.set(runId, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (lifecycleTails.get(runId) === tail) lifecycleTails.delete(runId)
    }
  }
  async function commitRun<T>(
    runId: string,
    proposed: StopReason,
    commit: (reason: StopReason) => Promise<T>,
  ): Promise<T> {
    return withRunLifecycle(runId, async () => {
      if (terminalOwners.has(runId)) throw Error('run-terminal-already-owned')
      // This is the terminal intent's single ordering point. Cancellation cannot
      // interleave any of its writes or its independent commit verification.
      terminalOwners.add(runId)
      const reason =
        proposed === 'reconciliation-required'
          ? proposed
          : cancellationRequests.has(runId)
            ? 'cancelled'
            : proposed
      try {
        return await commit(reason)
      } catch (error) {
        // Keep ownership even on failed storage; no late cancel/replay can repair it.
        requiresReconciliation = true
        throw error
      }
    })
  }
  const cancellationRequests = new Set<string>()
  let tail: Promise<unknown> = Promise.resolve()
  const pending = new Map<string, Promise<void>>()
  function executionBusy(): boolean {
    return pending.size > 0 || requiresReconciliation
  }
  function startRunExecution(runId: string): Promise<void> {
    const existing = pending.get(runId)
    if (existing) return existing
    const result = tail
      .then(() => executeRun(runId))
      .finally(() => {
        pending.delete(runId)
        cancellationRequests.delete(runId)
      })
    pending.set(runId, result)
    tail = result.catch(() => {})
    return result
  }
  async function cancelRunExecution(runId: string): Promise<boolean> {
    return withRunLifecycle(runId, async () => {
      if (terminalOwners.has(runId)) return false
      const run = await getRun(runId)
      if (!run || !['queued', 'running'].includes(run.status)) return false
      if (cancellationRequests.has(runId)) return true
      await appendEvent(runId, 'run:cancel-requested', {})
      cancellationRequests.add(runId)
      const active = getActiveRun(runId)
      if (active) active.abortController.abort(new Error('cancelled'))
      else {
        await updateRunStatus(runId, 'cancelled', { stopReason: 'cancelled' })
        await appendEvent(runId, 'run:cancelled', {})
      }
      return true
    })
  }

  return {
    withRunLifecycle,
    commitRun,
    startRunExecution,
    cancelRunExecution,
    executionBusy,
    reconcileInterruptedRuns,
    acknowledgeReconciliation,
    isCancellationRequested: (id: string) => cancellationRequests.has(id),
    requiresReconciliation: () => requiresReconciliation,
    requireReconciliation: () => {
      requiresReconciliation = true
    },
  }
}
