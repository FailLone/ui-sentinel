# UIK-D001 · 必要内容不得被无替代方式的裁切破坏

- 类型：缺陷检查规则；主题：布局与内容适应。
- 文档修订：2；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：限定子集已实现并通过免费本地验证；`control-text-clipping` 0.1.0 在本分支已开启的 ui-scan 自动参与，待维护者整合。广义知识仍未完全实现，原 Jira 未复现。
- 来源摘要：7 条（含 1 条归并摘要；不是独立验证次数）。

## 一句话原则

在用户需要识别内容或操作的状态下，裁切不能让必要信息失去可读且可达的表达。

## 适用条件

对象已加载；完整信息对当前任务必要；需检查容器、文字及可用替代入口。

## 不适用情形和正常例外

有意省略并提供可达全文；可辨认且符合约定的缩写；纯装饰裁切；按需加载尚未触发；字符仅几何越界但实际绘制完整。

## 可观察的违反条件

可见字形被切掉或关键操作文案残缺，且当前可用路径无法恢复任务所需信息。只见 ellipsis 或 scrollWidth 大于 clientWidth 不是充分条件。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

按卡片标题、实体标识、操作按钮的语义定位；关联可访问名称和可见文字，不绑定人名、标签文本或 CSS 选择器。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 在声明支持的视口、语言与内容长度下确认内容已完成加载。
2. 记录完整源文本、绘制区域、容器边界与实际可见字形。
3. 尝试已有展开、滚动或全文入口，对照必要信息是否仍可获得。

## 所需证据与不确定性

全文、截图/字形裁切区域、视口和缩放、替代入口操作证据。只知道“截得太早”、看不到原图或不知文本用途时返回 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，广义对象的四态映射仍未实现；下述限定子集已按四态输出。

## 缺陷或问题案例（来源报告，未复现）

007 报告长姓名字形底部被切；332 报告按钮缩成 “Add t”。均为来源报告，未复现。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：卡片标题显示省略号，展开可阅读完整标题；主要按钮文字完整。 此历史例为构造，不计入健康 pass；本批另有实际完整文字墨迹的健康测量，见限定实现。

## 自动化可行性

