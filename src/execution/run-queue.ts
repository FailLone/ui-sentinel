import {
  getRun,
  updateRunStatus,
  appendEvent,
  getActiveRun,
  reconcileInterruptedRuns as reconcileStoredRuns,
} from './run-manager.ts'
import { getDbClient } from '../storage/database.ts'

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
    const run = await getRun(runId)
    if (!run || !['queued', 'running'].includes(run.status)) return false
    cancellationRequests.add(runId)
    await appendEvent(runId, 'run:cancel-requested', {})
    const active = getActiveRun(runId)
    if (active) active.abortController.abort(new Error('cancelled'))
    else {
      await updateRunStatus(runId, 'cancelled', { stopReason: 'cancelled' })
      await appendEvent(runId, 'run:cancelled', {})
    }
    return true
  }

  return {
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
