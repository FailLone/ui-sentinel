import { visualReviewQuestion } from './efficiency-protocol.ts'

/** Private evaluation only. Expected fixture outcomes never enter the operator's context. */
export function scoreVisualAnalysis(report: any, profile: string, artifacts: Record<string, any>) {
  const tasks = report.analysisTasks ?? []
  const events = report.events ?? []
  const task = tasks.length === 1 ? tasks[0] : undefined
  const visual = task?.result?.visual
  const consumed = events.find(
    (e: any) => e.type === 'analysis:consumed' && e.payload.taskId === task?.id,
  )
  const completed = events.find(
    (e: any) =>
      e.type === 'analysis:state' && e.payload.id === task?.id && e.payload.status === 'completed',
  )
  const finish = events.find((e: any) => e.type === 'finish:accepted')
  const ids: string[] = consumed?.payload.hypothesisIds ?? []
  const checks = {
    oneReview: tasks.length === 1 && task.question === visualReviewQuestion,
    reviewed: task?.status === 'completed' && visual?.coverage === 'reviewed',
    answerAvailable: typeof visual?.answer === 'string' && visual.answer.length > 0,
    evidence:
      !!task &&
      task.runId === report.runId &&
      !!task.factVersion &&
      task.evidenceRefs.length >= 2 &&
      task.evidenceRefs.every((id: string) => artifacts[id]?.exists) &&
      task.evidenceRefs.some((id: string) => artifacts[id]?.type === 'screenshot') &&
      task.evidenceRefs.some((id: string) => artifacts[id]?.type === 'snapshot'),
    expectedCandidates:
      profile === 'C0'
        ? visual?.candidates.length === 0
        : visual?.candidates.some((c: any) => c.kind === 'occlusion'),
    reviewedBeforeFinish:
      !!completed &&
      !!consumed &&
      !!finish &&
      completed.seq < consumed.seq &&
      consumed.seq < finish.seq,
    candidatesResolved:
      !!visual &&
      ids.length === visual.candidates.length &&
      ids.every((id) =>
        report.hypotheses.some(
          (h: any) => h.id === id && ['supported', 'refuted'].includes(h.status),
        ),
      ),
    noUnverifiedAnalysis: report.coverage?.unverifiedAnalysisTasks?.length === 0,
    oneVisionRequest:
      events.filter(
        (e: any) => e.type === 'model:request-started' && e.payload.role === 'evidence-analysis',
      ).length === 1,
  }
  const started = events.find(
    (e: any) =>
      e.type === 'analysis:state' && e.payload.id === task?.id && e.payload.status === 'running',
  )
  const origin = Date.parse(events.find((e: any) => e.type === 'run:started')?.timestamp)
  const offset = (event: any) =>
    event && Number.isFinite(origin) ? Date.parse(event.timestamp) - origin : null
  const mainRequestsDuringReview =
    started && completed
      ? events.filter(
          (e: any) =>
            e.type === 'model:request-started' &&
            e.payload.purpose === 'agent' &&
            e.seq > started.seq &&
            e.seq < completed.seq,
        ).length
      : 0
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    timing: {
      firstFindingMs: offset(events.find((e: any) => e.type === 'finding:submitted')),
      analysisStartedMs: offset(started),
      analysisCompletedMs: offset(completed),
      reportAvailableMs: report.usage?.elapsedMs ?? null,
      mainRequestsDuringReview,
    },
  }
}