需要语义绑定 + 视觉判断；几何检查仅筛候选。 这是广义可行性评估；已交付的限定子集见下方。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：在用户需要识别内容或操作的状态下，裁切不能让必要信息失去可读且可达的表达。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0007](../ticket-mapping.md#src-fail-0007) · [原文 L70–L78](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:70>) · 原文摘录：Player names are being cut off/truncated on the Season Stat Leaders section of the leaderboard UI. The issue is visible at the bottom of longer names (e.g. "Smith-Njigba" is clipped at the bottom of the card). * Affected section: Season Stat Leaders / player props leaderboard cards * Example affected player: Jaxon Smith-Njigba (#11, Seattle Seahawks) — name truncated at the bottom of the highlighted top card * The leaderboard displays top 5 players by stat (e.g. Receiving Yards), with the leader in a highlighted card at the top followed by rank …（摘录，见原文）
- [SRC-FAIL-0008](../ticket-mapping.md#src-fail-0008) · [原文 L80–L89](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:80>) · 原文摘录：When a player has a name longer than 3 characters, the fallback logo currently shows more than 3 initials, causing the text to be truncated within the fallback logo container. The fix is to always take only the first 3 initials regardless of name length. * Affects the player fallback logo (used when no player image is available) * Current behaviour: full initials shown for long names → text gets cut off/truncated * Expected behaviour: always display only the first 3 characters/initials, matching the logo container size * Flagged by \[Original m …（摘录，见原文）
- [SRC-FAIL-0009](../ticket-mapping.md#src-fail-0009) · [原文 L91–L98](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:91>) · 原文摘录：Fix the label chip concatenation logic to prevent label text from being cut off too aggressively. * On contract/market cards, label chips are being truncated too soon, causing important label text to be cut off * The concatenation logic needs to be reviewed to ensure labels are fully readable before truncation occurs * Supporting context: screenshot shows a tennis prediction market (Robin Montgomery vs Maria Sakkari) with odds displayed — the issue likely affects the label/chip display in this and similar market card contexts
- [SRC-FAIL-0010](../ticket-mapping.md#src-fail-0010) · [原文 L100–L107](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:100>) · 原文摘录：Fix the label chip concatenation logic to prevent label text from being cut off too aggressively. * On contract/market cards, label chips are being truncated too soon, causing important label text to be cut off * The concatenation logic needs to be reviewed to ensure labels are fully readable before truncation occurs * Supporting context: screenshot shows a tennis prediction market (Robin Montgomery vs Maria Sakkari) with odds displayed — the issue likely affects the label/chip display in this and similar market card contexts
- [SRC-FAIL-0104](../ticket-mapping.md#src-fail-0104) · [原文 L989–L997](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:989>) · 原文摘录：Promotional banner is getting cut off on mobile web and web — design involvement may be needed to resolve the layout issue. * The banner (e.g. "New OG.com users only. Trade...") with the sports fan image and orange "Sign Up" CTA is being truncated/clipped on both mobile web and web * The issue affects the banner's visible area — the content is cut off rather than displaying in full * Screenshot shows the banner on the OG.com home screen alongside navigation tabs (Trending, LIVE, Sports, Crypto, Economics) and featured markets * Design review fl …（摘录，见原文）
- [SRC-FAIL-0197](../ticket-mapping.md#src-fail-0197) · [原文 L1730–L1734](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1730>) · 原文摘录：MMA tall card — right team/player text truncated/missing on mobile web; should show abbreviation or full name. Typography/truncation.
- [SRC-FAIL-0332](../ticket-mapping.md#src-fail-0332) · [原文 L2656–L2660](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2656>) · 原文摘录：Long left copy squeezes footer, CTA clipped as "Add t"; expected full label. Cosmetic/visual only.

## 未解决问题与关联

009/010 的“过早”是否实际损失必要信息？008 的缩写策略是否仍可识别？

关联：[UIK-D002](UIK-D002.md)、[UIK-R003](UIK-R003.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。首次知识提炼时未执行这些验证；当前限定子集的实际结果见下方。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。

## 限定实现（2026-10-09）

原生 button/a 的唯一纯文字名称，Arial 12–40px、黑字白底、平面绘制、单行、不可滚动 overflow:clip 的垂直字形切片。范围内通过同次截图与隔离参考字形逐像素核对，至少4个丢失墨迹像素和4个保留像素且模型一致才 fail；几何越界但墨迹完整为真实 pass。横向缩写、ellipsis、hidden/auto/scroll 恢复、替代名称/提示、动态脚本或交互CSS恢复未确认时不 fail。

自动对象与适用依据来自当前页面公开原生角色/结构，不使用业务名称、夹具答案或用户手填selector/合同。只对当前局部呈现给出上述测量，不声称全站无替代入口。存在脚本、公开恢复控件、hover/focus等交互样式或无法读取的恢复样式时，缺失墨迹仍为unknown；完整健康墨迹可以独立测得。正常禁用、隐藏、模态背景为明确不适用。

新观察/节点、样式、视口、页面、资源或证据变化拒绝旧结论；未知、省略及枚举截断不计pass。D001/D002分别保留字形裁切/兄弟遮盖因果，遇到另一原因无法分离时保留unknown并关联已证实项。D010指针采样为独立事实：同目标时在报告关联，不用几何或视觉结论替代指针结论。

[统一交付及准确测试范围](../rules-clipping-overlap-delivery.md)记录源版本、11项定向测试、普通工作台/API/历史报告链路及本地原始材料索引。合成异常和健康样本均不是原Jira复现。全局扫描开关、业务默认、D004默认关闭及原完成门保持。
