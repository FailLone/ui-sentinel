import { expect, it } from 'vitest'
import { scoreVisualAnalysis } from '../../../scripts/experiments/visual-protocol.ts'
import {
  efficiencyOptions,
  efficiencySchedule,
  visualReviewQuestion,
} from '../../../scripts/experiments/efficiency-protocol.ts'

it('requires matching protocol and alternates equal visual workloads', () => {
  const args = [
    '--baseline-ref',
    '1234567',
    '--candidate-ref',
    '1234567',
    '--phase',
    'visual-compare',
  ]
  expect(() => efficiencyOptions(args)).toThrow('visual-1')
  expect(efficiencyOptions([...args, '--protocol', 'visual-1']).learningSource).toBeUndefined()
  expect(efficiencyOptions([...args, '--protocol', 'visual-2']).failurePolicy).toBe('stop')
  expect(
    efficiencyOptions([...args, '--protocol', 'visual-2', '--failure-policy', 'complete'])
      .failurePolicy,
  ).toBe('complete')
  expect(() =>
    efficiencyOptions([...args, '--protocol', 'visual-2', '--failure-policy', 'ignore']),
  ).toThrow('failure policy')
  expect(efficiencySchedule('visual-diagnostic')).toEqual([
    { arm: 'candidate', profile: 'C2', repeat: 1 },
  ])
  const schedule = efficiencySchedule('visual-compare')
  expect(schedule).toHaveLength(8)
  for (const arm of ['baseline', 'candidate'])
    for (const profile of ['C0', 'C2'])
      expect(schedule.filter((s) => s.arm === arm && s.profile === profile)).toHaveLength(2)
})

it('rejects absent, unfinished, unreviewed, wrong-fixture or ungrounded visual work', () => {
  const task = {
    id: 'a',
    runId: 'r',
    factVersion: 'v',
    question: visualReviewQuestion,
    status: 'completed',
    evidenceRefs: ['image', 'snapshot'],
    result: {
      visual: {
        answer: 'The primary control is unobscured.',
        coverage: 'reviewed',
        candidates: [],
      },
    },
  }
  const events = [
    { type: 'model:request-started', payload: { role: 'evidence-analysis' } },
    { type: 'analysis:state', payload: { id: 'a', status: 'completed' } },
    { type: 'analysis:consumed', payload: { taskId: 'a', hypothesisIds: [] } },
    { type: 'finish:accepted', payload: {} },
  ].map((e, seq) => ({ ...e, seq }))
  const report = {
    runId: 'r',
    analysisTasks: [task],
    events,
    hypotheses: [],
    coverage: { unverifiedAnalysisTasks: [] },
  }
  const artifacts = {
    image: { exists: true, type: 'screenshot' },
    snapshot: { exists: true, type: 'snapshot' },
  }
  expect(scoreVisualAnalysis(report, 'C0', artifacts).passed).toBe(true)
  expect(scoreVisualAnalysis(report, 'C2', artifacts).passed).toBe(false)
  expect(scoreVisualAnalysis({ ...report, analysisTasks: [] }, 'C0', artifacts).passed).toBe(false)
  expect(
    scoreVisualAnalysis({ ...report, events: events.slice(0, 2) }, 'C0', artifacts).passed,
  ).toBe(false)
  expect(scoreVisualAnalysis(report, 'C0', {}).passed).toBe(false)
  expect(
    scoreVisualAnalysis(
      {
        ...report,
        analysisTasks: [
          {
            ...task,
            result: { visual: { coverage: 'reviewed', candidates: [{ kind: 'occlusion' }] } },
          },
        ],
      },
      'C2',
      artifacts,
    ).passed,
  ).toBe(false)
})

it('visual-2 rejects a supported visual-covering claim even alongside a real intercepted control', () => {
  const events = [
    { type: 'model:request-started', payload: { role: 'evidence-analysis' } },
    { type: 'analysis:state', payload: { id: 'a', status: 'completed' } },
    { type: 'analysis:consumed', payload: { taskId: 'a', hypothesisIds: ['pointer', 'pixels'] } },
    { type: 'finish:accepted', payload: {} },
  ].map((e, seq) => ({ ...e, seq }))
  const report = {
    runId: 'r',
    events,
    hypotheses: [
      { id: 'pointer', status: 'supported' },
      { id: 'pixels', status: 'supported' },
    ],
    coverage: { unverifiedAnalysisTasks: [] },
    analysisTasks: [
      {
        id: 'a',
        runId: 'r',
        factVersion: 'v',
        question: visualReviewQuestion,
        status: 'completed',
        evidenceRefs: ['image', 'snapshot'],
        result: {
          visual: {
            answer: 'A backdrop intercepts the readable control.',
            coverage: 'reviewed',
            candidates: [{ kind: 'pointer-interception' }, { kind: 'occlusion' }],
          },
        },
      },
    ],
  }
  const artifacts = {
    image: { exists: true, type: 'screenshot' },
    snapshot: { exists: true, type: 'snapshot' },
  }
  expect(scoreVisualAnalysis(report, 'C2', artifacts).checks.preciseSupport).toBe(false)
  report.hypotheses[1]!.status = 'refuted'
  expect(scoreVisualAnalysis(report, 'C2', artifacts).passed).toBe(true)
})
