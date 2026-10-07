import { describe, it, expect } from 'vitest'
import { scoreUrlScan, type UrlScanScoreInput } from './scorer.ts'
import { urlScanTruth } from './truth.ts'

/**
 * The URL-scan scorer, and the false positives it must refuse (plan 10.3).
 *
 * A scorer is only trustworthy if you have watched it reject things that superficially look like a
 * pass. Every test here feeds it a result that a careless reader would accept - a run that says
 * "completed", a report with no findings, a healthy page with a finding - together with the
 * independent facts, and asserts it does *not* conclude the expected outcome.
 *
 * The scorer never imports the production verdict functions. It reads the persisted report, the
 * independent measurements and the private truth, so a bug that makes production say "covered" cannot
 * make the scorer agree.
 */
const truth = urlScanTruth('test-build')

function healthyInput(overrides: Partial<UrlScanScoreInput> = {}): UrlScanScoreInput {
  return {
    run: {
      runId: 'run-1',
      status: 'completed',
      businessResult: 'not-applicable',
      stopReason: 'goal-reached',
      persistence: { status: 'verified', issues: [] },
      finishAccepted: true,
      proofVerified: true,
      coverage: 'covered',
      items: [
        {
          itemId: 'item-1',
          category: 'entry-observation',
          status: 'verified',
          evidenceRefs: ['artifact-1'],
        },
        {
          itemId: 'item-2',
          category: 'local-interaction',
          status: 'verified',
          evidenceRefs: ['artifact-2'],
        },
      ],
      findings: [],
    },
    independent: {
      buildIdentity: truth.buildIdentity,
      expectedBuildIdentity: truth.buildIdentity,
      serverRequestCount: 4,
      writeCount: 0,
      entryObserved: true,
      entryUrl: truth.entryUrl,
      expectedEntryUrl: truth.entryUrl,
      interactionsPerformed: 1,
      healthyReplayPassed: true,
      controlReplayPassed: true,
      agentBehaviorVerified: true,
      readableEvidenceRefs: [
        'artifact-1',
        'artifact-2',
        'evidence-1',
        'shot.png',
        'artifact-finding',
      ],
      interventionCount: 0,
      findingKeysById: {
        'finding-1': 'foreground-control-covered',
        f1: 'foreground-control-covered',
      },
      leakedPrivateAnswers: [],
      reproducedFindingKeys: [],
    },
    truth: truth.samples[0]!,
    ...overrides,
  }
}

describe('the scorer confirms a genuine healthy result', () => {
  it('accepts a healthy scan that actually observed and interacted', () => {
    const verdict = scoreUrlScan(healthyInput())
    expect(verdict.outcome).toBe('healthy-verified')
    expect(verdict.rejections).toEqual([])
  })
})

