import { createHash } from 'node:crypto'
import { focusTestReceipt } from '../../execution/focus-test-fixture.ts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The report surface for one bounded focus measurement.
 *
 * Plan 4.6 requires the report to show the original image, the annotated image and the result of every
 * point, and to keep working across a restart. The rows are read back from the artifact the run saved,
 * so what a reviewer sees is what was measured rather than a re-derivation.
 */
vi.mock('../../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    arenaPort: 4173,
    agentModel: 'openai/test-mock',
    visionModel: 'test',
    features: { observation: false, ruleRouting: false, journeys: false },
    completionReview: { model: 'm', expectedModel: 'm', apiKey: '', timeoutMs: 100 },
    budget: {
      totalTimeoutMs: 20000,
      maxActions: 10,
      maxModelCalls: 6,
      toolTimeoutMs: 15000,
      modelRequestTimeoutMs: 10000,
      modelRequestMaxRetries: 1,
    },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))
import { initDatabase, getDbClient } from '../../storage/database.ts'
import {
  appendEvent,
  createRun,
  recordHypothesis,
  submitFinding,
} from '../../execution/run-manager.ts'
import { buildReport } from './run-report.ts'

beforeAll(initDatabase)

const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }

let dir = ''
const dirs = new Set<string>()
afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})
async function artifact(runId: string, type: string, body: unknown, metadata = {}) {
  const id = `${type}-${Math.random().toString(36).slice(2)}.json`
  dirs.add(dir)
  const file = join(dir, id)
  await writeFile(file, JSON.stringify(body), 'utf8')
  await getDbClient().execute({
    sql: 'INSERT INTO artifacts (id,run_id,type,file_path,metadata) VALUES (?,?,?,?,?)',
    args: [id, runId, type, file, JSON.stringify(metadata)],
  })
  return id
}

async function runWithMeasurement(over: { withScreenshot?: boolean } = {}) {
  const run = await createRun({
    goal: 'inspect search',
    environmentId: 'arena',
    entryUrl: 'http://localhost:4173/',
  })
  const candidateId = 'candidate-1'
  const screenshotRef =
    over.withScreenshot === false
      ? undefined
      : await artifact(run.id, 'screenshot', 'x', { evidenceIntegrity: clean })

  const sha = createHash('sha256').update(JSON.stringify('x')).digest('hex')
  const candidateRef = await artifact(
    run.id,
    'visual-candidate',
    {
      id: candidateId,
      runId: run.id,
      screenshotRef,
      screenshotSha: sha,
      perceivedRegion: { x: 100, y: 200, width: 400, height: 40 },
      excludedRegions: [],
      confidence: 'high',
    },
    { candidateId },
  )
  const receipt = structuredClone(
    focusTestReceipt(candidateId, {
      screenshotRef: screenshotRef ?? 'missing',
      screenshotSha: sha,
    }),
  ) as any
  receipt.samples[1].focusAfter = 'node-1'
  receipt.samples[1].focusedWithinMs = 92
  const receiptRef = await artifact(run.id, 'focus-receipt', receipt, { candidateId })
  const samplesRef = await artifact(
    run.id,
    'measurement',
    { receiptRef, samples: receipt.samples },
    { candidateId, kind: 'focus-samples' },
  )
  const annotatedRef = await artifact(run.id, 'screenshot', 'y', {
    annotation: true,
    kind: 'focus-annotation',
    sourceRef: screenshotRef,
  })
  // The derived image carries no candidate id of its own, so the run records the link explicitly.
  await appendEvent(run.id, 'visual-focus:annotated', {
    candidateId,
    annotatedRef,
    sourceRef: screenshotRef,
  })
  return { run, candidateId, candidateRef, receiptRef, samplesRef, annotatedRef, screenshotRef }
}

