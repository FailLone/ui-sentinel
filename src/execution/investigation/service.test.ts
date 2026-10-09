import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { rm, writeFile } from 'node:fs/promises'
vi.mock('../../shared/config.ts', () => ({
  config: {
    databaseUrl: 'file::memory:',
    arenaPort: 4173,
    budget: { totalTimeoutMs: 30000, maxActions: 10, maxModelCalls: 10 },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))
import { initDatabase, getDbClient } from '../../storage/database.ts'
import {
  createRun,
  getFindings,
  updateHypothesis,
  assertPromotableHypothesis,
  getEvents,
} from '../run-manager.ts'
import { saveEvidence } from '../browser.ts'
import { investigateProgram } from './service.ts'
import { programInput } from './program.ts'
let browser: Browser
const ids: string[] = []
beforeAll(async () => {
  await initDatabase()
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => {
  await browser.close()
  await Promise.all(ids.map((id) => rm(`data/artifacts/${id}`, { recursive: true, force: true })))
})
describe('program evidence persistence', () => {
  it('persists missing-target diagnostics and returns honest recovery guidance', async () => {
    const run = await createRun({
      goal: 'Inspect',
      environmentId: 'arena',
      entryUrl: 'http://localhost:4173',
    })
    ids.push(run.id)
    const page = await browser.newPage()
    try {
      await page.setContent('<p>Public status</p>')
      const result = await investigateProgram(
        programInput.parse({
          version: 1,
          phenomenon: 'Previously observed status is unavailable',
          basis: 'Public status content',
          targets: [{ name: 'notice', selector: '#missing' }],
          steps: [{ op: 'measure', name: 'now' }],
          assertions: [
            {
              expectation: 'Status is visible',
              left: { sample: 'now', target: 'notice', metric: 'displayed' },
              operator: 'eq',
              right: { value: true },
            },
          ],
        }),
        {
          page,
          runId: run.id,
          guard: () => {},
          signal: new AbortController().signal,
          remainingActions: () => 5,
          clean: () => true,
          metadata: () => ({}),
          registered: () => {},
          resolved: () => {},
          act: async () => {},
          screenshot: async () => saveEvidence(run.id, 'screenshot', await page.screenshot()),
        },
      )
      expect(result.verdict).toBe('unknown')
      expect(result.targetIssues).toEqual([
        { sample: 'now', target: 'notice', reason: 'target-missing' },
      ])
      expect(result.nextStep).toContain('inconclusive')
      expect(result.nextStep).toContain('does not erase')
      expect(await getFindings(run.id)).toHaveLength(0)
      const saved = (await getEvents(run.id)).find((e) => e.type === 'program:completed')
      expect(saved!.payload).toMatchObject({
        targetIssues: result.targetIssues,
        verdict: 'unknown',
      })
    } finally {
      await page.close()
    }
  })
  it('saves replayable source and computed finding; forbids verdict changes and tampering', async () => {
    const run = await createRun({
      goal: 'Inspect',
      environmentId: 'arena',
      entryUrl: 'http://localhost:4173',
    })
    ids.push(run.id)
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent('<p id="target" style="position:absolute;top:900px">Notice</p>')
    try {
      const program = programInput.parse({
        version: 1,
        phenomenon: 'Notice may be outside viewport',
        basis: 'Notice expected within current viewport by the task',
        targets: [{ name: 'notice', selector: '#target' }],
        steps: [{ op: 'measure', name: 'now' }],
        assertions: [
          {
            expectation: 'Notice is fully within viewport',
            left: { sample: 'now', target: 'notice', metric: 'viewportFraction' },
            operator: 'gte',
            right: { value: 1 },
          },
        ],
      })
      const result = await investigateProgram(program, {
        page,
        runId: run.id,
        guard: () => {},
        signal: new AbortController().signal,
        remainingActions: () => 5,
        clean: () => true,
        metadata: () => ({}),
        registered: () => {},
        resolved: () => {},
        act: async () => {},
        screenshot: async () => saveEvidence(run.id, 'screenshot', await page.screenshot()),
      })
      expect(result.verdict).toBe('fail')
      expect('error' in result).toBe(false)
      expect(await getFindings(run.id)).toHaveLength(1)
      expect((await getEvents(run.id)).filter((e) => e.type === 'program:completed')).toHaveLength(
        1,
      )
      if(!result.hypothesisId)throw Error('comparison must own a hypothesis')
      await expect(
        updateHypothesis(result.hypothesisId, 'refuted', result.evidenceRefs),
      ).rejects.toThrow('verdict')
      await expect(
        assertPromotableHypothesis(run.id, result.hypothesisId, 'supported', [result.receiptRef]),
      ).rejects.toThrow('required')
      const db = getDbClient()
      const row = await db.execute({
        sql: 'SELECT file_path FROM artifacts WHERE id=?',
        args: [result.receiptRef],
      })
      await writeFile(String(row.rows[0]!.file_path), '{}')
      await expect(
        updateHypothesis(result.hypothesisId, 'supported', result.evidenceRefs),
      ).rejects.toThrow('modified')
    } finally {
      await page.close()
    }
  })
})
