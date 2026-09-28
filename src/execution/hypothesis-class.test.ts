import { beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../shared/config.ts', () => ({
  config: {
    databaseUrl: 'file::memory:',
    arenaPort: 4173,
    budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))
import { initDatabase } from '../storage/database.ts'
import { createRun, getRunSnapshot, recordHypothesis, updateHypothesis } from './run-manager.ts'

beforeAll(initDatabase)

let counter = 0
async function newRun() {
  const run = await createRun({
    goal: `inspect the shopping flow ${++counter}`,
    entryUrl: 'http://localhost:4173/',
    environmentId: 'arena',
  })
  return run.id
}

const base = {
  phenomenon: 'clicks inside the search area do not focus the input',
  basis: 'the perceived region is wider than the native input',
  verificationPlan: 'click the derived points and watch document.activeElement',
  status: 'open' as const,
  evidenceRefs: [],
}

describe('hypothesis class persistence', () => {
  it('records the visual-focus class and bound candidate on the created event', async () => {
    // The created event is the authoritative record: it is append-only and written by the server, so a
    // later status change cannot rewrite which class the hypothesis was registered under.
    const runId = await newRun()
    await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })

    const snapshot = await getRunSnapshot(runId)
    const event = snapshot!.events.find((e) => e.type === 'hypothesis:created')
    expect(event?.payload.kind).toBe('visual-focus')
    expect(event?.payload.visualCandidateId).toBe('candidate-7')
  })

  it('records no class for an ordinary hypothesis', async () => {
    const runId = await newRun()
    await recordHypothesis({ ...base, runId })

    const snapshot = await getRunSnapshot(runId)
    const event = snapshot!.events.find((e) => e.type === 'hypothesis:created')
    expect(event?.payload.kind ?? null).toBeNull()
  })

  it('refuses to resolve a visual-focus hypothesis to supported without a receipt', async () => {
    // The gate has to hold on the persistence path too, not only in the tool that calls it.
    const runId = await newRun()
    const created = await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })

    await expect(updateHypothesis(created.id, 'supported')).rejects.toThrow(/focus receipt/i)
  })

  it('refuses to resolve it to refuted without a receipt', async () => {
    const runId = await newRun()
    const created = await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })

    await expect(updateHypothesis(created.id, 'refuted')).rejects.toThrow(/focus receipt/i)
  })

  it('allows a visual-focus hypothesis to be resolved to inconclusive', async () => {
    const runId = await newRun()
    const created = await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })

    await updateHypothesis(created.id, 'inconclusive')
    const snapshot = await getRunSnapshot(runId)
    expect(snapshot!.hypothesisRows.rows[0].status).toBe('inconclusive')
  })

  it('allows promotion when a valid receipt bound to the candidate exists', async () => {
    // The positive direction matters as much as the refusal: a gate that always blocks would pass the
    // refusal tests above while making the feature impossible.
    const runId = await newRun()
    const created = await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })
    await writeFocusReceipt(runId, 'candidate-7', {
      screenshotRef: await writeArtifact(runId, 'screenshot', 'x'),
    })

    await updateHypothesis(created.id, 'supported')
    const snapshot = await getRunSnapshot(runId)
    expect(snapshot!.hypothesisRows.rows[0].status).toBe('supported')
  })

  it('refuses promotion when the only receipt is bound to another candidate', async () => {
    const runId = await newRun()
    const created = await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })
    await writeFocusReceipt(runId, 'candidate-other')

    await expect(updateHypothesis(created.id, 'supported')).rejects.toThrow(/candidate-mismatch/i)
  })

  it('refuses promotion when the receipt names the right candidate but another screenshot', async () => {
    // The receipt has to name BOTH the candidate and the screenshot being promoted. Comparing the
    // receipt's screenshot against itself would make that half of the rule a tautology, so a receipt
    // measured against a different observation would sail through.
    const runId = await newRun()
    const created = await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })
    await writeFocusReceipt(runId, 'candidate-7', { screenshotRef: 'shot-other' })

    await expect(updateHypothesis(created.id, 'supported')).rejects.toThrow(/screenshot/i)
  })

  it('allows promotion when the receipt names the right candidate and a real screenshot of the run', async () => {
    const runId = await newRun()
    const shot = await writeArtifact(runId, 'screenshot', 'x')
    const created = await recordHypothesis({
      ...base,
      runId,
      kind: 'visual-focus',
      visualCandidateId: 'candidate-7',
    })
    await writeFocusReceipt(runId, 'candidate-7', { screenshotRef: shot })

    await updateHypothesis(created.id, 'supported')
    const snapshot = await getRunSnapshot(runId)
    expect(snapshot!.hypothesisRows.rows[0].status).toBe('supported')
  })

  it('resolves an ordinary hypothesis to a status without any receipt', async () => {
    const runId = await newRun()
    const created = await recordHypothesis({ ...base, runId })

    await updateHypothesis(created.id, 'inconclusive')
    const snapshot = await getRunSnapshot(runId)
    expect(snapshot!.hypothesisRows.rows[0].status).toBe('inconclusive')
  })
})

