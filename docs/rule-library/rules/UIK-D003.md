# UIK-D003 · 视口边界变化后必要操作仍应可达

- 类型：缺陷检查规则；主题：滚动与视口。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：2 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

受支持的视口和浏览器界面变化不应使当前必要操作永久落入不可达区域。

## 适用条件

操作在此状态确实允许；面板内容增长、浏览器工具栏或可视视口变化影响布局。

## 不适用情形和正常例外

正常滚动后可完整到达；合法禁用；模态背景不可交互；屏外按需内容；不要求按钮始终固定或所有内容一次可见。

## 可观察的违反条件

尝试已提供的页面/内部滚动后，必要操作仍被视口裁掉或浏览器栏遮住，无法完整辨认并操作。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

从当前任务的主要操作和所属面板绑定，识别真正滚动容器与可视视口，不用固定 CTA 名称。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 建立操作允许和任务仍进行中的前置事实。
2. 在支持的设备状态增加内容或显隐浏览器工具栏。
3. 尝试所有明确可用的滚动路径并记录目标到达情况。

## 所需证据与不确定性

设备/视口/浏览器栏状态、完整滚动轨迹、操作允许事实及目标截屏。只有静态屏外位置或“需滚动”时不能 fail。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

196 报告按钮被浏览器底栏遮住一半；088 仅报告 CTA 需滚动，单凭该点不足以确认缺陷。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：长面板可内部滚动，底部按钮滚动后完整可见且可操作。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断；几何与滚动范围可确定性采样。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：受支持的视口和浏览器界面变化不应使当前必要操作永久落入不可达区域。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0088](../ticket-mapping.md#src-fail-0088) · [原文 L835–L841](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:835>) · 原文摘录：The trade slip on web extends beyond the viewport/screen boundary, causing the right side of the screen to feel cramped. The CTA (place bet button) is not always visible without scrolling. Expected behaviour (per Kalshi comparison): - The trade slip should remain fully contained within the viewport - The trade slip content should be internally scrollable - The CTA should always be sticky/visible at the bottom of the slip, regardless of how many picks are added Context: - The issue is most noticeable as more picks are added to a parlay (the slip …（摘录，见原文）
- [SRC-FAIL-0196](../ticket-mapping.md#src-fail-0196) · [原文 L1724–L1728](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1724>) · 原文摘录：In the withdraw flow (Portfolio page → Withdraw button), the "Add bank account" button is covered halfway by the browser bottom bar — the button should be fully visible.

## 未解决问题与关联

088 是否真的无法到达，还是仅偏好 sticky CTA？

关联：[UIK-D002](UIK-D002.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
