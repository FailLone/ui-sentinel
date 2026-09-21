import type { RunReport, Finding } from '../../src/shared/types.ts'
import { VARIANT_EXPECTATIONS, type VariantId, type VariantExpectation } from './answers.ts'

export interface EvalScore {
  readonly variant: VariantId
  readonly runId: string
  readonly repeat: number
  readonly businessResultCorrect: boolean
  readonly findingsScore: number
  readonly falsePositives: readonly string[]
  readonly missingFindings: readonly string[]
  readonly budgetRespected: boolean
  readonly noAnswerLeak: boolean
  readonly overallPass: boolean
  readonly details: Record<string, unknown>
}

export function evaluateRun(
  report: RunReport,
  variant: VariantId,
  repeat: number,
): EvalScore {
  const expectation = VARIANT_EXPECTATIONS[variant]

  const businessResultCorrect = checkBusinessResult(report, expectation)
  const { score: findingsScore, falsePositives, missingFindings } = checkFindings(report, expectation)
  const budgetRespected = checkBudget(report)
  const noAnswerLeak = checkNoAnswerLeak(report)

  const overallPass = businessResultCorrect
    && findingsScore >= 0.5
    && budgetRespected
    && noAnswerLeak
    && missingFindings.length === 0

  return {
    variant,
    runId: report.runId,
    repeat,
    businessResultCorrect,
    findingsScore,
    falsePositives,
    missingFindings,
    budgetRespected,
    noAnswerLeak,
    overallPass,
    details: {
      status: report.status,
      businessResult: report.businessResult,
      expectedBusinessResult: expectation.expectedBusinessResult,
      findingCount: report.findings.length,
      usage: report.usage,
    },
  }
}

function checkBusinessResult(report: RunReport, expectation: VariantExpectation): boolean {
  if (report.status === 'execution-error' || report.status === 'interrupted') {
    return false
  }

  if (expectation.expectedBusinessResult === 'unknown') {
    return report.businessResult === 'unknown' || report.status === 'blocked'
  }

  return report.businessResult === expectation.expectedBusinessResult
}

function checkFindings(
  report: RunReport,
  expectation: VariantExpectation,
): { score: number; falsePositives: string[]; missingFindings: string[] } {
  const falsePositives: string[] = []
  const missingFindings: string[] = []

  for (const expected of expectation.expectedFindings) {
    if (!expected.required) continue

    const found = report.findings.some((f) =>
      matchesFinding(f, expected.category, expected.description),
    )
    if (!found) {
      missingFindings.push(expected.description)
    }
  }

  for (const finding of report.findings) {
    if (finding.validationStatus !== 'supported' && finding.validationStatus !== 'candidate') continue

    const matchesMustNot = expectation.mustNot.some((pattern) =>
      finding.title.toLowerCase().includes(pattern.toLowerCase()),
    )
    if (matchesMustNot) {
      falsePositives.push(finding.title)
    }
  }

  if (expectation.expectedFindings.length === 0) {
    return {
      score: falsePositives.length === 0 ? 1.0 : 0.5,
      falsePositives,
      missingFindings,
    }
  }

  const requiredCount = expectation.expectedFindings.filter((f) => f.required).length
  const foundCount = requiredCount - missingFindings.length
  const score = requiredCount > 0 ? foundCount / requiredCount : 1.0

  return { score, falsePositives, missingFindings }
}

function matchesFinding(finding: Finding, category: string, description: string): boolean {
  const titleLower = finding.title.toLowerCase()
  const descLower = description.toLowerCase()

  if (category === 'overlay') {
    return titleLower.includes('overlay') || titleLower.includes('blocking') || titleLower.includes('modal')
  }

  if (category === 'hypothesis') {
    return finding.source === 'agent' && (
      titleLower.includes('retry') ||
      titleLower.includes('recovery') ||
      titleLower.includes('fail')
    )
  }

  return titleLower.includes(descLower) || descLower.includes(titleLower)
}

function checkBudget(report: RunReport): boolean {
  if (report.status === 'timed-out') return true
  return !report.findings.some((f) =>
    f.title.toLowerCase().includes('budget exceeded') ||
    f.title.toLowerCase().includes('over budget'),
  )
}

function checkNoAnswerLeak(report: RunReport): boolean {
  const events = report.exploredStates.concat(
    report.findings.map((f) => f.title),
    report.findings.map((f) => f.actual),
  )

  const leakPatterns = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'variant-', '__control']

  return !events.some((text) =>
    leakPatterns.some((pattern) => text.includes(pattern)),
  )
}

export interface EvalSummary {
  readonly suite: string
  readonly timestamp: string
  readonly variants: Record<VariantId, readonly EvalScore[]>
  readonly passRate: number
  readonly totalRuns: number
  readonly passedRuns: number
}

export function summarizeEvaluation(scores: readonly EvalScore[]): EvalSummary {
  const variants: Record<string, EvalScore[]> = {}
  for (const score of scores) {
    const list = variants[score.variant] ?? []
    list.push(score)
    variants[score.variant] = list
  }

  const passedRuns = scores.filter((s) => s.overallPass).length

  return {
    suite: 'minimum',
    timestamp: new Date().toISOString(),
    variants: variants as Record<VariantId, readonly EvalScore[]>,
    passRate: scores.length > 0 ? passedRuns / scores.length : 0,
    totalRuns: scores.length,
    passedRuns,
  }
}
