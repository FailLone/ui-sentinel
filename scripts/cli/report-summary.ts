/**
 * The terminal summary of an exported report (plan 6.3).
 *
 * The JSON file is the record; these lines are what a person reads before opening it. Two things they
 * must never do: show a business result for a UI scan (it is genuinely inapplicable, not zero), and
 * let an inconsistent persistence verdict sit below a status that reads like a result.
 */

interface SummaryInput {
  readonly runId: string
  readonly status: string
  readonly businessResult: string
  readonly stopReason: string | null
  readonly persistence?: { readonly status: string; readonly issues: readonly string[] }
  readonly uiScan?: {
    readonly inspection: {
      readonly coverage: string
      readonly counts: { readonly unverified: number; readonly verified: number }
    }
  }
}

export function reportSummaryLines(report: SummaryInput): string[] {
  if (report.persistence?.status === 'inconsistent')
    return [
      `运行 ${report.runId}：持久记录不一致，结果未获验证（${report.persistence.issues.join(', ')}）`,
      '完整报告已导出，但请先核对记录本身，不要把其中的状态当作结论。',
    ]
  if (report.uiScan) {
    const { coverage, counts } = report.uiScan.inspection
    return [
      `运行 ${report.runId}：ui-scan · ${report.status} · 停止原因 ${report.stopReason ?? '尚未停止'}`,
      `检查覆盖 ${coverage}：已验证 ${counts.verified} 项，未验证 ${counts.unverified} 项 · 业务不适用`,
    ]
  }
  return [
    `运行 ${report.runId}：business · ${report.status} · 业务结果 ${report.businessResult} · 停止原因 ${report.stopReason ?? '尚未停止'}`,
  ]
}
