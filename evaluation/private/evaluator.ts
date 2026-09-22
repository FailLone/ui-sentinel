import type { RunReport, Finding, RunEvent } from '../../src/shared/types.ts'
import type { PageSnapshot } from '../../src/rules/types.ts'
import type { TransitionObservation } from '../../src/rules/transition.ts'
import type { VariantId } from './answers.ts'

export interface IndependentEvidence {
  fixtureValid: boolean
  backend: { orders: { id: string; status: string }[] }
  artifacts: Record<string, { type: string; data?: unknown; exists: boolean }>
  events: readonly RunEvent[]
  budget: { totalTimeoutMs: number; maxActions: number; maxModelCalls: number }
  hypotheses: { id: string; status: string; evidenceRefs: string[] }[]
  invalidReason?: string
}
export interface EvalScore {
  variant: VariantId
  runId: string
  repeat: number
  businessResultCorrect: boolean
  findingsScore: number
  falsePositives: string[]
  missingFindings: string[]
  budgetRespected: boolean
  noAnswerLeak: boolean
  overallPass: boolean
  details: Record<string, unknown>
  classification: 'pass' | 'fail' | 'invalid' | 'needs-review'
}
function isSnapshot(value: unknown): value is PageSnapshot {
  return !!value && Array.isArray((value as PageSnapshot).elements)
}
function intercepted(snapshot: PageSnapshot) {
  return snapshot.elements.some(
    (el) =>
      el.visible &&
      el.enabled !== false &&
      el.tag === 'button' &&
      el.hitSamples &&
      el.hitSamples.length >= 5 &&
      el.hitSamples.every((s) => s.relation === 'unrelated'),
  )
}
function hasEvidence(f: Finding, evidence: IndependentEvidence) {
  return (
    f.validationStatus === 'supported' &&
    f.evidenceRefs.length >= 2 &&
    f.evidenceRefs.every((id) => evidence.artifacts[id]?.exists) &&
    f.evidenceRefs.some((id) => evidence.artifacts[id]?.type === 'screenshot')
  )
}
export function evaluateRun(
  report: RunReport,
  variant: VariantId,
  repeat: number,
  evidence?: IndependentEvidence,
): EvalScore {
  const base: EvalScore = {
    variant,
    repeat,
    runId: report.runId,
    businessResultCorrect: false,
    findingsScore: 0,
    falsePositives: [],
    missingFindings: [],
    budgetRespected: false,
    noAnswerLeak: false,
    overallPass: false,
    details: {},
    classification: 'invalid',
  }
  if (!evidence?.fixtureValid || evidence.invalidReason)
    return {
      ...base,
      details: {
        reason: evidence?.invalidReason ?? 'Independent fixture and artifact evidence required',
      },
    }
  const snapshots = Object.values(evidence.artifacts)
    .filter((a) => a.exists && a.type === 'snapshot' && isSnapshot(a.data))
    .map((a) => a.data as PageSnapshot)
  const expectedStatus = variant === 'C4' ? 'rejected' : 'paid'
  const expectedBusiness = variant === 'C4' ? 'rejected' : 'success'
  const onlyOrder = evidence.backend.orders.length === 1 ? evidence.backend.orders[0] : null
  let businessResultCorrect = false
  if (['C0', 'C1', 'C3', 'C4'].includes(variant)) {
    businessResultCorrect =
      report.status === 'completed' &&
      report.businessResult === expectedBusiness &&
      !!onlyOrder &&
      onlyOrder.status === expectedStatus &&
      snapshots.some((s) => s.elements.some((el) => el.visible && el.text.includes(onlyOrder.id)))
  } else if (variant === 'C2')
    businessResultCorrect =
      report.status === 'blocked' &&
      report.businessResult === 'unknown' &&
      evidence.backend.orders.length === 0
  else
    businessResultCorrect =
      report.businessResult === 'unknown' &&
      report.status === 'blocked' &&
      !!onlyOrder &&
      onlyOrder.status === 'failed'
  const matched = new Set<string>()
  for (const f of report.findings) {
    if (!hasEvidence(f, evidence)) continue
    if (
      ['C1', 'C2'].includes(variant) &&
      f.stepId &&
      f.evidenceRefs.some(
        (id) =>
          isSnapshot(evidence.artifacts[id]?.data) &&
          intercepted(evidence.artifacts[id].data as PageSnapshot),
      )
    )
      matched.add(f.id)
    if (
      variant === 'C5' &&
      f.source === 'agent' &&
      f.hypothesisId &&
      evidence.hypotheses.some((h) => h.id === f.hypothesisId && h.status === 'supported')
    ) {
      const valid = f.evidenceRefs.some((id) => {
        const a = evidence.artifacts[id]
        if (a?.type !== 'measurement') return false
        const o = a.data as TransitionObservation & { selector?: string }
        if (!o || !o.eventType || !o.samples?.length) return false
        // A measured target must correspond to a real disabled retry control in the referenced UI.
        const retrySnapshot = f.evidenceRefs.some((ref) => {
          const s = evidence.artifacts[ref]?.data
          return (
            isSnapshot(s) &&
            s.elements.some(
              (el) =>
                el.tag === 'button' &&
                el.visible &&
                el.enabled === false &&
                el.selector === o.selector &&
                /retry|try again|重试/i.test(el.text),
            )
          )
        })
        const samples = [...o.samples].sort((a, b) => a.atMs - b.atMs)
        const target = samples[0]?.target
        const deadline = o.startedAtMs + 5000
        const window = samples.filter((s) => s.atMs >= o.startedAtMs && s.atMs <= deadline)
        return (
          retrySnapshot &&
          Number.isFinite(o.startedAtMs) &&
          o.observedUntilMs >= deadline &&
          window.length >= 11 &&
          window.every(
            (s, i) =>
              s.target === target &&
              s.value === false &&
              (!i || s.atMs - window[i - 1]!.atMs <= 500),
          ) &&
          window[0]!.atMs - o.startedAtMs <= 250 &&
          deadline - window.at(-1)!.atMs <= 250
        )
      })
      if (valid) matched.add(f.id)
    }
  }
  const required = ['C1', 'C2', 'C5'].includes(variant)
  const missingFindings =
    required && !matched.size
      ? ['No supported finding with independently checked UI/measurement evidence']
      : []
  const unexpected = report.findings
    .filter((f) => f.validationStatus === 'supported' && !matched.has(f.id))
    .map((f) => f.id)
  const usage = report.usage,
    b = evidence.budget
  const budgetRespected =
    Number.isFinite(usage.actions) &&
    Number.isFinite(usage.modelCalls) &&
    Number.isFinite(usage.elapsedMs) &&
    usage.actions <= b.maxActions &&
    usage.modelCalls <= b.maxModelCalls &&
    usage.elapsedMs <= b.totalTimeoutMs + 1000
  const noAnswerLeak = !evidence.events.some((e) =>
    /\bC[0-5]\b|__control|variant-/.test(JSON.stringify(e.payload)),
  )
  const unsupportedStatus = !['completed', 'blocked'].includes(report.status)
  const allEvidencePresent = report.findings
    .filter((f) => f.validationStatus === 'supported')
    .every((f) => hasEvidence(f, evidence))
  const overallPass =
    businessResultCorrect &&
    !missingFindings.length &&
    !unexpected.length &&
    budgetRespected &&
    noAnswerLeak &&
    !unsupportedStatus &&
    allEvidencePresent
  return {
    ...base,
    businessResultCorrect,
    findingsScore: required ? (matched.size ? 1 : 0) : unexpected.length ? 0 : 1,
    missingFindings,
    budgetRespected,
    noAnswerLeak,
    overallPass,
    classification: overallPass ? 'pass' : unexpected.length ? 'needs-review' : 'fail',
    details: {
      unexpectedFindings: unexpected,
      orderCount: evidence.backend.orders.length,
      artifactsChecked: Object.keys(evidence.artifacts).length,
      allEvidencePresent,
      status: report.status,
    },
  }
}
export function summarizeEvaluation(scores: readonly EvalScore[]) {
  const variants: Partial<Record<VariantId, EvalScore[]>> = {}
  for (const s of scores) (variants[s.variant] ??= []).push(s)
  const complete = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'].every(
    (v) => variants[v as VariantId]?.length === 3,
  )
  const gatePassed =
    complete &&
    ['C0', 'C1', 'C2', 'C3', 'C4'].every((v) =>
      variants[v as VariantId]!.every((s) => s.overallPass),
    ) &&
    (variants.C5?.filter((s) => s.overallPass).length ?? 0) >= 2 &&
    scores.every((s) => s.noAnswerLeak && s.budgetRespected && s.classification !== 'invalid')
  return {
    suite: 'minimum',
    timestamp: new Date().toISOString(),
    variants,
    totalRuns: scores.length,
    passedRuns: scores.filter((s) => s.overallPass).length,
    passRate: scores.length ? scores.filter((s) => s.overallPass).length / scores.length : 0,
    gatePassed,
  }
}
