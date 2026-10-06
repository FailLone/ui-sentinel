import type { UiScanReport } from '../server/reports/ui-scan-report.ts'
import { artifactUrl } from './state.ts'

/**
 * The `ui-scan` section of the workbench (plan 3.2 steps 6-7).
 *
 * Three rules decide the wording here, because each one is a claim a person will read as a promise:
 *
 * - Coverage is scoped. "No problems found" is only ever said *within the verified scope*, and the
 *   page states plainly that this is not a site-wide guarantee. A partial scan never gets the healthy
 *   wording at all.
 * - A gap is shown, not counted. Every item left unverified is listed with its reason and its ledger
 *   identity, because a count in a summary is exactly what hides the thing the run did not check.
 * - The business dimension is stated as inapplicable. Blank would read as "not measured yet"; the
 *   contract is what makes it genuinely inapplicable.
 */
const COVERAGE_LABEL: Record<UiScanReport['inspection']['coverage'], string> = {
  covered: '已完成（已验证范围）',
  partial: '部分完成（仍有未验证项）',
  'not-started': '未开始检查',
}

function Coverage({ report }: { report: UiScanReport }) {
  const { inspection } = report
  // A covered verdict is only shown as covered when the proof behind it verifies. The report already
  // refuses to compute `covered` on an unverified proof, and this is the belt to that braces: the
  // display must not say "covered" whatever a hand-edited payload contains.
  const covered = inspection.coverage === 'covered' && report.proofVerified
  return (
    <div className="ui-scan">
      <p>
        <strong>网址 UI 检查</strong> · 业务不适用（本次没有业务操作，也不代表业务结果）·{' '}
        {covered ? COVERAGE_LABEL.covered : COVERAGE_LABEL[inspection.coverage]}
      </p>
      <p>
        边界：匿名会话 · 不提交业务操作 · 仅支持 GET 型数据 · 有界采样（最多{' '}
        {report.contract.scope.maxPages} 页，深度 {report.contract.scope.maxDepth}）
      </p>
      <p>
        入口：
        <code>{report.contract.entryUrl}</code>
        {report.contract.requestedUrl !== report.contract.entryUrl && (
          <>
            {' '}
            （提交时：<code>{report.contract.requestedUrl}</code>）
          </>
        )}
      </p>
      <p>
        检查范围：已验证 {inspection.counts.verified} · 已证缺陷 {inspection.counts.failed} · 未验证{' '}
        {inspection.counts.unverified} · 排除 {inspection.counts.excluded} · 合计{' '}
        {inspection.counts.total}
      </p>
      {covered ? (
        <p>
          在已验证范围内未发现问题。这只是在本次已验证的条目和页面范围内成立，不代表整站合格，也不代表
          未检查的功能正常。
        </p>
      ) : (
        inspection.coverage === 'partial' && (
          <p>
            本次未完成全部所选检查，下面列出未验证的条目和原因；未验证不等于通过，也不等于存在缺陷。
          </p>
        )
      )}
      {report.proof ? (
        <p>
          完成证明 <code>{report.proof.hash}</code>
          {report.proofVerified ? '' : ' · 证明校验未通过，本次结果不能作为覆盖结论'}
        </p>
      ) : (
        <p>本次没有接受的完成证明，覆盖结论不成立。</p>
      )}
    </div>
  )
}

function Items({ report }: { report: UiScanReport }) {
  const { items, candidates } = report.inspection
  if (!items.length) return <p>本轮没有形成可核对的检查条目。</p>
  return (
    <>
      {candidates && (
        <p>
          候选来源：{candidates.detail}
          {candidates.truncated > 0 ? `（另有 ${candidates.truncated} 项被截断未采样）` : ''} · 类别{' '}
          {candidates.categories.join('、') || '无'}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>条目</th>
            <th>类别</th>
            <th>状态</th>
            <th>依据</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemId}>
              <td>{item.itemId}</td>
              <td>{item.category}</td>
              <td>
                {item.status}
                {item.reasonCode ? ` · ${item.reasonCode}` : ''}
              </td>
              <td>{item.basis}</td>
              <td>{item.detail ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function Gaps({ report }: { report: UiScanReport }) {
  const { gaps, unsupported } = report.inspection
  if (!gaps.length && !unsupported.length) return null
  return (
    <details open>
      <summary>未验证范围（{gaps.length} 项）</summary>
      <ul>
        {gaps.map((gap) => (
          <li key={gap.itemId}>
            {gap.itemId} · {gap.category} · {gap.status}
            {gap.reasonCode ? ` · ${gap.reasonCode}` : ''}：{gap.reason}
          </li>
        ))}
        {unsupported.map((u) => (
          <li key={u.dimension}>
            {u.dimension}：本次不支持（{u.reasonCode}），不属于通过
          </li>
        ))}
      </ul>
    </details>
  )
}

function Interventions({ report }: { report: UiScanReport }) {
  if (!report.interventions.length) return null
  return (
    <details>
      <summary>执行器干预（{report.interventions.length}）</summary>
      <ul>
        {report.interventions.map((intervention) => (
          <li key={intervention.eventId}>
            {intervention.kind}
            {intervention.reasonCode ? ` · ${intervention.reasonCode}` : ''}
            {intervention.detail ? `：${intervention.detail}` : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function UiScanReportSection({ report, runId }: { report: UiScanReport; runId: string }) {
  return (
    <section>
      <h2>网址 UI 检查</h2>
      <Coverage report={report} />
      <Gaps report={report} />
      <Interventions report={report} />
      <details open={report.inspection.coverage !== 'covered'}>
        <summary>检查条目（{report.inspection.items.length}）</summary>
        <Items report={report} />
      </details>
      <details>
        <summary>本次能力与不支持项</summary>
        <p>可用：{report.contract.availableCapabilities.join('、') || '无'}</p>
        <p>不支持：{report.contract.unsupportedCapabilities.join('、') || '无'}</p>
        <p>
          契约 <code>{report.contract.hash}</code> · 模式 {report.contract.integrity} · schema{' '}
          {report.contract.schemaVersion} · 策略 {report.contract.policyRevision}
        </p>
      </details>
    </section>
  )
}

export { artifactUrl }
