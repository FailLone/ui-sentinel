# Ticket 来源索引与双向映射

批次 `FAIL-20261008-01`，处理日期 2026-10-08。来源文件：[fail.md](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md>)；SHA-256 `4a7507c440a8ca3eb7260a662a5f511770348d2d4a873aa20a96f3445e73c614`；2820 行。范围：所有 356 个三级标题，全部完成文档分类。来源是 Jira 的二次摘要，原文自称“纯 UI”不作为本轮结论。

`SRC-FAIL-0001` 等为本库来源记录 ID，**不是 Jira ID**。本文件中每条均保留完整标题、行范围、父分组、原状态、相关 ID 和处置。原 ticket 自身 ID 全部缺失（356/356），不可用 epic ID 或引用的重复目标 ID 代替；恢复后追加别名，不重新编号。来源文件不在仓库内，跨机器需按指纹找回原件；本索引与规则中的短摘录不替代原件。

## 计数口径

分类是互斥的主分类，单条可以映射多个规则。176 条有规则映射，155 条直接暂缓；另有 3 条重复摘要继承“暂不成规则”的结论。重复仅是摘要内容/父子范围归并，不宣称相同 Jira 身份。

| 主分类 | 条数 |
| --- | ---: |
| 信息不足，暂缓 | 155 |
| 可提炼体验审查建议 | 128 |
| 混合案例，仅提取 UI 部分 | 12 |
| 可提炼通用 UI 缺陷规则 | 31 |
| 重复案例，归并 | 8 |
| 业务专属，排除 | 22 |

## 附件状态（每条适用）

仅读取这份 Markdown；正文没有可解析的完整 Markdown 图片地址/附件路径或有效的 Figma/Jira/Slack 目标链接。`Screenshot shows` 是摘要作者的描述，截图像素未提供、未读取。`smartlink`、`[`、`[Source: Slack thread](` 等占位均未解析。Downloads 同级只有这一份 Markdown；同名 `.lottie` 和其他图片未被条目明确关联，不能凭名称或日期绑定，未作为证据。没有访问当前产品网站代替历史截图。

