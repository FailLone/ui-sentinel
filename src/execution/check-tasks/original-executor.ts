import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createRun, appendEvent, getRunSnapshot } from '../run-manager.ts'
import { resolveUiScanContract, type UiContractSnapshot } from '../../inspection/contract.ts'
import { popupArtifactIssues } from '../../inspection/popup-artifacts.ts'
import { popupReport } from '../../server/reports/popup-report.ts'
import { saveEvidence } from '../browser.ts'
import { bytesHash } from './resources.ts'
import type { CheckTask, BudgetLease, CheckResult } from './contract.ts'
import type { SharedNetworkBudget } from '../network/shared-budget.ts'

import type { PopupAccountOwner } from '../../agent/popup/account-owner.ts'

export interface DelegatedExecution {
  accountOwner?: PopupAccountOwner
  task: CheckTask
  signal: AbortSignal
  lease: BudgetLease
  progress?: (message: string) => Promise<void>
  networkBudget: SharedNetworkBudget
}
export type OriginalExecutor = (runId: string, delegation: DelegatedExecution) => Promise<void>
export const childRunId = (task: CheckTask) => `check-${task.childTaskId}`

/** Original child run owns all action/item/observation IDs and original artifact bytes. */
export async function readOriginalChild(task: CheckTask) {
  const snapshot = await getRunSnapshot(childRunId(task))
  if (!snapshot) throw Error('check-original-child-missing')
  const { run, events, artifactRows } = snapshot
  const owner = events.find((e) => e.type === 'run:delegated-from')?.payload
  if (
    owner?.parentRunId !== task.parentRunId ||
    owner.taskHash !== task.taskHash ||
    owner.childTaskId !== task.childTaskId ||
    owner.parentContractHash !== task.contractHash
  )
    throw Error('check-original-owner-mismatch')
  if (
    !['completed', 'blocked', 'cancelled', 'timed-out', 'execution-error', 'interrupted'].includes(
      run.status,
    )
  )
    throw Error('check-original-child-not-terminal')
  const artifacts = artifactRows.rows.map((r) => ({
    id: String(r.id),
    type: String(r.type),
    path: String(r.file_path),
    metadata: JSON.parse(String(r.metadata)),
  }))
  const readable = new Set<string>()
  for (const a of artifacts) {
    try {
      if ((await stat(a.path)).isFile()) readable.add(a.id)
    } catch {}
  }
  const { completionIssues } = await import('../completion-integrity.ts')
  const issues = [
    ...completionIssues(run, events),
    ...(await popupArtifactIssues(run, events, artifacts)),
  ]
  if (!events.some((e) => e.type === 'run:delegated-resource-closed' && e.payload.closed === true))
    issues.push('child-resource-close-unverified')
  if (issues.length) throw Error('check-original-evidence-invalid:' + issues.join(','))
  const popup = popupReport(run, events, readable, issues)
  if (!popup) throw Error('check-original-popup-missing')
  const receipt = popup.receiptRef ? artifacts.find((a) => a.id === popup.receiptRef) : undefined
  const raw = receipt ? JSON.parse(await readFile(receipt.path, 'utf8')) : undefined
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        runId: run.id,
        status: run.status,
        usage: run.usage,
        popup,
        receipt: raw,
        events,
      }),
    )
    .digest('hex')
  return {
    runId: run.id,
    status: run.status,
    popup,
    receipt: raw,
    fingerprint,
    usage: run.usage,
    evidence: popup.evidenceRefs.map((id) => ({
      id,
      url: `/api/runs/${run.id}/artifacts/${encodeURIComponent(id)}`,
    })),
    reportUrl: `/api/runs/${run.id}/report`,
  }
}
export async function runOriginalPopup(
  deps: DelegatedExecution & { contract: UiContractSnapshot; execute: OriginalExecutor },
): Promise<CheckResult> {
  const { task, signal, lease } = deps
  signal.throwIfAborted()
  const resolution = resolveUiScanContract(
    {
      kind: 'ui-scan',
      entryUrl: task.start.url,
      ...(deps.contract.requestedGoal ? { goal: deps.contract.requestedGoal } : {}),
      popupCheck: { mode: 'popup-viewport' },
      access: deps.contract.access,
      scope: { maxPages: 1, maxDepth: 0 },
      budget: {
        maxActions: task.quota.actions,
        maxModelCalls: task.quota.modelCalls,
        totalTimeoutMs: Math.max(1, Math.min(300000, task.deadlineAt - Date.now())),
      },
      viewport: task.start.viewport,
    },
    { reachableOrigins: (await import('../../shared/config.ts')).config.urlScan.trustedOrigins },
  )
  if (resolution.kind !== 'resolved')
    throw Error(`check-original-contract-refused:${resolution.reasonCode}`)
  const contract = resolution.contract
  await createRun(
    {
      kind: 'ui-scan',
      uiContract: contract,
      goal: contract.goal,
      entryUrl: contract.entryUrl,
      environmentId: 'default',
      budget: contract.budget,
      viewport: task.start.viewport,
    },
    childRunId(task),
  )
  await deps.execute(childRunId(task), deps)
  signal.throwIfAborted()
  const original = await readOriginalChild(task)
  if (['execution-error', 'interrupted', 'timed-out', 'cancelled'].includes(original.status))
    throw Error(`check-original-${original.status}`)
  const body = JSON.stringify(original)
  const ref = await saveEvidence(
    task.parentRunId,
    'check-original-result',
    body,
    {
      parentRunId: task.parentRunId,
      childTaskId: task.childTaskId,
      taskHash: task.taskHash,
      contractHash: task.contractHash,
      contentHash: bytesHash(body),
    },
    () => {
      signal.throwIfAborted()
      if (Date.now() >= task.deadlineAt) throw Error('check-expired')
    },
  )
  const verified = original.popup.verdict !== 'unknown'
  return {
    status: verified ? (original.popup.verdict === 'fail' ? 'defect' : 'completed') : 'unverified',
    evidenceRefs: [ref],
    original,
    measurements: verified
      ? [
          {
            measurementId: original.popup.receiptRef!,
            childTaskId: task.childTaskId,
            taskHash: task.taskHash,
            actionId: original.receipt.actionId ?? undefined,
            itemId: original.receipt.itemId ?? undefined,
            measuredAt: Date.now(),
            verified: true,
            evidenceRefs: [ref],
            value: original.receipt,
          },
        ]
      : [],
    unchecked: verified
      ? []
      : original.popup.missing.length
        ? original.popup.missing
        : [original.popup.reason],
  }
}
export async function verifyOriginalResult(task: CheckTask, result: CheckResult) {
  const current = await readOriginalChild(task)
  if (
    !result.original ||
    result.original.runId !== childRunId(task) ||
    result.original.fingerprint !== current.fingerprint ||
    JSON.stringify(result.original) !== JSON.stringify(current)
  )
    throw Error('check-original-result-stale-or-swapped')
  const expected =
    current.popup.verdict === 'pass'
      ? 'completed'
      : current.popup.verdict === 'fail'
        ? 'defect'
        : 'unverified'
  if (result.measurements.length !== (expected === 'unverified' ? 0 : 1))
    throw Error('check-original-measurement-count')
  if (result.status !== expected) throw Error('check-original-verdict-mismatch')
  for (const m of result.measurements) {
    if (
      m.childTaskId !== task.childTaskId ||
      m.taskHash !== task.taskHash ||
      m.measurementId !== current.popup.receiptRef ||
      m.actionId !== (current.receipt?.actionId ?? undefined) ||
      m.itemId !== (current.receipt?.itemId ?? undefined) ||
      JSON.stringify(m.value) !== JSON.stringify(current.receipt)
    )
      throw Error('check-original-measurement-mismatch')
  }
}
