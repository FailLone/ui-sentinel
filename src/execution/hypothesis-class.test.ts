import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
vi.mock('../shared/config.ts', () => ({
  config: {
    databaseUrl: 'file::memory:',
    arenaPort: 4173,
    budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))
import { initDatabase } from '../storage/database.ts'
import {
  createRun,
  getRunSnapshot,
  recordHypothesis,
  updateHypothesis,
  submitFinding,
  getFindings,
} from './run-manager.ts'
import { saveEvidence } from './browser.ts'
import { focusTestReceipt } from './focus-test-fixture.ts'
beforeAll(initDatabase)
const ids: string[] = []
afterAll(async () => {
  for (const id of ids) await rm(`data/artifacts/${id}`, { recursive: true, force: true })
})
const base = {
  phenomenon: 'perceived input region may not focus',
  basis: 'visual candidate',
  verificationPlan: 'normal clicks',
  status: 'open' as const,
  evidenceRefs: [],
}
async function setup(kind: 'visual-focus' | undefined = 'visual-focus') {
  const run = await createRun({
    goal: 'Inspect shopping',
    entryUrl: 'http://localhost:4173/',
    environmentId: 'arena',
  })
  ids.push(run.id)
  const hypothesis = await recordHypothesis({
    ...base,
    runId: run.id,
    ...(kind ? { kind, visualCandidateId: 'candidate-1' } : {}),
  })
  return { runId: run.id, id: hypothesis.id }
}
async function evidence(runId: string, mutation?: string) {
  const shot = await saveEvidence(runId, 'screenshot', Buffer.from('original-image'))
  const sha = createHash('sha256').update('original-image').digest('hex')
  const candidate = await saveEvidence(
    runId,
    'visual-candidate',
    JSON.stringify({
      id: 'candidate-1',
      runId,
      screenshotRef: shot,
      screenshotSha: sha,
      perceivedRegion: { x: 100, y: 200, width: 400, height: 40 },
      excludedRegions: [],
      confidence: 'high',
    }),
    { candidateId: 'candidate-1' },
  )
  const receipt = structuredClone(
    focusTestReceipt('candidate-1', { screenshotRef: shot, screenshotSha: sha }),
  ) as any
  if (mutation === 'candidate') receipt.candidateId = 'foreign'
  if (mutation === 'screenshot') receipt.screenshotRef = 'foreign'
  if (mutation === 'baseline') receipt.samples[0].focusBefore = receipt.binding.nodeIdentity
  if (mutation === 'retest') {
    receipt.samples.pop()
    receipt.actionCost--
  }
  const ref = await saveEvidence(runId, 'focus-receipt', JSON.stringify(receipt))
  const measurement = await saveEvidence(
    runId,
    'measurement',
    JSON.stringify({ receiptRef: ref, samples: receipt.samples }),
    { kind: 'focus-samples' },
  )
  const annotation = await saveEvidence(runId, 'screenshot', Buffer.from('annotation'), {
    annotation: true,
    kind: 'focus-annotation',
    sourceRef: shot,
  })
  return [shot, candidate, ref, measurement, annotation]
}
describe('visual class persistence and promotion', () => {
  it('persists class on the server-created hypothesis event', async () => {
    const h = await setup()
    const s = await getRunSnapshot(h.runId)
    expect(s!.events.find((e) => e.type === 'hypothesis:created')?.payload).toMatchObject({
      kind: 'visual-focus',
      visualCandidateId: 'candidate-1',
    })
  })
  it('allows a complete matching supported receipt and its owned evidence', async () => {
    const h = await setup(),
      refs = await evidence(h.runId)
    await updateHypothesis(h.id, 'supported', refs)
    expect((await getRunSnapshot(h.runId))!.hypothesisRows.rows[0].status).toBe('supported')
  })
  for (const mutation of ['candidate', 'screenshot', 'baseline', 'retest'])
    it(`rejects ${mutation} at persistence, leaving no finding row`, async () => {
      const h = await setup(),
        refs = await evidence(h.runId, mutation)
      await expect(updateHypothesis(h.id, 'supported', refs)).rejects.toThrow(/focus/)
      await expect(
        submitFinding({
          runId: h.runId,
          hypothesisId: h.id,
          source: 'agent',
          ruleId: null,
          ruleRevision: null,
          validationStatus: 'supported',
          severity: 'warning',
          title: 'retitled',
          expected: 'focus',
          actual: 'no focus',
          stepId: null,
          evidenceRefs: refs,
        }),
      ).rejects.toThrow(/focus/)
      expect(await getFindings(h.runId)).toEqual([])
    })
  it('does not borrow a stored receipt omitted from the evidence refs or contradict it', async () => {
    const h = await setup(),
      refs = await evidence(h.runId)
    await expect(
      updateHypothesis(
        h.id,
        'supported',
        refs.filter((_, i) => i !== 2),
      ),
    ).rejects.toThrow(/receipt/)
    await expect(updateHypothesis(h.id, 'refuted', refs)).rejects.toThrow(/verdict/)
  })
  it('requires evidence for supported/refuted but permits honest unknown', async () => {
    const h = await setup()
    for (const status of ['supported', 'refuted'] as const)
      await expect(updateHypothesis(h.id, status)).rejects.toThrow(/receipt/)
    await updateHypothesis(h.id, 'inconclusive')
    expect((await getRunSnapshot(h.runId))!.hypothesisRows.rows[0].status).toBe('inconclusive')
  })
})
