import type { UiRuleReportEntry } from '../server/reports/ui-rule-report.ts'
import { artifactUrl } from './state.ts'
const labels: Record<string, string> = {
  pass: '限定健康见证',
  fail: '已确认文字消失',
  unknown: '证据不足 / 范围外',
  'not-applicable': '本项不适用',
  'review-needed': '待审查建议',
  loaded: '已加载',
  'source-absent': '未提供图片资源',
  'http-failed': 'HTTP 加载失败',
  'request-failed': '请求失败',
  'load-or-decode-failed': '加载或解码失败',
  loading: '加载中',
  'lazy-no-request-observed': '懒加载：尚未观察到请求',
}
const label = (value: string) => labels[value] ?? value
const reasonText = (value: string) => {
  const meanings: Record<string, string> = {
    'sole-native-text-name-has-no-distinguishable-paint':
      '截图像素与平面合成共同确认：此控件的文字名称与背景无法区分',
    'opaque-black-white-text-ink-observed': '已观察到黑白文字实色像素与背景，仅此限定子集健康',
    'stroke-shadow-or-decoration': '文字有描边、阴影或修饰，当前不能判断其替代表达',
    'complex-compositing': '存在复杂背景或合成效果，当前无法可靠测量',
    'document-budget': '页面超过本项有界绘制扫描预算',
    'evidence-intervened-or-missing': '执行器干预了页面请求，或证据完整性缺失，不能判断原网站',
    'observation-changed': '目标或页面在采集后变化，旧事实不能用于本次结论',
    'canvas-background-unresolved': '实际画布背景没有得到可靠确认',
    'font-not-established': '字体尚未稳定或使用当前不支持的自定义字体',
    'native-appearance-unmeasured': '原生控件的系统绘制外观不在当前支持范围',
    'disabled-or-inert': '控件已明确禁用或不可交互，本项不适用',
    'not-presented': '控件未呈现，本项不适用',
    'outside-exact-disappearance-or-black-white-witness':
      '既非确切的文字消失，也非本项支持的黑白健康见证',
    'missing-or-ambiguous-target': '目标缺失或有多个匹配，未选择其中第一个',
    'intersecting-content': '存在可能覆盖文字的内容，当前不能确认文字绘制',
  }
  return [
    ...new Set(value.split('; ').map((code) => meanings[code] ?? '存在当前未支持的绘制或证据条件')),
  ].join('；')
}
export function UiRuleReportSection({
  entries,
  runId,
}: {
  entries: UiRuleReportEntry[]
  runId: string
}) {
  if (!entries.length) return null
  return (
    <section aria-label="文字与缺图检查">
      <h2>文字与缺图检查</h2>
      <p>每次观察的有限目标检查；未知和省略不表示全页通过。缺图建议与已确认缺陷分开。</p>
      {[...entries].reverse().map((entry, index) => {
        const b = entry.body
        return (
          <details key={entry.eventId} open={index === 0}>
            <summary>{b ? `${b.url} · ${b.observedAt}` : '历史材料不可用'}</summary>
            {!entry.available || !b ? (
              <p>证据不足：{entry.reason}</p>
            ) : (
              <>
                <p>
                  <a href={artifactUrl(runId, b.screenshotRef)} target="_blank" rel="noreferrer">
                    查看同次截图
                  </a>{' '}
                  · 共享观察之外的采集/评价时间 {Math.round(b.timing.addedMs)} ms（同次共享观察另计{' '}
                  {Math.round(b.timing.sharedObservationMs)}{' '}
                  ms，含截图、原DOM及新增图片事实；未做基线差分）
                </p>
                <h3>原生控件文字检查</h3>
                <p>
                  目标 {b.controls.total} · 已测 {b.controls.enumerated} · 未知 {b.controls.unknown}{' '}
                  · 省略 {b.controls.omitted}。只验证受支持的文字绘制，不是完整可读性或合规证明。
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>目标 / 文字</th>
                      <th>结果</th>
                      <th>依据或未知原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.controls.rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          {r.text || '没有可取得的文字'}
                          <br />
                          <small>{r.selector}</small>
                        </td>
                        <td>{label(r.verdict)}</td>
                        <td>
                          {reasonText(r.reason)}
                          <details>
                            <summary>原始原因</summary>
                            {r.reason}
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3>缺图替代表达：待审查建议与证据不足</h3>
                <p>
                  目标 {b.images.total} · 已测 {b.images.enumerated} · 未知 {b.images.unknown} ·
                  省略 {b.images.omitted}。本区不是缺陷清单，不计算健康 pass，也不推断替代身份等效。
                </p>
                {b.images.rows.length ? (
                  b.images.rows.map((r, i) => (
                    <article key={i}>
                      <strong>
                        {r.selector}：{label(r.disposition)}
                      </strong>
                      <p>
                        图片状态：{label(r.state)}；图槽：{r.layout}
                      </p>
                      <p>同区域文字：{r.text.join('；') || '没有采到公开文字（不证明不存在）'}</p>
                      <p>其他图片：{r.alternatives.join('；') || '没有采到兄弟图片'}</p>
                      <p>{r.association}</p>
                      {r.disposition === 'review-needed' && (
                        <p>
                          请审查该区域是否确实需要图片；清楚的文字可能已经足够，不要求特定占位图。
                        </p>
                      )}
                      {r.reasons.length > 0 && (
                        <p>未知理由：{r.reasons.map(reasonText).join('；')}</p>
                      )}
                    </article>
                  ))
                ) : (
                  <p>未枚举到原生图片；不能据此判断没有 img 的头像区域。</p>
                )}
              </>
            )}
          </details>
        )
      })}
    </section>
  )
}
