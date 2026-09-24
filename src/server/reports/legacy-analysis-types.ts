// Read compatibility for persisted reports from the retired visual-analysis prototype.
export interface AnalysisTask {
  id: string
  runId: string
  parentTaskId: string
  dependsOn: string[]
  deadlineAt: number
  resourceAccess: 'frozen-evidence-read'
  snapshotId: string
  factVersion: string
  operationId: string | null
  question: string
  evidenceRefs: string[]
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: {
    visual: {
      answer: string
      coverage: 'reviewed' | 'insufficient-evidence'
      candidates: unknown[]
      limitations: string[]
    }
    geometry: { checkedElements: number; partiallyOutside: string[]; intercepted: string[] }
  }
  error?: string
}
