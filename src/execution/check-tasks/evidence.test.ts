import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { initDatabase, getDbClient } from '../../storage/database.ts'
import { createRun } from '../run-manager.ts'
import { saveEvidence } from '../browser.ts'
import { bytesHash, checkEvidence, validateCheckResult } from './resources.ts'
import { checkTaskReport, checkTaskArtifactIssues } from './report.ts'
import type { CheckTask } from './contract.ts'
import type { RunEvent } from '../../shared/types.ts'

let runId: string
beforeAll(async () => {
  await initDatabase()
  const run = await createRun({
    goal: 'evidence-test',
    entryUrl: 'https://example.org',
    environmentId: 'arena',
  })
  runId = run.id
})
afterAll(async () => {
  if (runId) await rm(resolve('data/artifacts', runId), { recursive: true, force: true })
})
const task = (): CheckTask => ({
  version: 1,
  key: 'a',
  kind: 'element-measurement',
  purpose: 'test',
  target: { selector: 'h1' },
  start: { url: 'https://example.org', viewport: { width: 320, height: 240 }, prerequisites: [] },
  publicFacts: [],
  evidenceRefs: [],
  permissions: { session: 'anonymous', writes: 'none', actions: 'none' },
  quota: { actions: 0, modelCalls: 0, reads: 1 },
  deadlineAt: Date.now() + 10000,
  parentRunId: runId,
  childTaskId: randomUUID(),
  taskHash: 'hash',
  contractHash: 'contract',
})
const save = async (t: CheckTask) => {
  const data = JSON.stringify({ test: true })
  return saveEvidence(runId, 'check-measurement', data, {
    parentRunId: runId,
    childTaskId: t.childTaskId,
    taskHash: t.taskHash,
    contractHash: t.contractHash,
    contentHash: bytesHash(data),
  })
}
describe('child evidence integrity', () => {
  it('rejects foreign child/parent references, changed bytes and forged measurement receipts', async () => {
    const a = task(),
      b = task(),
      ref = await save(a)
    await expect(checkEvidence(a, [ref])).resolves.toBeUndefined()
    await expect(checkEvidence(b, [ref])).rejects.toThrow('owner-mismatch')
    await expect(checkEvidence({ ...a, parentRunId: 'other' }, [ref])).rejects.toThrow(
      'parent-mismatch',
    )
    await expect(
      validateCheckResult(a, {
        status: 'completed',
        evidenceRefs: [ref],
        unchecked: [],
        measurements: [
          {
            measurementId: 'fake',
            childTaskId: a.childTaskId,
            taskHash: a.taskHash,
            measuredAt: Date.now(),
            verified: true,
            evidenceRefs: [ref],
            value: { fake: true },
          },
        ],
      }),
    ).rejects.toThrow('bytes-mismatch')
    const row = (
      await getDbClient().execute({
        sql: 'SELECT file_path FROM artifacts WHERE id=?',
        args: [ref],
      })
    ).rows[0]
    await writeFile(String(row.file_path), 'changed')
    await expect(checkEvidence(a, [ref])).rejects.toThrow('bytes-mismatch')
  })
  it('projects a refused submission as unfinished work, not corrupted history', () => {
    const a = task()
    const snapshot = {
      task: a,
      status: 'queued',
      acceptedAt: Date.now(),
      usage: { actions: 0, modelCalls: 0, reads: 0, elapsedMs: 0 },
    }
    const events = [
      { type: 'check-task:submitted', payload: { snapshot } },
      {
        type: 'check-task:terminal',
        payload: { snapshot: { ...snapshot, status: 'failed', error: 'check-v1-read-only' } },
      },
    ] as unknown as RunEvent[]
    expect(checkTaskReport(events).issues).toEqual([`check-task-unfinished:${a.childTaskId}`])
  })
  it('retains accepted work with no terminal event and refuses swapped/unreadable historical evidence', async () => {
    const a = task(),
      b = task(),
      ref = await save(b)
    const accepted = {
      type: 'check-task:accepted',
      payload: {
        snapshot: {
          task: a,
          status: 'queued',
          acceptedAt: Date.now(),
          usage: { actions: 0, modelCalls: 0, reads: 0, elapsedMs: 0 },
        },
      },
    } as unknown as RunEvent
    expect(checkTaskReport([accepted]).issues).toHaveLength(1)
    const completed = { ...structuredClone(accepted), type: 'check-task:terminal' }
    Object.assign(completed.payload.snapshot as object, {
      status: 'completed',
      result: { status: 'completed', unchecked: [], evidenceRefs: [ref], measurements: [] },
    })
    const row = (
      await getDbClient().execute({
        sql: 'SELECT file_path,metadata FROM artifacts WHERE id=?',
        args: [ref],
      })
    ).rows[0]
    const issues = await checkTaskArtifactIssues(
      [accepted, completed],
      [{ id: ref, path: String(row.file_path), metadata: JSON.parse(String(row.metadata)) }],
    )
    expect(issues.some((i) => i.includes('owner-mismatch'))).toBe(true)
    expect(
      checkTaskReport([accepted, completed], new Set()).issues.some((i) =>
        i.includes('unreadable'),
      ),
    ).toBe(true)
  })
})