describe('focus measurement in the report', () => {
  it('lists every point with its coordinates and measured outcome', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run, samplesRef } = await runWithMeasurement()

    const report = await buildReport(run.id)

    const measurement = report!.focusMeasurements[0]
    expect(measurement.samplesRef).toBe(samplesRef)
    const points = measurement.points!
    expect(points).toHaveLength(3)
    expect(points[0]).toMatchObject({ side: 'left', x: 148, y: 220 })
    // A point that focused and a point that did not are distinguishable at a glance.
    expect(points.map((p) => p.focusedWithinMs)).toEqual([null, 92, null])
  })

  it('shows the window each point was actually observed for (P3/P3.4)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run } = await runWithMeasurement()

    const report = await buildReport(run.id)

    // The 500ms limit is only meaningful next to the time actually spent observing, so the report
    // carries it per point rather than stating the limit alone.
    expect(report!.focusMeasurements[0].points!.map((p) => p.observedWindowMs)).toEqual([
      520, 520, 520,
    ])
  })

  it('reports an unrecorded window as null, never as 0', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run, samplesRef } = await runWithMeasurement()
    const { readFile: read, writeFile: write } = await import('node:fs/promises')
    const file = join(dir, samplesRef)
    const body = JSON.parse(await read(file, 'utf8'))
    // A pre-P3 receipt has no window at all. 0 would read as "observed for no time", which is a
    // different and much worse claim than "this run never recorded it".
    for (const sample of body.samples) delete sample.observedWindowMs
    await write(file, JSON.stringify(body), 'utf8')

    const report = await buildReport(run.id)

    expect(report!.focusMeasurements[0].points!.map((p) => p.observedWindowMs)).toEqual([
      null,
      null,
      null,
    ])
  })

  it('reports visual spend as unknown rather than zero when the run recorded none', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run } = await runWithMeasurement()

    const report = await buildReport(run.id)

    // The product persists tokens, not dollars. A `0` here would read as "this run was free"; the
    // report must say the cost was not recorded so a reader cannot mistake unknown for zero.
    expect(report!.visual.costUsd).toBeNull()
    expect(report!.visual.costStatus).toBe('not-recorded')
  })

  it('counts the vision requests this run actually made', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run } = await runWithMeasurement()
    // The runtime emits this event with `purpose: visual-discovery` for each vision call; the report
    // must count them, so a zero here would be a real "none were made", not a field nobody populates.
    await appendEvent(run.id, 'model:request-finished', {
      attemptId: 'a1',
      purpose: 'visual-discovery',
      model: 'qwen',
    })
    await appendEvent(run.id, 'model:request-finished', {
      attemptId: 'a2',
      purpose: 'visual-discovery',
      model: 'qwen',
    })
    // An agent request is not a vision request and must not be counted as one.
    await appendEvent(run.id, 'model:request-finished', { attemptId: 'a3', source: 'agent' })

    const report = await buildReport(run.id)

    expect(report!.visual.visionRequests).toBe(2)
  })

  it('shows the perceived frame and the input it was bound to, so the two can be compared (W01)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run, candidateId } = await runWithMeasurement()
    // The witness is what the product observed about the bound element; the candidate box is what the
    // model perceived. The report must show both, or a reader cannot tell the frame from the input.
    await artifact(run.id, 'binding-witness', {
      candidateId,
      selector: '.visual-search-region input',
      tag: 'input',
      attributes: { id: 'product-search-input', type: 'search' },
      bounds: { x: 500, y: 142, width: 380, height: 38 },
    })

    const report = await buildReport(run.id)

    const measurement = report!.focusMeasurements[0]
    expect(measurement.perceivedRegion).toMatchObject({ x: 100, y: 200, width: 400, height: 40 })
    expect(measurement.boundBounds).toMatchObject({ x: 500, y: 142, width: 380, height: 38 })
  })

  it('reports an unrecorded region or witness as null rather than an empty box', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run } = await runWithMeasurement()

    const report = await buildReport(run.id)

    const measurement = report!.focusMeasurements[0]
    expect(measurement.perceivedRegion).toMatchObject({ x: 100, y: 200, width: 400, height: 40 })
    // No witness was saved for this run; a zeroed box would read as "the input is at 0,0".
    expect(measurement.boundBounds).toBeNull()
  })

  it('surfaces the original and annotated images as viewable refs', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run, annotatedRef, screenshotRef } = await runWithMeasurement()

    const report = await buildReport(run.id)
    const measurement = report!.focusMeasurements[0]

    expect(measurement.originalRef).toBe(screenshotRef)
    expect(measurement.annotatedRef).toBe(annotatedRef)
  })

  it('carries the binding and the positive control that licensed the result', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run } = await runWithMeasurement()

    const report = await buildReport(run.id)
    const measurement = report!.focusMeasurements[0]

    expect(measurement.nodeIdentity).toBe('node-1')
    expect(measurement.positiveControlFocusedWithinMs).toBe(20)
    expect(measurement.algorithmVersion).toBe('visual-focus-2')
  })

  it('reads the rows back from the persisted artifact, so a restart shows the same thing', async () => {
    // The report is built from what the run saved rather than from anything the model said, which is
    // also what makes it stable across a server restart.
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run } = await runWithMeasurement()

    const first = await buildReport(run.id)
    const second = await buildReport(run.id)

    expect(second!.focusMeasurements).toEqual(first!.focusMeasurements)
  })

  it('reports the measurement as unavailable rather than empty when its file is gone', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run, samplesRef } = await runWithMeasurement()
    const { rm } = await import('node:fs/promises')
    await rm(join(dir, samplesRef.split('/').pop()!), { force: true })

    const report = await buildReport(run.id)

    const measurement = report!.focusMeasurements[0]
    expect(measurement.samplesAvailable).toBe(false)
    // Unavailable is not the same as "nothing was measured", and the two must not look alike.
    expect(measurement.points).toBeUndefined()
  })

  it('omits the section entirely for a run with no focus measurement', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const run = await createRun({
      goal: 'buy',
      environmentId: 'arena',
      entryUrl: 'http://localhost:4173/',
    })

    const report = await buildReport(run.id)

    expect(report!.focusMeasurements).toEqual([])
  })

  it('includes the visual-focus finding with its bounded scope', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run, candidateRef, annotatedRef, receiptRef, samplesRef, screenshotRef } =
      await runWithMeasurement()
    const hypothesis = await recordHypothesis({
      runId: run.id,
      phenomenon: 'clicks in the region do not focus the input',
      basis: 'region wider than the input',
      verificationPlan: 'click derived points',
      status: 'open',
      evidenceRefs: [],
      kind: 'visual-focus',
      visualCandidateId: 'candidate-1',
    })
    await submitFinding({
      runId: run.id,
      source: 'agent',
      ruleId: null,
      ruleRevision: null,
      hypothesisId: hypothesis.id,
      validationStatus: 'supported',
      severity: 'warning',
      title: 'Input region does not focus the bound input at the sampled points',
      expected: 'the input focuses',
      actual: 'it never became the active element',
      stepId: 's0',
      evidenceRefs: [screenshotRef!, candidateRef, receiptRef, samplesRef, annotatedRef],
    })

    const report = await buildReport(run.id)

    const finding = report!.findings.find((f) => f.hypothesisId === hypothesis.id)
    expect(finding?.severity).toBe('warning')
    expect(report!.focusMeasurements[0].candidateId).toBe('candidate-1')
  })
})

