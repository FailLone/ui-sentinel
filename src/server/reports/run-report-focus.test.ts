import { beforeAll, describe, expect, it, vi } from 'vitest'
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
async function artifact(runId: string, type: string, body: unknown, metadata = {}) {
  const id = `${type}-${Math.random().toString(36).slice(2)}.json`
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

  const receipt = {
    version: 1,
    candidateId,
    screenshotRef: screenshotRef ?? 'missing',
    documentEpoch: 'epoch-0',
    url: 'http://localhost:4173/',
    scroll: { x: 0, y: 0 },
    viewport: { width: 1280, height: 768 },
    binding: { elementRef: 'e1', nodeIdentity: 'input#q@e1', reason: 'only input in region' },
    positiveControl: {
      x: 300,
      y: 220,
      hit: { ref: 'e1', tag: 'input', relation: 'self' },
      focusBefore: null,
      focusAfter: 'input#q@e1',
      focusedWithinMs: 88,
      valueChanged: false,
      documentEpoch: 'epoch-0',
      integrity: clean,
      ok: true,
    },
    samples: [],
    resets: [],
    actionCost: 3,
    integrity: clean,
    algorithmVersion: 'visual-focus-1',
  }
  const receiptRef = await artifact(run.id, 'focus-receipt', receipt, { candidateId })
  const samplesRef = await artifact(
    run.id,
    'measurement',
    {
      receiptRef,
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
          documentEpoch: 'epoch-0',
          integrity: clean,
        },
        {
          side: 'right',
          x: 700,
          y: 220,
          hit: { ref: 'e9', tag: 'div', relation: 'ancestor' },
          focusBefore: null,
          focusAfter: 'input#q@e1',
          focusedWithinMs: 92,
          valueChanged: false,
          documentEpoch: 'epoch-0',
          integrity: clean,
        },
      ],
    },
    { candidateId, kind: 'focus-samples' },
  )
  const annotatedRef = await artifact(run.id, 'screenshot', 'y', {
    annotation: true,
    sourceRef: screenshotRef,
  })
  // The derived image carries no candidate id of its own, so the run records the link explicitly.
  await appendEvent(run.id, 'visual-focus:annotated', {
    candidateId,
    annotatedRef,
    sourceRef: screenshotRef,
  })
  return { run, candidateId, receiptRef, samplesRef, annotatedRef, screenshotRef }
}

describe('focus measurement in the report', () => {
  it('lists every point with its coordinates and measured outcome', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uis-report-'))
    const { run, samplesRef } = await runWithMeasurement()

    const report = await buildReport(run.id)

    const measurement = report!.focusMeasurements[0]
    expect(measurement.samplesRef).toBe(samplesRef)
    const points = measurement.points!
    expect(points).toHaveLength(2)
    expect(points[0]).toMatchObject({ side: 'left', x: 148, y: 220 })
    // A point that focused and a point that did not are distinguishable at a glance.
    expect(points.map((p) => p.focusedWithinMs)).toEqual([null, 92])
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

    expect(measurement.nodeIdentity).toBe('input#q@e1')
    expect(measurement.positiveControlFocusedWithinMs).toBe(88)
    expect(measurement.algorithmVersion).toBe('visual-focus-1')
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
    const { run, receiptRef, samplesRef, screenshotRef } = await runWithMeasurement()
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
      evidenceRefs: [screenshotRef!, receiptRef, samplesRef],
    })

    const report = await buildReport(run.id)

    const finding = report!.findings.find((f) => f.hypothesisId === hypothesis.id)
    expect(finding?.severity).toBe('warning')
    expect(report!.focusMeasurements[0].candidateId).toBe('candidate-1')
  })
})
