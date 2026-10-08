# UIK-R006 · 审查等待、空内容和暂不可操作的说明

- 类型：体验审查建议；主题：反馈。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：6 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

用户可能困惑时，应审查当前状态是否得到准确而适量的解释。

## 适用条件

用户主动打开内容区、触发取数或遇到已确认不可操作状态，且不易从上下文理解。

## 不适用情形和正常例外

立即完成无需可见 spinner；折叠区无需空态；有其他反馈；合法按需加载；不要求所有流程有进度条，也不设等待时限。

## 可观察的违反条件（审查信号）

审查信号：已展开区域长期呈空白而无法区分加载/零结果，或不可操作入口没有足够上下文。误报终态另由 D006 检查。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

关联用户意图、异步状态和内容/反馈区；不从空 DOM 推断零数据。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 确认区域已激活和实际加载/空/不可操作状态。
2. 观察已有文字、动画、内容及上下文说明。
3. 评估用户是否能理解状态，并记录替代反馈；不强制骨架或 tooltip。

## 所需证据与不确定性

用户动作、状态事件与时间线、反馈截图；缺少状态依据或只想换 spinner 样式时不能判缺陷。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

138 报告展开的聊天区域零消息时完全空白；136 请求首次加载和切换时提供占位。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：数据更新保留旧内容并明确提示；零结果用简短说明；立即完成不闪出加载图。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 人工审查；状态可确定性采样。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：用户可能困惑时，应审查当前状态是否得到准确而适量的解释。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0136](../ticket-mapping.md#src-fail-0136) · [原文 L1303–L1309](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1303>) · 原文摘录：Implement a skeleton/placeholder loading state for data points in player cards on the web player pages, so that: 1. On initial load, data point areas show a loading placeholder instead of an empty space. 2. When the user switches to a second player, the same placeholder is shown to indicate data is updating. * The placeholder should be re-usable across both the initial page load and the player-switch transition. * Screenshots show the Caleb Williams player page (NFL QB #18, Chicago Bears) with the Markets tab displaying "Next game" (Bears vs Vi …（摘录，见原文）
- [SRC-FAIL-0138](../ticket-mapping.md#src-fail-0138) · [原文 L1321–L1328](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1321>) · 原文摘录：The Chat section on the event detail page is missing an empty state — when there are no messages, nothing is shown to the user where content is expected. * Affects the Chat collapsible section visible on event detail pages (e.g. Over/Under markets, sports events) * No empty state UI (illustration, copy, or placeholder) is displayed when the chat has no messages * Other collapsible sections on the same page (Timeline, How It Works) appear to handle their states correctly
- [SRC-FAIL-0195](../ticket-mapping.md#src-fail-0195) · [原文 L1710–L1714](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1710>) · 原文摘录：Progress bar missing on first step of email login/registration flow. Only appears from Step 2 onwards.
- [SRC-FAIL-0209](../ticket-mapping.md#src-fail-0209) · [原文 L1806–L1810](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1806>) · 原文摘录：Blank tab; expected "No markets available" empty state.
- [SRC-FAIL-0224](../ticket-mapping.md#src-fail-0224) · [原文 L1904–L1908](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1904>) · 原文摘录：Right-rail container swaps in-place to a branded loading state (unlike the App's full-bleed treatment). Phase 1/2 copy transition + animation specs frame per App §5.1.2.
- [SRC-FAIL-0338](../ticket-mapping.md#src-fail-0338) · [原文 L2698–L2702](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2698>) · 原文摘录：Lock icon hover shows "No price available now" tooltip; one tooltip at a time.

## 未解决问题与关联

195 进度条缺首步只是当前设计诉求；338 不应只允许 hover 获取必要说明。

关联：[UIK-D006](UIK-D006.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
