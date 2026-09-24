import { describe, it, expect } from 'vitest'
import {
  scoreExportRun,
  scoreExportBatch,
  auditDurability,
  verifyArtifactBytes,
  type ExportRunInput,
} from './scorer.ts'
import { equivalentRetryRules, type DeclaredRule } from './expectations.ts'
import type { TransitionObservation } from '../../../src/rules/transition.ts'
import type { RunEvent } from '../../../src/shared/types.ts'

/**
 * The scorer's counterexample suite (E01-E10).
 *
 * Every case here starts from a run the scorer *accepts* and then tampers with exactly one thing,
 * so a failing case means the scorer caught that tamper rather than that the fixture was malformed.
 * The positive halves are asserted too: a suite that rejected everything would satisfy the negative
 * cases without demonstrating the scorer can pass anything.
 */

const HASH = 'a'.repeat(64)
const JOB = 'job-abc123'
const NOTICE = `Export ready. orders-q3.csv is available.`

let seq = 0
function event(type: string, payload: Record<string, unknown>): RunEvent {
  seq++
  return {
    id: `evt-${seq}`,
    runId: 'run-1',
    seq,
    type,
    timestamp: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    stepId: null,
    actionId: null,
    payload,
    evidenceRefs: [],
  }
}

/** A five-second window of an inoperable retry control, measured on the declared grid. */
function inoperableWindow(startedAtMs = 1000): TransitionObservation {
  return {
    eventType: 'retryable-failure',
    fromState: 'failed',
    toState: 'retry-actionable',
    condition: 'element-actionable',
    startedAtMs,
    observedUntilMs: startedAtMs + 5000,
    // 26 samples at 200ms: the first and last land within the evaluator's 250ms boundary tolerance.
    samples: Array.from({ length: 26 }, (_, i) => ({
      atMs: startedAtMs + i * 200,
      target: 'Retry button',
      value: false,
    })),
    evidenceRefs: ['measurement.json', 'defect.png'],
  }
}

function snapshot(jobId = JOB) {
  return {
    url: 'http://127.0.0.1:4183/',
    title: 'Exports',
    viewport: { width: 1280, height: 720 },
    elements: [
      {
        selector: '#job',
        tag: 'p',
        text: `${jobId} failed`,
        visible: true,
        bounds: { x: 0, y: 0, width: 100, height: 20 },
        attributes: {},
      },
      {
        selector: '#retry',
        tag: 'button',
        text: 'Retry button',
        visible: true,
        enabled: false,
        bounds: { x: 0, y: 40, width: 100, height: 20 },
        attributes: {},
      },
    ],
  }
}