<a id="src-fail-0001"></a>
### SRC-FAIL-0001 · [Web] Referral page — earned amount ($X) and referral count should use Heading 1 font style

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L12–L21](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:12>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The earned amount (e.g. $0) and referral count (e.g. 0 referrals) displayed on the referral dashboard page should use Heading 1 font style. Currently these values are not using the correct typography. * Affected page: Web referral page / referral dashboard * The "$X earned" value and the referral count number should both adopt Heading 1 typography * Screenshot shows "$0 earned" and "0 referrals" as the affected values * The referral code input field (\`f76gmz6n\`) and share button are visible below these values for context * Related tickets for …（摘录，见原文）
- 处置/推断：仅规定展示值使用 H1，没有独立层级混淆事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0002"></a>
### SRC-FAIL-0002 · [Web] Referral page — "How it works" section title should match font style of "Share your referral code"

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L23–L31](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:23>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R001](rules/UIK-R001.md)。
- 依据摘录：The "How it works" section title on the web Referral page does not match the font style used by the "Share your referral code" section title. Both section titles should use a consistent font style. * Affected page: Referral page (web) * Issue: "How it works" section title has a different font style from "Share your referral code" * Expected: All section titles on the Referral page should use the same font style * Note: The app equivalent of this issue is tracked in &lt;custom data-type="smartlink" data-id="id-0"&gt;
- 处置/推断：提取按语义层级审查字体层次与同级一致性；Heading 名称、字号、字重、标题文案属于产品要求，不升格为通用阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0003"></a>
### SRC-FAIL-0003 · [Web] Featured cards — font sizes and layout differ between futures and matchup cards (vol and market display inconsistent)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L33–L41](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:33>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R001](rules/UIK-R001.md)、[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Font sizes for futures cards are much larger than matchup cards. The vol and market display is also different between the two card types — inconsistency across card layouts. * Reporter flagged the discrepancy between a Pro Football matchup card (New England @ Seattle) and a Culture/futures card (Dancing With The Stars Season 35 Winner) * On the futures card, font sizes appear noticeably larger than on the matchup card * Volume and market count display also renders differently between the two card types * Unclear if intentional — needs design/pr …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0004"></a>
### SRC-FAIL-0004 · [Web] Pro Football Hub — section titles should use Heading 1 style; "Pro Football Hub" text should read "Pro Football 26"

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L43–L51](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:43>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R001](rules/UIK-R001.md)。
- 依据摘录：Two typographic/copy issues on the OG Web Pro Football Hub page: 1\. Section titles across the Pro Football Hub (Featured Parlays, Pro Football Hub, Standings, Featured, This Week, Futures) should use Heading 1 style — currently using a smaller/incorrect heading style. 2. The "Pro Football Hub" text label should read "Pro Football 26" instead. * Affected page: OG Web — Pro Football Hub * Screenshot shows sections including All Games / Featured Parlays (with parlay cards and multipliers), Stats / Standings (NFL divisional standings), Futures (e. …（摘录，见原文）
- 处置/推断：提取按语义层级审查字体层次与同级一致性；Heading 名称、字号、字重、标题文案属于产品要求，不升格为通用阈值。 排除专属年度标题改名。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0005"></a>
### SRC-FAIL-0005 · [Web] Featured cards — update match title to Heading 1 (align with future event featured card titles)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L53–L61](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:53>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R001](rules/UIK-R001.md)。
- 依据摘录：Update the match title typography on featured cards to use Heading 1, to align with future event featured card title styles. * Currently, match titles on featured cards do not use Heading 1 typography * This change is needed for visual consistency with future event featured card designs * Applies to all featured card types (sports matches, politics, etc.) on web Screenshot reference shows two featured cards: 1. Live Pro Baseball — Washington @ Los Angeles (Top 6th, tied 4-4) with win-probability chart and $371,201 volume 2. Politics market — Te …（摘录，见原文）
- 处置/推断：提取按语义层级审查字体层次与同级一致性；Heading 名称、字号、字重、标题文案属于产品要求，不升格为通用阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0006"></a>
### SRC-FAIL-0006 · [Web] Event details page headers — change to Heading 2 (20px)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L62–L69](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:62>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Change the section headers on the event details page to Heading 2 typography (17px). * The section headers on the event details page (e.g. Moneyline, Spread, Total, Timeline) are not using Heading 2 styling * They should be updated to Heading 2 at 20px to match the design spec * Screenshot shows the Game Lines page for a sports matchup — red arrows annotate the Moneyline, Spread, Total, and Timeline section headers, highlighting these labels as the ones requiring the typography update
- 处置/推断：17px/20px 冲突，且无可访问基线；暂不作为规则支持。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0007"></a>
### SRC-FAIL-0007 · [Web] Season stat leaders — player names truncated/cut off on leaderboard cards

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L70–L78](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:70>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D001](rules/UIK-D001.md)。
- 依据摘录：Player names are being cut off/truncated on the Season Stat Leaders section of the leaderboard UI. The issue is visible at the bottom of longer names (e.g. "Smith-Njigba" is clipped at the bottom of the card). * Affected section: Season Stat Leaders / player props leaderboard cards * Example affected player: Jaxon Smith-Njigba (#11, Seattle Seahawks) — name truncated at the bottom of the highlighted top card * The leaderboard displays top 5 players by stat (e.g. Receiving Yards), with the leader in a highlighted card at the top followed by rank …（摘录，见原文）
- 处置/推断：提取必要文字/内容被裁切后无法识别的风险；不采纳固定缩写长度、绝不截断或必须单行的产品方案。实际缺陷仍需核验全文替代入口和裁切意图。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0008"></a>
### SRC-FAIL-0008 · [Web] Player fallback logo — use only first 3 initials for names longer than 3 characters to avoid truncation

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L80–L89](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:80>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D001](rules/UIK-D001.md)。
- 依据摘录：When a player has a name longer than 3 characters, the fallback logo currently shows more than 3 initials, causing the text to be truncated within the fallback logo container. The fix is to always take only the first 3 initials regardless of name length. * Affects the player fallback logo (used when no player image is available) * Current behaviour: full initials shown for long names → text gets cut off/truncated * Expected behaviour: always display only the first 3 characters/initials, matching the logo container size * Flagged by \[Original m …（摘录，见原文）
- 处置/推断：提取必要文字/内容被裁切后无法识别的风险；不采纳固定缩写长度、绝不截断或必须单行的产品方案。实际缺陷仍需核验全文替代入口和裁切意图。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0009"></a>
### SRC-FAIL-0009 · [Web] Contract label chips — concatenation logic cuts off label text too aggressively

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L91–L98](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:91>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D001](rules/UIK-D001.md)。
- 依据摘录：Fix the label chip concatenation logic to prevent label text from being cut off too aggressively. * On contract/market cards, label chips are being truncated too soon, causing important label text to be cut off * The concatenation logic needs to be reviewed to ensure labels are fully readable before truncation occurs * Supporting context: screenshot shows a tennis prediction market (Robin Montgomery vs Maria Sakkari) with odds displayed — the issue likely affects the label/chip display in this and similar market card contexts
- 处置/推断：提取必要文字/内容被裁切后无法识别的风险；不采纳固定缩写长度、绝不截断或必须单行的产品方案。实际缺陷仍需核验全文替代入口和裁切意图。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0010"></a>
### SRC-FAIL-0010 · [App/Web] Contract label chips — concatenation logic cuts off label text too aggressively

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L100–L107](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:100>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：[UIK-D001](rules/UIK-D001.md)。
- 依据摘录：Fix the label chip concatenation logic to prevent label text from being cut off too aggressively. * On contract/market cards, label chips are being truncated too soon, causing important label text to be cut off * The concatenation logic needs to be reviewed to ensure labels are fully readable before truncation occurs * Supporting context: screenshot shows a tennis prediction market (Robin Montgomery vs Maria Sakkari) with odds displayed — the issue likely affects the label/chip display in this and similar market card contexts
- 处置/推断：正文逐字同义，仅平台标题不同；摘要级重复，Jira 身份未知。
- 归并目标：[SRC-FAIL-0009](#src-fail-0009)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0011"></a>
### SRC-FAIL-0011 · [Web] Time filter — font size and pill size do not match Figma spec

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L109–L116](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:109>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Fix the font size and pill size of the time filter component on Web to match the Figma design spec. * The time filter pills (e.g. "All" time range selector) have incorrect font size and pill size compared to the Figma design * Screenshot shows the "All" time filter pill highlighted with a red arrow on a win probability chart (Brandon Nakashima vs Luciano Darderi tennis match) * Reference Figma: [
- 处置/推断：字体和 pill 尺寸匹配要求，缺 Figma 和损害事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0012"></a>
### SRC-FAIL-0012 · [Web] Promotional banners — font does not match original Figma designs

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L118–L126](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:118>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Promotional banners across the platform are using an incorrect font that does not match the original Figma design specifications. The screenshot shows an example banner ("New OG.com users only. Trade $10. Get $10.") where the typography visibly deviates from what was designed. * Banners are not rendering the font specified in the original Figma designs * This affects acquisition/promotional banners (e.g. the sign-up incentive banner shown in the screenshot) * Reported by the design team;  for design spec reference * Screenshot attached showing  …（摘录，见原文）
- 处置/推断：字体规范未提供，没有层级/阅读问题事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0013"></a>
### SRC-FAIL-0013 · [Web] Sports event detail — "Live" and inning/position labels font not aligned

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L128–L136](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:128>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R001](rules/UIK-R001.md)、[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：The "Live" label and the inning/positional label (e.g. "5th") in the sports event detail view use different fonts that are visually misaligned — they should be typographically consistent. * Observed on the Sports → Pro Baseball event detail screen (Boston vs Los Angeles NL, live game) * The "Live" badge and the "5th" (inning indicator) display with inconsistent font styling, causing visual misalignment * Screenshot attached showing the live game view with score (5–3), at-bat counts (2 balls, 2 strikes, 1 out), and inning label * Both labels app …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0014"></a>
### SRC-FAIL-0014 · [Web] Player pages — type sizes off, nav style not updated to library, event card icons misaligned

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L138–L145](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:138>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R001](rules/UIK-R001.md)、[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Three design issues identified on \[Web\] Player pages: 1\. \*\*Type sizes are off\*\* — latest type size reference should be followed per Figma:  2. \*\*Navigation style not updated to library\*\* — the nav style has been updated in the DS library; implementation should align with the updated component. Figma reference:  3. \*\*Event card icons not aligned with main event card style\*\* — icons on the event cards in Player pages do not match the standard event card icon style used elsewhere in the app (see screenshot for reference showing the  …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0015"></a>
### SRC-FAIL-0015 · [Web] Live tab label — use all-caps "LIVE", remove dot, change section title to "Live Markets", style in content/primary

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：字体 / 排版 (15 条)。
- 路径与定位：[原文 L147–L151](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:147>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Live tab label — use all-caps "LIVE", remove dot, change section title to "Live Markets", style in content/primary（标题）
- 处置/推断：标题混合大小写、红点和颜色要求；与 140/229/337 冲突，缺少版本/范围。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0016"></a>
### SRC-FAIL-0016 · [Web] Event icon borders — make border inset (overlaid over image) to provide contrast with background

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L157–L165](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:157>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：Event icon borders should be inset (overlaid on top of the image/icon) rather than outside the image bounds. This gives the icon contrast against varying backgrounds. * Currently, icon borders appear to sit outside/around the image, meaning they don't help with contrast when the icon background colour is similar to the card/page background. * The fix is to render the border as an inner/inset stroke overlaid directly over the image, so it creates contrast regardless of the surrounding background colour. * The screenshot shows asset contract card …（摘录，见原文）
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0017"></a>
### SRC-FAIL-0017 · [App/Web] Culture, Politics, and Economics category icons — update to latest designs per Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L167–L174](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:167>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the plain category icons for Culture, Politics, and Economics to the latest versions in Figma. * The current icons for these three categories (theatre masks for Culture, tie for Politics, chart for Economics) need to be replaced with the updated designs linked in Figma * This applies to both App and Web — the screenshot shows the icons appearing in both light-mode list-style UI and dark-mode category card UI * Figma reference:
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0018"></a>
### SRC-FAIL-0018 · [Web] Politics contracts — use Republican and Democrat icons on outcome buttons

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L175–L183](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:175>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：On web, politics contracts with Republican and Democrat outcomes should display the relevant party icons (Republican elephant / Democrat donkey) on the outcome buttons/cards, rather than generic or placeholder icons. * The correct icons are available in Figma: [ * Screenshots show examples of politics contracts on web (light mode) and app (dark mode) — e.g. "Party to control the US House of Representatives in 2026" and "Alabama election winner" with Democrat/Republican outcomes * The Politics category browse screen (dark mode) shows the elephan …（摘录，见原文）
- 处置/推断：按政治结果选择党派图标的实体映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0019"></a>
### SRC-FAIL-0019 · [Web] Crypto token icon should not appear in the tab/section header — maintain consistent style across all tabs

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L185–L192](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:185>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Remove the crypto token icon from the tab/section header to maintain a consistent design system across all tabs. The icon should not appear in the header — all tabs should follow the same style. * Raised by  in #og-design-triage * Applies across tabs system-wide; consistent treatment requested for all tabs * No specific platform specified — applies to both App and Web
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0020"></a>
### SRC-FAIL-0020 · [Web] Crypto category icon — appears smaller in light mode than in dark mode

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L194–L203](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:194>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：The Crypto plain category icon renders at a smaller size in light mode compared to dark mode on web. A new icon asset may be needed to ensure consistent sizing across both themes. * Icon asset in question: [ * Issue is visible in the category filter list (Baseball, CFB, Crypto, MMA &amp; More, Pro Basketball, NFL, Soccer, Tennis) * In the side-by-side screenshot, the Crypto row is the active/highlighted state — the icon appears noticeably smaller in light mode (left) vs dark mode (right) * cc: , , * Platform is not explicitly stated — defaulting to …（摘录，见原文）
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0021"></a>
### SRC-FAIL-0021 · [Web] Event details page — BTC icon misaligned on staging

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L205–L213](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:205>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：BTC icon is misaligned on the event details page on staging (web). * Observed on the web event details page in the staging environment * The Bitcoin (BTC) icon (rounded-square orange/amber badge with white ₿ symbol) appears to be rendering out of position * Screenshot attached as supporting reference showing the icon alongside a large bold "B" character cut off at the edge, suggesting a layout/alignment issue * Potentially related to coin logo rendering on this surface
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0022"></a>
### SRC-FAIL-0022 · [Web] Contract header — replace caret with chevron

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L215–L222](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:215>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On staging, the caret icon in the contract header dropdown should be replaced with a chevron component, per the Figma spec. * Affected on: Web (staging) * Figma reference: [ * Screenshot context: Contract headers for BTC 15 min and BTC 5 min show a dropdown arrow/caret — this should be updated to the chevron DS component
- 处置/推断：caret/chevron 是设计取舍，没有操作损害。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0023"></a>
### SRC-FAIL-0023 · [Web] Crypto tab — coin logos are square instead of rounded; outdated logos

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L224–L231](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:224>)；原状态：暂停（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Crypto coin logos on the Crypto tab in the OG App are displaying as square instead of rounded. The logos are also reported as outdated. * Logos on the Crypto tab are not using the correct rounded shape — they appear square instead * Logos are still using outdated assets (not updated to the latest versions) * Observed on the Crypto tab of the home screen; screenshot shows Bitcoin-related prediction market contracts affected (e.g. "Bitcoin Price at the End of 2026", "When will Bitcoin cross $100k again?")
- 处置/推断：方形/圆角及新旧资产更换不足以成规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0024"></a>
### SRC-FAIL-0024 · [Web] Player pages — remove border from icons; retain graphic (reference boxing headshot / trade slip handling)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L233–L241](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:233>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Remove the border from icons on the \[Web\] Player pages — the graphic should be kept, but the border should be removed. Exception: boxing headshot icons should retain their borders (reference the handling applied on the trade slip). * Affected surface: Web Player pages * Icon border should be removed; graphic itself should remain * Boxing headshot icons are an explicit exception — keep their borders * Reference: trade slip icon border handling for the boxing headshot treatment
- 处置/推断：移除边框但保留特定头像边框是产品变体要求；与 75/160/163 不同范围，不能统一。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0025"></a>
### SRC-FAIL-0025 · [App/Web] Politics market cards — category icon appears grainy/low-resolution

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L243–L251](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:243>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R012](rules/UIK-R012.md)。
- 依据摘录：Politics category icons on market/contract cards appear grainy or low-resolution. * Observed on the Trending tab on the app — Politics contract cards (e.g. "Florida Governor Election Winner 2026", "South Carolina Senate Election Winner 2026") show a grainy/pixelated icon * The icon affected appears to be the Politics subcategory badge/icon displayed on the market card * Note: &lt;custom data-type="smartlink" data-id="id-0"&gt; and &lt;custom data-type="smartlink" data-id="id-1"&gt; cover a related issue (wrong icon defaulting to governor/"Politics" for all …（摘录，见原文）
- 处置/推断：提取图像资源在目标显示比例下是否清晰的审查；没有截图/原图不能确证低清，更不能定义跨项目分辨率门槛。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0026"></a>
### SRC-FAIL-0026 · [Web] Limit order — legacy icon; replace with latest adjust icon (matching trade slip)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L253–L261](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:253>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The limit order page is using a legacy icon. It should be updated to use the latest adjust icon — the same one currently used in the trade slip. * Platform: Web * The adjust icon on the limit order is outdated/legacy * The correct icon to use is the adjust icon already present in the trade slip * Screenshot attached by reporter as supporting reference
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0027"></a>
### SRC-FAIL-0027 · [Web] Limit order trade slip — missing icon placeholder when no image is available

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L263–L272](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:263>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R005](rules/UIK-R005.md)。
- 依据摘录：When no image is available for a contract in the limit order trade slip, the icon is not shown at all. The coloured placeholder icon should be reused in this case. * Affects the limit order trade slip on web (OG.com) * When a contract has no associated image, the icon slot appears empty instead of falling back to the coloured placeholder * The coloured placeholder icon (used elsewhere on the platform) should be reused here for consistency * Observed on the F1 Drivers' Champion 2026 event (Sports › F1), trade slip for "Alexander Albon Yes" at 1. …（摘录，见原文）
- 处置/推断：提取缺图/无图情况下的中性替代与身份连续性；不规定必须有头像、默认运动图标或缩写算法，不采纳实体分类映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0028"></a>
### SRC-FAIL-0028 · [Web] "Get the App" modal — incorrect size and squished QR code logo

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L274–L283](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:274>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D004](rules/UIK-D004.md)。
- 依据摘录：The "Get the App" modal (triggered from the footer or side menu) has two design issues: 1\. The modal size does not appear correct — likely too large or incorrectly sized vs. Figma spec 2. The QR code has the OG.com logo squished/distorted inside it The reporter has flagged this for team guidance before proceeding with a fix. * Triggered via: Footer → "Get the App" link, or Side menu → "Get the App" link * The modal shows a QR code with tagline "Trade anywhere, anytime. Never miss a winning move." and a "Download the OG.com App" header * Screen …（摘录，见原文）
- 处置/推断：仅提取标识被非等比压缩的图像失真；弹窗大小是否正确缺少原设计，单独暂缓；不推断二维码不能扫描。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0029"></a>
### SRC-FAIL-0029 · [Web] Share icon — update with revised design (Sep 8, updated gap spacing)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L285–L293](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:285>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：OG-10348, OG-10352, OG-10888, OG-10889；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the Share icon on both App and Web to the latest Figma revision (Sep 8, 2026). The icon has updated gap spacing. * Affects both App and Web platforms * Figma reference: * Change: updated gap spacing Note: Orderbook and Chat icon updates from the same Sep 8 batch are already tracked in existing tickets (OG-10348, OG-10352, OG-10888, OG-10889) — please add the new Figma links to those tickets as well.
- 处置/推断：仅新版 Share 图标间距更新。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0030"></a>
### SRC-FAIL-0030 · [Web] Player futures — helmet icon used instead of jersey with player number

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L295–L303](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:295>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Player futures pages (e.g. "Pro Football Passing Yards Leader 2026-27") are displaying a helmet icon for each outcome instead of the correct jersey icon with player numbers. * Affected surface: Web — player futures outcome list * Expected: jersey icon with player number per outcome * Actual: generic helmet icon shown for all outcomes * Screenshot attached shows the Pro Football Passing Yards Leader event page with NFL QBs (Brock Purdy, Aaron Rodgers, Jared Goff, etc.) — all outcomes using helmet icons instead of numbered jerseys
- 处置/推断：按运动类型和球员身份选择球衣/头盔资源。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0031"></a>
### SRC-FAIL-0031 · [Web] Event detail page icons — remove background and update Chat & Orderbook icon files to 24px

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L305–L316](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:305>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Remove the background from the event detail page icons that appear above the chart, and update the Chat and Orderbook icon files with the latest Figma drawings. Ensure all icons on this surface use the same 24px size variant. * Icons affected: Chat and Orderbook icons on the event detail page (above the chart area) * Background should be removed from these icons * Icon files must be updated to match the latest Figma designs * All icons on this surface must use the 24px size variant consistently * Figma reference: [ * Related existing tickets: &lt; …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0032"></a>
### SRC-FAIL-0032 · [Web] Icon colours incorrect — should all use `icon/secondary`

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L318–L325](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:318>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Icon colours on the OG web app are incorrect and not aligned to the design system — all affected icons should use the \`icon/secondary\` colour token. * Reported via #og-design-triage * Screenshot shows the Account → Profile page (Personal Information section) on OG.com web; the icon colours visible there do not match the \`icon/secondary\` spec * No specific screen was named beyond the web platform — fix should be applied across all affected web surfaces
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0033"></a>
### SRC-FAIL-0033 · [Web] Chat icon — update with revised design

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L327–L334](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:327>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the chat icon on both App and Web to match the revised design in Figma. * New chat icon spec: [ * Applies to both App and Web * Reporter also flagged the orderbook icon — already tracked in &lt;custom data-type="smartlink" data-id="id-0"&gt; (App) and &lt;custom data-type="smartlink" data-id="id-1"&gt; (Web)
- 处置/推断：仅新版 Chat 资源更新。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0034"></a>
### SRC-FAIL-0034 · [Web] Orderbook icon — update with revised design and icon sizes

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L336–L343](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:336>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the orderbook icon to match the revised design and updated icon sizes as specified in the Figma file. * Both App and Web surfaces are affected * Updated icon design and sizing are defined in the Figma Icons file (node: 30951-7382) * Figma reference: [
- 处置/推断：仅新版图标/尺寸要求，设计链接丢失。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0035"></a>
### SRC-FAIL-0035 · [Web] Alpha icons — replace all instances with consistent `Alpha-fill` icon (all available sizes)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L345–L352](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:345>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：OG-10317；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Replace all Alpha-related icons across the platform with the consistent \`Alpha-fill\` icon using all available sizes. The "sparkle" icon must never be used in relation to Alpha. Surfaces to update: - App top nav on Alpha tab - Icon on Analyze button on event card in Alpha tab - Top nav button on web — "Get started with Alpha" - Alpha suggestion row on event detail page Reference: [ Extension of [OG-10317]( — \[App\] Alpha screen — logo not aligned.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0036"></a>
### SRC-FAIL-0036 · [App/Web] Inconsistent Bitcoin logos across the platform

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L354–L362](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:354>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Bitcoin logos appear inconsistent across the platform — the logo styling, colour, or rendering differs depending on where it is displayed (e.g. Crypto category under the Live tab vs. other screens). * Reported as a general inconsistency with no specific screen called out — affects Bitcoin logo appearance across the app and/or web * Screenshot shows the Crypto category under the Live tab on OG.com, displaying short-duration BTC price prediction contracts (5 min, 20 min, 2 hour) and longer-term contracts ("Bitcoin Price at the End of 2026", "When …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0037"></a>
### SRC-FAIL-0037 · [Web] Update favicon to support light mode

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L364–L371](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:364>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：Update the OG web favicon to support light mode. The current favicon appears designed for dark backgrounds — it needs a variant (or adaptive version) that remains visible and correct in light mode browser tabs/bookmarks. * The OG favicon uses a dark background with orange "OG" text, which works on dark-mode browser chrome but may not display correctly in light mode * A light-mode-compatible favicon should be provided (either a separate light-mode asset or an SVG/ICO that adapts) * Screenshot shows the current OG app icon (dark background, orang …（摘录，见原文）
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0038"></a>
### SRC-FAIL-0038 · [Web] PROD — Missing combo icon on event cards for combo-able events

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L373–L381](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:373>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Combo icon is missing on web event cards for combo-able events. The app correctly displays a combo icon on eligible event cards, but the web version does not show it at all — behaviour should match the app. * Reported on PROD (web) * The combo icon should appear on event cards where combo betting is available, consistent with how it appears on the app * Screenshot shows a Pro Baseball / MLB matchup listing (event cards with team logos, implied odds, volume) — the combo icon is absent from these cards on web * Reference design: [
- 处置/推断：组合资格决定图标显隐，资格及跨端功能范围未经确认。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0039"></a>
### SRC-FAIL-0039 · [Web] Left menu — use correct Figma icons for category items (Sports/Crypto/Financials/etc. "All" and Crypto subcategories)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L383–L391](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:383>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the left menu icons on Web to use the correct Figma icons for category items as specified below. * \*"All" icon\* for Sports, Crypto, Financials, Commodities, Economics, Politics, Tech, Culture, Climate: * \*Crypto &gt; 5 min and 20 min icon\*: * \*Crypto &gt; 2 hour, Daily, Weekly, One-time icon\*: [Source: Slack thread](
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0040"></a>
### SRC-FAIL-0040 · [App] "All" tab section headers — add `all-fill` icon to match web style

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L393–L403](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:393>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Add the \`all-fill\` icon to "All" tab section headers on App, to match the existing web treatment. * Currently, "All" tab headings on App do not have an icon, whereas web shows the \`all-fill\` icon consistently * All "All" tab section headers should use the \`all-fill\` icon * Figma reference confirms the expected heading style (icon + label) * Team discussed whether this applies to every "All" heading — confirmed applicable across the board *  flagged this; planned for the Sep 30 OTA [Figma reference](
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0041"></a>
### SRC-FAIL-0041 · [Web] Mobile web Crypto category — filter coin logos should be coloured, not black/white

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L405–L413](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:405>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：On mobile web, the crypto asset filter pills (e.g. BTC, ETH, XRP, SOL) on the Crypto category page display coin logos in black/white (monochrome) instead of their correct brand colours. These should follow the web designs and render in full colour. * Affects the Crypto category tab on mobile web (og.com) * Filter pills with coin logos (BTC, ETH, XRP, SOL, etc.) are showing monochrome/black-and-white icons * Expected: coin logos should use their standard brand colours (e.g. Bitcoin orange, Ethereum blue/purple, etc.) to match the web design spec …（摘录，见原文）
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0042"></a>
### SRC-FAIL-0042 · [Web] Homepage crypto contracts — coin logos not aligned with Crypto category page

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L415–L423](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:415>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Homepage crypto prediction contracts are using different coin logos compared to the logos shown on the Crypto category page. The two surfaces should display identical coin logos for consistency. * On the Trending/Homepage, crypto contracts (e.g. "Bitcoin Price at the End of 2026", "When will Bitcoin cross $100k again?") show coin logos that differ from those displayed on the Crypto category page. * The Crypto category page displays coin logos in a left sidebar asset filter (BTC, ETH, XRP, SOL, etc.) and on contract cards — these should be the c …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0043"></a>
### SRC-FAIL-0043 · [Web] Chevrons should be orange — match OG logo colour

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L425–L432](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:425>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update chevron icons on web to use orange, matching the OG logo colour as per design specs. * Reporter flagged that chevrons are not currently using the correct orange colour * Should match the OG logo colour (same orange used in the brand identity) * Applies to web platform
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0044"></a>
### SRC-FAIL-0044 · [Web] Section icons should be at 50%

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L434–L438](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:434>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Section icons should be at 50%（标题）
- 处置/推断：“50%”没有属性、对象或对照：不知是透明度、尺寸还是其他含义。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0045"></a>
### SRC-FAIL-0045 · [Web] Remove icon in market card next to more markets

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L440–L444](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:440>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Remove icon in market card next to more markets（标题）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0046"></a>
### SRC-FAIL-0046 · [Web] Market card — remove parlay icon (out of scope for v1)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L446–L450](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:446>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Market cards 上显示了 parlay 图标。Parlay 标记不在 v1 范围内（PRD §2.2），需隐藏该图标。
- 处置/推断：版本功能范围要求隐藏特定业务标志。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0047"></a>
### SRC-FAIL-0047 · [Web] Category page — remove icon next to the page title

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L452–L456](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:452>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Web category page（如 Sports、Crypto）页面标题旁边不应有图标（按 Figma），但 staging 上有图标显示。
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0048"></a>
### SRC-FAIL-0048 · [Web] Remove category icons and always show chevron for subcategory navigation

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图标 / Logo / 资源 (33 条)。
- 路径与定位：[原文 L458–L462](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:458>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Remove category icons and always show chevron for subcategory navigation（标题）
- 处置/推断：仅标题要求移除图标并永远显示 chevron，缺少是否可导航的条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0049"></a>
### SRC-FAIL-0049 · [Web] Design token mismatch — `border/status-neutral` (light) shows #E8D0B5 in variables but #BFC6D8 where used on button component

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L468–L476](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:468>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D011](rules/UIK-D011.md)。
- 依据摘录：Investigate and resolve a color token inconsistency in the OG App Design Library for \`border/status-neutral\` in light mode. * Token \`border/status-neutral\` (light) maps to \`neutral/300\`, which is defined as \*\*#E8D0B5\*\* in the Figma variables panel * However, where this token is applied to the button component, the resolved colour shows as \*\*#BFC6D8\*\* — a different value * This discrepancy needs to be verified and corrected so the token value is consistent across its definition and all usages Reference links: - Variables definition …（摘录，见原文）
- 处置/推断：提取相同 token 在同一模式/版本/作用域中解析不一致；原变量与组件链接缺失，色值只是案例报告，不能据此决定哪一值正确。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0050"></a>
### SRC-FAIL-0050 · [Web] Limit order — "Submitted" status colour should match other statuses, not use `content/active`

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L478–L486](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:478>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The "Submitted" order status in the limit order history table is displayed in orange (\`content/active\`) — it should use the same colour as all other status labels for visual consistency. * On the order history table, pending/unfilled GTC limit buy orders show a "Submitted" status in orange * All other statuses (e.g. Filled) do not use orange — the colour is inconsistent * The "Submitted" status colour should match the neutral colour used by other status labels (not \`content/active\`) * Observed on orders such as Chicago C No, Moneyline bets, …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0051"></a>
### SRC-FAIL-0051 · [Web] Crypto category page — category icon visible in light mode but missing in dark mode

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L488–L497](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:488>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：The Crypto category page displays a category icon in light mode but the icon is absent in dark mode — the two modes should be visually consistent. * Reported on OG.com web (Crypto prediction markets category page) * In light mode, a category icon is present alongside the page content * In dark mode, the same icon does not appear — inconsistent behaviour across themes * Screenshot shows side-by-side comparison of the Crypto page in dark vs. light mode; light mode shows the category icon, dark mode does not * Both modes display the same markets ( …（摘录，见原文）
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0052"></a>
### SRC-FAIL-0052 · [Web] Perps trade drawer — fill colour should match standard trade drawer

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L499–L506](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:499>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The Perps trade drawer on web has an incorrect fill/background colour. It should use the same fill as the standard (non-Perps) trade drawer to ensure visual consistency across drawer types. * The issue is on the web platform (Perps trade drawer specifically) * The standard trade drawer fill should be the reference — the Perps drawer should match it exactly * Screenshot shows the Perps order entry for AAPL Perp • Up at $319.00, with 3x leverage, TP/SL enabled (TP at $350.90 / SL at $303.05, liquidation at $247.64) — the drawer fill is visually i …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0053"></a>
### SRC-FAIL-0053 · [Web] Build Parlay trade slip — colours are off

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L507–L515](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:507>)；原状态：暂停（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The colours on the Build Parlay trade slip screen are off and do not match the expected design. * Reporter flagged colour issues on the Build Parlay trade slip (screenshot attached to ticket) * Screenshot shows the Build Parlay screen with a single selection (Cincinnati Yes, Cincinnati @ San Francisco · Winner) at 14%, $0 entry, 10.45x payout multiplier * The "Build Parlay" header/tab label is circled in red in the screenshot, suggesting the label, icon, or its surrounding styling may be where the colour discrepancy is most visible * No specifi …（摘录，见原文）
- 处置/推断：“colours are off”且目标 token 未给出，没有可核验差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0054"></a>
### SRC-FAIL-0054 · [Web] Last button has white text on white background — unreadable

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L517–L525](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:517>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D005](rules/UIK-D005.md)。
- 依据摘录：The last button on the web staging page has white text rendered on a white background, making it completely unreadable/invisible. * Reported on web staging (staging B) * The affected button appears to be the final/last button in a sequence on the page * Text colour and background colour are both white — likely a contrast/theming issue * Screenshot attached shows the OG.com web sign-up / onboarding screen (Welcome to OG registration form with Sign up with Google, Sign up with Apple, email input, and Login link); the right panel shows a dark prom …（摘录，见原文）
- 处置/推断：提取承担阅读/图表解释的前景在背景上消失；不将指定颜色或缺少非必要装饰判错，不添加对比度阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0055"></a>
### SRC-FAIL-0055 · [Web] Trade slip — incorrect background and shadow on category page

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L527–L535](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:527>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The trade slip panel on the Web category page is displaying an incorrect background colour and/or shadow styling — it does not match the expected design spec. * Observed on the category page (e.g. Sports &gt; Boxing subcategory page) * The trade slip panel appears with wrong background and shadow — needs to be corrected to match Figma * Screenshot shows the trade slip open on the right side with a pre-selected position (Denver Yes at 69%), quick-add stake buttons, and a "Sign up to trade" CTA * Issue is visible in the unauthenticated state (logged …（摘录，见原文）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0056"></a>
### SRC-FAIL-0056 · [Web] Cookie consent banner — add light mode support

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L537–L544](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:537>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：Cookie consent banner currently only supports dark mode. Light mode styling needs to be added. * The banner displays a dark background with orange accent elements ("Learn more and manage." link, "Accept all" button, "Reject non-essential cookies" outlined button) * The same dark-background treatment is being shown in light mode — it should adapt to the light mode theme * Screenshot confirms the banner layout: message text, orange CTA link, filled "Accept all" button, and outlined "Reject non-essential cookies" button
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0057"></a>
### SRC-FAIL-0057 · [Web] Top markets list — remove hover surface color (keep scaling animation)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L546–L554](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:546>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Remove the hover surface color on the top markets list on Web. The scaling animation should be kept — only the surface/background color that appears on hover should be removed. * Affects the top markets list component on OG Web * Only the hover surface color should be removed * Scaling animation must remain intact [Source: Slack thread](
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0058"></a>
### SRC-FAIL-0058 · [Web] Lifetime rewards card should use bg/surface-tertiary with border/surface-default outline (light and dark mode)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L556–L569](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:556>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Lifetime rewards card should use bg/surface-tertiary with border/surface-default outline (light and dark mode)（标题）
- 处置/推断：模板前置、步骤、实际结果全空，仅标题规定 token。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0059"></a>
### SRC-FAIL-0059 · [Web] Sign Up/Log In button should use Filled Primary button style (light and dark mode)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L571–L584](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:571>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Sign Up/Log In button should use Filled Primary button style (light and dark mode)（标题）
- 处置/推断：模板前置、步骤、实际结果全空，仅标题规定按钮变体。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0060"></a>
### SRC-FAIL-0060 · [Web] Parlay preview slip — multiple design misalignments vs Figma (exit button style, reminder banner, spacing, win chance colour)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L586–L599](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:586>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R002](rules/UIK-R002.md)、[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Parlay preview slip does not fully align with the intended Figma design. Multiple issues identified when the slip has only 1 pick selected (showing the "Pick at least two markets" validation state). Issues to fix: * To align Exit parlay button's style * "Pick at least two .." reminder should come with the grey background like a thin banner * To double check the spacing in between the Exit parlay button and the reminder banner, and between the banner and the X-pick header * The win chance % should be in black color instead of grey * Skip the lab …（摘录，见原文）
- 处置/推断：只审查按钮、提示区与间距；选择数量、隐藏 payout/settings 的条件不提炼。 只审查按钮、提示区与间距；选择数量、隐藏 payout/settings 的条件不提炼。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0061"></a>
### SRC-FAIL-0061 · [Web] Live icon should be content/danger-bold

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L601–L605](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:601>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Live icon should be content/danger-bold（标题）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0062"></a>
### SRC-FAIL-0062 · [Web] Promo Card component title amount should be decorative/orange-bold colour

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L607–L611](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:607>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Promo Card component title amount should be decorative/orange-bold colour（标题）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0063"></a>
### SRC-FAIL-0063 · [Web] Modal sheet fill colour should use bg/surface-tertiary

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L613–L617](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:613>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Modal sheet fill colour should use bg/surface-tertiary（标题）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0064"></a>
### SRC-FAIL-0064 · [Web] Pre-login visual headline should be content/primary

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L619–L623](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:619>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Pre-login visual headline should be content/primary（标题）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0065"></a>
### SRC-FAIL-0065 · [Web] Featured card — search bar surface color mismatch with Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L625–L629](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:625>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Web lobby staging 上 search bar 的 surface color 与 Figma 设计不一致。应匹配 Figma 中定义的颜色。
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0066"></a>
### SRC-FAIL-0066 · [Web] Featured card — no gradient overlay on futures cards (matches only)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L631–L635](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:631>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Futures featured card 不应有渐变/颜色叠层。渐变仅适用于 sports matches，取自 top-1 outcome 的主色。当前 staging 在 futures 上渲染了灰色渐变。
- 处置/推断：渐变应用条件和色源取决于市场类别及 outcome 排序。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0067"></a>
### SRC-FAIL-0067 · [Web] Featured card — pagination button color / style mismatch with Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L637–L641](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:637>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Featured card 轮播的 next/previous 按钮的颜色和样式与 Figma 不匹配。
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0068"></a>
### SRC-FAIL-0068 · [Web] Event detail page LIVE badge colour should match the LIVE page

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：颜色 / 主题 (20 条)。
- 路径与定位：[原文 L643–L647](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:643>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：[Web] Event detail page LIVE badge colour should match the LIVE page（标题）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0069"></a>
### SRC-FAIL-0069 · [Web] Auth login — button borders missing for email & passkey options

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L653–L662](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:653>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：OG-11349；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Button borders are missing for the email and passkey authentication options on the OG.com web login/sign-up page. * Affects the "Continue with email" and "Continue with passkey" buttons on the auth login card * The "Welcome to OG.com" card shows four auth options: Continue with Google, Continue with Apple, Continue with email, Continue with passkey * Google and Apple buttons appear to have correct styling; email and passkey buttons are missing their borders * Screenshot confirms the issue on the live web login screen Attach to epic: \[OG-11349  …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0070"></a>
### SRC-FAIL-0070 · [Web] Combo animation — border colour not aligned; Lottie update needed

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L664–L671](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:664>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Fix the combo animation on web — the border colour is not aligned with the Design System and a Lottie animation update is required. * Issue reported for the OG.com web platform (not app) * Border colour on the combo animation does not match DS spec * Lottie file needs to be updated to reflect correct border colour
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0071"></a>
### SRC-FAIL-0071 · [Web] Clicked buttons show browser focus outline — remove outline on click

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L673–L681](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:673>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R010](rules/UIK-R010.md)。
- 依据摘录：Remove the browser focus outline that appears on buttons when clicked on web (reported on Brave browser). * Reporter sees a visible focus ring/outline appear around buttons when clicked on the Brave browser * This is likely a browser default \`:focus\` or \`:focus-visible\` outline not being suppressed on click interactions * Should be suppressed on mouse/pointer click while still being accessible for keyboard navigation (\`:focus-visible\` pattern) * Screenshot shows the Game Lines tab selected on a sports event page (Rams vs Broncos), with an …（摘录，见原文）
- 处置/推断：点击后浏览器焦点环是正常候选行为；仅形成焦点样式变更审查建议，不能把去掉所有 outline 作为规则或假定已发生键盘缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0072"></a>
### SRC-FAIL-0072 · [Web] Limit order — event icon corner radius should be 8px

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L683–L690](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:683>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The corner radius for the event icon in the Web Limit Order flow should be 8px. * Issue is on the Web platform, in the Limit Order modal/flow * The event icon corner radius is currently incorrect and needs to be updated to 8px * Supporting screenshot shows a bet entry modal with a "Cincinnati Yes" prediction on Pro Baseball Champion 2026, stake input of $0, and a 1.45x payout multiplier in orange
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0073"></a>
### SRC-FAIL-0073 · [Web] Player fallback logo (initials badge) — missing grey border and border radius

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L692–L699](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:692>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The player fallback logo (initials badge, shown when no player photo or flag is available) on Web is missing a grey border and border radius. This causes the initials badge to visually appear inconsistent with other avatar/logo elements on the platform that do have this treatment. * The fallback initials badge (e.g. "EB" for a player with no image/flag) should have a grey border and border radius applied, matching the treatment used for flag/country icons. * Screenshot shows a live match (Remy Bertola vs Edas Butvilas) where Bertola has a red S …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0074"></a>
### SRC-FAIL-0074 · [Web] Individual sport player/country logos — add grey border and border radius so flags don't blend into white background

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L701–L709](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:701>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：Add a grey border and border radius to logos/icons used in individual-based sports prediction (e.g. tennis, golf) to prevent flags with white or light backgrounds from blending into the page background. * Currently, Japan's flag (white + red design) is indistinguishable from the white background on player/country icons in individual sports markets * Fix should apply a grey border and rounded corner radius to all individual sport player/country logos to ensure visual distinction in both light and dark mode **Supporting detail from screenshot:**  …（摘录，见原文）
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0075"></a>
### SRC-FAIL-0075 · [Web] Team / player / flag icons — missing border on all instances

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L711–L719](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:711>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：All team, player, and flag icons on Web are missing their border styling. This affects all instances across the platform — e.g. visible on baseball market cards (game matchup cards, season winner markets, player prop markets). * The border is absent on icons in market cards such as team matchup cards (e.g. Pittsburgh @ Milwaukee), season champion markets (e.g. Pro Baseball Champion), and player markets (e.g. NL MVP Winner 2026) * The screenshot highlights the affected areas with red circles around the team logo/name display sections * This appe …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0076"></a>
### SRC-FAIL-0076 · [Web] Market card price history chart — border radius should be 12px (currently 24px)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L721–L729](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:721>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The border radius on the price history chart on market cards is incorrect on web. It should be 12px per the Figma design, but is currently rendered at 24px. * Affects web market card price history charts (e.g. visible on Politics cards such as the South Carolina Republican Senate Special Primary Winner) * The chart in the screenshot shows candidates' price history from Aug 8–11 and the over-rounded corners are clearly visible * Figma reference: [ * Fix: change chart border radius from 24px → 12px to match Figma spec
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0077"></a>
### SRC-FAIL-0077 · [Web] Homepage odds format selector — selected segmented control (Percentage) corner radius incorrect (should be 8px)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L731–L739](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:731>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Fix the corner radius of the selected segmented control pill (Percentage option) on the homepage odds format selector — it should be 8px. * The odds format selector on the homepage uses a segmented control with "% Percentage" and "⊞ American" options * The active/selected pill (currently showing "% Percentage" with a white background) has an incorrect corner radius * Expected corner radius: 8px per Figma spec * Figma reference: [
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0078"></a>
### SRC-FAIL-0078 · [Web] Contract progress bars — inconsistent thickness across cards

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L741–L748](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:741>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The progress bars displayed on contract cards have inconsistent thickness across different cards on the web platform. * Reported on the web; screenshot shows a live Bitcoin price prediction market with two active contracts ("Above $64,732.00" and "Above $64,707.00") * The orange/red progress bars indicating trade activity appear at different thicknesses between cards * This is a visual inconsistency that should be standardised across all contract card types
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0079"></a>
### SRC-FAIL-0079 · [Web] Highlighted card faded background bleeds beyond border corners on mobile web

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L750–L758](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:750>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D009](rules/UIK-D009.md)。
- 依据摘录：The faded background of the highlighted/selected card on mobile web extends beyond the card's border corners, creating a visual overflow where the background gradient/fade is not clipped to the card boundary. * Observed on OG.com mobile web (homepage, logged-out state) * The highlighted card's faded background should be contained within the card's rounded border corners * The overflow is visible on the featured/market cards in the homepage view * Screenshot attached showing the issue on the Featured section (Golf market — Rocket Classic) and Pr …（摘录，见原文）
- 处置/推断：提取明确要求包含在容器内的装饰层越界；须确认装饰边界合同，阴影、外伸焦点环和有意叠层不在此规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0080"></a>
### SRC-FAIL-0080 · [Web] Align stroke weight of selected filter pill to match Figma design

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L760–L768](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:760>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R009](rules/UIK-R009.md)。
- 依据摘录：The selected filter pill's stroke weight is too thin and not legible in its selection state. Stroke weight should be updated to match the Figma design spec. * Affected platform: Web * The current stroke weight on the selected filter state is not legible — it needs to be increased/aligned to the Figma spec * Reference Figma: [ * Screenshot context: Positions/History tab view with "Open" and "Settled" filter pills — the selected pill's border stroke is not visually distinct enough
- 处置/推断：提取可操作性/选中性/滚动可能性的视觉暗示审查；不规定边框粗细、按钮并排、轮播预露或强制持续滚动。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0081"></a>
### SRC-FAIL-0081 · [Web] Pro Football Hub "Choose Your Team" carousel — "Pick now" CTA does not look like an active/tappable button

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L770–L779](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:770>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：OG-12334；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R009](rules/UIK-R009.md)。
- 依据摘录：The "Pick now" CTA on the "Choose Your Team" hero carousel in the Pro Football Hub does not appear as an active or tappable button — the styling makes it look inactive or disabled, which may cause users to miss it. * Observed on the Pro Football Hub page, in the "Choose Your Team" onboarding hero section * The carousel displays NFL team tiles (BUF, LAC, IND, DAL, ATL, NYG, DET, etc.) with a "Pick now" CTA on each tile * The CTA button styling does not communicate interactivity — should be updated to look like a clear, active call-to-action per  …（摘录，见原文）
- 处置/推断：提取可操作性/选中性/滚动可能性的视觉暗示审查；不规定边框粗细、按钮并排、轮播预露或强制持续滚动。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0082"></a>
### SRC-FAIL-0082 · [Web] Remove outline on campaign headers

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L781–L785](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:781>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Remove outline on campaign headers（标题）
- 处置/推断：只要求去掉 outline，不知是装饰边框还是键盘焦点指示；不可采纳全局移除。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0083"></a>
### SRC-FAIL-0083 · [Web] Trade slip shadow should use shadow-secondary. Current is too harsh.

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：边框 / 圆角 / 描边 (15 条)。
- 路径与定位：[原文 L787–L791](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:787>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Trade slip shadow should use shadow-secondary. Current is too harsh.（标题）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0084"></a>
### SRC-FAIL-0084 · [Web] Promo banner carousel — remove cut-off glow and peeking adjacent banners; active banner should fill full width

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L797–L805](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:797>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R009](rules/UIK-R009.md)。
- 依据摘录：Remove the cut-off glow effect and the partially visible adjacent banner from the promo banner carousel on web. Active banners should stretch to fill the full width of the carousel container. The carousel indicator (dots/pagination) is sufficient to communicate that it is a carousel — the peeking/cut-off treatment is no longer needed. * Currently, the carousel shows a glow at the edges and a sliver of the next/previous banner is visible — this should be removed. * Active banners should fill 100% of the carousel width instead of being narrowed t …（摘录，见原文）
- 处置/推断：提取可操作性/选中性/滚动可能性的视觉暗示审查；不规定边框粗细、按钮并排、轮播预露或强制持续滚动。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0085"></a>
### SRC-FAIL-0085 · [Web] Crypto page — contract cards not uniform height

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L807–L814](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:807>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：On the OG Web Crypto page, not all contract cards are the same height — cards in the grid have inconsistent heights, breaking the layout alignment. * Reported page: [ (Crypto category/predictions page) * The screenshot shows a grid of active prediction contracts (Bitcoin and Ethereum price predictions with various time horizons, multipliers, implied probabilities, and trading volume) — card height inconsistency is visible across the grid * This is a web-only issue
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0086"></a>
### SRC-FAIL-0086 · [Web] Contract chart — logo watermark not aligned to y-axis; missing spacing between event title and chart

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L816–L824](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:816>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Two visual issues on the contract detail page chart (web, staging): * Logo watermark is not aligned to the y-axis — needs to align horizontally with the y-axis baseline * Missing spacing between the event title and the chart area — gap should be added between them Reference: The Pro Football Champion page is cited as the correct example to follow for both the alignment and spacing treatment. Screenshot shows BTC 5-min contracts (web and app views) and the Pro Football Champion 2026–2027 market as the reference example.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0087"></a>
### SRC-FAIL-0087 · [App/Web] Category filter list — reduce spacing between category name and event count in brackets

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L826–L833](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:826>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Reduce the spacing between the category name and the event count displayed in brackets — e.g. \`EUR/USD (3)\` — in the category filter list. The gap between the text and the \`(N)\` suffix appears too wide and should be tightened. * Reported from the category filter panel, which groups instruments by timeframe (5 min, 2 hour, Daily) and lists asset pairs/indices (e.g. EUR/USD, S&amp;P 500, Nasdaq 100) each with a bracket count and collapsible chevron * Affects the watchlist/filter overview UI across the platform * No specific platform stated — appl …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0088"></a>
### SRC-FAIL-0088 · [Web] Trade slip — extends beyond viewport instead of staying contained and scrollable with CTA always visible

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L835–L841](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:835>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D003](rules/UIK-D003.md)。
- 依据摘录：The trade slip on web extends beyond the viewport/screen boundary, causing the right side of the screen to feel cramped. The CTA (place bet button) is not always visible without scrolling. Expected behaviour (per Kalshi comparison): - The trade slip should remain fully contained within the viewport - The trade slip content should be internally scrollable - The CTA should always be sticky/visible at the bottom of the slip, regardless of how many picks are added Context: - The issue is most noticeable as more picks are added to a parlay (the slip …（摘录，见原文）
- 处置/推断：提取视口/浏览器栏导致必要操作无法完整到达的机制；普通滚动可到达、内部滚动和非固定 CTA 均可健康。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0089"></a>
### SRC-FAIL-0089 · [Web] Player pages — header image not loading, navigation unclear, stats layout issues, and next-player arrow order ambiguous

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L843–L849](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:843>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R003](rules/UIK-R003.md)、[UIK-R005](rules/UIK-R005.md)、[UIK-R007](rules/UIK-R007.md)。
- 依据摘录：Several design and UX issues found on OG Web player pages (e.g. og.com/nfl/players/rashee-rice-fjzxza). Issues reported: - Header box image does not load on the player page - "Next game" section has a coloured background that appears off-brand — needs clarification on whether this is intentional - No category page link or back navigation in the header, making it unclear how to return to main pages - Stats are hard to read — column spacing is inconsistent - Left/right arrow navigation between players has no indication of ordering logic (alphabet …（摘录，见原文）
- 处置/推断：提取页面/弹层上下文、返回路径与导航可理解性审查；不规定每页必须返回键、某筛选项必现或悬停为唯一说明方式。 图片加载、返回/顺序提示、表格布局分别映射；背景是否 off-brand 暂缓。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0090"></a>
### SRC-FAIL-0090 · [Web] Top nav bar — does not wrap correctly when viewport is horizontally constrained

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L851–L859](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:851>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：The top navigation bar does not wrap nicely when the viewport is horizontally constrained — nav items overflow or break layout instead of wrapping cleanly. * Observed on the OG.com web app homepage * The nav bar includes tabs for All Markets, Pro Football Hub, Sports, Crypto, Financials, and more, plus an "Ask Alpha" AI button * When the viewport width is reduced, the nav items do not wrap gracefully — expected behaviour is a clean wrap or responsive collapse * Screenshot shows the homepage with the live tennis market (Linda Nosková vs Aryna Sa …（摘录，见原文）
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0091"></a>
### SRC-FAIL-0091 · [Web] My Team page — Next Game and Standings should be side by side at mid breakpoint; schedule and standings cards should fill width at smaller breakpoint

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L861–L868](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:861>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Fix responsive breakpoint behaviour on the My Team page: * At the mid breakpoint: the Next Game card and Standings card should appear side by side (two-column layout) * At smaller breakpoints: the schedule card and Standings card should each fill the full width (single-column layout) Context: - Reported with two screenshots showing the My Team tab (user rooting for CIN/Cincinnati) on desktop/tablet and mobile views - Hero section shows a large orange banner with team helmet and a next game card (CIN vs TB, Sep 14) - Below the hero: American con …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0092"></a>
### SRC-FAIL-0092 · [Web] Pro Football Hub — "This Week" card width should match Featured and Future cards

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L870–L877](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:870>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：The card width in the "This Week" section of the Pro Football Hub does not match the card width used in the "Featured" and "Future" sections. Cards should be consistent in width across all three sections. * The "This Week" section displays event cards (e.g. Baltimore @ Indianapolis, New Orleans @ Baltimore) with a different card width compared to the Featured and Futures sections * The Featured section and Futures section cards (e.g. Pro Football Champion 2026–2027) appear to use a different/wider card style * All three sections (Featured, This …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0093"></a>
### SRC-FAIL-0093 · [Web] My Team page — two cards have different widths

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L879–L887](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:879>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Two cards on the My Team page have different widths, creating an inconsistent layout. * Reported on the OG App's My Team page (LA Chargers / LAC view) * The page shows a hero banner at the top, followed by two sections: **This Week** and **Futures** * The cards in these sections appear to be different widths, breaking visual consistency * Screenshot shows: LAC vs ARI game card (This Week) and Pro Football Champion 2026-2027 market card (Futures) — the two card types do not share the same width
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0094"></a>
### SRC-FAIL-0094 · [Web] Pinned cards — inconsistent layout across card types (volume placement, padding, chart legend)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L889–L898](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:889>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Pinned cards on the homepage use inconsistent layouts depending on card type (e.g. Game Lines vs Futures, or across categories). Specific differences observed include: * Volume label placement differs between card types * Padding is inconsistent across card types * Chart legend presence/styling varies All pinned cards should follow a single unified layout regardless of market type or category. **Supporting screenshot details:** - Card 1 (Game Lines): New England @ Seattle (Pro Football) — $264,640 volume, probability chart with team legend - Ca …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0095"></a>
### SRC-FAIL-0095 · [Web] Perps position detail — margin health labels (Healthy / Add margin) should have 12px spacing in health bar area

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L900–L908](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:900>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：The margin health labels ("Healthy" on the left and "Add margin" on the right) in the Perps position detail health bar area need increased spacing. The highlighted area should have 12px spacing. * The health bar displays a gradient (green → yellow/orange → pink/magenta) representing health from safe to at-risk * Below the bar is a liquidation price indicator (e.g. $198.69) with a triangle marker on the far right * The "Healthy" label (left) and "Add margin" action (right) sit adjacent to this bar * Current spacing in the highlighted area is ins …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0096"></a>
### SRC-FAIL-0096 · [Web] Position details — increase spacing between label and content (should be consistent across all details)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L910–L918](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:910>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Increase the spacing between labels and their corresponding content values within position details. The spacing should be equal and consistent across all detail rows. * Affects all detail rows in the position details view (e.g. Margin, TP/SL, Leverage) * Currently the spacing between each label and its content value is insufficient and/or inconsistent across rows * Screenshot shows three detail rows: Margin ($63.59), TP/SL ($262.99 / $227.13), and Leverage (3X) — labels are annotated/flagged, suggesting the spacing does not match the design spe …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0097"></a>
### SRC-FAIL-0097 · [Web] Perps detail page — "More like..." cards on Crypto should match Stocks card sizes

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L920–L927](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:920>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：On the Perps detail page, the "More like..." carousel cards on the Crypto section do not match the card sizes used in the Stocks section. The Crypto cards should follow the same card dimensions as the Stocks cards. * Affected surface: "More like..." carousel on the Perps detail page (Crypto section) * The Stocks section card sizing is the reference/correct size * Screenshot shows the "More like BTC perps" carousel with LTC Perp and SOL Perp cards — the leftmost card appears cut off (no coin icon visible, only the 15X leverage badge), suggesting …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0098"></a>
### SRC-FAIL-0098 · [Web] Sports category list — uneven spacing between "All" and first sport vs. between subsequent categories

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L929–L937](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:929>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：The spacing between the "All" entry and the first sport (Baseball) in the Sports category list is inconsistent — it is larger than the spacing between the subsequent sport categories below it. * On the Sports markets page, the gap between "All" and the first sport entry does not match the uniform spacing used between all other category rows * All other inter-category spacing appears consistent; only the "All" → first sport gap is different * Affects the web Sports page category list (visible with 283 total active contracts across Tennis, Soccer …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0099"></a>
### SRC-FAIL-0099 · [Web] Contract detail page — odds values not centre-aligned in bet buttons

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L939–L947](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:939>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：The odds values displayed inside the bet buttons on the contract detail page are not centre-aligned. They should be horizontally centred within their respective buttons. * Observed on a BOS vs. LAD baseball game contract detail page * Affects all contract sections visible on the page: Moneyline (Boston 87¢ / LAD 14¢), Total Runs Over/Under (49%/53¢), and Spread (BOS -2.5 at 56¢ / LAD +2.5 at 45¢) * The odds text (e.g. "Yes 87¢", "No 14¢") appears misaligned within the button — not centred * The scrubber UI for adjusting spread/total line values …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0100"></a>
### SRC-FAIL-0100 · [Web] Mobile web category headers — reduce spacing, tighten layout, and align contract count with category name

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L949–L958](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:949>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Tighten up the category header section on mobile web. The current layout has too much spacing, making headers look visually heavy and misaligned. * Category headers on mobile web have excessive spacing — layout feels too loose and should be tightened * Contract count (e.g. "All 91", "Bitcoin 6") needs to be visually aligned inline with the category name, not offset or displaced * Filter chip row (shown with All/Dota 2/Bitcoin/Ethereum pills) is the specific UI area flagged as looking "quite ugly" * Screenshot shows the LIVE markets tab with cry …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0101"></a>
### SRC-FAIL-0101 · [Web] Mobile web category card headers — increase font size dramatically and make chevrons OG orange

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L960–L967](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:960>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Increase the font size of category card headers dramatically on mobile web. Additionally, chevrons on these cards should be styled in OG orange to match the brand colour. * Category card header text on mobile web is too small — needs a significant font size increase * Chevrons should use OG orange (matching the OG logo colour), consistent with the fix requested in &lt;custom data-type="smartlink" data-id="id-0"&gt; for other chevron instances * Screenshot context: mobile web homepage showing category tabs (Trending, LIVE, Sports, Crypto, Economics) a …（摘录，见原文）
- 处置/推断：增大字号及指定橙色是产品方案，缺不可读证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0102"></a>
### SRC-FAIL-0102 · [Web] OG.com logo — match height to "Sign Up / Login" button on mobile web nav

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L969–L977](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:969>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Resize the OG.com logo in the mobile web navigation bar so its height matches the height of the "Sign Up / Login" button alongside it. * The logo and the Sign Up / Login button sit in the same nav bar row on mobile web * Currently the logo height does not align with the button height, creating a visual imbalance * Both elements should be the same height for consistent vertical alignment in the nav bar * Screenshot shows the mobile web homepage nav with the logo and CTA button visible together
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0103"></a>
### SRC-FAIL-0103 · [Web] Cookie consent banner — reduce size on mobile web and place CTAs side by side

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L979–L987](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:979>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R009](rules/UIK-R009.md)。
- 依据摘录：Reduce the cookie consent banner size significantly on mobile web. The two CTAs ("Accept all" and "Reject non-essential cookies") should be placed next to each other (side by side) rather than stacked, to reduce the overall height of the banner. * Currently the cookie consent banner takes up a large portion of the screen on mobile web, overlaying content below * The two CTAs are stacked vertically — they should be laid out horizontally side by side to save space * Screenshot shows the banner covering the bottom of the Economics category page (U …（摘录，见原文）
- 处置/推断：提取可操作性/选中性/滚动可能性的视觉暗示审查；不规定边框粗细、按钮并排、轮播预露或强制持续滚动。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0104"></a>
### SRC-FAIL-0104 · [App/Web] Promotional banner is cut off on mobile web and web

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L989–L997](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:989>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D001](rules/UIK-D001.md)。
- 依据摘录：Promotional banner is getting cut off on mobile web and web — design involvement may be needed to resolve the layout issue. * The banner (e.g. "New OG.com users only. Trade...") with the sports fan image and orange "Sign Up" CTA is being truncated/clipped on both mobile web and web * The issue affects the banner's visible area — the content is cut off rather than displaying in full * Screenshot shows the banner on the OG.com home screen alongside navigation tabs (Trending, LIVE, Sports, Crypto, Economics) and featured markets * Design review fl …（摘录，见原文）
- 处置/推断：提取必要文字/内容被裁切后无法识别的风险；不采纳固定缩写长度、绝不截断或必须单行的产品方案。实际缺陷仍需核验全文替代入口和裁切意图。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0105"></a>
### SRC-FAIL-0105 · [Web] Too much spacing between sport name and contract count

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L999–L1007](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:999>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Reduce the spacing between the sport/category name and its contract count in the sports category navigation list on Web. * The gap between the sport name text and the market count in parentheses is too large * Affects the sports category list (e.g. Soccer (76), Baseball (46), Esports (41), etc.) * Each category row shows: icon → sport name → \[gap\] → count → chevron * The spacing should be tightened to match the Figma design spec
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0106"></a>
### SRC-FAIL-0106 · [Web] Event details page — elements not left-aligned

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1009–L1017](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1009>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Elements on event details pages are not left-aligned and need to be corrected to match the expected left-alignment layout. * The screenshot shows the "Bitcoin Price at the End of 2026" contract page (Predicts · Crypto), displaying four price range outcomes with Yes/No pricing and a probability chart * Page elements (outcome rows, pricing labels, chart section, top markets list) appear misaligned — they should all be left-aligned consistently * The Trade Slip panel on the right is open with a selection highlighted, and the overall page layout in …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0107"></a>
### SRC-FAIL-0107 · [Web] Crypto category page — left-align time interval filter list with crypto logos

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1019–L1026](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1019>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Left-align the time interval filter list (5 min, 20 min, 2 hour, Daily, Weekly, One-time) with the crypto subcategory logos on the Crypto category page. * On the Crypto category page, the time interval breakdown section (showing total market counts by interval) is not left-aligned with the crypto asset rows below it * Each crypto row displays a coin logo (BTC, ETH, XRP, SOL, ADA, DOGE, AVAX, etc.) — the time interval list should align to the same left edge as these logos * Screenshot confirms the layout: filter section at top, followed by crypt …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0108"></a>
### SRC-FAIL-0108 · [Web][Phase2]All page content should have consistent left and right alignment

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1028–L1041](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1028>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web][Phase2]All page content should have consistent left and right alignment（标题）
- 处置/推断：空模板仅有对齐标题，无可观察事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0109"></a>
### SRC-FAIL-0109 · [Web] Spacing between chart and top markets section should be 24px

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1043–L1056](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1043>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Spacing between chart and top markets section should be 24px（标题）
- 处置/推断：空模板仅规定 24px 间距。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0110"></a>
### SRC-FAIL-0110 · [Web] "Get started with Alpha" CTA button — tighten up button styling

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1058–L1062](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1058>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：This needs to be tightened up in terms of spacing
- 处置/推断：只有 tighten spacing 的主观判断。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0111"></a>
### SRC-FAIL-0111 · [Web] Top markets list — align items to 20px page margin

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1064–L1077](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1064>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Top markets list — align items to 20px page margin（标题）
- 处置/推断：空模板仅规定 20px 页边距。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0112"></a>
### SRC-FAIL-0112 · [Web] All page content should have consistent left and right alignment

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1079–L1092](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1079>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：—。
- 依据摘录：[Web] All page content should have consistent left and right alignment（标题）
- 处置/推断：同一对齐标题与空模板；摘要级重复，Phase2 范围待确认。
- 归并目标：[SRC-FAIL-0108](#src-fail-0108)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0113"></a>
### SRC-FAIL-0113 · [Web] Logo size too small — align with lobby

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1094–L1100](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1094>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：The logo displayed on the web is too small and should be aligned in size with how it appears on the lobby page. * Reported as a visual inconsistency between the logo size on the current page vs. the lobby * Screenshot attached shows the Verify Email Address screen (OTP input) — the logo size issue appears to be present across web screens
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0114"></a>
### SRC-FAIL-0114 · [Web] N1 and N2 campaign banner cards — button component not consistent; should match N1 button style across all card banners

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1102–L1109](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1102>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The N1 and N2 campaign banner cards on web are not using the same button component. All card banners should use a consistent button size and style — follow the N1 button as the reference. * Affected cards observed in screenshot: "Weekly Trading Streak" card (with "See campaign" / "Trade now" CTAs) and a Campaign Pick card ("Will the Sunday Night Football game go to overtime?" with "See campaign" / "Share my pick" CTAs) * Button component inconsistency spans both N1 and N2 banner card types * All card banners should standardise to the same butto …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0115"></a>
### SRC-FAIL-0115 · [Web] Featured card — left panel and chart area width proportions off from Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1111–L1115](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1111>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Featured card 的左侧面板（contract section）和右侧面板（chart area）的宽度比例与 Figma 定义不一致。Chart 区域占比过大，contract section 被挤压。
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0116"></a>
### SRC-FAIL-0116 · [Web] Market card — align vol + "+X more" label horizontally across cards

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1117–L1121](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1117>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：同一行的 market cards 上，`$vol` 和 `+X more markets` / `+X more outcomes` 标签应在同一垂直位置对齐，不应因 odds mode 或 contract 数量不同而错位。
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0117"></a>
### SRC-FAIL-0117 · [Web] Category page — fix card height inconsistency

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1123–L1127](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1123>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Category pages 上的 cards 应使用固定/一致的高度。当前 card 高度因内容不同而不一致，破坏了 grid 对齐。
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0118"></a>
### SRC-FAIL-0118 · [Web] Add 16px spacing between carousel cards

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1129–L1133](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1129>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Add 16px spacing between carousel cards（标题）
- 处置/推断：只有 16px 间距要求。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0119"></a>
### SRC-FAIL-0119 · [Web] Side menus should be lower to align with page titles

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：间距 / 布局 / 对齐 (36 条)。
- 路径与定位：[原文 L1135–L1139](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1135>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Side menus should be lower to align with page titles（标题）
- 处置/推断：只要求侧栏向下移动，没有明确阅读损害。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0120"></a>
### SRC-FAIL-0120 · [Web] Sort and filter modal — confirm chip component is used for filter options

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1145–L1153](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1145>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Confirm whether the Sort &amp; Filter modal sheet is using the correct chip component from the Design System for its filter option selectors. * The modal contains three filter sections: Sort (Default, Highest to lowest, Closest expiry first), Type (All, Bonus, Boost), and Markets (All markets, Pro Baseball, Tennis) * Selected options show a checkmark; "Apply" CTA uses OG brand salmon/orange colour; "Reset" is secondary * Question raised is whether the chip component used for each filter option aligns with the DS chip component spec * Screenshot att …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0121"></a>
### SRC-FAIL-0121 · [App/Web] Event detail pages — update filter chip and dropdown to use global DS components

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1155–L1163](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1155>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Update the filter chip and dropdown components on event detail pages to use the global Design System "filter chip" and "dropdown" components — replacing any custom/legacy implementations currently in use. * Applies to event detail pages on the OG App * The Game Lines tab (e.g. "Winner" market for NFL matchups) and Player Props tab (e.g. "Anytime Goal Scorer" goals category with player outcome rows) are visible in the reference screenshots, showing the current filter chip / sub-tab UX * Sub-tabs such as Full game / 1st half / 2nd half under "Spr …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0122"></a>
### SRC-FAIL-0122 · [Web] Player pages — "View more" CTA should use secondary button style

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1165–L1172](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1165>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The "View more" CTA on the Player pages stats section (Recent Games table) should use the secondary button style per Figma spec. Currently it does not match the design library component. * Figma reference: [ * The screenshot shows the Recent Games stats table on a player page (last 5 games with TD, PASS, RUSH, REC, CMP, ATT, INT columns), with the "View more" CTA button visible at the bottom of the table — the button style does not match the secondary button component in the Figma design spec. * Additionally, this ticket should be attached to t …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0123"></a>
### SRC-FAIL-0123 · [Web] Perps filter chips — should use same component as other pages (e.g. Sports)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1174–L1181](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1174>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The filter chips on the Perps page (Trending, Top Gainers, Top Losers) are not using the same component as equivalent filter chips on other pages such as Sports. They should be consistent across the platform. * The Perps page has a set of filter tabs — Trending (active), Top Gainers, Top Losers — as well as a left sidebar (All / Stocks / Crypto) * The filter chip component used here visually differs from the standardised chip component used on Sports and other category pages * All filter chips across the platform should use the same design syst …（摘录，见原文）
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0124"></a>
### SRC-FAIL-0124 · [Web] Perps position detail — TPSL info should use underlined text with tooltip (same as Margin and Leverage), not an info icon

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1183–L1191](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1183>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)、[UIK-R007](rules/UIK-R007.md)。
- 依据摘录：The TP/SL (Take Profit / Stop Loss) info in the Perps position detail view currently uses an info icon (ⓘ) to surface the tooltip. This should instead use the same underlined text hover interaction used for Margin and Leverage on the same page — for visual and interaction consistency. * The current implementation shows an ⓘ icon next to the TPSL label * Margin and Leverage already use an underlined text style that triggers a tooltip on hover * TPSL should adopt the same pattern — underlined label text that shows a tooltip on hover, no info icon …（摘录，见原文）
- 处置/推断：提取页面/弹层上下文、返回路径与导航可理解性审查；不规定每页必须返回键、某筛选项必现或悬停为唯一说明方式。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0125"></a>
### SRC-FAIL-0125 · [Web] Update top navigation to use new DS component

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1193–L1201](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1193>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the OG web top navigation to use the new top navigation component from the Design System library. * The current web top navigation does not use the updated DS component * Reference Figma: [ * Screenshot context: current nav shows OG.COM logo, search bar, "✦ Get started with Alpha" CTA, Trade Slip button (with badge), Sign up / Log in button, hamburger menu, and a category nav bar (Trending, LIVE indicator, Sports, Crypto, Financials, Commodities, Economics, Politics, Tech, Culture, Climate) * The new DS component should replace the exist …（摘录，见原文）
- 处置/推断：仅替换最新版组件工作项，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0126"></a>
### SRC-FAIL-0126 · [Web] Limit order — "Order rejected" screen should use latest UI design

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1203–L1211](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1203>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the "Order rejected" result screen in the web limit order flow to match the latest UI design per Figma. * Currently the order rejected screen uses an outdated/legacy design * Target design: [ * Screenshot shows the current state: red ✕ icon, "You weren't charged for this order" message, and OK button — layout/styling does not match the latest Figma spec * Observed on the web limit order flow (e.g. "Zac Taylor Yes" position on Pro Football Coach of the Year 2026-27 event page)
- 处置/推断：只称 legacy，无有效新版对照。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0127"></a>
### SRC-FAIL-0127 · [Web] Filter chip components style fix. Follow figma reference

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：组件一致性 (Design System) (8 条)。
- 路径与定位：[原文 L1213–L1217](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1213>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Filter chip components style fix. Follow figma reference（标题）
- 处置/推断：只有“follow figma”，无有效链接或具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0128"></a>
### SRC-FAIL-0128 · [Web] Futures contract chart — team/outcome labels not appearing on chart

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1223–L1231](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1223>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D008](rules/UIK-D008.md)。
- 依据摘录：Chart labels are not appearing on the futures contract probability chart. Even for futures contracts, team/outcome labels should be displayed on the chart lines. * Reported on the NFL Champion 2026-2027 contract: [ * The chart shows probability lines for multiple outcomes (e.g. Buffalo 15%, Los Angeles 15%, San Francisco 13%, Kansas City 10%) but the labels for each line are missing * Screenshot confirms the issue: four probability lines are plotted over time with "All" range selected, total volume $6,886,658 — but no team labels appear on the  …（摘录，见原文）
- 处置/推断：提取图表系列或注释的归属无法辨认/误绑定；缺少内联标签不等于缺陷，可由图例或交互提供等效信息；不核验数据计算。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0129"></a>
### SRC-FAIL-0129 · [Web] Recurring crypto chart — horizontal line appears before dot; target label still mispositioned

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1233–L1241](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1233>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Two visual bugs on the recurring crypto chart (Web): 1\. \*\*Horizontal line before dot\*\* — there is always a horizontal line rendered before the price dot. The dot should move directly without this leading line artefact. 2. \*\*Target label mispositioned\*\* — the target label is still incorrectly positioned/appearing on the chart despite a prior fix attempt. * Observed on the BTC 15 min recurring crypto contract (confirmed via screenshot comparing OG.COM vs Kalshi for the Sep 24 BTC contract, target $84,179.06). * Screenshot shows OG displa …（摘录，见原文）
- 处置/推断：价格线前水平线可能是合法阶梯/采样表达；目标标签位置也未说明预期锚点，需原图及图表规格。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0130"></a>
### SRC-FAIL-0130 · [Web] Contract card — OG.com watermark overflowing/clipping out of card bounds

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1243–L1251](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1243>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D009](rules/UIK-D009.md)。
- 依据摘录：The OG.com watermark on contract cards is hitting overflow issues — it is clipping or extending outside the card boundaries rather than staying contained within the card area. * Reported on the OG.com prediction market contract cards (e.g. "Will the Clarity Act Become Law?" Politics category contract card) * The watermark (logo) is overflowing/not constrained within the card bounds * Screenshot shows a multi-outcome contract card with a line chart; the watermark overflow is visible on the chart area of the card * Platform not specified — filing …（摘录，见原文）
- 处置/推断：提取明确要求包含在容器内的装饰层越界；须确认装饰边界合同，阴影、外伸焦点环和有意叠层不在此规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0131"></a>
### SRC-FAIL-0131 · [Web] Crypto contract chart — +/- X.XX% change label appears next to Target line instead of current price line

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1253–L1262](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1253>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D008](rules/UIK-D008.md)。
- 依据摘录：The +/- X.XX% price change label is incorrectly positioned next to the black "Target" line on the crypto contract chart. It should appear next to the current price line — placing it on the Target line is confusing to readers. * Affects both App and Web * The black Target line should display only the target price value (e.g. $81,570.62), with no % change label * The current price line should display the current price AND the +/- X.XX% change indicator (e.g. $81,625.52 +0.067%) * Related ticket &lt;custom data-type="smartlink" data-id="id-0"&gt; covers …（摘录，见原文）
- 处置/推断：提取图表系列或注释的归属无法辨认/误绑定；缺少内联标签不等于缺陷，可由图例或交互提供等效信息；不核验数据计算。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0132"></a>
### SRC-FAIL-0132 · [Web] Chart legend — improve wrapping logic to prevent clashing with OG logo

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1264–L1272](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1264>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：Improve the wrapping logic for the chart legend, which is currently clashing with the OG logo. * The legend on the win probability / line chart overlaps or conflicts with the OG logo placement * Seen on a prediction market card (e.g. CFB National Champion 2026-27 — Sports · College Football), where the chart tracks probability shifts for multiple outcomes (Notre Dame, Ohio State, Texas) from roughly June through August * The chart displays volatile probability swings (\~10–22%) across 3 tracked teams with the legend labels crowding the logo are …（摘录，见原文）
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0133"></a>
### SRC-FAIL-0133 · [Web] Play-by-play feed — add fade effect

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1274–L1281](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1274>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R011](rules/UIK-R011.md)。
- 依据摘录：Add a fade effect to the play-by-play feed on the live sports contract/event detail page on web, as per the Figma design. * The play-by-play section currently lacks a fade effect; the Figma spec shows a fade/gradient treatment at the edges or bottom of the feed * Reference Figma: [ * Screenshot shows the live play-by-play feed for a Pro Baseball game (LAA @ BAL) — team badges (LAA/BAL) with play events and real-time probability sparkline charts are visible; the fade effect is absent in the current implementation
- 处置/推断：提取滚动边缘渐隐是否正确表达内容方向的审查；不要求增加渐隐，不固定顶/底，不把有意裁切自动判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0134"></a>
### SRC-FAIL-0134 · [Web] Play-by-play feed — fade effect should be at the top, not the bottom

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1283–L1291](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1283>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R011](rules/UIK-R011.md)。
- 依据摘录：The fade effect on the play-by-play feed is applied at the bottom, but it should be at the top. Since the most recent play is at the bottom, the top of the feed shows older entries — so the fade should appear at the top to indicate older content is cut off, not the bottom. * Reported on the live event card (Pro Baseball: Houston @ New York Y, Mid 4th inning) * The feed shows events like Daulton Varsho home run and Jose Altuve fly-out, with the most recent entry at the bottom * Fade gradient is currently visible at the bottom of the play-by-play …（摘录，见原文）
- 处置/推断：提取滚动边缘渐隐是否正确表达内容方向的审查；不要求增加渐隐，不固定顶/底，不把有意裁切自动判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0135"></a>
### SRC-FAIL-0135 · [Web] Featured card — restore OG.COM watermark on chart area (matches + futures)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：图表 / 数据可视化样式 (8 条)。
- 路径与定位：[原文 L1293–L1297](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1293>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Featured card 的 chart area 上应显示 OG.COM 水印（按 Figma），目前 staging 上水印缺失。适用于 match 和 futures 两种变体。
- 处置/推断：品牌水印属于装饰要求，不等价于信息缺失。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0136"></a>
### SRC-FAIL-0136 · [Web] Player pages — add loading placeholder for data points in player cards (initial load and player switch)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：加载态 / 空状态 (3 条)。
- 路径与定位：[原文 L1303–L1309](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1303>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R006](rules/UIK-R006.md)。
- 依据摘录：Implement a skeleton/placeholder loading state for data points in player cards on the web player pages, so that: 1. On initial load, data point areas show a loading placeholder instead of an empty space. 2. When the user switches to a second player, the same placeholder is shown to indicate data is updating. * The placeholder should be re-usable across both the initial page load and the player-switch transition. * Screenshots show the Caleb Williams player page (NFL QB #18, Chicago Bears) with the Markets tab displaying "Next game" (Bears vs Vi …（摘录，见原文）
- 处置/推断：提取加载、空内容或暂不可操作状态的可感知说明；不强制某种骨架、进度条或文案，不推断业务可用性条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0137"></a>
### SRC-FAIL-0137 · [Web] Player pages — error state should use icon, not illustration (prohibited)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：加载态 / 空状态 (3 条)。
- 路径与定位：[原文 L1311–L1319](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1311>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Update the error state on Web player pages to use an icon instead of an illustration. Illustrations are now prohibited across the platform — all error and empty states must use the icon variant only (per design system guidelines). * The error state on player detail pages currently renders an illustration; this must be replaced with the icon version (circular \`!\` icon style, as shown on the iOS reference) * The same fix should apply to any other error state on player pages that still uses an illustration * Design reference provided by reporter …（摘录，见原文）
- 处置/推断：禁插画为产品政策，且与更新插画要求冲突。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0138"></a>
### SRC-FAIL-0138 · [Web] Chat — missing empty state

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：加载态 / 空状态 (3 条)。
- 路径与定位：[原文 L1321–L1328](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1321>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R006](rules/UIK-R006.md)。
- 依据摘录：The Chat section on the event detail page is missing an empty state — when there are no messages, nothing is shown to the user where content is expected. * Affects the Chat collapsible section visible on event detail pages (e.g. Over/Under markets, sports events) * No empty state UI (illustration, copy, or placeholder) is displayed when the chat has no messages * Other collapsible sections on the same page (Timeline, How It Works) appear to handle their states correctly
- 处置/推断：提取加载、空内容或暂不可操作状态的可感知说明；不强制某种骨架、进度条或文案，不推断业务可用性条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0139"></a>
### SRC-FAIL-0139 · [Web] Remove hover over bounce effect on LIVE and Section titles

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：交互效果 (2 条)。
- 路径与定位：[原文 L1334–L1338](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1334>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Remove hover over bounce effect on LIVE and Section titles（标题）
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0140"></a>
### SRC-FAIL-0140 · [Web] Nav — persist LIVE red-dot on tab load (don't flicker)

- 原 ticket ID：未提供；原父分组/epic：`OG-9709`；原章节：交互效果 (2 条)。
- 路径与定位：[原文 L1340–L1344](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1340>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R008](rules/UIK-R008.md)。
- 依据摘录：加载新页面或 tab 时，LIVE 旁的红点不应闪烁消失再出现，应持续保持显示。当前 staging 上在页面加载过程中红点会消失又重新出现。
- 处置/推断：提取状态变化中控件位置、非状态驱动标识和动效连续性审查；数据驱动变化与必要重排是正常例外，不设动效时长或位移阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0141"></a>
### SRC-FAIL-0141 · [Web] error copy should use danger-bold typography

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：字体/排版 (3 条)。
- 路径与定位：[原文 L1354–L1358](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1354>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The error copy in the trade slip should use the `danger-bold` typography token.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0142"></a>
### SRC-FAIL-0142 · [Web] font style incorrect; should use heading2

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：字体/排版 (3 条)。
- 路径与定位：[原文 L1360–L1364](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1360>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Font style on Web player pages should use `heading2` typography style per Figma spec. Affects player profile card.
- 处置/推断：仅规定 heading2，没有层级问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0143"></a>
### SRC-FAIL-0143 · [Web] border line should be above expiry row; font weight heavier than Figma spec (450 16px)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：字体/排版 (3 条)。
- 路径与定位：[原文 L1366–L1370](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1366>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R001](rules/UIK-R001.md)、[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Two issues: border line position should be above Expiry row; font weight across trade slip appears heavier than Figma spec (should be 450 weight, 16px).
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0144"></a>
### SRC-FAIL-0144 · [Web] Trade slip — "+" icon next to balance should be removed (align with app)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：图标 (5 条)。
- 路径与定位：[原文 L1376–L1380](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1376>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Remove the "+" icon next to balance on web trade slip. App does not show this icon.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0145"></a>
### SRC-FAIL-0145 · [Web] Trade slip (Parlay) — exit parlay icon incorrect

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：图标 (5 条)。
- 路径与定位：[原文 L1382–L1386](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1382>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The exit parlay icon on the web trade slip is incorrect and does not match the design spec.
- 处置/推断：只说图标 incorrect，缺具体形态和语义。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0146"></a>
### SRC-FAIL-0146 · [Web] Trade slip — delete button icon incorrect in mobile view (should be trash can icon)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：图标 (5 条)。
- 路径与定位：[原文 L1388–L1392](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1388>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Delete button icon changed to incorrect icon in mobile view. Should remain trash can icon.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0147"></a>
### SRC-FAIL-0147 · [Web] Limit order — order type adjustment button using outdated icon

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：图标 (5 条)。
- 路径与定位：[原文 L1394–L1398](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1394>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：The order type adjustment button in limit order UI is using an outdated icon.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0148"></a>
### SRC-FAIL-0148 · [Web] Limit order — back navigation icon should be arrow left, not chevron

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：图标 (5 条)。
- 路径与定位：[原文 L1400–L1404](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1400>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Back navigation icon uses chevron but should use arrow left.
- 处置/推断：箭头与 chevron 取舍无导航损害依据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0149"></a>
### SRC-FAIL-0149 · [Web] Trade slip (Parlay) — exit parlay hover state missing background colour

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1410–L1414](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1410>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The exit parlay hover state is missing its background colour. May be a system colour token issue.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0150"></a>
### SRC-FAIL-0150 · [Web] Trade slip — error state amount should remain content/primary colour, not red

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1416–L1420](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1416>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：In error state, bet amount is incorrectly displayed in red. Should remain content/primary colour — only the error message should use red.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0151"></a>
### SRC-FAIL-0151 · [Web] Trade slip — error copy mismatch and button should remain primary (not red) in error state

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1422–L1426](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1422>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Two issues: (1) Error message copy doesn't match app; (2) CTA button renders red in error state but should remain primary style.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0152"></a>
### SRC-FAIL-0152 · [Web] Trade slip (Parlay) — remove background colour from event container

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1428–L1432](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1428>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The event container in parlay trade slip has a background colour that should not be present per design spec.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0153"></a>
### SRC-FAIL-0153 · [Web] Limit order — "Explore markets" CTA incorrect colour; empty state text & icon colour incorrect

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1434–L1438](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1434>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Three colour issues: CTA button, empty state text, and icon colours are all incorrect per DS spec.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0154"></a>
### SRC-FAIL-0154 · [Web] Player pages — jersey graphic missing, background colour missing, gradient should be removed from match card

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1440–L1444](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1440>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R005](rules/UIK-R005.md)。
- 依据摘录：Three visual issues: (1) Jersey graphic not rendering; (2) Background colour missing; (3) Gradient should be removed from match card.
- 处置/推断：提取缺图/无图情况下的中性替代与身份连续性；不规定必须有头像、默认运动图标或缩写算法，不采纳实体分类映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0155"></a>
### SRC-FAIL-0155 · [Web] Player pages — player card background colour missing (should use bg/surface/primary)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1446–L1450](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1446>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Player card background colour not rendering. Should use `bg/surface/primary` token.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0156"></a>
### SRC-FAIL-0156 · [Web] Trade slip result screen — unwanted white gradient overlay

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1452–L1456](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1452>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：White gradient appears on trade slip result screen that is not part of the design.
- 处置/推断：多余白色渐变没有说明遮挡或可读性损害；不能直接归入遮挡。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0157"></a>
### SRC-FAIL-0157 · [Web] Player pages — section title colour should use content/secondary (Stats, Info, Recent Games, Career, Glossary)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：颜色/主题 (9 条)。
- 路径与定位：[原文 L1458–L1462](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1458>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Section title colour is incorrect. Should use `content/secondary` token. Applies to all sub-sections.
- 处置/推断：指定颜色 token 不等价于层级问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0158"></a>
### SRC-FAIL-0158 · [Web] Trade slip (Parlay) — parlay icon missing outline/border

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：边框/圆角 (6 条)。
- 路径与定位：[原文 L1468–L1472](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1468>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Parlay icon missing its outer border/outline per Figma design.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0159"></a>
### SRC-FAIL-0159 · [Web] Trade slip — card corner radius should be 16px

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：边框/圆角 (6 条)。
- 路径与定位：[原文 L1474–L1478](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1474>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Card corner radius is incorrect, should be 16px.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0160"></a>
### SRC-FAIL-0160 · [Web] Limit order trade slip — apply conditional border logic to event image

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：边框/圆角 (6 条)。
- 路径与定位：[原文 L1480–L1484](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1480>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：No border for sports/object images; border for profile photos. Trade slip event image doesn't follow this logic.
- 处置/推断：头像/物体/运动图片边框分支属产品变体；不能推广所有图片必须有或无边框。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0161"></a>
### SRC-FAIL-0161 · [Web] Player pages — info page table missing border

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：边框/圆角 (6 条)。
- 路径与定位：[原文 L1486–L1490](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1486>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Table border is absent on Info tab per Figma.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0162"></a>
### SRC-FAIL-0162 · [Web] Player pages — scrollable stats table missing border between first column and scrollable area

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：边框/圆角 (6 条)。
- 路径与定位：[原文 L1492–L1496](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1492>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Missing visual separator between sticky first column and scrollable stats area.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0163"></a>
### SRC-FAIL-0163 · [Web] Player pages — update chevron button to latest DS component; remove border from helmet/image icons on match card

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：边框/圆角 (6 条)。
- 路径与定位：[原文 L1498–L1502](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1498>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Two fixes: (1) Update chevron button to latest DS component; (2) Remove border from sports asset images on match card.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0164"></a>
### SRC-FAIL-0164 · [Web] Trade slip — padding should be 20px (currently larger)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1508–L1512](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1508>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Trade slip settings panel padding appears larger than the specified 20px.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0165"></a>
### SRC-FAIL-0165 · [Web] Trade slip — button padding mis-aligned with bottom sheet (should be 20px)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1514–L1518](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1514>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Button padding in trade slip doesn't match the 20px used by the rest of the bottom sheet.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0166"></a>
### SRC-FAIL-0166 · [Web] Trade slip — buttons should be fit width with 8px padding (not large gaps)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1520–L1524](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1520>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Quick-add buttons and CTA have large gaps instead of fit-width with 8px padding.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0167"></a>
### SRC-FAIL-0167 · [Web] Trade slip (Parlay) — close button overlaps content in mobile view

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1526–L1530](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1526>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：Close button overlaps content in mobile view parlay slip. Should stay on top nav.
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0168"></a>
### SRC-FAIL-0168 · [Web] Limit order modal — remove divider between CTA and content; fix bottom padding

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1532–L1536](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1532>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Remove divider between CTA buttons and modal content. Bottom padding larger than other modals.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0169"></a>
### SRC-FAIL-0169 · [Web] Limit order — trade/cash out button style misaligned with app; 24px padding missing between last table row and CTAs

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1538–L1542](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1538>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)、[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Button styles misaligned with app. Padding between last row and CTAs should be 24px.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0170"></a>
### SRC-FAIL-0170 · [Web] Limit order — quick input buttons should be fit width, not fixed width

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1544–L1548](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1544>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Quick input buttons (+$1, +$10, +$50, Max) should be fit width to scale naturally.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0171"></a>
### SRC-FAIL-0171 · [Web] Limit order — spacing between icon button and parlay icon should be 8px

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1550–L1554](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1550>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Gap between icon button and parlay icon is larger than the 8px spec.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0172"></a>
### SRC-FAIL-0172 · [Web] Player pages — market display not aligned with Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1556–L1560](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1556>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Market cards on player pages don't match Figma design. Market card layout, price button sizing/placement misaligned.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0173"></a>
### SRC-FAIL-0173 · [Web] Player pages — team chip and layout should not resize when switching between players

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1562–L1566](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1562>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R008](rules/UIK-R008.md)。
- 依据摘录：Team chip changes size when navigating between players. Should remain consistent.
- 处置/推断：提取状态变化中控件位置、非状态驱动标识和动效连续性审查；数据驱动变化与必要重排是正常例外，不设动效时长或位移阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0174"></a>
### SRC-FAIL-0174 · [Web] Player pages — Glossary items should be top-aligned, not center-aligned

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1568–L1572](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1568>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Glossary stat items are centre-aligned but should be top-aligned. Edge case: multi-line labels.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0175"></a>
### SRC-FAIL-0175 · [Web] Player pages — mobile view layout breaks during loading; chevron switcher shifts position

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1574–L1578](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1574>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R008](rules/UIK-R008.md)。
- 依据摘录：Chevron switcher moves during loading state. Should maintain stable position.
- 处置/推断：提取状态变化中控件位置、非状态驱动标识和动效连续性审查；数据驱动变化与必要重排是正常例外，不设动效时长或位移阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0176"></a>
### SRC-FAIL-0176 · [Web] Player & team pages — incorrect spacing on player card; align with Figma specs

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1580–L1584](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1580>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Spacing on player card is off on both player and team pages. Specific measurements provided in Figma redline.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0177"></a>
### SRC-FAIL-0177 · [Web] Player pages — splits table gap in mobile view; line should extend to screen edge

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：间距/布局 (14 条)。
- 路径与定位：[原文 L1586–L1590](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1586>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Gap on right edge of splits table. Divider/border line should extend to screen edge.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0178"></a>
### SRC-FAIL-0178 · [Web] Limit order — chip group component not updated to latest design (portfolio page)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：组件一致性 (DS) (3 条)。
- 路径与定位：[原文 L1596–L1600](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1596>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Chip group component on portfolio page uses outdated style. Should adopt new library component.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0179"></a>
### SRC-FAIL-0179 · [Web] Player pages — chip component not aligned with library (team chip, next game & futures chip tab)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：组件一致性 (DS) (3 条)。
- 路径与定位：[原文 L1602–L1606](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1602>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Team chip uses outdated style with orange outline. Next game &amp; futures chip tab also outdated.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0180"></a>
### SRC-FAIL-0180 · [Web] Player pages — empty state should follow DS (icon on top)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：组件一致性 (DS) (3 条)。
- 路径与定位：[原文 L1608–L1612](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1608>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录："No markets available" empty state doesn't follow DS. Icon should be on top per DS spec.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0181"></a>
### SRC-FAIL-0181 · [Web] Limit order — top nav visual is off; nav buttons not in the same style as the others

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：样式更新 (6 条)。
- 路径与定位：[原文 L1618–L1622](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1618>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Nav buttons styled differently from the rest of the platform.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0182"></a>
### SRC-FAIL-0182 · [Web] Limit order — button style incorrect after tablet breakpoint

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：样式更新 (6 条)。
- 路径与定位：[原文 L1624–L1628](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1624>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Button style incorrect at tablet breakpoint. Should use secondary small button style.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0183"></a>
### SRC-FAIL-0183 · [Web] Limit order error modal — switch to updated illustration

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：样式更新 (6 条)。
- 路径与定位：[原文 L1630–L1634](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1630>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录："Something went wrong" modal uses outdated illustration. Should use updated version.
- 处置/推断：更新插画为资源换版。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0184"></a>
### SRC-FAIL-0184 · [Web] Limit order — cash out result screen is legacy version

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：样式更新 (6 条)。
- 路径与定位：[原文 L1636–L1640](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1636>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Cash out result screen uses legacy layout. Should be updated to redesigned format.
- 处置/推断：仅旧结果屏换新版，缺具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0185"></a>
### SRC-FAIL-0185 · [Web] Limit order — pending order screen uses legacy design

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：样式更新 (6 条)。
- 路径与定位：[原文 L1642–L1646](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1642>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Pending order screen on web uses legacy design. Should match latest version like the app.
- 处置/推断：仅 pending 屏换新版，缺具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0186"></a>
### SRC-FAIL-0186 · [Web] Player pages — button style incorrect; should align with PROD

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：样式更新 (6 条)。
- 路径与定位：[原文 L1648–L1652](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1648>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Button component on Player pages is out of sync with PROD button styles.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0187"></a>
### SRC-FAIL-0187 · [Web] Trade slip — remove animation in new release

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：交互效果 (4 条)。
- 路径与定位：[原文 L1658–L1662](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1658>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Unwanted animation in the trade slip should be removed as part of the redesign.
- 处置/推断：仅本次发布移除动画的取舍，没有报告任务干扰。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0188"></a>
### SRC-FAIL-0188 · [Web] Trade slip — loading animation below input renders incorrectly

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：交互效果 (4 条)。
- 路径与定位：[原文 L1664–L1668](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1664>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Loading animation below wager input is visually broken during price update.
- 处置/推断：只说动画 broken，未说明无反馈、遮挡、闪烁还是资源失败。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0189"></a>
### SRC-FAIL-0189 · [Web] Limit order — apply production order book transition

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：交互效果 (4 条)。
- 路径与定位：[原文 L1670–L1674](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1670>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Order book navigation uses a different transition than production flow. Should match prod.
- 处置/推断：过渡必须与 production 相同只有产品基线诉求，无实际交互损害。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0190"></a>
### SRC-FAIL-0190 · [Web] Player pages — tab underline disappears on hover (should persist)

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：交互效果 (4 条)。
- 路径与定位：[原文 L1676–L1680](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1676>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D007](rules/UIK-D007.md)。
- 依据摘录：Active tab underline disappears on hover. Should remain visible.
- 处置/推断：提取已确认选中状态缺少或丢失可感知标识；不规定下划线、默认时间范围或特定颜色，需排除替代选中线索。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0191"></a>
### SRC-FAIL-0191 · [Web] Trade slip — missing loading state when fetching new price

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：加载态/空状态/通知 (5 条)。
- 路径与定位：[原文 L1686–L1690](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1686>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D006](rules/UIK-D006.md)。
- 依据摘录：Shows "Price unavailable. Edit your parlay." instead of loading indicator during price fetch.
- 处置/推断：提取未完成加载或退出过渡被错误表现为失败/空结果；不强制骨架屏，需同一请求和过渡时间线。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0192"></a>
### SRC-FAIL-0192 · [Web] Trade slip — "your trade slip is empty" screen briefly visible when closing

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：加载态/空状态/通知 (5 条)。
- 路径与定位：[原文 L1692–L1696](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1692>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D006](rules/UIK-D006.md)。
- 依据摘录：Empty state flashes during dismiss animation. Should transition directly.
- 处置/推断：提取未完成加载或退出过渡被错误表现为失败/空结果；不强制骨架屏，需同一请求和过渡时间线。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0193"></a>
### SRC-FAIL-0193 · [Web] Limit order trade slip — show loading skeleton instead of empty state

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：加载态/空状态/通知 (5 条)。
- 路径与定位：[原文 L1698–L1702](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1698>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D006](rules/UIK-D006.md)。
- 依据摘录：Show standard loading skeleton instead of empty state while content loads.
- 处置/推断：提取未完成加载或退出过渡被错误表现为失败/空结果；不强制骨架屏，需同一请求和过渡时间线。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0194"></a>
### SRC-FAIL-0194 · [Web] Notification styling — outdated; align with Figma library

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：加载态/空状态/通知 (5 条)。
- 路径与定位：[原文 L1704–L1708](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1704>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Add shadow to notification, remove border. Currently using outdated style on PROD.
- 处置/推断：通知阴影/边框取舍没有阅读或操作损害。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0195"></a>
### SRC-FAIL-0195 · [Web] Auth login — progress bar missing on first email step

- 原 ticket ID：未提供；原父分组/epic：`OG-11349`；原章节：加载态/空状态/通知 (5 条)。
- 路径与定位：[原文 L1710–L1714](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1710>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R006](rules/UIK-R006.md)。
- 依据摘录：Progress bar missing on first step of email login/registration flow. Only appears from Step 2 onwards.
- 处置/推断：提取加载、空内容或暂不可操作状态的可感知说明；不强制某种骨架、进度条或文案，不推断业务可用性条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0196"></a>
### SRC-FAIL-0196 · [Web][Responsive] Add bank account button got covered an half by the browser bottom bar

- 原 ticket ID：未提供；原父分组/epic：`OG-3403`；原章节：OG-3403: OG Web Navigation Enhancement Phase 1 (5 条)。
- 路径与定位：[原文 L1724–L1728](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1724>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D003](rules/UIK-D003.md)。
- 依据摘录：In the withdraw flow (Portfolio page → Withdraw button), the "Add bank account" button is covered halfway by the browser bottom bar — the button should be fully visible.
- 处置/推断：提取视口/浏览器栏导致必要操作无法完整到达的机制；普通滚动可到达、内部滚动和非固定 CTA 均可健康。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0197"></a>
### SRC-FAIL-0197 · [Web][Responsive][iOS&Android] missing characters for right team/player on mobile web

- 原 ticket ID：未提供；原父分组/epic：`OG-3403`；原章节：OG-3403: OG Web Navigation Enhancement Phase 1 (5 条)。
- 路径与定位：[原文 L1730–L1734](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1730>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D001](rules/UIK-D001.md)。
- 依据摘录：MMA tall card — right team/player text truncated/missing on mobile web; should show abbreviation or full name. Typography/truncation.
- 处置/推断：提取必要文字/内容被裁切后无法识别的风险；不采纳固定缩写长度、绝不截断或必须单行的产品方案。实际缺陷仍需核验全文替代入口和裁切意图。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0198"></a>
### SRC-FAIL-0198 · [Web][Social Column][Web & Responsive] LinkedIn shows incorrect

- 原 ticket ID：未提供；原父分组/epic：`OG-3403`；原章节：OG-3403: OG Web Navigation Enhancement Phase 1 (5 条)。
- 路径与定位：[原文 L1736–L1740](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1736>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：LinkedIn icon in the social column renders incorrectly on mobile web. Icon/asset fix.
- 处置/推断：图标 renders incorrectly 未说明失真、低清或身份错误。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0199"></a>
### SRC-FAIL-0199 · [Web][Responsive] Buy button extend over the bounder if long name

- 原 ticket ID：未提供；原父分组/epic：`OG-3403`；原章节：OG-3403: OG Web Navigation Enhancement Phase 1 (5 条)。
- 路径与定位：[原文 L1742–L1746](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1742>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：Buy button overflows the container when the team/player name is long; should keep the original button size. Responsive layout.
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0200"></a>
### SRC-FAIL-0200 · [Web][Responsive] Wrong position of the 'X more' and missing navigation mark in standard card for futures

- 原 ticket ID：未提供；原父分组/epic：`OG-3403`；原章节：OG-3403: OG Web Navigation Enhancement Phase 1 (5 条)。
- 路径与定位：[原文 L1748–L1752](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1748>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：'X more' label is at the left bottom corner instead of the right bottom, and the navigation mark is missing. Layout/alignment fix.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0201"></a>
### SRC-FAIL-0201 · [Web] Tooltip copy box is a bit smaller than Figma design

- 原 ticket ID：未提供；原父分组/epic：`OG-4632`；原章节：OG-4632: OG Funnel Optimization Phase 9 (1 条)。
- 路径与定位：[原文 L1756–L1760](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1756>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：On the phone verification screen of the onboarding flow, clicking the "Didn't Receive a Code?" tooltip shows a copy box that is smaller than the Figma design — the copy box size should be consistent with Figma.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0202"></a>
### SRC-FAIL-0202 · [Web][Player Page]Color of player's jersey number/position label  should be grey

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1764–L1768](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1764>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On the player page header section, the jersey number / position label currently renders white; it should be grey.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0203"></a>
### SRC-FAIL-0203 · [Web][Player Page - Stats tab]No color for "L" in Recent Games

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1770–L1774](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1770>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On the Stats tab's Recent Games section of a World Cup player page, the "L" (loss) marker has no color — Recent Games should render the same as Figma.
- 处置/推断：L 标记应有颜色，但未证明文字不可见或状态无法辨认。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0204"></a>
### SRC-FAIL-0204 · [Web][Player Page - Header section] Placeholder image should display when there's no headshot image

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1776–L1780](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1776>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R005](rules/UIK-R005.md)。
- 依据摘录：When a player has no headshot url in the API, the hero banner area should display the expected placeholder image; currently a different default headshot shows instead.
- 处置/推断：提取缺图/无图情况下的中性替代与身份连续性；不规定必须有头像、默认运动图标或缩写算法，不采纳实体分类映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0205"></a>
### SRC-FAIL-0205 · [Web][Player page] Icons in Career section should be displayed when there's no icon_url

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1782–L1786](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1782>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R005](rules/UIK-R005.md)。
- 依据摘录：In the Career section (Stats tab) on player pages, when a season has no `icon_url` the icon slot is empty — the abbreviation of `event_kind_display_name` should be displayed as an icon with a grey background.
- 处置/推断：提取缺图/无图情况下的中性替代与身份连续性；不规定必须有头像、默认运动图标或缩写算法，不采纳实体分类映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0206"></a>
### SRC-FAIL-0206 · [Web] Team/Competition selector remains visible when switching to Info tab

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1788–L1792](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1788>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Selector should not remain visible on Info tab.
- 处置/推断：页签与球队选择器的专属信息结构。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0207"></a>
### SRC-FAIL-0207 · [Web] Only team name should display in NBA Hero banner

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1794–L1798](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1794>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：NBA Hero banner shows Event Kind + down arrow; expected only team name.
- 处置/推断：特定赛事/队伍字段展示范围。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0208"></a>
### SRC-FAIL-0208 · [Web] L1 team selector renders as interactive button instead of static pill for national-team-only players

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1800–L1804](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1800>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R009](rules/UIK-R009.md)。
- 依据摘录：Should render as static non-interactive bordered pill "National Team".
- 处置/推断：提取可操作性/选中性/滚动可能性的视觉暗示审查；不规定边框粗细、按钮并排、轮播预露或强制持续滚动。 只审查已确认不可切换时的交互暗示；国家队身份判断排除。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0209"></a>
### SRC-FAIL-0209 · [Web] Markets tab shows blank content instead of empty state when no club markets

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1806–L1810](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1806>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R006](rules/UIK-R006.md)。
- 依据摘录：Blank tab; expected "No markets available" empty state.
- 处置/推断：提取加载、空内容或暂不可操作状态的可感知说明；不强制某种骨架、进度条或文案，不推断业务可用性条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0210"></a>
### SRC-FAIL-0210 · [Web] A small red bar should display when score is 0

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1812–L1816](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1812>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Chart under Markets tab: no red bar when score is 0.
- 处置/推断：零比分仍画非零柱的业务图表编码要求，不能凭此判数据视觉正确性。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0211"></a>
### SRC-FAIL-0211 · [Web] Default soccer icon should display when there's no icon

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1818–L1822](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1818>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R005](rules/UIK-R005.md)。
- 依据摘录：Career section: when no icon_url, no icon; expected default soccer icon.
- 处置/推断：提取缺图/无图情况下的中性替代与身份连续性；不规定必须有头像、默认运动图标或缩写算法，不采纳实体分类映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0212"></a>
### SRC-FAIL-0212 · [Web] All event card UI should align with Soccer/WC event

- 原 ticket ID：未提供；原父分组/epic：`OG-7514`；原章节：OG-7514: Player Pages (11 条)。
- 路径与定位：[原文 L1824–L1828](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1824>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：NBA event cards still use new UI; expected alignment with Soccer/WC card styling.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0213"></a>
### SRC-FAIL-0213 · [Web][Position widget]Trade button will be covered when zooming out the browser window

- 原 ticket ID：未提供；原父分组/epic：`OG-7855`；原章节：OG-7855: Event Details Redesign - Chart, Live activities, Chat, Contract List & UI Alignment (4 条)。
- 路径与定位：[原文 L1832–L1836](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1832>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：On an event details page with an opened position, zooming out the browser window causes "You paid", "Current" and "Max payout" to cover the Trade button in the Positions widget. The widget should display correctly.
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0214"></a>
### SRC-FAIL-0214 · [Web][Match Chart] Loading state is not expected

- 原 ticket ID：未提供；原父分组/epic：`OG-7855`；原章节：OG-7855: Event Details Redesign - Chart, Live activities, Chat, Contract List & UI Alignment (4 条)。
- 路径与定位：[原文 L1838–L1842](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1838>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On a match event details page, selecting a timeframe and refreshing shows a loading state that doesn't match Figma: expected a dashed horizontal line at chart mid-height (skeleton) with no axis ticks; actual shows a loading icon and no dashed line.
- 处置/推断：spinner 换虚线骨架是加载形态取舍。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0215"></a>
### SRC-FAIL-0215 · [Web][Recurring Chart] Remove price label on endpoint and hover state

- 原 ticket ID：未提供；原父分组/epic：`OG-7855`；原章节：OG-7855: Event Details Redesign - Chart, Live activities, Chat, Contract List & UI Alignment (4 条)。
- 路径与定位：[原文 L1844–L1848](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1844>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On recurring event details charts, no price label should appear at the right of the chart endpoint, nor on hover; currently a price label displays in both states.
- 处置/推断：端点/悬停价格是否应出现是图表设计取舍，与 128 的身份识别不是同一问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0216"></a>
### SRC-FAIL-0216 · [Web] Event Details UI alignment, padding & sizing pass (July 2 Release)

- 原 ticket ID：未提供；原父分组/epic：`OG-7855`；原章节：OG-7855: Event Details Redesign - Chart, Live activities, Chat, Contract List & UI Alignment (4 条)。
- 路径与定位：[原文 L1850–L1854](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1850>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Housekeeping UI pass: align spacing/padding, adjust font sizes and logo sizing. Explicitly visual-only — no behavioural change.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0217"></a>
### SRC-FAIL-0217 · [Web] Color palette refresh

- 原 ticket ID：未提供；原父分组/epic：`OG-7869`；原章节：OG-7869: Design System: Update OG Branded Color Palette (1 条)。
- 路径与定位：[原文 L1858–L1862](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1858>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：Web-side container for the brand team's color-token updates. Once the design-system tokens are updated on Web, every consumer should reflect the new color values without per-route overrides, and brand orange CTAs/accents must remain readable against the new palette (no "Halloween effect"). Any Web surface where the token-level change is not visually correct should be captured as a follow-up rather than patched with a hard-coded color. Out of scope: marketing site / logged-out homepage, component-level re-skin beyond the named tokens.
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。 只审查主题可读性；改色范围、token 发布与营销页排除项属于本产品合同。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0218"></a>
### SRC-FAIL-0218 · [web] Promos V3: Apply button size is bigger than prototype design 

- 原 ticket ID：未提供；原父分组/epic：`OG-7874`；原章节：OG-7874: OG Promo Center v3 — revamp & new display format (5 条)。
- 路径与定位：[原文 L1866–L1870](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1866>)；原状态：暂停（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：On Portfolio → Promos → My Rewards, the Apply button on coupon cards renders bigger than the prototype — button size and font size are bigger than the design.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0219"></a>
### SRC-FAIL-0219 · [Web] Bonus/Rebate coupon icon incorrect for "all markets" promo type

- 原 ticket ID：未提供；原父分组/epic：`OG-7874`；原章节：OG-7874: OG Promo Center v3 — revamp & new display format (5 条)。
- 路径与定位：[原文 L1872–L1876](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1872>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Active-tab cards show wrong icon (trophy/cup) instead of PRD-specified icon.
- 处置/推断：优惠类型对应专属图标的映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0220"></a>
### SRC-FAIL-0220 · [Web] Coupon card does not display correct icon for its market

- 原 ticket ID：未提供；原父分组/epic：`OG-7874`；原章节：OG-7874: OG Promo Center v3 — revamp & new display format (5 条)。
- 路径与定位：[原文 L1878–L1882](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1878>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：All cards show a generic gift icon instead of market-specific icon.
- 处置/推断：优惠适用市场对应专属图标的映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0221"></a>
### SRC-FAIL-0221 · [Web] Promo card amount/value text not displayed in orange colour

- 原 ticket ID：未提供；原父分组/epic：`OG-7874`；原章节：OG-7874: OG Promo Center v3 — revamp & new display format (5 条)。
- 路径与定位：[原文 L1884–L1888](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1884>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Amount/value text should be orange per design.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0222"></a>
### SRC-FAIL-0222 · [Web] Copy text color and coupon card background color are not align with design

- 原 ticket ID：未提供；原父分组/epic：`OG-7874`；原章节：OG-7874: OG Promo Center v3 — revamp & new display format (5 条)。
- 路径与定位：[原文 L1890–L1894](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1890>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Copy renders white and card bg black; expected correct colors per design.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0223"></a>
### SRC-FAIL-0223 · [Web] Trade slip UI alignment & polish

- 原 ticket ID：未提供；原父分组/epic：`OG-8893`；原章节：OG-8893: Trade slip & order result screen UI refresh (3 条)。
- 路径与定位：[原文 L1898–L1902](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1898>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Trade slip renders in the event-details right rail (386px) with the same "$X pays $Y" dynamic rule as App §5.1.1; align the slip UI and polish per PRD §5.2.1.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。 只审查布局，金额动态规则及固定侧栏宽度排除。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0224"></a>
### SRC-FAIL-0224 · [Web] Branded order-placement loading screen

- 原 ticket ID：未提供；原父分组/epic：`OG-8893`；原章节：OG-8893: Trade slip & order result screen UI refresh (3 条)。
- 路径与定位：[原文 L1904–L1908](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1904>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R006](rules/UIK-R006.md)。
- 依据摘录：Right-rail container swaps in-place to a branded loading state (unlike the App's full-bleed treatment). Phase 1/2 copy transition + animation specs frame per App §5.1.2.
- 处置/推断：提取加载、空内容或暂不可操作状态的可感知说明；不强制某种骨架、进度条或文案，不推断业务可用性条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0225"></a>
### SRC-FAIL-0225 · [Web] Not fully rendered the background color when the position closed

- 原 ticket ID：未提供；原父分组/epic：`OG-8893`；原章节：OG-8893: Trade slip & order result screen UI refresh (3 条)。
- 路径与定位：[原文 L1910–L1914](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1910>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：After cash-out, trade slip background color only renders half; expected full render.
- 处置/推断：背景半幅渲染，未说明有意分区还是缺陷；需原图和预期边界，不能套用“所有背景填满”。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0226"></a>
### SRC-FAIL-0226 · [Web] Fix icon rendering issues in lobby (tint + SVG support)

- 原 ticket ID：未提供；原父分组/epic：`OG-9051`；原章节：OG-9051: Fix icon rendering issues in lobby (tint + SVG support) (1 条)。
- 路径与定位：[原文 L1918–L1922](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1918>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Fix the OpenAI logo sizing issue on web — confirmed as web-only (sizing renders correctly on app, so no cross-platform fix needed).
- 处置/推断：logo sizing issue 未给原图、尺寸或保形问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0227"></a>
### SRC-FAIL-0227 · [Web] Smoother live-chart animation

- 原 ticket ID：未提供；原父分组/epic：`OG-9332`；原章节：OG-9332: Smoother live-chart animation to catch up with Kalshi (1 条)。
- 路径与定位：[原文 L1926–L1930](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1926>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Optimize live-chart animation smoothness on OG-web to match Kalshi's reference. Placeholder — specs to be verified and confirmed by PM before implementation.
- 处置/推断：来源明确为 placeholder 且规格待 PM 确认；不臆造帧率/响应时间。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0228"></a>
### SRC-FAIL-0228 · [Web][Order Book]Price color issue

- 原 ticket ID：未提供；原父分组/epic：`OG-9354`；原章节：OG-9354: Event details — order book (1 条)。
- 路径与定位：[原文 L1934–L1938](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1934>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：In the order book on the event details page, ask/bid prices render black; asks and their price should be red, bids and their price should be green.
- 处置/推断：买卖两侧红绿配色是领域/地域约定，不是通用 UI 规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0229"></a>
### SRC-FAIL-0229 · [web][Live tab/screen] display live icon and tab name is not capitalized for Live tab 

- 原 ticket ID：未提供；原父分组/epic：`OG-9656`；原章节：OG-9656: Lobby & Category Uplift (3 条)。
- 路径与定位：[原文 L1942–L1946](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1942>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On the top navigation bar of the OG LIVE tab page, the live icon should be removed and the tab name displayed as capitalized "Live".
- 处置/推断：大小写与去除 live 图标的要求，与 15/140/337 的范围/版本不明。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0230"></a>
### SRC-FAIL-0230 · [Web][Market card variants]Hide vol and parlay icon on market card when no value

- 原 ticket ID：未提供；原父分组/epic：`OG-9656`；原章节：OG-9656: Lobby & Category Uplift (3 条)。
- 路径与定位：[原文 L1948–L1952](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1948>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：When vol is not available it should be hidden (currently shows "$-"), and the parlay icon should be hidden on market cards.
- 处置/推断：金额缺失时隐藏以及功能图标开关属于产品数据/功能规则，缺少可独立 UI 损害。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0231"></a>
### SRC-FAIL-0231 · [web][Featured card] Spacing and typography not consistent with Figma design

- 原 ticket ID：未提供；原父分组/epic：`OG-9656`；原章节：OG-9656: Lobby & Category Uplift (3 条)。
- 路径与定位：[原文 L1954–L1958](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1954>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：On the Trending page's featured card there is font inconsistency and gap in spacing between modules — spacing and typography should be consistent with the Figma design.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0232"></a>
### SRC-FAIL-0232 · [web][perps][asset detail] chart timeline label color is inconsistent with Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-10270`；原章节：OG-10270: OG Perps (5 条)。
- 路径与定位：[原文 L1962–L1966](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1962>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On the perpetual asset detail page, the asset header, currency label and chart timeline label render solid black; colors should match Figma.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0233"></a>
### SRC-FAIL-0233 · [web][perps][asset detail] Live label from chart display black color

- 原 ticket ID：未提供；原父分组/epic：`OG-10270`；原章节：OG-10270: OG Perps (5 条)。
- 路径与定位：[原文 L1968–L1972](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1968>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On the BTC perpetual details page, the "Live" label on the chart timeline displays black; it should match the Figma color.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0234"></a>
### SRC-FAIL-0234 · [Web][Peps][Trading] The font color of the button should not turn white when hovering

- 原 ticket ID：未提供；原父分组/epic：`OG-10270`；原章节：OG-10270: OG Perps (5 条)。
- 路径与定位：[原文 L1974–L1978](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1974>)；原状态：Staging 已验证（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：In the perps order flow, the button font color turns white on hover; it should not change to white when hovering.
- 处置/推断：悬停白字本身合法，缺背景和可读性证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0235"></a>
### SRC-FAIL-0235 · [Web] Missing live chat icon for Crypto and missing live chat/share for Stock on asset detail

- 原 ticket ID：未提供；原父分组/epic：`OG-10270`；原章节：OG-10270: OG Perps (5 条)。
- 路径与定位：[原文 L1980–L1984](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1980>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On Crypto/Stock asset detail page: live chat icon missing for Crypto; live chat and share icons missing for Stock per Figma.
- 处置/推断：图标缺失可能是功能范围差异；无法确认入口是否应存在及替代入口。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0236"></a>
### SRC-FAIL-0236 · [Web] Gap too narrow between About description and Ask Alpha button on perps detail

- 原 ticket ID：未提供；原父分组/epic：`OG-10270`；原章节：OG-10270: OG Perps (5 条)。
- 路径与定位：[原文 L1986–L1990](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1986>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Gap between About description and Ask Alpha button too narrow vs Figma.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0237"></a>
### SRC-FAIL-0237 · [Web][Recurring Crypto][Reponsive] UI need to develop in mobile web

- 原 ticket ID：未提供；原父分组/epic：`OG-10568`；原章节：OG-10568: Event details pages - Crypto recurring contracts (4 条)。
- 路径与定位：[原文 L1994–L1998](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1994>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：On mobile web (Safari), the crypto details page has responsive UI issues: the chart filter exceeds the chart's edges, the "Below" CTA overlaps, and the overall visual effect looks cluttered — needs to be polished.
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0238"></a>
### SRC-FAIL-0238 · [Web][Recurring Crypto] Selected CTA UI change

- 原 ticket ID：未提供；原父分组/epic：`OG-10568`；原章节：OG-10568: Event details pages - Crypto recurring contracts (4 条)。
- 路径与定位：[原文 L2000–L2004](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2000>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On crypto event details, the selected "Above"/"Below" CTA background should match Figma and the text color should not change.
- 处置/推断：选中背景/文字规范无状态丢失证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0239"></a>
### SRC-FAIL-0239 · [Web][Recurring Crypto] Event ended UI issue

- 原 ticket ID：未提供；原父分组/epic：`OG-10568`；原章节：OG-10568: Event details pages - Crypto recurring contracts (4 条)。
- 路径与定位：[原文 L2006–L2010](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2006>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Event-ended state on the crypto details page has multiple visual issues: ended timer UI, popup title should be "Event ended", missing subtext "This market is now closed and is awaiting settlement.", "Go to open market" background should be orange, results should show in the outcome row (same as app), remove the "End" status below the event title, and the final price value should be grey once ended while the target value stays black.
- 处置/推断：终态文案、结果放置与颜色方案依赖事件状态定义和设计；没有通用违反事实，暂缓 UI 部分，排除结算判断。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0240"></a>
### SRC-FAIL-0240 · [Web] Chart color should be green when current price > target price in event details page

- 原 ticket ID：未提供；原父分组/epic：`OG-10568`；原章节：OG-10568: Event details pages - Crypto recurring contracts (4 条)。
- 路径与定位：[原文 L2012–L2016](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2012>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Chart color should be green when current price &gt; target price and red when less. Color rule fix.
- 处置/推断：当前价与目标价的比较决定红绿颜色，属于业务语义映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0241"></a>
### SRC-FAIL-0241 · [Web] Responsive UI

- 原 ticket ID：未提供；原父分组/epic：`OG-10709`；原章节：OG-10709: OG US - Perps & Margin Fiat Ramps (1 条)。
- 路径与定位：[原文 L2020–L2024](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2020>)；原状态：正在测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Responsive UI work for the Perps &amp; Margin Fiat Ramps flow (ticket description not provided).
- 处置/推断：只写 Responsive UI，缺少现象、视口、操作和期望。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0242"></a>
### SRC-FAIL-0242 · [Web][NFl-N2]inconsistent UI from figma/prd in Weekly Trading Streak page

- 原 ticket ID：未提供；原父分组/epic：`OG-10972`；原章节：OG-10972: OG - NFL N2 2-Trade Weekly Mission + Streaks (4 条)。
- 路径与定位：[原文 L2028–L2032](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2028>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The Weekly Trading Streak page UI is inconsistent with the Figma / PRD design.
- 处置/推断：只有整体“不符 Figma/PRD”，无具体可抽象现象。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0243"></a>
### SRC-FAIL-0243 · [Web][NFL-N2]Incorrect UI for user current period is week 1 & already with 1 streak

- 原 ticket ID：未提供；原父分组/epic：`OG-10972`；原章节：OG-10972: OG - NFL N2 2-Trade Weekly Mission + Streaks (4 条)。
- 路径与定位：[原文 L2034–L2038](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2034>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：When the current period is week 1 and the user already has 1 streak: no orange background should be shown for week 2, and the gift icon should show "Apply".
- 处置/推断：周次与连续达标条件决定奖励状态。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0244"></a>
### SRC-FAIL-0244 · [Web][NFL-N2]need to show the background gradient for user who has traded & settled in current week

- 原 ticket ID：未提供；原父分组/epic：`OG-10972`；原章节：OG-10972: OG - NFL N2 2-Trade Weekly Mission + Streaks (4 条)。
- 路径与定位：[原文 L2040–L2044](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2040>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Users who have traded and settled in the current week should see the background gradient on the N2 banner (NFL hub / Promo / Campaign landing); currently no background gradient is shown.
- 处置/推断：交易/结算达标条件决定渐变显示。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0245"></a>
### SRC-FAIL-0245 · [Web][NFL-N2]when user missed or did only 1 trade & settle in past weeks ,then need to show an empty ring without background gradient

- 原 ticket ID：未提供；原父分组/epic：`OG-10972`；原章节：OG-10972: OG - NFL N2 2-Trade Weekly Mission + Streaks (4 条)。
- 路径与定位：[原文 L2046–L2050](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2046>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：For weeks the user missed or only did 1 trade &amp; settle, the banner ring should show empty without a background gradient; currently the gradient still shows for those weeks.
- 处置/推断：历史交易次数和结算条件决定环形标记。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0246"></a>
### SRC-FAIL-0246 · [web][NFL hub][Stats][responsive] team name/icon and score are overlapped for standing list

- 原 ticket ID：未提供；原父分组/epic：`OG-11196`；原章节：OG-11196: NFL Hub — Core Development Epic (3 条)。
- 路径与定位：[原文 L2054–L2058](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2054>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：On the NFL page Stats tab, team name/icon and score overlap in the standing list (responsive layout issue).
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0247"></a>
### SRC-FAIL-0247 · [web][NFL hub] the background of Weekly Trading Streak Rewards display grey color under the Dark mode

- 原 ticket ID：未提供；原父分组/epic：`OG-11196`；原章节：OG-11196: NFL Hub — Core Development Epic (3 条)。
- 路径与定位：[原文 L2060–L2064](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2060>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R004](rules/UIK-R004.md)。
- 依据摘录：Under dark mode, the Weekly Trading Streak Rewards banner background renders grey; it should display black like other banner backgrounds.
- 处置/推断：提取不同主题/资源背景下的辨识与呈现一致性审查；不要求主题间相同颜色或每个背景随主题反转，单纯风格差异不能判缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0248"></a>
### SRC-FAIL-0248 · [web][nfl hub] the color of multiplier is black on Parlay from Featured tab

- 原 ticket ID：未提供；原父分组/epic：`OG-11196`；原章节：OG-11196: NFL Hub — Core Development Epic (3 条)。
- 路径与定位：[原文 L2066–L2070](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2066>)；原状态：待发布（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The parlay multiplier value on the NFL Featured tab renders black; the color should match the Figma design.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0249"></a>
### SRC-FAIL-0249 · [Web] Parlays: Motion design & color updates (Web)

- 原 ticket ID：未提供；原父分组/epic：`OG-12348`；原章节：OG-12348: Parlays - Motion design & Color Updates (1 条)。
- 路径与定位：[原文 L2074–L2078](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2074>)；原状态：功能测试中（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Implement the parlays button motion design (Lottie), the proposed entry-point change, and the associated color updates on Web. Blocked on design specs and the Lottie file from Design. To confirm: entry-point placement and which pages/breakpoints it appears on, animation trigger and loop behavior (on load / on hover / on click / idle loop), Lottie asset format and bundle-size budget (incl. fallback if the animation can't render), whether color updates are design-token changes or one-off values, and desktop vs mobile-web treatment. Ships independ …（摘录，见原文）
- 处置/推断：动效、入口、断点与资产均待设计确认；无法确定触发或受损行为。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0250"></a>
### SRC-FAIL-0250 · [Web] Home screen — platform component UI/UX updates

- 原 ticket ID：未提供；原父分组/epic：`OG-12464`；原章节：OG-12464: [App/Web] Platform Component UI/UX Updates — Home, Category & Event Details (6 条)。
- 路径与定位：[原文 L2082–L2086](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2082>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Style and placement updates to Home screen platform components. Style/layout only, no new features. Featured carousel: more compact header (event logo next to the event title and metadata), EK label next to the event date, truncate displayed metadata without changing the card height, parlay icon moves to the right next to "+X more markets". Market list: update category header font size/weight/type and add the EK logo next to it. Market card (sports): no event-level logo in the card header, no EK label (already on the category header above), par …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。 仅空间与内容适应审查；类别图标、标签和功能标志显示条件排除。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0251"></a>
### SRC-FAIL-0251 · [Web] Category screen — platform component UI/UX updates

- 原 ticket ID：未提供；原父分组/epic：`OG-12464`；原章节：OG-12464: [App/Web] Platform Component UI/UX Updates — Home, Category & Event Details (6 条)。
- 路径与定位：[原文 L2088–L2092](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2088>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Style and placement updates to Category screen platform components. Style/layout only, no new features. Market list (All): added H1 header "All Sports", Games/Futures chips below the header, "Build Parlay" entry point to the right of the chips (full-width button if the sport type has no chips), EK label added below the event title together with the LIVE tag / event date-time. Market list (category chip): H1 header updates dynamically with the selected sport, same chips/buttons, same market card with the EK label. Remark: skip the EK label on re …（摘录，见原文）
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。 仅空间与内容适应审查；类别、周期和功能入口分支排除。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0252"></a>
### SRC-FAIL-0252 · [Web] Event Details screen — platform component UI/UX updates

- 原 ticket ID：未提供；原父分组/epic：`OG-12464`；原章节：OG-12464: [App/Web] Platform Component UI/UX Updates — Home, Category & Event Details (6 条)。
- 路径与定位：[原文 L2094–L2098](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2094>)；原状态：待测试（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Style and placement updates to Event Details screen platform components. Style/layout only, no new features. Header and overall layout: segmented toggle for Chart / Stats / Chat, show the full event title (flows onto the next row if long), EK label and event date in the second row. Chart: updated timeframe chip styling and volume data added bottom-left. Market list: updated odds button style and "Show more" button, updated player prop alt-lines dropdown.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。 只提取长标题与区域布局审查，导航功能增改和数据字段加入不作为规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0253"></a>
### SRC-FAIL-0253 · [Web] Home screen — platform component UI/UX updates

- 原 ticket ID：未提供；原父分组/epic：`OG-12464`；原章节：OG-12464: [App/Web] Platform Component UI/UX Updates — Home, Category & Event Details (6 条)。
- 路径与定位：[原文 L2100–L2104](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2100>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：OG-12469；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Web sub-task of the Home screen platform component UI/UX updates. Scope: see parent OG-12469 (style/layout only, no new features).
- 处置/推断：同名子任务仅引用父项 OG-12469；归入父内容组，无法证明为同一 Jira。
- 归并目标：[SRC-FAIL-0250](#src-fail-0250)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0254"></a>
### SRC-FAIL-0254 · [Web] Category screen — platform component UI/UX updates

- 原 ticket ID：未提供；原父分组/epic：`OG-12464`；原章节：OG-12464: [App/Web] Platform Component UI/UX Updates — Home, Category & Event Details (6 条)。
- 路径与定位：[原文 L2106–L2110](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2106>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：OG-12470；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Web sub-task of the Category screen platform component UI/UX updates. Scope: see parent OG-12470 (style/layout only, no new features).
- 处置/推断：同名子任务仅引用父项 OG-12470；归入父内容组，无法证明为同一 Jira。
- 归并目标：[SRC-FAIL-0251](#src-fail-0251)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0255"></a>
### SRC-FAIL-0255 · [Web] Event Details screen — platform component UI/UX updates

- 原 ticket ID：未提供；原父分组/epic：`OG-12464`；原章节：OG-12464: [App/Web] Platform Component UI/UX Updates — Home, Category & Event Details (6 条)。
- 路径与定位：[原文 L2112–L2116](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2112>)；原状态：待办（仅来源元数据）。
- 正文关联 ID：OG-12471；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Web sub-task of the Event Details platform component UI/UX updates. Scope: see parent OG-12471 (style/layout only, no new features).
- 处置/推断：同名子任务仅引用父项 OG-12471；归入父内容组，无法证明为同一 Jira。
- 归并目标：[SRC-FAIL-0252](#src-fail-0252)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0256"></a>
### SRC-FAIL-0256 · [Web] Responsive UI

- 原 ticket ID：未提供；原父分组/epic：`OG-13468`；原章节：OG-13468: OG US - Fiat Withdrawal - PayPal (1 条)。
- 路径与定位：[原文 L2120–L2124](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2120>)；原状态：暂停（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Responsive UI work for the Fiat withdrawal (PayPal) flow (ticket description not provided).
- 处置/推断：只有 Responsive UI 工作项，缺少实际现象。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0257"></a>
### SRC-FAIL-0257 · [Web] Responsive UI

- 原 ticket ID：未提供；原父分组/epic：`OG-13470`；原章节：OG-13470: OG US - Fiat Withdrawal - Venmo (1 条)。
- 路径与定位：[原文 L2128–L2132](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2128>)；原状态：暂停（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Responsive UI work for the Fiat withdrawal (Venmo) flow (ticket description not provided).
- 处置/推断：只有 Responsive UI 工作项，缺少实际现象。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0258"></a>
### SRC-FAIL-0258 · [Web][Fiat] Responsive UI

- 原 ticket ID：未提供；原父分组/epic：`OG-1`；原章节：OG-1: Fiat Web - Day 1 (1 条)。
- 路径与定位：[原文 L2136–L2140](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2136>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Responsive UI work for the Fiat Web Day-1 flow (ticket description not provided).
- 处置/推断：只有 Responsive UI 工作项；已完成不补足证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0259"></a>
### SRC-FAIL-0259 · [Web][Portfolio][Responsive][IOS&Android] Portfolio label at top navigation is not fixed when a user enters og web

- 原 ticket ID：未提供；原父分组/epic：`OG-34`；原章节：OG-34: OG Web Fiat — Responsive/Auth (3 条)。
- 路径与定位：[原文 L2144–L2148](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2144>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Portfolio label at the top navigation is not fixed (sticky) when a user enters OG web; expected it to stay fixed like the Figma design.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0260"></a>
### SRC-FAIL-0260 · [Web][Top Navigation][Responsive] The user logout OG web the top nav bar isn't same as Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-34`；原章节：OG-34: OG Web Fiat — Responsive/Auth (3 条)。
- 路径与定位：[原文 L2150–L2154](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2150>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Top nav bar not the same as Figma — layout/visual mismatch on log out.
- 处置/推断：导航不符 Figma，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0261"></a>
### SRC-FAIL-0261 · [Web][March Madness onboarding reminder] The sign in page reminder is not matched with the figma

- 原 ticket ID：未提供；原父分组/epic：`OG-34`；原章节：OG-34: OG Web Fiat — Responsive/Auth (3 条)。
- 路径与定位：[原文 L2156–L2160](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2156>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Sign-in page reminder should match Figma (referral code excluded in Figma). Visual mismatch only.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0262"></a>
### SRC-FAIL-0262 · [Web][EDD] On cdc web, the font color of EDD banner is different from Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-102`；原章节：OG-102: OG Web KYC/Onboarding (3 条)。
- 路径与定位：[原文 L2164–L2168](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2164>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：EDD yellow banner font color does not match Figma — pure color fix.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0263"></a>
### SRC-FAIL-0263 · [Web] Auth portal and Web portal tab icon is incorrect

- 原 ticket ID：未提供；原父分组/epic：`OG-102`；原章节：OG-102: OG Web KYC/Onboarding (3 条)。
- 路径与定位：[原文 L2170–L2174](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2170>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Tab icons (favicon) on the auth portal and web portal are incorrect; should be the correct OG icon.
- 处置/推断：favicon incorrect 无原图或身份/呈现损害。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0264"></a>
### SRC-FAIL-0264 · [Web] Web Core Color Changes

- 原 ticket ID：未提供；原父分组/epic：`OG-102`；原章节：OG-102: OG Web KYC/Onboarding (3 条)。
- 路径与定位：[原文 L2176–L2180](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2176>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Brand/core color token changes (ticket description not provided).
- 处置/推断：仅品牌色更新标题，无 token 范围或实际问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0265"></a>
### SRC-FAIL-0265 · [Web][Fiat] Responsive UI

- 原 ticket ID：未提供；原父分组/epic：`OG-963`；原章节：OG-963: Fiat Deposit Top Up (2 条)。
- 路径与定位：[原文 L2184–L2188](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2184>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Responsive UI work for the Fiat deposit flow (ticket description not provided).
- 处置/推断：只有 Responsive UI 工作项，缺少实际现象。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0266"></a>
### SRC-FAIL-0266 · [Web][Fiat] Responsiveness - Button should be at the bottom

- 原 ticket ID：未提供；原父分组/epic：`OG-963`；原章节：OG-963: Fiat Deposit Top Up (2 条)。
- 路径与定位：[原文 L2190–L2194](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2190>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On deposit screens (debit card / Google Pay / Apple Pay / PayPal), the primary button should sit at the bottom of the page like other pages — responsive layout fix.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0267"></a>
### SRC-FAIL-0267 · [Web] Pre-typing - Keyboard open (Cursor Active, No Input)

- 原 ticket ID：未提供；原父分组/epic：`OG-1139`；原章节：OG-1139: Search/Typing (1 条)。
- 路径与定位：[原文 L2198–L2202](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2198>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Pre-typing state — keyboard open, cursor active, no input entered (ticket description not provided).
- 处置/推断：键盘打开且无输入是正常前置状态，不含违反事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0268"></a>
### SRC-FAIL-0268 · [Web][Dashboard] the text size is discrepancy with Figma design

- 原 ticket ID：未提供；原父分组/epic：`OG-1215`；原章节：OG-1215: Referral (4 条)。
- 路径与定位：[原文 L2206–L2210](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2206>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Referral dashboard "Refer-a-friend" tab — copy code / copy link text size doesn't match Figma. Typography fix.
- 处置/推断：字号不符 Figma，无阅读问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0269"></a>
### SRC-FAIL-0269 · [Web][Entry point] incorrect icon for Refer and get $100 label on User menu

- 原 ticket ID：未提供；原父分组/epic：`OG-1215`；原章节：OG-1215: Referral (4 条)。
- 路径与定位：[原文 L2212–L2216](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2212>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：User menu entry for "Refer and get $100" shows an incorrect icon vs Figma. Icon fix.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0270"></a>
### SRC-FAIL-0270 · [Web][Referral dashboard] error msg alignment when user enter the code that exceed maximum limits

- 原 ticket ID：未提供；原父分组/epic：`OG-1215`；原章节：OG-1215: Referral (4 条)。
- 路径与定位：[原文 L2218–L2222](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2218>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Error message alignment when the referral code exceeds the max usage limit — alignment/layout issue.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。 只审查已出现的错误消息布局；码使用次数与拒绝条件排除。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0271"></a>
### SRC-FAIL-0271 · [Web][Claim bonus tab] color inconsistency for 'Enter referral code' in input field

- 原 ticket ID：未提供；原父分组/epic：`OG-1215`；原章节：OG-1215: Referral (4 条)。
- 路径与定位：[原文 L2224–L2228](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2224>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：'Enter referral code' placeholder renders purple instead of the standard font color. Color fix.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0272"></a>
### SRC-FAIL-0272 · [Web][Homepage banner] incorrect button on Homepage banner

- 原 ticket ID：未提供；原父分组/epic：`OG-1821`；原章节：OG-1821: Super Bowl Campaign (4 条)。
- 路径与定位：[原文 L2232–L2236](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2232>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Super Bowl homepage banner shows incorrect button styling; should be a "Learn more"-style button per Figma.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0273"></a>
### SRC-FAIL-0273 · [Web][Coupon inventory] CTA text color is white in apply bonus modal

- 原 ticket ID：未提供；原父分组/epic：`OG-1821`；原章节：OG-1821: Super Bowl Campaign (4 条)。
- 路径与定位：[原文 L2238–L2242](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2238>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Apply-bonus modal CTA text is white but should be black. Color fix.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0274"></a>
### SRC-FAIL-0274 · [Web][Apply bonus modal] Title missing on the modal

- 原 ticket ID：未提供；原父分组/epic：`OG-1821`；原章节：OG-1821: Super Bowl Campaign (4 条)。
- 路径与定位：[原文 L2244–L2248](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2244>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R007](rules/UIK-R007.md)。
- 依据摘录：Apply Bonus modal is missing the 'Bonuses' title per Figma. Layout/element missing.
- 处置/推断：提取页面/弹层上下文、返回路径与导航可理解性审查；不规定每页必须返回键、某筛选项必现或悬停为唯一说明方式。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0275"></a>
### SRC-FAIL-0275 · [Web][Bonus header] All letters for 'Bonus' are capitalized on order input screen and open position history

- 原 ticket ID：未提供；原父分组/epic：`OG-1821`；原章节：OG-1821: Super Bowl Campaign (4 条)。
- 路径与定位：[原文 L2250–L2254](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2250>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：'Bonus' rendered all-caps; only the first letter should be capitalized. Typography/case styling.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0276"></a>
### SRC-FAIL-0276 · [Web][App] Size adjustment for event cards, team icons and web grid layout

- 原 ticket ID：未提供；原父分组/epic：`OG-3499 / OG-3991`；原章节：OG-3499 / OG-3991: Event Card Size Adjustment (2 条)。
- 路径与定位：[原文 L2258–L2262](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2258>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Same size/icon adjustments for the App; square team icons, reduced font sizes, reposition live scores.
- 处置/推断：尺寸/图标/位置为改版方案，无独立问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0277"></a>
### SRC-FAIL-0277 · [Web] Size adjustment for event cards, team icons and web grid layout

- 原 ticket ID：未提供；原父分组/epic：`OG-3499 / OG-3991`；原章节：OG-3499 / OG-3991: Event Card Size Adjustment (2 条)。
- 路径与定位：[原文 L2264–L2268](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2264>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Adjust sizing/positioning of event card components: square team icons beside abbreviations, reduced font sizes; featured card 10-col width, max 1440px.
- 处置/推断：列数/最大宽度是产品配置，无溢出或遮挡事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0278"></a>
### SRC-FAIL-0278 · [Web][MM Take-Over Screen] event cards become as wide as the page after switching L2 tab of the tournament

- 原 ticket ID：未提供；原父分组/epic：`OG-3554`；原章节：OG-3554: March Madness Tournament (2 条)。
- 路径与定位：[原文 L2272–L2276](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2272>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：After switching L2 tab on the Tournament, event cards break layout and span the full page width. Layout regression.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0279"></a>
### SRC-FAIL-0279 · [Web][Responsive] orange progress line missing between rounds

- 原 ticket ID：未提供；原父分组/epic：`OG-3554`；原章节：OG-3554: March Madness Tournament (2 条)。
- 路径与定位：[原文 L2278–L2282](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2278>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：March Hoops progress bar is missing the orange progress line between rounds. Visual/color fix.
- 处置/推断：专属阶段进度线缺失，但无状态/替代信息依据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0280"></a>
### SRC-FAIL-0280 · [Web] Loading state / send animation on OTP screens

- 原 ticket ID：未提供；原父分组/epic：`OG-3821`；原章节：OG-3821: OTP (1 条)。
- 路径与定位：[原文 L2286–L2290](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2286>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Loading state / send animation for OTP screens (ticket description not provided).
- 处置/推断：仅加载/发送动画标题，没有现象或要求。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0281"></a>
### SRC-FAIL-0281 · [Web] Update sign-up page checkbox color to match Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-3918`；原章节：OG-3918: Sign-up (1 条)。
- 路径与定位：[原文 L2294–L2298](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2294>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Checkbox color from orange to grey, with a grey backdrop, per the latest Figma.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0282"></a>
### SRC-FAIL-0282 · [Web] Motorsports page — NASCAR sport icon broken/missing

- 原 ticket ID：未提供；原父分组/epic：`OG-4089`；原章节：OG-4089: Motorsports (1 条)。
- 路径与定位：[原文 L2302–L2306](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2302>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R005](rules/UIK-R005.md)。
- 依据摘录：NASCAR sport icon shows a placeholder instead of the proper logo on the Motorsports page. Icon asset fix.
- 处置/推断：提取缺图/无图情况下的中性替代与身份连续性；不规定必须有头像、默认运动图标或缩写算法，不采纳实体分类映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0283"></a>
### SRC-FAIL-0283 · [Web][Details page][Responsive][Android] Trade button display in two line when name is too long

- 原 ticket ID：未提供；原父分组/epic：`OG-4219`；原章节：OG-4219: Event Details (2 条)。
- 路径与定位：[原文 L2310–L2314](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2310>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Trade CTA wraps to two lines when the team/player name is long; should stay on one line. Responsive typography.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0284"></a>
### SRC-FAIL-0284 · [Web][Details page] Inactive status of one color button should still keep one color

- 原 ticket ID：未提供；原父分组/epic：`OG-4219`；原章节：OG-4219: Event Details (2 条)。
- 路径与定位：[原文 L2316–L2320](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2316>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Inactive one-color buttons render in two colors; should keep a single color. Color/state styling.
- 处置/推断：单色/双色禁用样式是取舍，无语义误导证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0285"></a>
### SRC-FAIL-0285 · [Web] Green Banner On Select Deposit Method

- 原 ticket ID：未提供；原父分组/epic：`OG-4255`；原章节：OG-4255: Green Banner On Select Deposit Method (1 条)。
- 路径与定位：[原文 L2324–L2328](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2324>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Green banner display on the deposit method selection screen (no further description).
- 处置/推断：只有绿色横幅名称，不含实际/预期差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0286"></a>
### SRC-FAIL-0286 · [Web] Tiered Coupon Colour System

- 原 ticket ID：未提供；原父分组/epic：`OG-4277`；原章节：OG-4277: Tiered Coupon Colour System (1 条)。
- 路径与定位：[原文 L2332–L2336](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2332>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Update coupon colour display from denomination-specific to tier-based (Low/Medium/High/Premium). Tier mapping: Low ($1–$9), Medium ($10–$19), High ($20–$49), Premium ($50+). $20 coupons use "High" tier colour (same as $25); preserve existing fallback to $5 generic coupon palette when no BE colours defined.
- 处置/推断：金额区间到优惠等级的显式业务映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0287"></a>
### SRC-FAIL-0287 · [Web] The icon is still shown in Deposit Cash page when click on Edit button

- 原 ticket ID：未提供；原父分组/epic：`OG-4285`；原章节：OG-4285: Fiat Web - 2026Q2 Post Launch Issues (3 条)。
- 路径与定位：[原文 L2340–L2344](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2340>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Expected: icon in front of Bank account hidden in Edit mode. Actual: icon still shown. Payment method icon rendered unconditionally; fix hides icon for editable methods in edit mode.
- 处置/推断：编辑态隐藏支付图标是特定交互设计，不必然构成通用问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0288"></a>
### SRC-FAIL-0288 · [Web] The copy 'It can…' in Confirm page is not greyed out while page is loading

- 原 ticket ID：未提供；原父分组/epic：`OG-4285`；原章节：OG-4285: Fiat Web - 2026Q2 Post Launch Issues (3 条)。
- 路径与定位：[原文 L2346–L2350](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2346>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Entire page except the 'Confirm' button should grey out during loading. The last copy "It can take…" is not greyed out. Loading overlay only covers initial viewport due to CSS containment issue.
- 处置/推断：加载遮罩范围与交互冻结需合同确认；不推广“全页变灰/确认按钮例外”。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0289"></a>
### SRC-FAIL-0289 · [Web] CTA button "Visit Help Center" is in title case on ACH and Wire bank transfer pages

- 原 ticket ID：未提供；原父分组/epic：`OG-4285`；原章节：OG-4285: Fiat Web - 2026Q2 Post Launch Issues (3 条)。
- 路径与定位：[原文 L2352–L2356](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2352>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Typography/casing fix: should be "Visit help center" (sentence case), not "Visit Help Center" (title case).
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0290"></a>
### SRC-FAIL-0290 · [Web] DateTime/Countdown Timer should display in one line

- 原 ticket ID：未提供；原父分组/epic：`OG-4333`；原章节：OG-4333: OG Funnel Optimization Phase 8 (1 条)。
- 路径与定位：[原文 L2360–L2364](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2360>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：On match event details page, DateTime/Countdown Timer wraps into two lines; should display in one line. Responsive layout/wrapping fix.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0291"></a>
### SRC-FAIL-0291 · [Web] Pro basketball Futures top carousel card not clickable and displayed darker

- 原 ticket ID：未提供；原父分组/epic：`OG-4382`；原章节：OG-4382: OG Web UI/UX Enhancement (2 条)。
- 路径与定位：[原文 L2368–L2372](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2368>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D010](rules/UIK-D010.md)。
- 依据摘录：Top carousel card on Pro basketball Futures tab renders darker than expected; visual overlay/z-index defect.
- 处置/推断：标题报告不可点击，正文只报告变暗/叠层；仅作为指针拦截候选，现有摘要不足以证明命中被劫持或当时应可操作。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0292"></a>
### SRC-FAIL-0292 · [Web] Portfolio tab color should be orange

- 原 ticket ID：未提供；原父分组/epic：`OG-4382`；原章节：OG-4382: OG Web UI/UX Enhancement (2 条)。
- 路径与定位：[原文 L2374–L2378](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2374>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Portfolio page Positions/History tab color should be orange (matches Prod); currently renders yellow.
- 处置/推断：黄改橙匹配 PROD，无通用可读性事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0293"></a>
### SRC-FAIL-0293 · [Web] Add confetti animation to order success screens

- 原 ticket ID：未提供；原父分组/epic：`OG-4392`；原章节：OG-4392: Add confetti animation to order success screens (1 条)。
- 路径与定位：[原文 L2382–L2386](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2382>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R008](rules/UIK-R008.md)。
- 依据摘录：Confetti + checkmark Lottie animation on Singles, Buy more, Close, and Parlay order success screens. Auto-plays once on success; confetti layer non-blocking; respects prefers-reduced-motion.
- 处置/推断：提取状态变化中控件位置、非状态驱动标识和动效连续性审查；数据驱动变化与必要重排是正常例外，不设动效时长或位移阈值。 只审查动画与用户任务/偏好的一致性，不要求成功必须放烟花；未发生动画阻断的缺陷证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0294"></a>
### SRC-FAIL-0294 · [Web] Affiliate Promo Codes — Rebranded UI for promo code entry

- 原 ticket ID：未提供；原父分组/epic：`OG-4424`；原章节：OG-4424: Affiliate Promo Codes (1 条)。
- 路径与定位：[原文 L2390–L2394](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2390>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Rebranded UI visual reskin for the promo code entry screen (no further description).
- 处置/推断：品牌换肤工作项，无可独立成立问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0295"></a>
### SRC-FAIL-0295 · [Web] Font/color/font_style should be consistent with Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-4488`；原章节：OG-4488: OG - Share & Get (1 条)。
- 路径与定位：[原文 L2398–L2402](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2398>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On "Share your position" section, font/color/font_style must be consistent with Figma. Note line and "Learn more" render as plain text; rich-text styling from BE fields not applied.
- 处置/推断：富文本样式未应用但未报告链接不可用或信息损失；不将后端样式字段作为跨项目合同。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0296"></a>
### SRC-FAIL-0296 · [Web] T&C links appear grey instead of orange-highlighted on OG Phone Input screen

- 原 ticket ID：未提供；原父分组/epic：`ONB-5897`；原章节：ONB-5897: Continuous Improvement - 2026Q2 (1 条)。
- 路径与定位：[原文 L2406–L2410](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2406>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：On the "Find your info" Phone step, Terms &amp; Conditions / Privacy Notice links render grey (underline only) instead of orange-highlighted. Color fix.
- 处置/推断：灰色带下划线的链接不天然有错，缺少不可识别或不可读证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0297"></a>
### SRC-FAIL-0297 · [Web] Background color should not be transparent

- 原 ticket ID：未提供；原父分组/epic：`OG-4902`；原章节：OG-4902: Event Details UI/UX Upgrade (1 条)。
- 路径与定位：[原文 L2414–L2418](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2414>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Event details page with one active market: background renders transparent; should match Figma.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0298"></a>
### SRC-FAIL-0298 · [Web] UI of wheel — $5 / $10 / $50 / $100 should be white

- 原 ticket ID：未提供；原父分组/epic：`OG-5427`；原章节：OG-5427: G1 G4 G6 G8 Welcome Offers Campaign (4 条)。
- 路径与定位：[原文 L2422–L2426](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2422>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Lucky wheel reward labels should be white; currently render in different color.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0299"></a>
### SRC-FAIL-0299 · [Web] Bonus size should be the same whether applied or not on bonus modal

- 原 ticket ID：未提供；原父分组/epic：`OG-5427`；原章节：OG-5427: G1 G4 G6 G8 Welcome Offers Campaign (4 条)。
- 路径与定位：[原文 L2428–L2432](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2428>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Applied bonus should render same size as unapplied bonus, matching the APP.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0300"></a>
### SRC-FAIL-0300 · [Web] Locked $15 coupon should be shown in green on the modal

- 原 ticket ID：未提供；原父分组/epic：`OG-5427`；原章节：OG-5427: G1 G4 G6 G8 Welcome Offers Campaign (4 条)。
- 路径与定位：[原文 L2434–L2438](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2434>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Locked $15 coupon should render green per FCM payload; currently grey.
- 处置/推断：颜色由业务锁定状态及服务端 payload 决定，不能推广锁定必须绿或灰。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0301"></a>
### SRC-FAIL-0301 · [Web] "Keep trading to unlock your bonus" subtext colour should be grey instead of white

- 原 ticket ID：未提供；原父分组/epic：`OG-5427`；原章节：OG-5427: G1 G4 G6 G8 Welcome Offers Campaign (4 条)。
- 路径与定位：[原文 L2440–L2444](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2440>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Subtext should be grey per Figma; currently renders white.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0302"></a>
### SRC-FAIL-0302 · [Web] Betslip responsive: Leg row incorrectly visible in State 2

- 原 ticket ID：未提供；原父分组/epic：`OG-5437`；原章节：OG-5437: Integrated Single & Parlay Betslip (6 条)。
- 路径与定位：[原文 L2448–L2452](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2448>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Collapsed betslip reopened into State 2 incorrectly shows leg row (team name). State 2 should show only stake controls; leg list hidden until State 3.
- 处置/推断：特定抽屉 State 2/3 的字段显隐要求，无独立通用违反事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0303"></a>
### SRC-FAIL-0303 · [Web] Betslip responsive: Multiplier should be colored in orange

- 原 ticket ID：未提供；原父分组/epic：`OG-5437`；原章节：OG-5437: Integrated Single & Parlay Betslip (6 条)。
- 路径与定位：[原文 L2454–L2458](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2454>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Collapsed betslip multiplier should be orange; currently white. Color fix.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0304"></a>
### SRC-FAIL-0304 · [Web] Betslip responsive: Downward chevron next to multiplier should be removed

- 原 ticket ID：未提供；原父分组/epic：`OG-5437`；原章节：OG-5437: Integrated Single & Parlay Betslip (6 条)。
- 路径与定位：[原文 L2460–L2464](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2460>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Remove the downward chevron displayed next to the multiplier on collapsed betslip.
- 处置/推断：删 chevron、保留把手属于入口设计取舍，缺少操作不可发现事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0305"></a>
### SRC-FAIL-0305 · [Web] Betslip: Add usual loading spinner at the top right when in loading state

- 原 ticket ID：未提供；原父分组/epic：`OG-5437`；原章节：OG-5437: Integrated Single & Parlay Betslip (6 条)。
- 路径与定位：[原文 L2466–L2470](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2466>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Loading state should show standard spinner at top right; currently shows three dots.
- 处置/推断：三点与 spinner 都可表达加载，仅更换形态不构成加载缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0306"></a>
### SRC-FAIL-0306 · [Web] Remove downward chevron from betslip; rely solely on drawer handle for expand/collapse

- 原 ticket ID：未提供；原父分组/epic：`OG-5437`；原章节：OG-5437: Integrated Single & Parlay Betslip (6 条)。
- 路径与定位：[原文 L2472–L2476](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2472>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：OG-6644；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：—。
- 依据摘录：Duplicate of OG-6644; obsoleted.
- 处置/推断：原文明示重复 OG-6644；与本地删 chevron 摘要同义，但不能认定 304 的原 ID 是 OG-6644。
- 归并目标：[SRC-FAIL-0304](#src-fail-0304)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0307"></a>
### SRC-FAIL-0307 · [Web] Betslip loading state should use spinner at top right instead of three dots

- 原 ticket ID：未提供；原父分组/epic：`OG-5437`；原章节：OG-5437: Integrated Single & Parlay Betslip (6 条)。
- 路径与定位：[原文 L2478–L2482](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2478>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：OG-6664；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：—。
- 依据摘录：Duplicate of OG-6664; obsoleted.
- 处置/推断：原文明示重复 OG-6664；与本地 spinner 摘要同义，但不能认定 305 的原 ID 是 OG-6664。
- 归并目标：[SRC-FAIL-0305](#src-fail-0305)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0308"></a>
### SRC-FAIL-0308 · [Web] Add team colour / player image to search results

- 原 ticket ID：未提供；原父分组/epic：`OG-5587`；原章节：OG-5587: Add team colour / player image to search results (1 条)。
- 路径与定位：[原文 L2486–L2490](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2486>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Replace generic event_kind_group logos in search results with: 2-colored circular team logo, player image/jersey, or category logo fallback. Asset/logo visual change.
- 处置/推断：实体种类决定资源映射，缺少独立的缺图/错误身份事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0309"></a>
### SRC-FAIL-0309 · [Web] Livestream responsive: Video blocked by top row and search bar after expanding in-page PiP

- 原 ticket ID：未提供；原父分组/epic：`OG-5816`；原章节：OG-5816: OG - Live Stream (2 条)。
- 路径与定位：[原文 L2494–L2498](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2494>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：After expanding in-page PiP on mobile, video overlapped by top row and search bar. Overlap/z-index layout defect.
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0310"></a>
### SRC-FAIL-0310 · [Web] OG Livestream: Channel dropdown overlaps with video stream

- 原 ticket ID：未提供；原父分组/epic：`OG-5816`；原章节：OG-5816: OG - Live Stream (2 条)。
- 路径与定位：[原文 L2500–L2504](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2500>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Mobile-web channel dropdown overlaps the video stream. Layout/overlap fix.
- 处置/推断：下拉框覆盖视频可能是正常弹层；需确认遮挡持续性、可关闭性及受损操作。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0311"></a>
### SRC-FAIL-0311 · [Web] Update web logo

- 原 ticket ID：未提供；原父分组/epic：`OG-6146`；原章节：OG-6146: OG Logo Update (2 条)。
- 路径与定位：[原文 L2508–L2512](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2508>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：[Web] Update web logo（标题）
- 处置/推断：只要求换品牌 logo，无通用质量事实。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0312"></a>
### SRC-FAIL-0312 · [Web] Update logo background colour from #000000 to #121B38

- 原 ticket ID：未提供；原父分组/epic：`OG-6146`；原章节：OG-6146: OG Logo Update (2 条)。
- 路径与定位：[原文 L2514–L2518](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2514>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Change all #000000 instances to #121B38 for logo background.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0313"></a>
### SRC-FAIL-0313 · [Web] Display national team logos in place of two-tone color for World Cup

- 原 ticket ID：未提供；原父分组/epic：`OG-6176`；原章节：OG-6176: World Cup Logo (1 条)。
- 路径与定位：[原文 L2522–L2526](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2522>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Render national team logos (flags) instead of two-tone color when team type === 'national' across all web logo surfaces; preserve two-tone for club/missing.
- 处置/推断：国家队/俱乐部条件决定标识，不能推广为通用默认图标规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0314"></a>
### SRC-FAIL-0314 · [Web] Promo center flashes when switching different coupons while stay in Promos tab with Betslip display

- 原 ticket ID：未提供；原父分组/epic：`OG-6217`；原章节：OG-6217: OG Promo Center V1 (2 条)。
- 路径与定位：[原文 L2530–L2534](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2530>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R008](rules/UIK-R008.md)。
- 依据摘录：Switching coupons causes flashes; expected synced display without flash.
- 处置/推断：提取状态变化中控件位置、非状态驱动标识和动效连续性审查；数据驱动变化与必要重排是正常例外，不设动效时长或位移阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0315"></a>
### SRC-FAIL-0315 · [Web] No filter when user has no active coupons on Promos tab

- 原 ticket ID：未提供；原父分组/epic：`OG-6217`；原章节：OG-6217: OG Promo Center V1 (2 条)。
- 路径与定位：[原文 L2536–L2540](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2536>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R007](rules/UIK-R007.md)。
- 依据摘录：When user has no active coupons, All / Bonuses / Boosts filter chips are missing; expected filter row to still display.
- 处置/推断：提取页面/弹层上下文、返回路径与导航可理解性审查；不规定每页必须返回键、某筛选项必现或悬停为唯一说明方式。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0316"></a>
### SRC-FAIL-0316 · [Web] Update Referral QR code with latest logo

- 原 ticket ID：未提供；原父分组/epic：`OG-6788`；原章节：OG-6788: Referral QR Code Logo Update (1 条)。
- 路径与定位：[原文 L2544–L2548](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2544>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Replace logo in Referral QR code with latest logo per new design.
- 处置/推断：仅有当前产品的样式/资源/呈现要求，未提供独立于该设计选择的损害或可靠比较基线；暂不推广为通用规则。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0317"></a>
### SRC-FAIL-0317 · [Web] Share button size is a bit smaller than Figma design

- 原 ticket ID：未提供；原父分组/epic：`OG-6326`；原章节：OG-6326: Share Slip for Open & Settled Positions (2 条)。
- 路径与定位：[原文 L2552–L2556](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2552>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Portfolio Open/Settled tabs Share button is narrower than Figma width.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0318"></a>
### SRC-FAIL-0318 · [Web] Share slip responsive is not expected

- 原 ticket ID：未提供；原父分组/epic：`OG-6326`；原章节：OG-6326: Share Slip for Open & Settled Positions (2 条)。
- 路径与定位：[原文 L2558–L2562](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2558>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Share slip from Portfolio Open/Settle does not display as expected on responsive viewports.
- 处置/推断：响应式不符合预期，无视口、截图或具体损害。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0319"></a>
### SRC-FAIL-0319 · [Web] World Cup bracket page UI inconsistent with staging-b

- 原 ticket ID：未提供；原父分组/epic：`OG-6915`；原章节：OG-6915: World Cup Event Bracket (3 条)。
- 路径与定位：[原文 L2566–L2570](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2566>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Bracket page Leaderboard/Breakdown banner UI differs from staging-b reference.
- 处置/推断：整体不同于 staging-b，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0320"></a>
### SRC-FAIL-0320 · [Web] World Cup daily trade coupon reward popup UI inconsistent with app

- 原 ticket ID：未提供；原父分组/epic：`OG-6915`；原章节：OG-6915: World Cup Event Bracket (3 条)。
- 路径与定位：[原文 L2572–L2576](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2572>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Web reward popup should match app: coupon card background green (web shows dark grey), subtitle mismatch, body copy differs.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0321"></a>
### SRC-FAIL-0321 · [Web] "All" chip missing from chip filter row on World Cup Category page

- 原 ticket ID：未提供；原父分组/epic：`OG-6915`；原章节：OG-6915: World Cup Event Bracket (3 条)。
- 路径与定位：[原文 L2578–L2582](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2578>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R007](rules/UIK-R007.md)。
- 依据摘录：Filter row shows only "Games" and "Futures"; "All" chip missing.
- 处置/推断：提取页面/弹层上下文、返回路径与导航可理解性审查；不规定每页必须返回键、某筛选项必现或悬停为唯一说明方式。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0322"></a>
### SRC-FAIL-0322 · [Web] Group tab bar is covered by Category tab bar on responsive

- 原 ticket ID：未提供；原父分组/epic：`OG-7064`；原章节：OG-7064: WC Group Stage View (2 条)。
- 路径与定位：[原文 L2586–L2590](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2586>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D002](rules/UIK-D002.md)。
- 依据摘录：Mobile viewports: Group tab bar covered by Category tab bar.
- 处置/推断：提取响应式布局中元素相互侵占并损害阅读/操作的机制；必须确认同屏共存意图，几何重叠本身不足以判错。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0323"></a>
### SRC-FAIL-0323 · [Web] Spacing between group chips and tabs is too wide

- 原 ticket ID：未提供；原父分组/epic：`OG-7064`；原章节：OG-7064: WC Group Stage View (2 条)。
- 路径与定位：[原文 L2592–L2596](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2592>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Spacing wider than Figma reference.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0324"></a>
### SRC-FAIL-0324 · [Web] Team color row background accent missing on all event card types

- 原 ticket ID：未提供；原父分组/epic：`OG-7537`；原章节：OG-7537: Home Card & Featured Carousel Refresh (4 条)。
- 路径与定位：[原文 L2600–L2604](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2600>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Team rows show plain background; expected team-brand color accents per Figma.
- 处置/推断：领域实体品牌背景的设计要求，不等于缺失可识别信息。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0325"></a>
### SRC-FAIL-0325 · [Web] Team color split background missing on featured banner hero carousel card

- 原 ticket ID：未提供；原父分组/epic：`OG-7537`；原章节：OG-7537: Home Card & Featured Carousel Refresh (4 条)。
- 路径与定位：[原文 L2606–L2610](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2606>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Featured banner shows solid background; expected split dual-color.
- 处置/推断：纯背景分割设计取舍，不能要求所有轮播使用双拼背景。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0326"></a>
### SRC-FAIL-0326 · [Web] Featured banner split-panel not rendered at mobile viewport (393px)

- 原 ticket ID：未提供；原父分组/epic：`OG-7537`；原章节：OG-7537: Home Card & Featured Carousel Refresh (4 条)。
- 路径与定位：[原文 L2612–L2616](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2612>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：At 393px renders as compact card instead of split-panel per PRD.
- 处置/推断：393px 使用紧凑卡本身合法，依赖 PRD 断点合同。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0327"></a>
### SRC-FAIL-0327 · [Web] Live event card score displayed next to team name instead of odds button

- 原 ticket ID：未提供；原父分组/epic：`OG-7537`；原章节：OG-7537: Home Card & Featured Carousel Refresh (4 条)。
- 路径与定位：[原文 L2618–L2622](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2618>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Score in wrong position; should be next to odds button.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0328"></a>
### SRC-FAIL-0328 · [Web] Positions page Cash tab spacing should match Perps and Predictions tab spacing

- 原 ticket ID：未提供；原父分组/epic：`OG-7713`；原章节：OG-7713: Conversion Rate Optimizations & Post-Jun-12 Launch Enhancements (2 条)。
- 路径与定位：[原文 L2626–L2630](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2626>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Cash tab padding/spacing misaligned vs other tabs.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0329"></a>
### SRC-FAIL-0329 · [Web] Add card page color needs update

- 原 ticket ID：未提供；原父分组/epic：`OG-7713`；原章节：OG-7713: Conversion Rate Optimizations & Post-Jun-12 Launch Enhancements (2 条)。
- 路径与定位：[原文 L2632–L2636](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2632>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Background color should match modal background.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0330"></a>
### SRC-FAIL-0330 · [Web] Chat-button placement in Event Details header

- 原 ticket ID：未提供；原父分组/epic：`OG-7749`；原章节：OG-7749: Event Details Header Design Refresh (1 条)。
- 路径与定位：[原文 L2640–L2644](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2640>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Desktop-only: chat icon next to gear icon; click opens existing in-app chat. Placement-only.
- 处置/推断：桌面聊天按钮放置的设计要求，无不可达证据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0331"></a>
### SRC-FAIL-0331 · [Web] Trade slip promo application animation

- 原 ticket ID：未提供；原父分组/epic：`OG-7880`；原章节：OG-7880: Trade slip promo animation (1 条)。
- 路径与定位：[原文 L2648–L2652](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2648>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：One-shot promo-applied animation: animate pay/win CTA and boost pill on apply; re-show on re-selection.
- 处置/推断：一次性促销动画触发依赖专属交互，无异常现象。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0332"></a>
### SRC-FAIL-0332 · [Web] 'Add to slip' button label truncated to 'Add t' in no-price parlay card state

- 原 ticket ID：未提供；原父分组/epic：`OG-7983`；原章节：OG-7983: Alpha AI Search Phase 3 (2 条)。
- 路径与定位：[原文 L2656–L2660](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2656>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D001](rules/UIK-D001.md)。
- 依据摘录：Long left copy squeezes footer, CTA clipped as "Add t"; expected full label. Cosmetic/visual only.
- 处置/推断：提取必要文字/内容被裁切后无法识别的风险；不采纳固定缩写长度、绝不截断或必须单行的产品方案。实际缺陷仍需核验全文替代入口和裁切意图。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0333"></a>
### SRC-FAIL-0333 · [Web] Radar chart grid web missing in Light Mode

- 原 ticket ID：未提供；原父分组/epic：`OG-7983`；原章节：OG-7983: Alpha AI Search Phase 3 (2 条)。
- 路径与定位：[原文 L2662–L2666](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2662>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D005](rules/UIK-D005.md)。
- 依据摘录：Radar chart grid lines/axis invisible in Light Mode on Web; expected visible grid.
- 处置/推断：提取承担阅读/图表解释的前景在背景上消失；不将指定颜色或缺少非必要装饰判错，不添加对比度阈值。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0334"></a>
### SRC-FAIL-0334 · [Web] Incorrect Deposit Pending screen UI

- 原 ticket ID：未提供；原父分组/epic：`OG-7985`；原章节：OG-7985: OG Web Fiat - ACH Pull Fraud Prevention (2 条)。
- 路径与定位：[原文 L2670–L2674](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2670>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Deposit Pending screen UI does not match expected design.
- 处置/推断：只有 Pending UI 不正确，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0335"></a>
### SRC-FAIL-0335 · [Web] USD Pending screen UI issue

- 原 ticket ID：未提供；原父分组/epic：`OG-7985`；原章节：OG-7985: OG Web Fiat - ACH Pull Fraud Prevention (2 条)。
- 路径与定位：[原文 L2676–L2680](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2676>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：USD Pending screen renders differently than expected.
- 处置/推断：只有 Pending UI 不符合预期，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0336"></a>
### SRC-FAIL-0336 · [Web] Use crypto icon in crypto-to-cash intro screen

- 原 ticket ID：未提供；原父分组/epic：`OG-8814`；原章节：OG-8814: Fiat Web - 2026Q3 Post Launch Issues (1 条)。
- 路径与定位：[原文 L2684–L2688](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2684>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Swap 3D illustration to crypto icon per internal design alignment.
- 处置/推断：插画改图标属内部设计取舍。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0337"></a>
### SRC-FAIL-0337 · [Web] Live tab — add red dot indicator in top nav

- 原 ticket ID：未提供；原父分组/epic：`OG-9054`；原章节：OG-9054: UIUX fixes on spacing, alignment and display logic (3 条)。
- 路径与定位：[原文 L2692–L2696](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2692>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录：Static red dot on Live tab icon in top nav when at least one live event running.
- 处置/推断：红点触发依赖 live event 业务定义，且与其他文案/红点要求冲突。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0338"></a>
### SRC-FAIL-0338 · [Web] Locked icon — tooltip on hover when no quote

- 原 ticket ID：未提供；原父分组/epic：`OG-9054`；原章节：OG-9054: UIUX fixes on spacing, alignment and display logic (3 条)。
- 路径与定位：[原文 L2698–L2702](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2698>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**混合案例，仅提取 UI 部分**；规则：[UIK-R006](rules/UIK-R006.md)。
- 依据摘录：Lock icon hover shows "No price available now" tooltip; one tooltip at a time.
- 处置/推断：提取加载、空内容或暂不可操作状态的可感知说明；不强制某种骨架、进度条或文案，不推断业务可用性条件。 仅状态说明审查；有无报价的判定和 tooltip 文案不提炼。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0339"></a>
### SRC-FAIL-0339 · [Web] Home cards — audit font, spacing, colour-block height vs Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-9054`；原章节：OG-9054: UIUX fixes on spacing, alignment and display logic (3 条)。
- 路径与定位：[原文 L2704–L2708](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2704>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Cross-check prod home feed against Figma for font, spacing, colour-block height consistency.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0340"></a>
### SRC-FAIL-0340 · [Web] Adjust player card font size on home page

- 原 ticket ID：未提供；原父分组/epic：`OG-9263`；原章节：OG-9263: Adjust player card font size on home page (1 条)。
- 路径与定位：[原文 L2712–L2716](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2712>)；原状态：已废弃（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Apply font-size adjustment to home page player cards on web per updated design. Font size only — no layout or content changes.
- 处置/推断：字体改版明确无布局/内容变化，缺问题依据。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0341"></a>
### SRC-FAIL-0341 · [Web] Image update on the onboarding modal (newbie guide)

- 原 ticket ID：未提供；原父分组/epic：`OG-9470`；原章节：OG-9470: Image update on the onboarding modal (1 条)。
- 路径与定位：[原文 L2720–L2724](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2720>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Image/illustration swap on the onboarding modal (no further description).
- 处置/推断：只更换新手引导插图，无图像缺陷描述。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0342"></a>
### SRC-FAIL-0342 · [Web] Top Trades card UI issues

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2728–L2732](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2728>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)、[UIK-R005](rules/UIK-R005.md)。
- 依据摘录：Avatar for event not displayed on card, and "paid out" not at lower right corner.
- 处置/推断：提取缺图/无图情况下的中性替代与身份连续性；不规定必须有头像、默认运动图标或缩写算法，不采纳实体分类映射。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0343"></a>
### SRC-FAIL-0343 · [Web] 1W chip should be highlighted as active selection by default

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2734–L2738](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2734>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼通用 UI 缺陷规则**；规则：[UIK-D007](rules/UIK-D007.md)。
- 依据摘录：On Top trades / Leaderboard, 1W chip not highlighted on load.
- 处置/推断：提取已确认选中状态缺少或丢失可感知标识；不规定下划线、默认时间范围或特定颜色，需排除替代选中线索。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0344"></a>
### SRC-FAIL-0344 · [Web] Category UI issues

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2740–L2744](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2740>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录："ALL" not left-aligned; no display icon before each category item; font color of "search" and icon should be black not gray.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0345"></a>
### SRC-FAIL-0345 · [Web] "Following" button display inconsistent with Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2746–L2750](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2746>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：The "following" button display is inconsistent with Figma design.
- 处置/推断：只有 following 外观不符设计，无比较基线。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0346"></a>
### SRC-FAIL-0346 · [Web] Category items inconsistent with Figma display

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2752–L2756](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2752>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Items displayed in category inconsistent with Figma; entrances: Top trades and Leaderboard.
- 处置/推断：分类项目整体不符 Figma，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0347"></a>
### SRC-FAIL-0347 · [Web] UI issues on Rank cards

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2758–L2762](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2758>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：UI issues on Leaderboard Rank cards.
- 处置/推断：仅“UI issues”，没有具体缺陷。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0348"></a>
### SRC-FAIL-0348 · [Web] Follow Top Predictors dialog header — extra back button and gray background for X close

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2764–L2768](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2764>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R007](rules/UIK-R007.md)。
- 依据摘录：Extra back button at top-left (clicking returns to trade instruction) and X close button has gray background. Expected: no back button, X without gray background.
- 处置/推断：提取页面/弹层上下文、返回路径与导航可理解性审查；不规定每页必须返回键、某筛选项必现或悬停为唯一说明方式。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0349"></a>
### SRC-FAIL-0349 · [Web] Perps transaction record card UI display incorrect

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2770–L2774](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2770>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Perps transaction record card UI display incorrect vs expected.
- 处置/推断：记录卡 UI 不正确，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0350"></a>
### SRC-FAIL-0350 · [Web] Parlay type transaction card inconsistent with Figma

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2776–L2780](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2776>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Parlay-type transaction card on profile page inconsistent with Figma.
- 处置/推断：记录卡不符 Figma，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0351"></a>
### SRC-FAIL-0351 · [Web] "Loading" button display incorrect

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2782–L2786](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2782>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Loading button display incorrect on profile trade feeds.
- 处置/推断：Loading 按钮 display incorrect，无法区分禁用、反馈、文案或样式问题。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0352"></a>
### SRC-FAIL-0352 · [Web] "NO" should be in red font

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2788–L2792](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2788>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**业务专属，排除**；规则：—。
- 依据摘录："NO" should be red font and "YES" should be green font.
- 处置/推断：YES/NO 固定映射红绿为产品/领域约定。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0353"></a>
### SRC-FAIL-0353 · [Web] Notification UI display incorrect for parlay

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2794–L2798](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2794>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**信息不足，暂缓**；规则：—。
- 依据摘录：Parlay notification record UI display incorrect.
- 处置/推断：通知记录 UI 不正确，无具体差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0354"></a>
### SRC-FAIL-0354 · [Web] Notification icon color inconsistent with other modules

- 原 ticket ID：未提供；原父分组/epic：`OG-11412`；原章节：OG-11412: OG Social - Public Profile (13 条)。
- 路径与定位：[原文 L2800–L2804](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2800>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R002](rules/UIK-R002.md)。
- 依据摘录：Icon color in notifications inconsistent with other modules.
- 处置/推断：提取语义角色、状态及适用变体一致时的组件/资源比较方法；版本替换和跨端完全一致不是普适义务，未取得有效基线时仅作审查。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0355"></a>
### SRC-FAIL-0355 · [Web] Should have a line above the button

- 原 ticket ID：未提供；原父分组/epic：`OG-12419`；原章节：OG-12419: Onboarding - OG Web - Ad Hoc Requests 2026Q3 (1 条)。
- 路径与定位：[原文 L2808–L2812](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2808>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**可提炼体验审查建议**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：On referral code input page, there should be a divider line above the button.
- 处置/推断：提取空间分组、对齐与内容适应的审查；固定间距、列数、卡片同高、左对齐、单行和边框方案不作为通用判错条件。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

<a id="src-fail-0356"></a>
### SRC-FAIL-0356 · [Web] Category filter list — reduce spacing between category name and event count in brackets

- 原 ticket ID：未提供；原父分组/epic：`OG-13166`；原章节：OG-13166: Category filter list spacing (1 条)。
- 路径与定位：[原文 L2816–L2820](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2816>)；原状态：已完成（仅来源元数据）。
- 正文关联 ID：无可恢复的关联 ID；不代表当前条目 ID。
- 分类：**重复案例，归并**；规则：[UIK-R003](rules/UIK-R003.md)。
- 依据摘录：Reduce spacing between category name and event count in brackets in the category filter list.
- 处置/推断：同一名称/计数间距要求，摘要级重复；保留来源，不认定 Jira ID 相同。
- 归并目标：[SRC-FAIL-0087](#src-fail-0087)；保留本条来源与平台差异。
- 证据状态：文字摘要已读；截图/设计链接/附件未核验；本轮无 UI 复现。