it('separates visual token usage from agent tokens and retains unknown attempts', async () => {
  dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
  const { run } = await runWithMeasurement()
  await appendEvent(run.id, 'model:request-finished', {
    purpose: 'visual-discovery',
    inputTokens: 17,
    outputTokens: 3,
  })
  await appendEvent(run.id, 'model:request-finished', {
    source: 'agent',
    inputTokens: 900,
    outputTokens: 800,
  })
  expect((await buildReport(run.id))!.visual).toMatchObject({
    visionRequests: 1,
    inputTokens: 17,
    outputTokens: 3,
  })
  await appendEvent(run.id, 'model:request-started', {
    purpose: 'visual-discovery',
    attemptId: 'one',
  })
  await appendEvent(run.id, 'model:request-started', {
    purpose: 'visual-discovery',
    attemptId: 'two',
  })
  expect((await buildReport(run.id))!.visual).toMatchObject({
    visionRequests: 2,
    inputTokens: null,
    outputTokens: null,
  })
})

it('marks samples unverifiable when their receipt is missing', async () => {
  dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
  const { run, samplesRef } = await runWithMeasurement()
  const { readFile, rm } = await import('node:fs/promises')
  const sample = JSON.parse(await readFile(join(dir, samplesRef), 'utf8'))
  await rm(join(dir, sample.receiptRef))
  expect((await buildReport(run.id))!.focusMeasurements[0]).toMatchObject({
    samplesAvailable: false,
  })
})
