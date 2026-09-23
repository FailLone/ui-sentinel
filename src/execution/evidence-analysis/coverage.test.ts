import { expect, it } from 'vitest'
import { unresolvedAnalyses } from './coverage.ts'
import type { AnalysisTask } from './queue.ts'

const failed: AnalysisTask = {
  id: 'first',
  runId: 'run',
  parentTaskId: 'decision',
  dependsOn: [],
  deadlineAt: 123,
  resourceAccess: 'frozen-evidence-read',
  snapshotId: 'snapshot',
  factVersion: 'version',
  operationId: 'order',
  question: 'Is the button clipped?',
  evidenceRefs: ['image'],
  status: 'failed',
}
const reviewed: AnalysisTask = {
  ...failed,
  id: 'retry',
  status: 'completed',
  result: {
    visual: {
      answer: 'Frozen screenshot inspected for the requested question.',
      coverage: 'reviewed',
      candidates: [],
      limitations: [],
    },
    geometry: { checkedElements: 0, partiallyOutside: [], intercepted: [] },
  },
}

it('closes a failed review only with reviewed evidence for the same run, facts, operation and question', () => {
  expect(unresolvedAnalyses([failed, reviewed])).toEqual([])
  for (const field of ['runId', 'factVersion', 'operationId', 'question'] as const) {
    expect(unresolvedAnalyses([failed, { ...reviewed, [field]: 'different' }])).toEqual([failed])
  }
  const insufficient: AnalysisTask = {
    ...reviewed,
    result: {
      ...reviewed.result!,
      visual: {
        ...reviewed.result!.visual,
        coverage: 'insufficient-evidence',
      },
    },
  }
  expect(unresolvedAnalyses([failed, insufficient])).toEqual([failed, insufficient])
  expect(unresolvedAnalyses([{ ...failed, status: 'running' }])).toHaveLength(1)
})
