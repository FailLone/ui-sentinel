import { it, expect, beforeAll, afterAll } from 'vitest'
import { rm } from 'node:fs/promises'
import { createEvidenceIntegrity } from './evidence-integrity.ts'
import { launchBrowser, observePage, annotateEvidence, saveEvidence } from './browser.ts'
import { initDatabase, getDbClient } from '../storage/database.ts'
import {
  createRun,
  submitFinding,
  getFindings,
  recordHypothesis,
  updateHypothesis,
} from './run-manager.ts'
import {
  evaluateTransition,
  type TransitionObservation,
  type TransitionRuleConfig,
} from '../rules/transition.ts'

const runs: string[] = []
beforeAll(() => initDatabase())
afterAll(async () => {
  await Promise.all(runs.map((id) => rm(`data/artifacts/${id}`, { recursive: true, force: true })))
})

it('preserves capture lineage for originals and derived screenshots, blocking both mixed and wholly intervened claims', async () => {
  const run = await createRun({
    goal: 'Evidence lineage',
    environmentId: 'test',
    entryUrl: 'http://localhost',
  })
  runs.push(run.id)
  const tracker = createEvidenceIntegrity()
  const browser = await launchBrowser()
  try {
    await browser.page.setContent('<button disabled>Unavailable control</button>')
    const before = await observePage(browser.page, run.id, () => ({
      evidenceIntegrity: tracker.snapshot(),
    }))
    const finding = {
      runId: run.id,
      source: 'agent' as const,
      ruleId: null,
      ruleRevision: null,
      hypothesisId: null,
      validationStatus: 'supported' as const,
      severity: 'error' as const,
      title: 'Observed bounded state',
      expected: 'Operable control',
      actual: 'Disabled',
      stepId: null,
    }
    const original = await submitFinding({ ...finding, evidenceRefs: before.evidenceRefs })
    const intervention = tracker.intervene({
      kind: 'write-denied',
      url: 'http://localhost/submit',
      method: 'POST',
    })
    const after = await observePage(browser.page, run.id, () => ({
      evidenceIntegrity: tracker.snapshot(),
    }))
    const derivedClean = await annotateEvidence(
      browser.browser,
      run.id,
      before.snapshot.screenshotPath,
      [],
      before.snapshot.viewport,
    )
    const derivedIntervened = await annotateEvidence(
      browser.browser,
      run.id,
      after.snapshot.screenshotPath,
      [],
      after.snapshot.viewport,
    )
    const rows = await getDbClient().execute({
      sql: 'SELECT id,metadata FROM artifacts WHERE run_id=?',
      args: [run.id],
    })
    const metadata = new Map(
      rows.rows.map((row) => [String(row.id), JSON.parse(String(row.metadata))]),
    )
    expect(metadata.get(derivedClean).evidenceIntegrity).toMatchObject({
      status: 'clean',
      interventionIds: [],
    })
    expect(metadata.get(derivedIntervened).evidenceIntegrity).toMatchObject({
      status: 'intervened',
      interventionIds: [intervention.id],
    })
    expect(before.snapshot.evidenceIntegrity?.status).toBe('clean')
    const hypothesis = await recordHypothesis({
      runId: run.id,
      phenomenon: 'Intervened state',
      basis: 'After policy denial',
      verificationPlan: 'Unknown until a fresh trusted run',
      status: 'open',
      evidenceRefs: after.evidenceRefs,
    })
    await updateHypothesis(hypothesis.id, 'inconclusive', before.evidenceRefs)
    await expect(
      submitFinding({ ...finding, hypothesisId: hypothesis.id, evidenceRefs: before.evidenceRefs }),
    ).rejects.toThrow('inspection-intervention')
    await expect(updateHypothesis(hypothesis.id, 'supported', before.evidenceRefs)).rejects.toThrow(
      'inspection-intervention',
    )
    await expect(submitFinding({ ...finding, evidenceRefs: after.evidenceRefs })).rejects.toThrow(
      'inspection-intervention',
    )
    await expect(
      submitFinding({ ...finding, evidenceRefs: [derivedIntervened, before.evidenceRefs[1]!] }),
    ).rejects.toThrow('inspection-intervention')
    // An annotation of an immutable clean image stays historical clean evidence even if rendered later.
    await expect(
      submitFinding({
        ...finding,
        validationStatus: 'refuted',
        evidenceRefs: [derivedClean, before.evidenceRefs[1]!],
      }),
    ).resolves.toBeDefined()
    expect((await getFindings(run.id)).find((f) => f.id === original.id)?.validationStatus).toBe(
      'supported',
    )
    const malformed = await saveEvidence(run.id, 'snapshot', '{}', {
      evidenceIntegrity: { status: 'clean', interventionIds: [intervention.id] },
    })
    await expect(submitFinding({ ...finding, evidenceRefs: [malformed] })).rejects.toThrow(
      'inspection-intervention',
    )
  } finally {
    await browser.close()
  }
})

it('does not evaluate either positive or negative temporal evidence as normal behavior after intervention', () => {
  const rule: TransitionRuleConfig = {
    type: 'transition',
    name: 'Recovery',
    description: 'Ready within five seconds',
    trigger: { eventType: 'retryable-failure' },
    expectation: { condition: 'element-actionable', target: 'Recovery', timeoutMs: 5000 },
    severity: 'error',
  }
  const observation: TransitionObservation = {
    eventType: 'retryable-failure',
    condition: 'element-actionable',
    startedAtMs: 0,
    observedUntilMs: 5100,
    samples: Array.from({ length: 26 }, (_, i) => ({
      atMs: i * 200,
      target: 'Recovery',
      value: false,
    })),
    evidenceRefs: [],
  }
  expect(evaluateTransition(rule, observation)).toBe('fail')
  for (const value of [true, false]) {
    expect(
      evaluateTransition(rule, {
        ...observation,
        samples: observation.samples.map((s) => ({ ...s, value })),
        evidenceIntegrity: { version: 1, status: 'intervened', interventionIds: ['denied'] },
      }),
    ).toBe('unknown')
  }
})