describe('the scorer refuses a false pass (plan 10.3 negative cases)', () => {
  const refuse = (input: UrlScanScoreInput, reason: string) => {
    const verdict = scoreUrlScan(input)
    expect(verdict.outcome).not.toBe('healthy-verified')
    expect(verdict.rejections.map((r) => r.code)).toContain(reason)
  }

  it('refuses "completed" with no inspection items at all', () => {
    refuse(healthyInput({ run: { ...healthyInput().run, items: [] } }), 'no-inspection-items')
  })

  it('refuses a result whose items are all unknown-quality (no verified evidence)', () => {
    const run = healthyInput().run
    refuse(
      healthyInput({
        run: {
          ...run,
          items: run.items.map((item) => ({ ...item, status: 'unverified', evidenceRefs: [] })),
          coverage: 'covered',
        },
      }),
      'no-verified-items',
    )
  })

  it('refuses a healthy claim with no finding but where the target never interacted', () => {
    refuse(
      healthyInput({ independent: { ...healthyInput().independent, interactionsPerformed: 0 } }),
      'no-interaction',
    )
  })

  it('refuses a result from a different build than the frozen one', () => {
    refuse(
      healthyInput({
        independent: { ...healthyInput().independent, buildIdentity: 'other-build' },
      }),
      'build-identity-mismatch',
    )
  })

  it('refuses a result measured on a different run than the one scored', () => {
    refuse(
      healthyInput({
        run: { ...healthyInput().run, runId: 'run-other' },
        independent: { ...healthyInput().independent, expectedRunId: 'run-1' },
      }),
      'run-identity-mismatch',
    )
  })

  it('refuses a result whose entry is not the sample entry', () => {
    refuse(
      healthyInput({
        independent: { ...healthyInput().independent, entryUrl: 'https://evil.example/' },
      }),
      'entry-url-mismatch',
    )
  })

  it('refuses a result with no accepted finish', () => {
    refuse(
      healthyInput({ run: { ...healthyInput().run, finishAccepted: false } }),
      'no-accepted-finish',
    )
  })

  it('refuses a result whose inspection proof does not verify', () => {
    refuse(
      healthyInput({ run: { ...healthyInput().run, proofVerified: false } }),
      'proof-unverified',
    )
  })

  it('refuses a report the persistence check called inconsistent', () => {
    refuse(
      healthyInput({
        run: {
          ...healthyInput().run,
          persistence: { status: 'inconsistent', issues: ['inspection-proof-unverified'] },
        },
      }),
      'report-inconsistent',
    )
  })

  it('refuses a run that performed a business write', () => {
    refuse(
      healthyInput({ independent: { ...healthyInput().independent, writeCount: 1 } }),
      'write-performed',
    )
  })

  it('refuses a result that never observed the entry page', () => {
    refuse(
      healthyInput({ independent: { ...healthyInput().independent, entryObserved: false } }),
      'entry-not-observed',
    )
  })

  it('refuses a healthy result that leaked private answers to the agent', () => {
    refuse(
      healthyInput({
        independent: {
          ...healthyInput().independent,
          leakedPrivateAnswers: ['variant-label:defective'],
        },
      }),
      'private-answer-leak',
    )
  })

  it('refuses a healthy result that also reported a supported finding (false positive)', () => {
    refuse(
      healthyInput({
        run: {
          ...healthyInput().run,
          findings: [{ id: 'f1', validationStatus: 'supported', evidenceRefs: ['a-1'] }],
        },
      }),
      'healthy-false-positive',
    )
  })

  it('refuses a result produced by splicing samples from different batches', () => {
    refuse(
      healthyInput({
        independent: {
          ...healthyInput().independent,
          batchId: 'batch-a',
          expectedBatchId: 'batch-b',
        },
      }),
      'batch-identity-mismatch',
    )
  })
})

