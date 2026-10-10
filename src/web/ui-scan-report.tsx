import { UI_CHECK_DESCRIPTION, UI_SAMPLING_DESCRIPTION } from '../shared/ui-sampling-policy.ts'
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

function Coverage({ report, runId }: { report: UiScanReport; runId: string }) {
  const { inspection } = report
  // A covered verdict is only shown as covered when the proof behind it verifies. The report already
  // refuses to compute `covered` on an unverified proof, and this is the belt to that braces: the
  // display must not say "covered" whatever a hand-edited payload contains.
  const covered = inspection.coverage === 'covered' && report.proofVerified
  return (
    <div className="ui-scan">
      <p>
        <strong>网址 UI 检查</strong> · 业务不适用（本次没有业务操作，也不代表业务结果）·{' '}
        {report.checkCounts && (
          <p>
            功能要求：已验证 {report.checkCounts.requiredEffectVerifiedCount} · 已证违反{' '}
            {report.checkCounts.requiredEffectFailedCount} · 有要求未完成{' '}
            {report.checkCounts.requiredEffectPendingCount}；功能语义未验证（无独立规格）{' '}
            {report.checkCounts.effectUnspecifiedCount} 项。通用检查未完成{' '}
            {report.checkCounts.genericIncompleteCount} · 来源未闭合{' '}
            {report.checkCounts.sourceUnresolvedCount}。没有效果要求不表示功能全部通过。
          </p>
        )}
        {covered
          ? report.reportRevision === 'ui-check-report-2'
            ? '默认检查已完成（限定范围）'
            : COVERAGE_LABEL.covered
          : COVERAGE_LABEL[inspection.coverage]}
      </p>
      <p>
        边界：匿名会话 · 不提交业务操作 · 仅支持 GET 型数据 · 有界采样（最多{' '}
        {report.contract.scope.maxPages} 页，深度 {report.contract.scope.maxDepth}）
      </p>
      {report.checkTasks && (
        <section aria-label="并行检查子任务">
          <h3>并行检查子任务</h3>
          <p>子任务测量保留独立证据；原有必查和已选事项仍需各自验证。</p>
          <ul>
            {report.checkTasks.tasks.map((s) => (
              <li key={s.task.childTaskId}>
                {s.task.purpose}：{s.status}；动作 {s.usage.actions} 次，模型调用{' '}
                {s.usage.modelCalls} 次，补充读取 {s.usage.reads} 次，耗时 {s.usage.elapsedMs} ms
                {s.result?.unchecked.map((item) => (
                  <p key={item}>未检查：{item}</p>
                ))}
                {s.error && <p>{s.error}</p>}
                {s.execution && <a href={s.execution.reportUrl}>子任务原始报告</a>}
                {s.result?.original?.evidence.map((e) => (
                  <a key={e.id} href={e.url}>
                    {' '}
                    原证据{' '}
                  </a>
                ))}
                {(s.evidenceRefs ?? s.result?.evidenceRefs)?.map((ref) => (
                  <a key={ref} href={artifactUrl(runId, ref)}>
                    {' '}
                    证据{' '}
                  </a>
                ))}
              </li>
            ))}
          </ul>
          {report.checkTasks.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </section>
      )}
      {report.popupCheck && (
        <section aria-label="弹窗视口检查">
          <h3>弹窗视口检查</h3>
          <p>
            子任务：
            {report.popupCheck.verdict === 'pass'
              ? '已测弹窗外框未越界'
              : report.popupCheck.verdict === 'fail'
                ? '已测弹窗外框被裁切'
                : '未验证'}
          </p>
          <p>此结论仅适用于记录时测量的浮层；整任务覆盖仍以上方结果为准。</p>
          {report.popupCheck.revision === 'popup-viewport-2' && (
            <>
              <p>UI 规则检查可见浮层的外框，不声明按钮因果；功能预期由原操作条目单独验证。</p>
              {report.popupCheck.uiChecks?.map((c) => (
                <p key={c.receiptRef}>
                  {c.targetId}：
                  {c.verdict === 'fail'
                    ? '外框被裁切'
                    : c.verdict === 'pass'
                      ? '外框未越界'
                      : '未验证'}{' '}
                  · <a href={artifactUrl(runId, c.receiptRef)}>查看 UI 测量</a>
                </p>
              ))}
              {(report.functionalChecks ?? []).length ? (
                report.functionalChecks!.map((c) => (
                  <p key={c.requirementId}>
                    功能预期：{c.source} · {c.state === 'verified' ? '已观察到预期结果' : '未验证'}
                    {c.evidenceRefs[0] && (
                      <>
                        {' '}
                        · <a href={artifactUrl(runId, c.evidenceRefs[0])}>查看功能证据</a>
                      </>
                    )}
                  </p>
                ))
              ) : (
                <p>未登记明确的浮窗功能预期；本次 UI 结论不代表按钮功能已验证。</p>
              )}
            </>
          )}

          <p>
            语义决策 {report.popupCheck.decisions} 次，动作 {report.popupCheck.attempts.length}{' '}
            次，补充读取 {report.popupCheck.reads} 次。
          </p>
          {report.popupCheck.attempts.map((a, i) => (
            <p key={i}>
              {report.inspection.items
                .find((item) => item.itemId === a.itemId)
                ?.basis.replace('observed candidate: ', '') ?? '已记录的入口'}{' '}
              · {a.result === 'completed' ? '已操作' : '未完成'}
            </p>
          ))}
          {report.popupCheck.missing.length > 0 && (
            <p>
              {report.popupCheck.revision === 'popup-viewport-2'
                ? '仍有浮层未检查或不具备支持范围内的稳定测量，详见证据详情。'
                : '尚不能确认目标弹窗或取得支持范围内的稳定测量，详见证据详情。'}
            </p>
          )}
          {report.popupCheck.verdict === 'unknown' &&
            !!report.popupCheck.candidateGeometry?.length && (
              <div>
                <p>已观察到候选浮层，但尚未确认与本次操作的关联；以下记录不计入已确认缺陷。</p>
                {report.popupCheck.candidateGeometry.map((candidate) => (
                  <p key={String(candidate.receiptRef)}>
                    {candidate.geometryVerdict === 'fail'
                      ? '候选浮层外框被裁切'
                      : candidate.geometryVerdict === 'pass'
                        ? '候选浮层外框未越界'
                        : '候选浮层几何未验证'}
                    {' · 关联未确认 · '}
                    <a href={artifactUrl(runId, String(candidate.receiptRef))}>查看候选观察记录</a>
                  </p>
                ))}
              </div>
            )}
          <details>
            <summary>证据详情</summary>
            <p>{report.popupCheck.reason}</p>
            {report.popupCheck.attempts.map((a, i) => (
              <p key={i}>
                入口 {a.itemId} · 动作 {a.actionId ?? '未派发'}
              </p>
            ))}
            {report.popupCheck.missing.length > 0 && (
              <p>待补事实：{report.popupCheck.missing.join('；')}</p>
            )}
          </details>
          {report.popupCheck.receiptRef && (
            <a href={artifactUrl(runId, report.popupCheck.receiptRef)}>查看几何测量回执</a>
          )}
        </section>
      )}
      {report.exploration && (
        <section aria-label="R1 路径与检查">
          <h3>R1 路径与检查</h3>
          <p>
            观察到 {report.exploration.visitedStates.length} 个状态 · 实际动作{' '}
            {report.exploration.attempts.filter((a) => a.visited).length} 次 · 有原始测量的路径{' '}
            {report.exploration.paths.filter((p) => p.measured).length}{' '}
            条。访问不代表验证；有测量也不代表所有效果通过。
          </p>
          <table>
            <thead>
              <tr>
                <th>目标</th>
                <th>动作</th>
                <th>状态转移</th>
                <th>原事项测量</th>
              </tr>
            </thead>
            <tbody>
              {report.exploration.attempts.map((a) => (
                <tr key={a.actionId}>
                  <td>{a.label}</td>
                  <td>{a.action}</td>
                  <td>
                    状态 {report.exploration!.visitedStates.indexOf(a.from) + 1} →{' '}
                    {a.to
                      ? '状态 ' + (report.exploration!.visitedStates.indexOf(a.to) + 1)
                      : '尚未测量'}
                  </td>
                  <td>
                    {a.measurement === 'verified'
                      ? '已测量'
                      : a.measurement === 'failed'
                        ? '已证违反'
                        : '未验证'}
                    {a.evidenceRefs.map((ref) => (
                      <a key={ref} href={artifactUrl(runId, ref)}>
                        {' '}
                        证据
                      </a>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>探索策略与未检查分支</summary>
            <ul>
              {report.exploration.strategies
                .filter((s: any) => s.applicable)
                .map((s: any) => (
                  <li key={s.strategyId}>
                    {(
                      {
                        'boundary-input': '公开输入边界',
                        'return-refresh': '返回或刷新',
                        'repeat-operation': '重复操作',
                        'state-switch': '公开状态切换',
                        recovery: '有限恢复',
                      } as Record<string, string>
                    )[s.strategyId] ?? s.strategyId}
                    ：{s.proposable ? '当前事实支持该建议' : '当前条件不足'}
                    。建议是否执行，以原事项测量为准。
                  </li>
                ))}
            </ul>
            <p>仍未探索 {report.exploration.unexplored.length} 个分支。</p>
            {report.exploration.counterexample && (
              <p>
                反例调查：
                {report.exploration.counterexample.kind === 'compare-healthy'
                  ? '建议比较其他同类控件，健康与否需原始测量'
                  : '当前没有可负担的合法比较路径，保留进一步调查需求'}
                。
              </p>
            )}
          </details>
          {report.exploration.handoffs.map((h) => (
            <p key={h.eventId}>交回原因：{h.reason}</p>
          ))}
          <p>
            未纳入检查 {report.exploration.omittedItemIds.length}{' '}
            项；原事项及未完成原因见下表。模型调用 {report.exploration.usage.totalModelCalls}{' '}
            次，其中 Jev {report.exploration.usage.jevCalls} 次；Jev已知费用 USD
            {report.exploration.usage.jevKnownUsd}
            {report.exploration.usage.jevUnknown ? '，仍有未知费用' : ''}。
          </p>
        </section>
      )}
      {report.contract.samplingPolicy && (
        <p>
          {report.reportRevision === 'ui-check-report-2'
            ? UI_CHECK_DESCRIPTION
            : UI_SAMPLING_DESCRIPTION}
        </p>
      )}
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
          {inspection.counts.failed > 0
            ? '已完成范围内的检查并记录缺陷，见问题与反馈。'
            : '在已验证范围内未发现问题。'}
          这只是在本次已验证的条目和页面范围内成立，不代表整站合格，也不代表 未检查的功能正常。
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
      {report.inspection.sampling?.map((frame) => (
        <p key={frame.url}>
          冻结范围：{frame.url} · 必需 {frame.required} · 已登记 {frame.selected.length} · 未采样{' '}
          {frame.notChecked.length} · 截断 {frame.truncated}（未采样和截断均不代表通过）
        </p>
      ))}
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
                {!item.selected ? '未检查（未纳入本轮范围）' : item.status}
                {item.reasonCode ? ` · ${item.reasonCode}` : ''}
              </td>
              <td>{item.basis}</td>
              <td>
                {item.checks && (
                  <span>
                    通用：{item.checks.generic.state} · 效果：
                    {item.checks.effects.length
                      ? item.checks.effects.map((e) => e.state).join('、')
                      : '功能语义未验证'}{' '}
                    · 来源：{item.checks.sourceReview.state}。{' '}
                  </span>
                )}
                {item.detail ?? '—'}
              </td>
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
  if (report.reportRevision && report.reportRevision !== 'ui-check-report-2')
    return (
      <section>
        <h2>报告版本不支持</h2>
        <p>不能将未知版本显示为检查通过。</p>
      </section>
    )
  return (
    <section>
      <h2>网址 UI 检查</h2>
      <Coverage report={report} runId={runId} />
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
