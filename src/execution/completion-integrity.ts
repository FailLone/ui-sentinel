import { createClient } from '@libsql/client'
import { config } from '../shared/config.ts'
import type { Run, RunEvent } from '../shared/types.ts'
import { getRunSnapshot } from './run-manager.ts'

/** A terminal row alone cannot prove that the execution evidence was committed. */
export function completionIssues(run: Run, events: readonly RunEvent[]): string[] {
  const issues: string[] = []
  if (events.some((e, i) => e.runId !== run.id || e.seq !== i))
    issues.push('event-sequence-incomplete')
  const terminal = [...events].reverse().find((e) => e.type === 'run:completed')
  if (!terminal) issues.push('terminal-event-missing')
  else if (
    terminal.payload.status !== run.status ||
    terminal.payload.businessResult !== run.businessResult ||
    terminal.payload.stopReason !== run.stopReason
  )
    issues.push('terminal-event-mismatch')
  if (
    ['goal-reached', 'blocked'].includes(run.stopReason ?? '') &&
    !events.some((e) => e.type === 'finish:accepted' && e.seq < (terminal?.seq ?? Infinity))
  )
    issues.push('accepted-finish-missing')
  if (
    run.status === 'completed' &&
    (run.stopReason !== 'goal-reached' || run.businessResult === 'unknown')
  )
    issues.push('completed-outcome-unverified')
  return issues
}

/** File databases are checked on a fresh connection, outside the executor's pool/cache. */
export async function verifyCompletionCommit(expected: {
  runId: string
  status: Run['status']
  businessResult: Run['businessResult']
  stopReason: Run['stopReason']
  lastEvent: Pick<RunEvent, 'id' | 'seq'>
}) {
  const memory = config.databaseUrl.includes(':memory:')
  const reader = memory ? undefined : createClient({ url: config.databaseUrl, concurrency: 1 })
  try {
    const snapshot = await getRunSnapshot(expected.runId, reader)
    if (!snapshot) throw Error('completion-commit-run-missing')
    const issues = completionIssues(snapshot.run, snapshot.events)
    if (
      snapshot.run.status !== expected.status ||
      snapshot.run.businessResult !== expected.businessResult ||
      snapshot.run.stopReason !== expected.stopReason
    )
      issues.push('expected-terminal-mismatch')
    const last = snapshot.events.at(-1)
    if (last?.id !== expected.lastEvent.id || last?.seq !== expected.lastEvent.seq)
      issues.push('committed-tail-mismatch')
    if (issues.length) throw Error(`completion-commit-unverified:${issues.join(',')}`)
  } finally {
    reader?.close()
  }
}
