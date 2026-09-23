import type { AnalysisTask } from './queue.ts'

type CoverageTask = Pick<
  AnalysisTask,
  'id' | 'runId' | 'factVersion' | 'operationId' | 'question' | 'status' | 'result'
>

/** Keep failed attempts in the audit log; only an equivalent reviewed task closes their gap. */
export function unresolvedAnalyses<T extends CoverageTask>(tasks: T[]): T[] {
  return tasks.filter((task) => {
    if (task.status === 'completed' && task.result?.visual.coverage === 'reviewed') return false
    return !tasks.some(
      (replacement) =>
        replacement.status === 'completed' &&
        replacement.result?.visual.coverage === 'reviewed' &&
        replacement.runId === task.runId &&
        replacement.factVersion === task.factVersion &&
        replacement.operationId === task.operationId &&
        replacement.question === task.question,
    )
  })
}