/** Write a structurally valid focus receipt artifact owned by this run. */
/** Write a screenshot artifact owned by this run, as the scan/probe would. */
async function writeArtifact(runId: string, type: string, body: string) {
  const { getDbClient } = await import('../storage/database.ts')
  const id = `${type}-${Math.random().toString(36).slice(2)}`
  await getDbClient().execute({
    sql: `INSERT INTO artifacts (id, run_id, type, file_path, metadata) VALUES (?, ?, ?, ?, '{}')`,
    args: [id, runId, type, `/tmp/${id}`],
  })
  void body
  return id
}

async function writeFocusReceipt(
  runId: string,
  candidateId: string,
  over: { screenshotRef?: string } = {},
) {
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createFocusReceipt } = await import('./focus-receipt.ts')
  const { getDbClient } = await import('../storage/database.ts')

  const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
  // Unique per call: the suite shares one in-memory database, so a fixed id collides across tests.
  const id = `receipt-${candidateId}-${Math.random().toString(36).slice(2)}`
  const dir = await mkdtemp(join(tmpdir(), 'uis-receipt-'))
  const path = join(dir, `${id}.json`)
  const receipt = createFocusReceipt({
    candidateId,
    screenshotRef: over.screenshotRef ?? 'shot-1',
    screenshotSha: 'a'.repeat(64),
    documentEpoch: 'epoch-1',
    url: 'http://localhost:4173/',
    scroll: { x: 0, y: 0 },
    viewport: { width: 1280, height: 768 },
    binding: {
      elementRef: 'e1',
      nodeIdentity: 'input#q@e1',
      reason: 'the only input in the region',
    },
    positiveControl: {
      x: 300,
      y: 220,
      hit: { ref: 'e1', tag: 'input', relation: 'self' },
      focusBefore: null,
      focusAfter: 'input#q@e1',
      focusedWithinMs: 88,
      valueChanged: false,
      documentEpoch: 'epoch-1',
      integrity: clean,
      ok: true,
    },
    samples: [
      {
        side: 'left',
        x: 148,
        y: 220,
        hit: { ref: 'e9', tag: 'div', relation: 'ancestor' },
        focusBefore: null,
        focusAfter: null,
        focusedWithinMs: null,
        valueChanged: false,
        documentEpoch: 'epoch-1',
        integrity: clean,
      },
    ],
    resets: [{ x: 10, y: 10, introducedChange: false, integrity: clean }],
    actionCost: 3,
    integrity: clean,
    algorithmVersion: 'visual-focus-1',
  })
  await writeFile(path, JSON.stringify(receipt), 'utf8')
  await getDbClient().execute({
    sql: `INSERT INTO artifacts (id, run_id, type, file_path, metadata) VALUES (?, ?, 'focus-receipt', ?, '{}')`,
    args: [id, runId, path],
  })
}