describe('the scorer confirms a defect only on independent evidence', () => {
  const defective = truth.samples.find((s) => s.variant === 'defective')!

  it('accepts an abnormal result only when the finding is independently reproducible', () => {
    const verdict = scoreUrlScan({
      run: {
        runId: 'run-2',
        status: 'completed',
        businessResult: 'not-applicable',
        stopReason: 'goal-reached',
        persistence: { status: 'verified', issues: [] },
        finishAccepted: true,
        proofVerified: true,
        coverage: 'covered',
        items: [
          {
            itemId: 'item-1',
            category: 'entry-observation',
            status: 'verified',
            evidenceRefs: ['artifact-1'],
          },
          {
            itemId: 'item-2',
            category: 'local-interaction',
            status: 'failed',
            evidenceRefs: ['artifact-2'],
          },
        ],
        findings: [{ id: 'f1', validationStatus: 'supported', evidenceRefs: ['artifact-2'] }],
      },
      independent: {
        buildIdentity: truth.buildIdentity,
        expectedBuildIdentity: truth.buildIdentity,
        serverRequestCount: 5,
        writeCount: 0,
        entryObserved: true,
        entryUrl: truth.entryUrl,
        expectedEntryUrl: truth.entryUrl,
        interactionsPerformed: 1,
        healthyReplayPassed: true,
        controlReplayPassed: true,
        agentBehaviorVerified: true,
        readableEvidenceRefs: [
          'artifact-1',
          'artifact-2',
          'evidence-1',
          'shot.png',
          'artifact-finding',
        ],
        interventionCount: 0,
        findingKeysById: {
          'finding-1': 'foreground-control-covered',
          f1: 'foreground-control-covered',
        },
        leakedPrivateAnswers: [],
        reproducedFindingKeys: [defective.expectedFindingKey!],
      },
      truth: defective,
    })
    expect(verdict.outcome).toBe('defect-verified')
    expect(verdict.rejections).toEqual([])
  })

  it('refuses a supported finding the independent replay could not reproduce', () => {
    const verdict = scoreUrlScan({
      run: {
        runId: 'run-3',
        status: 'completed',
        businessResult: 'not-applicable',
        stopReason: 'goal-reached',
        persistence: { status: 'verified', issues: [] },
        finishAccepted: true,
        proofVerified: true,
        coverage: 'covered',
        items: [
          {
            itemId: 'item-2',
            category: 'local-interaction',
            status: 'failed',
            evidenceRefs: ['artifact-2'],
          },
        ],
        findings: [{ id: 'f1', validationStatus: 'supported', evidenceRefs: ['artifact-2'] }],
      },
      independent: {
        buildIdentity: truth.buildIdentity,
        expectedBuildIdentity: truth.buildIdentity,
        serverRequestCount: 5,
        writeCount: 0,
        entryObserved: true,
        entryUrl: truth.entryUrl,
        expectedEntryUrl: truth.entryUrl,
        interactionsPerformed: 1,
        healthyReplayPassed: true,
        controlReplayPassed: true,
        agentBehaviorVerified: true,
        readableEvidenceRefs: [
          'artifact-1',
          'artifact-2',
          'evidence-1',
          'shot.png',
          'artifact-finding',
        ],
        interventionCount: 0,
        findingKeysById: {
          'finding-1': 'foreground-control-covered',
          f1: 'foreground-control-covered',
        },
        leakedPrivateAnswers: [],
        reproducedFindingKeys: [],
      },
      truth: defective,
    })
    expect(verdict.outcome).not.toBe('defect-verified')
    expect(verdict.rejections.map((r) => r.code)).toContain('finding-not-reproduced')
  })

  it('refuses a defect claim whose finding cites no evidence', () => {
    const verdict = scoreUrlScan({
      run: {
        runId: 'run-4',
        status: 'completed',
        businessResult: 'not-applicable',
        stopReason: 'goal-reached',
        persistence: { status: 'verified', issues: [] },
        finishAccepted: true,
        proofVerified: true,
        coverage: 'covered',
        items: [
          {
            itemId: 'item-2',
            category: 'local-interaction',
            status: 'failed',
            evidenceRefs: [],
          },
        ],
        findings: [{ id: 'f1', validationStatus: 'supported', evidenceRefs: [] }],
      },
      independent: {
        buildIdentity: truth.buildIdentity,
        expectedBuildIdentity: truth.buildIdentity,
        serverRequestCount: 5,
        writeCount: 0,
        entryObserved: true,
        entryUrl: truth.entryUrl,
        expectedEntryUrl: truth.entryUrl,
        interactionsPerformed: 1,
        healthyReplayPassed: true,
        controlReplayPassed: true,
        agentBehaviorVerified: true,
        readableEvidenceRefs: [
          'artifact-1',
          'artifact-2',
          'evidence-1',
          'shot.png',
          'artifact-finding',
        ],
        interventionCount: 0,
        findingKeysById: {
          'finding-1': 'foreground-control-covered',
          f1: 'foreground-control-covered',
        },
        leakedPrivateAnswers: [],
        reproducedFindingKeys: [defective.expectedFindingKey!],
      },
      truth: defective,
    })
    expect(verdict.rejections.map((r) => r.code)).toContain('finding-without-evidence')
  })
})