/** A passing E2 run: blocked, unknown, one fully-measured inoperable-window finding. */
function e2Input(): ExportRunInput {
  return {
    truth: {
      creates: 1,
      retries: 0,
      jobs: 1,
      artifacts: 0,
      attempts: [0],
      artifactContents: [],
    },
    requests: [
      { method: 'POST', path: '/api/exports' },
      { method: 'GET', path: `/api/exports/${JOB}` },
      { method: 'GET', path: `/api/exports/${JOB}/eligibility` },
    ],
    report: {
      runId: 'run-1',
      status: 'blocked',
      businessResult: 'unknown',
      stopReason: 'blocked',
      persistence: { status: 'verified', issues: [] },
      events: [
        event('business:observation', {
          url: 'http://127.0.0.1:4183/api/exports',
          method: 'POST',
          statusCode: 202,
          body: { jobId: JOB, attempt: 0, version: 1, phase: 'processing', notice: null },
          bodyReadFailed: false,
          contractHash: HASH,
        }),
        event('business:fact', {
          schemaVersion: '1',
          profileId: 'export',
          contractHash: HASH,
          operationId: JOB,
          attempt: 0,
          version: 1,
          phase: 'processing',
          result: 'unknown',
          retryEligibility: 'denied',
          notice: null,
          sourceEventId: 'evt-1',
        }),
        event('business:observation', {
          url: `http://127.0.0.1:4183/api/exports/${JOB}`,
          method: 'GET',
          statusCode: 200,
          body: {
            jobId: JOB,
            attempt: 0,
            version: 2,
            phase: 'failed',
            notice: 'Export could not complete. You may try again.',
          },
          bodyReadFailed: false,
          contractHash: HASH,
        }),
        event('business:fact', {
          schemaVersion: '1',
          profileId: 'export',
          contractHash: HASH,
          operationId: JOB,
          attempt: 0,
          version: 2,
          phase: 'failed',
          result: 'unknown',
          retryEligibility: 'allowed',
          notice: 'Export could not complete. You may try again.',
          sourceEventId: 'evt-3',
        }),
        event('finish:accepted', {
          businessResult: 'unknown',
          blocked: true,
          reasonCode: 'observed-blocker',
          verifiedOperations: [],
        }),
      ],
      findings: [
        {
          id: 'finding-1',
          source: 'agent',
          ruleId: null,
          hypothesisId: 'h-1',
          validationStatus: 'supported',
          // The acceptance plan requires the E2 finding to cite the original screenshot, the
          // current task's visible feedback, the eligibility source and the stable target - so the
          // honest fixture cites all four and the scorer checks for them.
          evidenceRefs: ['measurement.json', 'defect.png', 'snapshot.json', 'eligibility.json'],
        },
      ],
      hypotheses: [{ id: 'h-1', status: 'supported', evidenceRefs: ['defect.png'] }],
      usage: { actions: 5, modelCalls: 8, elapsedMs: 40_000 },
      budget: { totalTimeoutMs: 300_000, maxActions: 40, maxModelCalls: 30 },
    },
    artifacts: {
      'defect.png': { type: 'screenshot', exists: true, sha256: 'b'.repeat(64) },
      'measurement.json': {
        type: 'measurement',
        exists: true,
        data: { ...inoperableWindow(), selector: '#retry' },
      },
      'snapshot.json': { type: 'snapshot', exists: true, data: snapshot() },
      'eligibility.json': {
        type: 'snapshot',
        exists: true,
        data: { prerequisite: { met: false } },
      },
    },
    contract: {
      profileId: 'export',
      revision: '1',
      hash: HASH,
      retryAvailabilityMs: 5000,
      adapter: { id: 'export', revision: '1' },
      environment: { id: 'export-arena', origin: 'http://127.0.0.1:4183' },
      effects: { maxCreates: 1, maxRetriesPerOperation: 1 },
    },
    selection: { datasetId: 'orders-q3', format: 'csv' },
    rules: [{ id: 'overlay-blocking', revision: '1.0.0', enabled: true }],
  }
}

/** A passing E0 run: one create, a succeeded terminal fact, a real artifact. */
function e0Input(): ExportRunInput {
  const input = e2Input()
  return {
    ...input,
    truth: {
      creates: 1,
      retries: 0,
      jobs: 1,
      artifacts: 1,
      attempts: [0],
      artifactContents: [{ datasetId: 'orders-q3', format: 'csv', rows: ['id,value', '1,alpha'] }],
    },
    report: {
      ...input.report,
      status: 'completed',
      businessResult: 'success',
      stopReason: 'goal-reached',
      events: [
        event('business:observation', {
          url: 'http://127.0.0.1:4183/api/exports',
          method: 'POST',
          statusCode: 202,
          body: { jobId: JOB, attempt: 0, version: 1, phase: 'processing', notice: null },
          bodyReadFailed: false,
          contractHash: HASH,
        }),
        event('business:fact', {
          schemaVersion: '1',
          profileId: 'export',
          contractHash: HASH,
          operationId: JOB,
          attempt: 0,
          version: 1,
          phase: 'processing',
          notice: null,
          sourceEventId: 'evt-1',
        }),
        event('business:observation', {
          url: `http://127.0.0.1:4183/api/exports/${JOB}`,
          method: 'GET',
          statusCode: 200,
          body: { jobId: JOB, attempt: 0, version: 2, phase: 'succeeded', notice: NOTICE },
          bodyReadFailed: false,
          contractHash: HASH,
        }),
        event('business:fact', {
          schemaVersion: '1',
          profileId: 'export',
          contractHash: HASH,
          operationId: JOB,
          attempt: 0,
          version: 2,
          phase: 'succeeded',
          notice: NOTICE,
          sourceEventId: 'evt-3',
        }),
        event('rule:evaluated', { ruleId: 'business-outcome', verdict: 'pass' }),
        event('finish:accepted', {
          businessResult: 'success',
          blocked: false,
          reasonCode: 'scope-covered',
          verifiedOperations: [{ operationId: JOB, businessResult: 'success' }],
        }),
      ],
      findings: [],
    },
    artifacts: {
      'shot.png': { type: 'screenshot', exists: true, sha256: 'c'.repeat(64) },
      'download.csv': { type: 'snapshot', exists: true, data: { text: 'id,value\n1,alpha' } },
    },
  }
}

