# UIK-D002 · 同屏必要内容与控件不得发生破坏性重叠

- 类型：缺陷检查规则；主题：布局与内容适应。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：9 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

应同时可见的内容和控件在受支持的布局状态下应保持可辨认和可操作。

## 适用条件

已确认对象在该状态应共存，且达到待检查的视口、缩放、内容量或展开状态。

## 不适用情形和正常例外

正常下拉框、tooltip、模态遮罩；可关闭的有意浮层；重叠的装饰；关闭动画中的中间布局；隐藏面板不要求可读。

## 可观察的违反条件

意外重叠遮住文字、目标或导航，使必要内容不能阅读或操作；不能仅用两个矩形相交判 fail。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

按导航组、列表行、卡片内容、关闭控件及其容器关系识别，用当前观察的元素引用绑定。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 确认同屏共存要求并记录初始布局。
2. 执行导致问题的缩放、收窄、长内容或展开操作。
3. 比较绘制层、文本可读性和目标实际可操作区域，排除正常弹层。

## 所需证据与不确定性

前后截图、视口与缩放、容器/绘制边界、必要内容用途；若只说“cluttered”或弹层意图不明，返回 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

213 报告缩放后数值覆盖操作按钮；246 报告名称、图标与分数重叠。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：窄屏导航折叠入菜单，菜单正常覆盖背景，关闭后内容恢复；无需各项强制换行。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断；确定性矩形交集用于筛查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：应同时可见的内容和控件在受支持的布局状态下应保持可辨认和可操作。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0090](../ticket-mapping.md#src-fail-0090) · [原文 L851–L859](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:851>) · 原文摘录：The top navigation bar does not wrap nicely when the viewport is horizontally constrained — nav items overflow or break layout instead of wrapping cleanly. * Observed on the OG.com web app homepage * The nav bar includes tabs for All Markets, Pro Football Hub, Sports, Crypto, Financials, and more, plus an "Ask Alpha" AI button * When the viewport width is reduced, the nav items do not wrap gracefully — expected behaviour is a clean wrap or responsive collapse * Screenshot shows the homepage with the live tennis market (Linda Nosková vs Aryna Sa …（摘录，见原文）
- [SRC-FAIL-0132](../ticket-mapping.md#src-fail-0132) · [原文 L1264–L1272](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1264>) · 原文摘录：Improve the wrapping logic for the chart legend, which is currently clashing with the OG logo. * The legend on the win probability / line chart overlaps or conflicts with the OG logo placement * Seen on a prediction market card (e.g. CFB National Champion 2026-27 — Sports · College Football), where the chart tracks probability shifts for multiple outcomes (Notre Dame, Ohio State, Texas) from roughly June through August * The chart displays volatile probability swings (\~10–22%) across 3 tracked teams with the legend labels crowding the logo are …（摘录，见原文）
- [SRC-FAIL-0167](../ticket-mapping.md#src-fail-0167) · [原文 L1526–L1530](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1526>) · 原文摘录：Close button overlaps content in mobile view parlay slip. Should stay on top nav.
- [SRC-FAIL-0199](../ticket-mapping.md#src-fail-0199) · [原文 L1742–L1746](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1742>) · 原文摘录：Buy button overflows the container when the team/player name is long; should keep the original button size. Responsive layout.
- [SRC-FAIL-0213](../ticket-mapping.md#src-fail-0213) · [原文 L1832–L1836](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1832>) · 原文摘录：On an event details page with an opened position, zooming out the browser window causes "You paid", "Current" and "Max payout" to cover the Trade button in the Positions widget. The widget should display correctly.
- [SRC-FAIL-0237](../ticket-mapping.md#src-fail-0237) · [原文 L1994–L1998](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1994>) · 原文摘录：On mobile web (Safari), the crypto details page has responsive UI issues: the chart filter exceeds the chart's edges, the "Below" CTA overlaps, and the overall visual effect looks cluttered — needs to be polished.
- [SRC-FAIL-0246](../ticket-mapping.md#src-fail-0246) · [原文 L2054–L2058](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2054>) · 原文摘录：On the NFL page Stats tab, team name/icon and score overlap in the standing list (responsive layout issue).
- [SRC-FAIL-0309](../ticket-mapping.md#src-fail-0309) · [原文 L2494–L2498](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2494>) · 原文摘录：After expanding in-page PiP on mobile, video overlapped by top row and search bar. Overlap/z-index layout defect.
- [SRC-FAIL-0322](../ticket-mapping.md#src-fail-0322) · [原文 L2586–L2590](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2586>) · 原文摘录：Mobile viewports: Group tab bar covered by Category tab bar.

## 未解决问题与关联

310 的视频上方下拉覆盖可能完全正常，故暂缓而未收入来源。

关联：[UIK-D001](UIK-D001.md)、[UIK-D003](UIK-D003.md)、[UIK-D010](UIK-D010.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
