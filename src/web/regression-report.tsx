import type { regressionReport } from '../server/reports/regression-report.ts'
const labels: Record<string, string> = {
  'no-observed-change': '所观察事实未见变化',
  'outside-dependency-display-change': '路径依赖之外的展示事实变化',
  'dependency-change': '路径目标、结果或前置事实变化',
  unknown: '观察不足，变化未知',
  'newly-verified': '本次新验证通过',
  'newly-failed': '本次测出缺陷',
  unchecked: '本次未验证',
  'target-missing-or-ambiguous': '目标缺失或定位歧义',
  'target-description-changed': '目标结构或名称变化',
  'product-target-not-unique-source-match': '来源命名目标不唯一',
  'compatible-description': '结构描述仍匹配，须本次重测',
  'target-not-visible-or-unidentified': '目标不可见或无法确认身份',
  'unknown-observation': '当前观察不完整',
  'live-node-replaced': '操作前节点身份已变化',
  'entry-or-origin-mismatch': '操作前入口发生变化',
}
export function RegressionReport({
  report,
}: {
  report: NonNullable<ReturnType<typeof regressionReport>>
}) {
  const identity = report.identity
  return (
    <section aria-label="增量回归报告">
      <h3>相对历史检查的变化</h3>
      <p>
        历史参考：
        <a href={'/?run=' + encodeURIComponent(identity.baselineRunId ?? '')}>
          {identity.baselineRunId}
        </a>
        。历史通过不计作本次通过。
      </p>
      <p>
        精确入口：{identity.entryMatches ? '相同' : '变化'}；资料身份、版本与正文：
        {identity.sourceMatches ? '相同，逐步重新测量' : '变化，旧计划失效，需要按本次资料重新调查'}
        。
      </p>
      <p>
        资料版本：{identity.previous.source.version} → {identity.current.source?.version ?? '缺失'}
        。
      </p>
      <ol>
        {report.steps.map((s) => (
          <li key={s.index}>
            <strong>
              {s.title}：{labels[s.state]}
            </strong>
            <p>
              {s.change ? labels[s.change.classification] : '尚未进入本步骤，未比较后续动态节点。'}
              {s.invalidated ? ' 旧路径的这一步不能继续复用，需重新调查。' : ''}
            </p>
            {!!s.invalidationReason && (
              <p>
                派发前再次检查发现：
                {labels[String(s.invalidationReason)] ?? String(s.invalidationReason)}
                ，本步骤未派发。
              </p>
            )}
            {s.change?.dependencies
              .filter((d) => d.factsChanged || d.state !== 'compatible-description')
              .map((d, i) => (
                <p key={i}>
                  {d.role === 'control'
                    ? '操作目标'
                    : d.role === 'result'
                      ? '结果区域'
                      : '前置条件'}{' '}
                  ：{labels[d.state] ?? d.state}
                  {d.factsChanged
                    ? `；公开事实由 ${d.before.map((n) => n.value ?? n.text).join(' / ') || '无'} 变为 ${d.after.map((n) => n.value ?? n.text).join(' / ') || '无'}`
                    : ''}
                </p>
              ))}
            {s.change?.outsideChanges.map((d, i) => (
              <p key={'display-' + i}>
                依赖之外展示：{d.before.map((n) => n.value ?? n.text).join(' / ') || '无'} →{' '}
                {d.after.map((n) => n.value ?? n.text).join(' / ') || '无'}
              </p>
            ))}
            {!!s.change && s.change.outsideChangeCount > 12 && (
              <p>其余展示变化已省略，共 {s.change.outsideChangeCount} 项。</p>
            )}
            <p>
              本次测量与证据见下方产品资料报告。
              {s.recommendation === 'not-reached' ? '本步骤未检查，不据此断言目标缺失。' : ''}
            </p>
          </li>
        ))}
      </ol>
      <p>
        比较仅覆盖所选路径和到达状态的公开节点事实；脚本、样式、其他页面与未观察依赖未知。资料变化后的新计划另见本次产品资料报告。
      </p>
      <details>
        <summary>变化依据与事件定位</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  )
}