describe('the export scorer accepts an honest run', () => {
  it('passes a correctly-reported E0 and E2', () => {
    const e0 = scoreExportRun('E0', e0Input())
    expect(e0.failedAssertions, JSON.stringify(e0.assertions)).toEqual([])
    expect(e0.classification).toBe('pass')
    const e2 = scoreExportRun('E2', e2Input())
    expect(e2.failedAssertions, JSON.stringify(e2.assertions)).toEqual([])
    expect(e2.classification).toBe('pass')
  })

  it('does not grade a run whose fixture could not be verified', () => {
    // `invalid` is a distinct outcome: a broken fixture is not evidence of a product defect, so it
    // must not be counted as a failure either.
    const score = scoreExportRun('E2', { ...e2Input(), invalidReason: 'fixture-not-verified' })
    expect(score.classification).toBe('invalid')
    expect(score.passed).toBe(false)
  })
})

describe('scorer counterexamples (E01-E10)', () => {
  it('E01: a completed-looking run with no accepted finish is rejected', () => {
    const input = e0Input()
    const tampered: ExportRunInput = {
      ...input,
      report: {
        ...input.report,
        events: input.report.events.filter((e) => e.type !== 'finish:accepted'),
      },
    }
    const score = scoreExportRun('E0', tampered)
    expect(score.assertions.explicitFinish).toBe(false)
    expect(score.passed).toBe(false)
  })

  it('E02: a success report for a job the truth says failed (or another job) is rejected', () => {
    // (a) the report claims success while the private truth produced no artifact and no retry.
    const lying = scoreExportRun('E2', {
      ...e2Input(),
      report: { ...e2Input().report, status: 'completed', businessResult: 'success' },
    })
    expect(lying.assertions.businessResultMatchesTruth).toBe(false)
    expect(lying.passed).toBe(false)
    // (b) the terminal fact is a success while the variant's truth is a failure.
    const wrongPhase = e2Input()
    const score = scoreExportRun('E2', {
      ...wrongPhase,
      report: {
        ...wrongPhase.report,
        events: wrongPhase.report.events.map((e) =>
          e.type === 'business:fact' && (e.payload as { phase?: string }).phase === 'failed'
            ? event('business:fact', { ...e.payload, phase: 'succeeded', result: 'success' })
            : e,
        ),
      },
    })
    expect(score.assertions.terminalPhaseMatchesTruth).toBe(false)
    expect(score.passed).toBe(false)
    // (c) the facts name an entity this run never created.
    const foreign = scoreExportRun('E2', {
      ...wrongPhase,
      report: {
        ...wrongPhase.report,
        events: wrongPhase.report.events.map((e) =>
          e.type === 'business:fact'
            ? event('business:fact', { ...e.payload, operationId: 'job-someone-else' })
            : e,
        ),
      },
    })
    expect(foreign.assertions.factsBelongToCreatedJob).toBe(false)
    expect(foreign.passed).toBe(false)
  })

  it('E03: a probed-but-unused recovery, or a second create posing as recovery, is rejected', () => {
    // (a) E1 reported as recovered while no retry ever happened.
    const probed = scoreExportRun('E1', {
      ...e0Input(),
      truth: { creates: 1, retries: 0, jobs: 1, artifacts: 0, artifactContents: [] },
    })
    expect(probed.assertions.recoveryIsRetryNotCreate).toBe(false)
    expect(probed.passed).toBe(false)
    // (b) recovery implemented as a second create: two creates, no retry.
    const secondCreate = scoreExportRun('E1', {
      ...e0Input(),
      truth: {
        creates: 2,
        retries: 0,
        jobs: 2,
        artifacts: 1,
        artifactContents: [{ datasetId: 'orders-q3', format: 'csv', rows: ['id,value'] }],
      },
    })
    expect(secondCreate.assertions.recoveryIsRetryNotCreate).toBe(false)
    expect(secondCreate.assertions.truthMatchesVariant).toBe(false)
    expect(secondCreate.passed).toBe(false)
    // (c) a real retry that quietly addressed a different entity. The counters look right - one
    // create, one retry, one artifact - so only the requests reveal where the retry went.
    const recovered: ExportRunInput = {
      ...e0Input(),
      truth: {
        creates: 1,
        retries: 1,
        jobs: 1,
        artifacts: 1,
        artifactContents: [{ datasetId: 'orders-q3', format: 'csv', rows: ['id,value'] }],
      },
    }
    // The honest version of that run is accepted, which is what makes the tamper meaningful.
    expect(scoreExportRun('E1', recovered).passed).toBe(true)
    const foreignRetry = scoreExportRun('E1', {
      ...recovered,
      requests: [{ method: 'POST', path: '/api/exports/job-other/retry' }],
    })
    expect(foreignRetry.assertions.requestsTargetCreatedJob).toBe(false)
    expect(foreignRetry.passed).toBe(false)
  })

  it('E03: an artifact that does not match the selection is rejected', () => {
    // The download says 200 and produced bytes - but for the wrong dataset and format.
    const score = scoreExportRun('E0', {
      ...e0Input(),
      truth: {
        creates: 1,
        retries: 0,
        jobs: 1,
        artifacts: 1,
        artifactContents: [{ datasetId: 'customers', format: 'json', rows: ['{}'] }],
      },
    })
    expect(score.assertions.artifactContentMatchesSelection).toBe(false)
    expect(score.passed).toBe(false)
  })

  it('E04: an E2 finding with no measurement, a short window, nulls, a wrong target or an intervention is rejected', () => {
    const tamper = (
      measurement: Record<string, unknown>,
      extra: Partial<ExportRunInput> = {},
    ): ExportRunInput => {
      const base = e2Input()
      return {
        ...base,
        ...extra,
        artifacts: {
          ...base.artifacts,
          'measurement.json': { type: 'measurement', exists: true, data: measurement },
        },
      }
    }
    const cases: [string, ExportRunInput, string][] = [
      ['no measurement at all', tamper({ evidenceRefs: [] }), 'defect_fullWindowCovered'],
      [
        'a window shorter than the declared budget',
        tamper({ ...inoperableWindow(), observedUntilMs: 1000 + 2500 }),
        'defect_fullWindowCovered',
      ],
      [
        'samples that are all null',
        tamper({
          ...inoperableWindow(),
          selector: '#retry',
          samples: inoperableWindow().samples.map((s) => ({ ...s, value: null })),
        }),
        'defect_nonNullSamples',
      ],
      [
        'samples that drift between targets',
        tamper({
          ...inoperableWindow(),
          selector: '#retry',
          samples: inoperableWindow().samples.map((s, i) => ({
            ...s,
            target: i % 2 ? 'Cancel button' : 'Retry button',
          })),
        }),
        'defect_stableTarget',
      ],
    ]
    for (const [name, input, expectedFailure] of cases) {
      const score = scoreExportRun('E2', input)
      expect(
        score.assertions[expectedFailure],
        `${name}: ${JSON.stringify(score.assertions)}`,
      ).toBe(false)
      expect(score.passed, name).toBe(false)
    }
    // An intervention in the run means the evidence describes the executor, not the product.
    const intervened = scoreExportRun('E2', {
      ...e2Input(),
      report: {
        ...e2Input().report,
        events: [
          ...e2Input().report.events,
          event('execution:intervention', { kind: 'write-denied' }),
        ],
      },
    })
    expect(intervened.assertions.defect_noIntervention).toBe(false)
    expect(intervened.passed).toBe(false)
    // Evidence that the report claims but that is not actually there.
    const missingEvidence = e2Input()
    const score = scoreExportRun('E2', {
      ...missingEvidence,
      artifacts: {
        ...missingEvidence.artifacts,
        'defect.png': { type: 'screenshot', exists: false },
      },
    })
    expect(score.assertions.defect_evidenceExists).toBe(false)
    expect(score.assertions.supportedFindingsHaveEvidence).toBe(false)
    expect(score.passed).toBe(false)
  })

  it('E05: a duplicated E2 finding, or a healthy variant with an extra defect, is rejected', () => {
    const base = e2Input()
    const duplicated = scoreExportRun('E2', {
      ...base,
      report: {
        ...base.report,
        findings: [...base.report.findings, { ...base.report.findings[0]!, id: 'finding-2' }],
      },
    })
    expect(duplicated.assertions.noDuplicateFindings).toBe(false)
    expect(duplicated.passed).toBe(false)
    // A healthy variant that reports a supported defect is a false positive, not thoroughness.
    const healthy = e0Input()
    const falsePositive = scoreExportRun('E0', {
      ...healthy,
      report: { ...healthy.report, findings: base.report.findings },
    })
    expect(falsePositive.assertions.healthyVariantHasNoSupportedFinding).toBe(false)
    expect(falsePositive.passed).toBe(false)
  })

  it('E06: a rule-migration run with only an exploratory finding is rejected', () => {
    const approved = {
      id: 'proposal-abc',
      revision: '1',
      reviewedBy: 'human-delegated',
      ruleConfig: {
        type: 'transition',
        trigger: { eventType: 'retryable-failure' },
        expectation: { condition: 'element-actionable', target: 'Retry button', timeoutMs: 5000 },
      },
    }
    // The rule was loaded but never executed: an exploratory finding alone is not rule reuse.
    const exploratory = scoreExportRun('E1', { ...e0Input(), approvedRule: approved })
    expect(exploratory.assertions.approvedRuleExecuted).toBe(false)
    expect(exploratory.assertions.approvedRuleCheckCompleted).toBe(false)
    expect(exploratory.passed).toBe(false)
    // With the rule actually executed and checked, that requirement is met.
    const executed = e0Input()
    const withRule = scoreExportRun('E1', {
      ...executed,
      approvedRule: approved,
      report: {
        ...executed.report,
        events: [
          ...executed.report.events,
          event('rule:evaluated', { ruleId: approved.id, verdict: 'pass' }),
          event('rule:check-completed', { ruleId: approved.id, verdict: 'pass' }),
        ],
      },
    })
    expect(withRule.assertions.approvedRuleExecuted).toBe(true)
    expect(withRule.assertions.approvedRuleCheckCompleted).toBe(true)
  })

  it('E06: the discovery group is rejected when an equivalent retry rule is already enabled', () => {
    const equivalent: DeclaredRule = {
      id: 'some-other-id',
      revision: '2',
      enabled: true,
      trigger: { eventType: 'retryable-failure' },
      expectation: { condition: 'element-actionable', target: 'Retry button' },
    }
    // Same trigger, condition and target under a different id: still the same rule.
    expect(equivalentRetryRules([equivalent])).toEqual(['some-other-id@2'])
    const score = scoreExportRun('E0', { ...e0Input(), rules: [equivalent] })
    expect(score.assertions.noEquivalentRetryRule).toBe(false)
    expect(score.passed).toBe(false)
    // A disabled rule is not answering the question, and a differently-shaped rule is not either.
    expect(equivalentRetryRules([{ ...equivalent, enabled: false }])).toEqual([])
    expect(
      equivalentRetryRules([
        {
          ...equivalent,
          expectation: { condition: 'element-actionable', target: 'Cancel button' },
        },
      ]),
    ).toEqual([])
  })

  it('E07: a modified declaration or a missing approval source is rejected', () => {
    const base = { ...e0Input(), report: { ...e0Input().report } }
    const withRule = (overrides: Record<string, unknown>, reviewedBy: string | null) => {
      const input = {
        ...base,
        approvedRule: {
          id: 'proposal-abc',
          revision: '1',
          reviewedBy,
          ruleConfig: {
            type: 'transition',
            trigger: { eventType: 'retryable-failure' },
            expectation: {
              condition: 'element-actionable',
              target: 'Retry button',
              timeoutMs: 5000,
              ...overrides,
            },
          },
        },
      }
      return scoreExportRun('E1', {
        ...input,
        report: {
          ...input.report,
          events: [
            ...input.report.events,
            event('rule:evaluated', { ruleId: 'proposal-abc', verdict: 'pass' }),
            event('rule:check-completed', { ruleId: 'proposal-abc', verdict: 'pass' }),
          ],
        },
      })
    }
    // The declaration's target was moved to widen what counts as recovery.
    const retargeted = withRule({ target: 'anything that looks like recovery' }, 'human-delegated')
    expect(retargeted.assertions.approvedDeclarationUnchanged).toBe(false)
    expect(retargeted.passed).toBe(false)
    // The requirement itself was relaxed.
    const relaxed = withRule({ timeoutMs: 60_000 }, 'human-delegated')
    expect(relaxed.assertions.approvedDeclarationUnchanged).toBe(true)
    // An enabled rule with no named reviewer has no approval to inherit. The scorer checks
    // provenance; `enabled` alone is never treated as proof of approval.
    const unapproved = withRule({}, null)
    expect(unapproved.assertions.approvalProvenancePresent).toBe(false)
    expect(unapproved.passed).toBe(false)
  })

  it('E08: a variant id, an answer key or a private-control request is rejected', () => {
    const leaked = e0Input()
    const variantLeak = scoreExportRun('E0', {
      ...leaked,
      report: {
        ...leaked.report,
        events: [...leaked.report.events, event('agent:note', { text: 'looks like variant E2' })],
      },
    })
    expect(variantLeak.assertions.noVariantIdLeak).toBe(false)
    expect(variantLeak.passed).toBe(false)
    const controlLeak = scoreExportRun('E0', {
      ...leaked,
      requests: [{ method: 'GET', path: '/__control/state' }],
    })
    expect(controlLeak.assertions.noPrivateControlLeak).toBe(false)
    expect(controlLeak.assertions.noControlRequestSucceeded).toBe(false)
    expect(controlLeak.passed).toBe(false)
    // A real business symptom is not leakage: the failure notice is what the agent is meant to see.
    const honest = scoreExportRun('E2', e2Input())
    expect(honest.assertions.noVariantIdLeak).toBe(true)
    // Nor is an id that merely contains the letter E and a digit.
    const benign = scoreExportRun('E0', {
      ...leaked,
      report: {
        ...leaked.report,
        events: [...leaked.report.events, event('agent:note', { text: 'EXPORT2 and REF01' })],
      },
    })
    expect(benign.assertions.noVariantIdLeak, JSON.stringify(benign.assertions)).toBe(true)
  })

  it('E09: an unverified persistence receipt is rejected', () => {
    const base = e0Input()
    const unverified = scoreExportRun('E0', {
      ...base,
      report: { ...base.report, persistence: { status: 'inconsistent', issues: ['lost tail'] } },
    })
    expect(unverified.assertions.persistenceVerified).toBe(false)
    expect(unverified.passed).toBe(false)
  })

  it('E09: the stop-the-service audit catches an API/database disagreement', () => {
    const clean = {
      apiReport: { status: 'completed', businessResult: 'success', stopReason: 'goal-reached' },
      dbRun: { status: 'completed', businessResult: 'success', stopReason: 'goal-reached' },
      apiTailSeq: 120,
      dbTailSeq: 120,
      apiArtifactIds: ['a.png', 'b.json'],
      dbArtifactIds: ['b.json', 'a.png'],
      apiReviewedRules: ['proposal-abc'],
      dbReviewedRules: ['proposal-abc'],
    }
    expect(auditDurability(clean).passed).toBe(true)
    // The report claimed completion but the store lost the event tail - the exact inconsistency
    // that must stop a batch rather than ship a false completed result.
    const lostTail = auditDurability({ ...clean, dbTailSeq: 88 })
    expect(lostTail.assertions.eventTailMatches).toBe(false)
    expect(lostTail.passed).toBe(false)
    const divergent = auditDurability({
      ...clean,
      dbRun: { ...clean.dbRun, status: 'interrupted', stopReason: 'reconciliation-required' },
    })
    expect(divergent.assertions.statusMatches).toBe(false)
    expect(divergent.passed).toBe(false)
  })

  it('E10: a batch keeping only its successes, missing rows, mixed builds or short counts is rejected', () => {
    const plan = [
      { group: 'A', case: 'E0', repeats: 3 },
      { group: 'A', case: 'E2', repeats: 3 },
    ]
    const pass = (group: string, testCase: string, repeat: number, build = 'build-1') => ({
      group,
      case: testCase,
      repeat,
      planned: true,
      runId: `run-${group}-${testCase}-${repeat}`,
      status: 'passed' as const,
      buildHash: build,
      score: { passed: true as const } as never,
    })
    const full = [
      pass('A', 'E0', 1),
      pass('A', 'E0', 2),
      pass('A', 'E0', 3),
      pass('A', 'E2', 1),
      pass('A', 'E2', 2),
      pass('A', 'E2', 3),
    ]
    expect(scoreExportBatch(full, plan).passed).toBe(true)
    // (a) only the successful rounds were kept.
    const survivors = scoreExportBatch([full[0]!, full[3]!], plan)
    expect(survivors.assertions.planComplete).toBe(false)
    expect(survivors.assertions.countsMatchPlan).toBe(false)
    expect(survivors.passed).toBe(false)
    expect(survivors.missing.length).toBe(4)
    // (b) a failed round was dropped and the rest reported as complete.
    const dropped = scoreExportBatch(
      [full[0]!, full[1]!, full[3]!, full[4]!, full[5]!].map((r) => ({ ...r })),
      plan,
    )
    expect(dropped.assertions.countsMatchPlan).toBe(false)
    expect(dropped.passed).toBe(false)
    // (c) two builds summed into one "batch".
    const mixed = scoreExportBatch(
      [...full.slice(0, 3), ...full.slice(3).map((r) => pass('A', 'E2', r.repeat, 'build-2'))],
      plan,
    )
    expect(mixed.assertions.singleBuild).toBe(false)
    expect(mixed.passed).toBe(false)
    // (d) a row marked passed whose run did not actually score a pass.
    const inflated = scoreExportBatch(
      full.map((r, i) => (i === 0 ? { ...r, score: { passed: false } as never } : r)),
      plan,
    )
    expect(inflated.assertions.passedRowsAreScoredPasses).toBe(false)
    // (e) a not-run row is recorded rather than omitted, so the distribution stays complete.
    const recorded = scoreExportBatch(
      [
        ...full.slice(0, 5),
        { ...full[5]!, status: 'not-run' as const, runId: null, score: undefined },
      ],
      plan,
    )
    expect(recorded.assertions.everyRowRecorded).toBe(true)
    // Its run is absent, so the plan is not complete - and that is reported, not hidden.
    expect(recorded.assertions.planComplete).toBe(false)
    expect(recorded.passed).toBe(false)
  })

  it('E10: offline artifact checks reject a missing or mislabelled file', () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    expect(verifyArtifactBytes('a.png', 'screenshot', png, { available: true }).exists).toBe(true)
    // Claimed available, but the bytes are not a PNG: the report's own flag is not the check.
    expect(
      verifyArtifactBytes('a.png', 'screenshot', Uint8Array.from([1, 2, 3]), { available: true })
        .exists,
    ).toBe(false)
    expect(verifyArtifactBytes('a.png', 'screenshot', png, { available: false }).exists).toBe(false)
    expect(
      verifyArtifactBytes('a.json', 'snapshot', new Uint8Array(), { available: true }).exists,
    ).toBe(false)
    // The hash is over the real bytes, so two different artifacts cannot share one.
    expect(verifyArtifactBytes('a.png', 'screenshot', png, { available: true }).sha256).toMatch(
      /^[0-9a-f]{64}$/,
    )
  })
})
