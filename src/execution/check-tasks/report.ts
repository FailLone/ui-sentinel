import { readFile } from 'node:fs/promises'
import type { RunEvent } from '../../shared/types.ts'
import { completed, terminal, type CheckSnapshot } from './contract.ts'
import { bytesHash } from './resources.ts'

/** Original event/artifact projection, not another persistence ledger. */
export function checkTaskReport(
  events: readonly RunEvent[],
  readable?: ReadonlySet<string>,
  integrityIssues: readonly string[] = [],
) {
  const tasks = new Map<string, CheckSnapshot>()
  const issues: string[] = integrityIssues.filter((issue) => issue.startsWith('check-task-'))
  for (const event of events) {
    if (
      ![
        'check-task:submitted',
        'check-task:accepted',
        'check-task:started',
        'check-task:progress',
        'check-task:terminal',
      ].includes(event.type)
    )
      continue
    const s = event.payload.snapshot as CheckSnapshot | undefined
    if (!s?.task?.childTaskId) {
      issues.push('check-task-malformed-event')
      continue
    }
    const prior = tasks.get(s.task.childTaskId)
    if (
      (!prior && !['check-task:submitted', 'check-task:accepted'].includes(event.type)) ||
      (prior && (prior.task.taskHash !== s.task.taskHash || terminal(prior.status)))
    )
      issues.push('check-task-invalid-history')
    tasks.set(s.task.childTaskId, s)
  }
  for (const s of tasks.values()) {
    if (!completed(s)) issues.push(`check-task-unfinished:${s.task.childTaskId}`)
    if (s.result?.evidenceRefs.some((ref) => readable && !readable.has(ref)))
      issues.push(`check-task-evidence-unreadable:${s.task.childTaskId}`)
  }
  return {
    version: 1 as const,
    tasks: [...tasks.values()],
    issues,
    note: 'Independent child observations do not resolve parent selected/required items. Missing terminal events remain unfinished.',
  }
}

export async function checkTaskArtifactIssues(
  events: readonly RunEvent[],
  artifacts: readonly { id: string; path: string; metadata: Record<string, unknown> }[],
) {
  const report = checkTaskReport(events)
  const issues = report.issues.filter((issue) => !issue.startsWith('check-task-unfinished:'))
  for (const s of report.tasks) {
    if (!s.result) continue
    const measured = events.filter(
      (e) => e.type === 'check-task:measurement' && e.payload.childTaskId === s.task.childTaskId,
    )
    for (const receipt of s.result.measurements) {
      if (!measured.some((e) => JSON.stringify(e.payload.receipt) === JSON.stringify(receipt)))
        issues.push('check-task-measurement-receipt-mismatch')
      let matchesBytes = false
      for (const ref of receipt.evidenceRefs) {
        const artifact = artifacts.find((a) => a.id === ref)
        if (!artifact) continue
        try {
          const saved = JSON.parse(await readFile(artifact.path, 'utf8'))
          if (
            saved.measurementId === receipt.measurementId &&
            saved.measuredAt === receipt.measuredAt &&
            JSON.stringify(saved.value) === JSON.stringify(receipt.value) &&
            receipt.childTaskId === s.task.childTaskId &&
            receipt.taskHash === s.task.taskHash &&
            receipt.measuredAt >= s.acceptedAt &&
            receipt.measuredAt <= s.task.deadlineAt &&
            receipt.actionId === undefined &&
            receipt.itemId === undefined
          )
            matchesBytes = true
        } catch {
          /* screenshots and missing JSON cannot establish measurement ownership */
        }
      }
      if (!matchesBytes) issues.push('check-task-measurement-bytes-mismatch')
    }
    for (const ref of s.result.evidenceRefs) {
      const a = artifacts.find((a) => a.id === ref)
      if (
        !a ||
        a.metadata.childTaskId !== s.task.childTaskId ||
        a.metadata.parentRunId !== s.task.parentRunId ||
        a.metadata.taskHash !== s.task.taskHash ||
        a.metadata.contractHash !== s.task.contractHash
      ) {
        issues.push(`check-task-evidence-owner-mismatch:${ref}`)
        continue
      }
      try {
        if (bytesHash(await readFile(a.path)) !== a.metadata.contentHash)
          issues.push(`check-task-evidence-bytes-mismatch:${ref}`)
      } catch {
        issues.push(`check-task-evidence-unreadable:${ref}`)
      }
    }
  }
  return issues
}
