import type { RunReport } from '../../src/shared/types.ts'
import type { PageSnapshot } from '../../src/rules/types.ts'
import type { VariantId } from './answers.ts'
import { evaluateRun, type IndependentEvidence } from './evaluator.ts'

export const recoveryProtocol = 'recovery-v2'

/** Experimental protocol. The historical minimum evaluator and scores remain unchanged. */
export function evaluateRecoveryRun(
  report: RunReport,
  variant: VariantId,
  repeat: number,
  evidence: IndependentEvidence,
) {
  const legacy = evaluateRun(report, variant, repeat, evidence)
  if (legacy.classification === 'invalid') return legacy
  const snapshots = Object.values(evidence.artifacts)
    .filter((a) => a.exists && a.type === 'snapshot')
    .map((a) => a.data as PageSnapshot)
  const hasOrder = (s: PageSnapshot | undefined, id: string) =>
    !!s?.elements?.some((el) => el.visible && el.text.includes(id))
  const order = evidence.backend.orders.length === 1 ? evidence.backend.orders[0] : undefined
  const recovered =
    variant === 'C2' &&
    ['completed', 'blocked'].includes(report.status) &&
    report.businessResult === 'success' &&
    order?.status === 'paid' &&
    snapshots.some((s) => hasOrder(s, order.id))
  const businessResultCorrect = legacy.businessResultCorrect || !!recovered
  const errors: string[] = []
  if (!evidence.events.some((e) => e.type === 'finish:accepted'))
    errors.push('Agent did not explicitly finish')
  if (variant === 'C5') {
    const eligible =
      order &&
      evidence.events.some((e) => {
        const p = e.payload as Record<string, unknown>
        return (
          e.type === 'business:response' &&
          p.orderId === order.id &&
          p.status === 'failed' &&
          p.success === false &&
          p.canRetry === true
        )
      })
    if (!eligible) errors.push('Missing matching public retry eligibility')
    for (const f of report.findings.filter((f) => f.validationStatus === 'supported')) {
      const references = f.evidenceRefs.map((id) => evidence.artifacts[id])
      if (
        !references.some(
          (a) =>
            a?.exists &&
            a.type === 'snapshot' &&
            order &&
            hasOrder(a.data as PageSnapshot, order.id),
        )
      )
        errors.push(`${f.id}: missing matching order UI in finding evidence`)
      const measurements = references.filter((a) => a?.exists && a.type === 'measurement')
      if (
        !measurements.length ||
        measurements.some(
          (a) => (a.data as { condition?: string })?.condition !== 'element-actionable',
        )
      )
        errors.push(`${f.id}: recovery operability requires actionability measurement`)
    }
  }
  const overallPass =
    businessResultCorrect &&
    errors.length === 0 &&
    legacy.missingFindings.length === 0 &&
    (legacy.details.unexpectedFindings as string[]).length === 0 &&
    legacy.budgetRespected &&
    legacy.noAnswerLeak &&
    legacy.details.allEvidencePresent === true &&
    ['completed', 'blocked'].includes(report.status) &&
    !['model-request-timeout', 'no-progress', 'finish-incomplete'].includes(report.stopReason ?? '')
  return {
    ...legacy,
    businessResultCorrect,
    overallPass,
    classification: overallPass ? ('pass' as const) : ('fail' as const),
    missingFindings: [...legacy.missingFindings, ...errors],
    details: {
      ...legacy.details,
      protocol: recoveryProtocol,
      historicalProtocolPass: legacy.overallPass,
      recoveredBusiness: !!recovered,
      recoverySafety: recovered
        ? 'Requires separate tool-trajectory review; score is not proof of safe actions'
        : 'not-applicable',
    },
  }
}
