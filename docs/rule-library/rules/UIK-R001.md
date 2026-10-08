# UIK-R001 · 按语义层级审查字体层次

- 类型：体验审查建议；主题：字体与排版。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：7 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

文字的视觉层次应帮助理解角色，同级比较应建立在语义等价之上。

## 适用条件

有多个可比较的标题、数值或说明，或有有效的文字角色设计基线。

## 不适用情形和正常例外

不同密度、不同重要性和不同主题的合法变体；强调展示数值；视觉 Heading token 不等于 HTML 标题级别。

## 可观察的违反条件（审查信号）

审查信号：同级内容视觉权重无解释地不同，或主次关系难理解；没有层级合同不直接判 fail。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

按区段标题、摘要值和辅助说明识别角色，不按文案相似或全页所有标题一概归同级。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 标注文字用途、层级与当前变体。
2. 在相同状态对照等价对象的字号、字重、换行及层次。
3. 记录差异影响和设计解释；缺意图时提出审查，不规定统一字号。

## 所需证据与不确定性

角色标注、截图与有效基线；只有“用 H1/H2”时无法认定普适缺陷。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

002 报告两个区段标题字体不同。边界反证：006 出现 17px 与 20px 冲突，已暂缓且不计入本条支持来源。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：主标题较突出，同级标题一致；紧凑卡片经设计使用不同文字变体。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断/人工审查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：文字的视觉层次应帮助理解角色，同级比较应建立在语义等价之上。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0002](../ticket-mapping.md#src-fail-0002) · [原文 L23–L31](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:23>) · 原文摘录：The "How it works" section title on the web Referral page does not match the font style used by the "Share your referral code" section title. Both section titles should use a consistent font style. * Affected page: Referral page (web) * Issue: "How it works" section title has a different font style from "Share your referral code" * Expected: All section titles on the Referral page should use the same font style * Note: The app equivalent of this issue is tracked in &lt;custom data-type="smartlink" data-id="id-0"&gt;
- [SRC-FAIL-0003](../ticket-mapping.md#src-fail-0003) · [原文 L33–L41](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:33>) · 原文摘录：Font sizes for futures cards are much larger than matchup cards. The vol and market display is also different between the two card types — inconsistency across card layouts. * Reporter flagged the discrepancy between a Pro Football matchup card (New England @ Seattle) and a Culture/futures card (Dancing With The Stars Season 35 Winner) * On the futures card, font sizes appear noticeably larger than on the matchup card * Volume and market count display also renders differently between the two card types * Unclear if intentional — needs design/pr …（摘录，见原文）
- [SRC-FAIL-0004](../ticket-mapping.md#src-fail-0004) · [原文 L43–L51](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:43>) · 原文摘录：Two typographic/copy issues on the OG Web Pro Football Hub page: 1\. Section titles across the Pro Football Hub (Featured Parlays, Pro Football Hub, Standings, Featured, This Week, Futures) should use Heading 1 style — currently using a smaller/incorrect heading style. 2. The "Pro Football Hub" text label should read "Pro Football 26" instead. * Affected page: OG Web — Pro Football Hub * Screenshot shows sections including All Games / Featured Parlays (with parlay cards and multipliers), Stats / Standings (NFL divisional standings), Futures (e. …（摘录，见原文）
- [SRC-FAIL-0005](../ticket-mapping.md#src-fail-0005) · [原文 L53–L61](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:53>) · 原文摘录：Update the match title typography on featured cards to use Heading 1, to align with future event featured card title styles. * Currently, match titles on featured cards do not use Heading 1 typography * This change is needed for visual consistency with future event featured card designs * Applies to all featured card types (sports matches, politics, etc.) on web Screenshot reference shows two featured cards: 1. Live Pro Baseball — Washington @ Los Angeles (Top 6th, tied 4-4) with win-probability chart and $371,201 volume 2. Politics market — Te …（摘录，见原文）
- [SRC-FAIL-0013](../ticket-mapping.md#src-fail-0013) · [原文 L128–L136](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:128>) · 原文摘录：The "Live" label and the inning/positional label (e.g. "5th") in the sports event detail view use different fonts that are visually misaligned — they should be typographically consistent. * Observed on the Sports → Pro Baseball event detail screen (Boston vs Los Angeles NL, live game) * The "Live" badge and the "5th" (inning indicator) display with inconsistent font styling, causing visual misalignment * Screenshot attached showing the live game view with score (5–3), at-bat counts (2 balls, 2 strikes, 1 out), and inning label * Both labels app …（摘录，见原文）
- [SRC-FAIL-0014](../ticket-mapping.md#src-fail-0014) · [原文 L138–L145](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:138>) · 原文摘录：Three design issues identified on \[Web\] Player pages: 1\. \*\*Type sizes are off\*\* — latest type size reference should be followed per Figma:  2. \*\*Navigation style not updated to library\*\* — the nav style has been updated in the DS library; implementation should align with the updated component. Figma reference:  3. \*\*Event card icons not aligned with main event card style\*\* — icons on the event cards in Player pages do not match the standard event card icon style used elsewhere in the app (see screenshot for reference showing the  …（摘录，见原文）
- [SRC-FAIL-0143](../ticket-mapping.md#src-fail-0143) · [原文 L1366–L1370](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1366>) · 原文摘录：Two issues: border line position should be above Expiry row; font weight across trade slip appears heavier than Figma spec (should be 450 weight, 16px).

## 未解决问题与关联

需补 006 的设计版本；014 已废弃不能作为强制最新库的依据。

关联：[UIK-R002](UIK-R002.md)、[UIK-D001](UIK-D001.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
