# UIK-R009 · 审查视觉暗示与实际交互状态是否一致

- 类型：体验审查建议；主题：交互可发现性。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：5 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

控件和滚动区域的外观应帮助用户理解可操作性与当前状态。

## 适用条件

已确认目标可用性、选择状态或区域可滚动，且视觉暗示影响发现操作。

## 不适用情形和正常例外

合法禁用；静态信息胶囊；通过其他清晰线索表示选择；轮播圆点可替代相邻预露；窄屏按钮堆叠可提升可读性。

## 可观察的违反条件（审查信号）

审查信号：可用动作看似禁用、静态标签看似可点击、选中或滚动提示难察觉；主观“看着不像”不足以判 fail。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

用可用性事实和语义角色绑定，区别 CTA、信息标签、筛选状态及轮播导航；不按颜色认定 enabled。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 确认真实可用性与预期交互。
2. 观察初态、选中及悬停线索，检查替代提示。
3. 记录认知歧义与设计解释；无法操作或状态完全消失另走 D010/D007。

## 所需证据与不确定性

可用性事实、画面与任务上下文；只有样式偏好、未确认可用性时 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

081 报告实际 CTA 看似禁用；208 要求不可切换对象显示为静态标签，业务条件不提炼。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：按钮合法禁用且理由明确；轮播无邻卡预露但有清楚分页与导航。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断/人工审查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：控件和滚动区域的外观应帮助用户理解可操作性与当前状态。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0080](../ticket-mapping.md#src-fail-0080) · [原文 L760–L768](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:760>) · 原文摘录：The selected filter pill's stroke weight is too thin and not legible in its selection state. Stroke weight should be updated to match the Figma design spec. * Affected platform: Web * The current stroke weight on the selected filter state is not legible — it needs to be increased/aligned to the Figma spec * Reference Figma: [ * Screenshot context: Positions/History tab view with "Open" and "Settled" filter pills — the selected pill's border stroke is not visually distinct enough
- [SRC-FAIL-0081](../ticket-mapping.md#src-fail-0081) · [原文 L770–L779](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:770>) · 原文摘录：The "Pick now" CTA on the "Choose Your Team" hero carousel in the Pro Football Hub does not appear as an active or tappable button — the styling makes it look inactive or disabled, which may cause users to miss it. * Observed on the Pro Football Hub page, in the "Choose Your Team" onboarding hero section * The carousel displays NFL team tiles (BUF, LAC, IND, DAL, ATL, NYG, DET, etc.) with a "Pick now" CTA on each tile * The CTA button styling does not communicate interactivity — should be updated to look like a clear, active call-to-action per  …（摘录，见原文）
- [SRC-FAIL-0084](../ticket-mapping.md#src-fail-0084) · [原文 L797–L805](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:797>) · 原文摘录：Remove the cut-off glow effect and the partially visible adjacent banner from the promo banner carousel on web. Active banners should stretch to fill the full width of the carousel container. The carousel indicator (dots/pagination) is sufficient to communicate that it is a carousel — the peeking/cut-off treatment is no longer needed. * Currently, the carousel shows a glow at the edges and a sliver of the next/previous banner is visible — this should be removed. * Active banners should fill 100% of the carousel width instead of being narrowed t …（摘录，见原文）
- [SRC-FAIL-0103](../ticket-mapping.md#src-fail-0103) · [原文 L979–L987](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:979>) · 原文摘录：Reduce the cookie consent banner size significantly on mobile web. The two CTAs ("Accept all" and "Reject non-essential cookies") should be placed next to each other (side by side) rather than stacked, to reduce the overall height of the banner. * Currently the cookie consent banner takes up a large portion of the screen on mobile web, overlaying content below * The two CTAs are stacked vertically — they should be laid out horizontally side by side to save space * Screenshot shows the banner covering the bottom of the Economics category page (U …（摘录，见原文）
- [SRC-FAIL-0208](../ticket-mapping.md#src-fail-0208) · [原文 L1800–L1804](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1800>) · 原文摘录：Should render as static non-interactive bordered pill "National Team".

## 未解决问题与关联

081 悬停暂停不能自动判缺陷；103 并排按钮未必适合长文案。

关联：[UIK-D007](UIK-D007.md)、[UIK-D010](UIK-D010.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
