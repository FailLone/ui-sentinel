export type RunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'timed-out'
  | 'cancelled'
  | 'execution-error'
  | 'interrupted'

export type BusinessResult = 'success' | 'rejected' | 'unknown'

export type StopReason =
  | 'goal-reached'
  | 'queue-empty'
  | 'budget-exhausted'
  | 'cancelled'
  | 'execution-error'
  | 'blocked'
  | 'reconciliation-required'

export interface RunBudget {
  readonly totalTimeoutMs: number
  readonly maxActions: number
  readonly maxModelCalls: number
}

export interface RunSpec {
  readonly goal: string
  readonly environmentId: string
  readonly entryUrl: string
  readonly budget: RunBudget
  readonly viewport: { readonly width: number; readonly height: number }
}

export interface Run {
  readonly id: string
  readonly spec: RunSpec
  readonly status: RunStatus
  readonly businessResult: BusinessResult
  readonly stopReason: StopReason | null
  readonly usage: RunUsage
  readonly createdAt: string
  readonly updatedAt: string
}

export interface RunUsage {
  readonly actions: number
  readonly modelCalls: number
  readonly elapsedMs: number
  readonly modelInputTokens: number | null
  readonly modelOutputTokens: number | null
}

export interface RunEvent {
  readonly id: string
  readonly runId: string
  readonly seq: number
  readonly type: string
  readonly timestamp: string
  readonly stepId: string | null
  readonly actionId: string | null
  readonly payload: Record<string, unknown>
  readonly evidenceRefs: readonly string[]
}

export type FindingSource = 'rule' | 'agent'

export type FindingValidation = 'candidate' | 'supported' | 'inconclusive' | 'refuted'

export type FindingSeverity = 'error' | 'warning' | 'info'

export interface Finding {
  readonly id: string
  readonly runId: string
  readonly source: FindingSource
  readonly ruleId: string | null
  readonly ruleRevision: string | null
  readonly hypothesisId: string | null
  readonly validationStatus: FindingValidation
  readonly severity: FindingSeverity
  readonly title: string
  readonly expected: string
  readonly actual: string
  readonly stepId: string | null
  readonly evidenceRefs: readonly string[]
  readonly createdAt: string
}

export type FeedbackVerdict = 'confirmed' | 'intentional' | 'cannot-reproduce' | 'deferred'

export interface FindingFeedback {
  readonly findingId: string
  readonly verdict: FeedbackVerdict
  readonly reason: string
  readonly createdAt: string
}

export type RuleProposalStatus = 'draft' | 'validating' | 'approved' | 'rejected' | 'enabled'

export interface RuleProposal {
  readonly id: string
  readonly findingId: string
  readonly ruleConfig: Record<string, unknown>
  readonly status: RuleProposalStatus
  readonly positiveResults: readonly RuleTestResult[]
  readonly negativeResults: readonly RuleTestResult[]
  readonly reviewedBy: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface RuleTestResult {
  readonly input: string
  readonly expected: 'pass' | 'fail' | 'unknown'
  readonly actual: 'pass' | 'fail' | 'unknown' | 'error'
  readonly passed: boolean
}

export interface Hypothesis {
  readonly id: string
  readonly runId: string
  readonly phenomenon: string
  readonly basis: string
  readonly verificationPlan: string
  readonly status: 'open' | 'supported' | 'refuted' | 'inconclusive'
  readonly evidenceRefs: readonly string[]
  readonly createdAt: string
}

export interface RunReport {
  readonly runId: string
  readonly status: RunStatus
  readonly businessResult: BusinessResult
  readonly stopReason: StopReason | null
  readonly findings: readonly Finding[]
  readonly usage: RunUsage
  readonly exploredStates: readonly string[]
  readonly unexploredBranches: readonly string[]
  readonly evaluatedRuleCount: number
  readonly unknownCount: number
}
