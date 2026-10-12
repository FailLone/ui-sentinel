/** Evidence triage only: semantic acceptance is the predeclared human rubric, never this boolean. */
export function triage(report: any, restored: any, expected: string) {
  const p = report.uiScan?.productSource
  const integrity = report.persistence?.issues?.length === 0
  const recovered =
    JSON.stringify(restored.uiScan?.productSource) === JSON.stringify(p) &&
    restored.persistence?.issues?.length === 0 &&
    restored.status === report.status
  return {
    integrity,
    recovered,
    expected,
    actual: p?.state ?? p?.status ?? null,
    status: report.status,
    completion: report.uiScan?.inspection?.coverage ?? null,
    product: p ?? null,
    semanticAcceptance: 'pending-human-review',
    note: 'Valid short plans may omit a required outcome. Review both source obligations and default scope; do not equate report status or zero findings with acceptance.',
  }
}
