# UIK-R007 · 审查导航方向与当前上下文

- 类型：体验审查建议；主题：导航与弹层。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：6 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

导航和弹层应提供足够上下文，让用户理解所在位置及操作将去往何处。

## 适用条件

用户在详情、相邻对象切换、筛选或弹层中需要判断返回/下一步的含义。

## 不适用情形和正常例外

浏览器后退、面包屑、全局导航可提供替代；自解释单任务弹层可无冗余标题；不要求每页返回键或每组都有 All。

## 可观察的违反条件（审查信号）

审查信号：箭头顺序难理解、返回路径不明、弹层任务身份不清或多余返回入口指向意外层级。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

识别导航角色、层级、任务标题与前后状态关系，不把左箭头固定等同浏览器后退。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 记录进入路径、当前上下文与可见导航提示。
2. 在安全演示中检查返回/相邻切换或弹层关闭的实际去向。
3. 核对用户是否能预测方向并识别替代路径，形成待设计确认的建议。

## 所需证据与不确定性

导航前后关系、入口语义与上下文证据；只有“缺标题/缺 All”不能断言通用缺陷。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

089 报告无清楚返回入口且相邻箭头顺序不明；348 报告弹层多余返回入口。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：详情没有专门返回键，但层级导航清楚；相邻切换明确标注对象和顺序。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 人工审查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：导航和弹层应提供足够上下文，让用户理解所在位置及操作将去往何处。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0089](../ticket-mapping.md#src-fail-0089) · [原文 L843–L849](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:843>) · 原文摘录：Several design and UX issues found on OG Web player pages (e.g. og.com/nfl/players/rashee-rice-fjzxza). Issues reported: - Header box image does not load on the player page - "Next game" section has a coloured background that appears off-brand — needs clarification on whether this is intentional - No category page link or back navigation in the header, making it unclear how to return to main pages - Stats are hard to read — column spacing is inconsistent - Left/right arrow navigation between players has no indication of ordering logic (alphabet …（摘录，见原文）
- [SRC-FAIL-0124](../ticket-mapping.md#src-fail-0124) · [原文 L1183–L1191](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1183>) · 原文摘录：The TP/SL (Take Profit / Stop Loss) info in the Perps position detail view currently uses an info icon (ⓘ) to surface the tooltip. This should instead use the same underlined text hover interaction used for Margin and Leverage on the same page — for visual and interaction consistency. * The current implementation shows an ⓘ icon next to the TPSL label * Margin and Leverage already use an underlined text style that triggers a tooltip on hover * TPSL should adopt the same pattern — underlined label text that shows a tooltip on hover, no info icon …（摘录，见原文）
- [SRC-FAIL-0274](../ticket-mapping.md#src-fail-0274) · [原文 L2244–L2248](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2244>) · 原文摘录：Apply Bonus modal is missing the 'Bonuses' title per Figma. Layout/element missing.
- [SRC-FAIL-0315](../ticket-mapping.md#src-fail-0315) · [原文 L2536–L2540](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2536>) · 原文摘录：When user has no active coupons, All / Bonuses / Boosts filter chips are missing; expected filter row to still display.
- [SRC-FAIL-0321](../ticket-mapping.md#src-fail-0321) · [原文 L2578–L2582](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2578>) · 原文摘录：Filter row shows only "Games" and "Futures"; "All" chip missing.
- [SRC-FAIL-0348](../ticket-mapping.md#src-fail-0348) · [原文 L2764–L2768](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2764>) · 原文摘录：Extra back button at top-left (clicking returns to trade instruction) and X close button has gray background. Expected: no back button, X without gray background.

## 未解决问题与关联

315/321 缺筛选项可能属于合法产品范围；只保留信息结构审查，不规定必须显示。

关联：[UIK-R009](UIK-R009.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
