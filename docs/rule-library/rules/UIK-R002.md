# UIK-R002 · 在有效变体范围内审查组件一致性

- 类型：体验审查建议；主题：组件与设计系统。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：39 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

同语义、同状态、同变体的控件应提供可理解且一致的视觉和交互表达。

## 适用条件

存在可比较的等价实例，或可访问并确认适用的组件版本；需识别平台与断点差异。

## 不适用情形和正常例外

不同语义/状态；合理跨端差异；版本迁移中的授权变体；外观不同但清楚表达同功能；不要求所有按钮同样式。

## 可观察的违反条件（审查信号）

审查信号：等价角色中图标、样式或交互提示无说明漂移。代码不是同一组件不能直接据此判 UI 缺陷。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

先绑定角色、状态、密度、平台、断点和版本，再找对照；不用业务名称或“最新”字样当基线。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 建立等价组与明确的允许变体。
2. 比较资源、视觉状态和交互入口；标注对照来源及版本。
3. 解释差异影响，确认设计取舍；有独立功能损害时转入对应缺陷规则。

## 所需证据与不确定性

对照实例、版本/变体合同、截图/交互证据；丢失 Figma、仅“legacy”或平台不同应为 unknown/待审。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

123 报告语义相同的筛选组件跨页不同；146 报告删除图标在移动端变成另一图标，需确认是否产生歧义。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：同一动作在桌面为图标加文字，移动端用清楚标记的紧凑版本，属于批准变体。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断/人工审查；已批准 token/资产合同可辅助确定性比较。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：同语义、同状态、同变体的控件应提供可理解且一致的视觉和交互表达。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0014](../ticket-mapping.md#src-fail-0014) · [原文 L138–L145](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:138>) · 原文摘录：Three design issues identified on \[Web\] Player pages: 1\. \*\*Type sizes are off\*\* — latest type size reference should be followed per Figma:  2. \*\*Navigation style not updated to library\*\* — the nav style has been updated in the DS library; implementation should align with the updated component. Figma reference:  3. \*\*Event card icons not aligned with main event card style\*\* — icons on the event cards in Player pages do not match the standard event card icon style used elsewhere in the app (see screenshot for reference showing the  …（摘录，见原文）
- [SRC-FAIL-0019](../ticket-mapping.md#src-fail-0019) · [原文 L185–L192](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:185>) · 原文摘录：Remove the crypto token icon from the tab/section header to maintain a consistent design system across all tabs. The icon should not appear in the header — all tabs should follow the same style. * Raised by  in #og-design-triage * Applies across tabs system-wide; consistent treatment requested for all tabs * No specific platform specified — applies to both App and Web
- [SRC-FAIL-0026](../ticket-mapping.md#src-fail-0026) · [原文 L253–L261](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:253>) · 原文摘录：The limit order page is using a legacy icon. It should be updated to use the latest adjust icon — the same one currently used in the trade slip. * Platform: Web * The adjust icon on the limit order is outdated/legacy * The correct icon to use is the adjust icon already present in the trade slip * Screenshot attached by reporter as supporting reference
- [SRC-FAIL-0031](../ticket-mapping.md#src-fail-0031) · [原文 L305–L316](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:305>) · 原文摘录：Remove the background from the event detail page icons that appear above the chart, and update the Chat and Orderbook icon files with the latest Figma drawings. Ensure all icons on this surface use the same 24px size variant. * Icons affected: Chat and Orderbook icons on the event detail page (above the chart area) * Background should be removed from these icons * Icon files must be updated to match the latest Figma designs * All icons on this surface must use the 24px size variant consistently * Figma reference: [ * Related existing tickets: &lt; …（摘录，见原文）
- [SRC-FAIL-0035](../ticket-mapping.md#src-fail-0035) · [原文 L345–L352](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:345>) · 原文摘录：Replace all Alpha-related icons across the platform with the consistent \`Alpha-fill\` icon using all available sizes. The "sparkle" icon must never be used in relation to Alpha. Surfaces to update: - App top nav on Alpha tab - Icon on Analyze button on event card in Alpha tab - Top nav button on web — "Get started with Alpha" - Alpha suggestion row on event detail page Reference: [ Extension of [OG-10317]( — \[App\] Alpha screen — logo not aligned.
- [SRC-FAIL-0036](../ticket-mapping.md#src-fail-0036) · [原文 L354–L362](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:354>) · 原文摘录：Bitcoin logos appear inconsistent across the platform — the logo styling, colour, or rendering differs depending on where it is displayed (e.g. Crypto category under the Live tab vs. other screens). * Reported as a general inconsistency with no specific screen called out — affects Bitcoin logo appearance across the app and/or web * Screenshot shows the Crypto category under the Live tab on OG.com, displaying short-duration BTC price prediction contracts (5 min, 20 min, 2 hour) and longer-term contracts ("Bitcoin Price at the End of 2026", "When …（摘录，见原文）
- [SRC-FAIL-0040](../ticket-mapping.md#src-fail-0040) · [原文 L393–L403](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:393>) · 原文摘录：Add the \`all-fill\` icon to "All" tab section headers on App, to match the existing web treatment. * Currently, "All" tab headings on App do not have an icon, whereas web shows the \`all-fill\` icon consistently * All "All" tab section headers should use the \`all-fill\` icon * Figma reference confirms the expected heading style (icon + label) * Team discussed whether this applies to every "All" heading — confirmed applicable across the board *  flagged this; planned for the Sep 30 OTA [Figma reference](
- [SRC-FAIL-0042](../ticket-mapping.md#src-fail-0042) · [原文 L415–L423](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:415>) · 原文摘录：Homepage crypto prediction contracts are using different coin logos compared to the logos shown on the Crypto category page. The two surfaces should display identical coin logos for consistency. * On the Trending/Homepage, crypto contracts (e.g. "Bitcoin Price at the End of 2026", "When will Bitcoin cross $100k again?") show coin logos that differ from those displayed on the Crypto category page. * The Crypto category page displays coin logos in a left sidebar asset filter (BTC, ETH, XRP, SOL, etc.) and on contract cards — these should be the c …（摘录，见原文）
- [SRC-FAIL-0050](../ticket-mapping.md#src-fail-0050) · [原文 L478–L486](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:478>) · 原文摘录：The "Submitted" order status in the limit order history table is displayed in orange (\`content/active\`) — it should use the same colour as all other status labels for visual consistency. * On the order history table, pending/unfilled GTC limit buy orders show a "Submitted" status in orange * All other statuses (e.g. Filled) do not use orange — the colour is inconsistent * The "Submitted" status colour should match the neutral colour used by other status labels (not \`content/active\`) * Observed on orders such as Chicago C No, Moneyline bets, …（摘录，见原文）
- [SRC-FAIL-0052](../ticket-mapping.md#src-fail-0052) · [原文 L499–L506](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:499>) · 原文摘录：The Perps trade drawer on web has an incorrect fill/background colour. It should use the same fill as the standard (non-Perps) trade drawer to ensure visual consistency across drawer types. * The issue is on the web platform (Perps trade drawer specifically) * The standard trade drawer fill should be the reference — the Perps drawer should match it exactly * Screenshot shows the Perps order entry for AAPL Perp • Up at $319.00, with 3x leverage, TP/SL enabled (TP at $350.90 / SL at $303.05, liquidation at $247.64) — the drawer fill is visually i …（摘录，见原文）
- [SRC-FAIL-0060](../ticket-mapping.md#src-fail-0060) · [原文 L586–L599](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:586>) · 原文摘录：Parlay preview slip does not fully align with the intended Figma design. Multiple issues identified when the slip has only 1 pick selected (showing the "Pick at least two markets" validation state). Issues to fix: * To align Exit parlay button's style * "Pick at least two .." reminder should come with the grey background like a thin banner * To double check the spacing in between the Exit parlay button and the reminder banner, and between the banner and the X-pick header * The win chance % should be in black color instead of grey * Skip the lab …（摘录，见原文）
- [SRC-FAIL-0068](../ticket-mapping.md#src-fail-0068) · [原文 L643–L647](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:643>) · 原文摘录：[Web] Event detail page LIVE badge colour should match the LIVE page（标题）
- [SRC-FAIL-0069](../ticket-mapping.md#src-fail-0069) · [原文 L653–L662](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:653>) · 原文摘录：Button borders are missing for the email and passkey authentication options on the OG.com web login/sign-up page. * Affects the "Continue with email" and "Continue with passkey" buttons on the auth login card * The "Welcome to OG.com" card shows four auth options: Continue with Google, Continue with Apple, Continue with email, Continue with passkey * Google and Apple buttons appear to have correct styling; email and passkey buttons are missing their borders * Screenshot confirms the issue on the live web login screen Attach to epic: \[OG-11349  …（摘录，见原文）
- [SRC-FAIL-0073](../ticket-mapping.md#src-fail-0073) · [原文 L692–L699](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:692>) · 原文摘录：The player fallback logo (initials badge, shown when no player photo or flag is available) on Web is missing a grey border and border radius. This causes the initials badge to visually appear inconsistent with other avatar/logo elements on the platform that do have this treatment. * The fallback initials badge (e.g. "EB" for a player with no image/flag) should have a grey border and border radius applied, matching the treatment used for flag/country icons. * Screenshot shows a live match (Remy Bertola vs Edas Butvilas) where Bertola has a red S …（摘录，见原文）
- [SRC-FAIL-0075](../ticket-mapping.md#src-fail-0075) · [原文 L711–L719](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:711>) · 原文摘录：All team, player, and flag icons on Web are missing their border styling. This affects all instances across the platform — e.g. visible on baseball market cards (game matchup cards, season winner markets, player prop markets). * The border is absent on icons in market cards such as team matchup cards (e.g. Pittsburgh @ Milwaukee), season champion markets (e.g. Pro Baseball Champion), and player markets (e.g. NL MVP Winner 2026) * The screenshot highlights the affected areas with red circles around the team logo/name display sections * This appe …（摘录，见原文）
- [SRC-FAIL-0078](../ticket-mapping.md#src-fail-0078) · [原文 L741–L748](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:741>) · 原文摘录：The progress bars displayed on contract cards have inconsistent thickness across different cards on the web platform. * Reported on the web; screenshot shows a live Bitcoin price prediction market with two active contracts ("Above $64,732.00" and "Above $64,707.00") * The orange/red progress bars indicating trade activity appear at different thicknesses between cards * This is a visual inconsistency that should be standardised across all contract card types
- [SRC-FAIL-0114](../ticket-mapping.md#src-fail-0114) · [原文 L1102–L1109](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1102>) · 原文摘录：The N1 and N2 campaign banner cards on web are not using the same button component. All card banners should use a consistent button size and style — follow the N1 button as the reference. * Affected cards observed in screenshot: "Weekly Trading Streak" card (with "See campaign" / "Trade now" CTAs) and a Campaign Pick card ("Will the Sunday Night Football game go to overtime?" with "See campaign" / "Share my pick" CTAs) * Button component inconsistency spans both N1 and N2 banner card types * All card banners should standardise to the same butto …（摘录，见原文）
- [SRC-FAIL-0120](../ticket-mapping.md#src-fail-0120) · [原文 L1145–L1153](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1145>) · 原文摘录：Confirm whether the Sort &amp; Filter modal sheet is using the correct chip component from the Design System for its filter option selectors. * The modal contains three filter sections: Sort (Default, Highest to lowest, Closest expiry first), Type (All, Bonus, Boost), and Markets (All markets, Pro Baseball, Tennis) * Selected options show a checkmark; "Apply" CTA uses OG brand salmon/orange colour; "Reset" is secondary * Question raised is whether the chip component used for each filter option aligns with the DS chip component spec * Screenshot att …（摘录，见原文）
- [SRC-FAIL-0121](../ticket-mapping.md#src-fail-0121) · [原文 L1155–L1163](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1155>) · 原文摘录：Update the filter chip and dropdown components on event detail pages to use the global Design System "filter chip" and "dropdown" components — replacing any custom/legacy implementations currently in use. * Applies to event detail pages on the OG App * The Game Lines tab (e.g. "Winner" market for NFL matchups) and Player Props tab (e.g. "Anytime Goal Scorer" goals category with player outcome rows) are visible in the reference screenshots, showing the current filter chip / sub-tab UX * Sub-tabs such as Full game / 1st half / 2nd half under "Spr …（摘录，见原文）
- [SRC-FAIL-0122](../ticket-mapping.md#src-fail-0122) · [原文 L1165–L1172](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1165>) · 原文摘录：The "View more" CTA on the Player pages stats section (Recent Games table) should use the secondary button style per Figma spec. Currently it does not match the design library component. * Figma reference: [ * The screenshot shows the Recent Games stats table on a player page (last 5 games with TD, PASS, RUSH, REC, CMP, ATT, INT columns), with the "View more" CTA button visible at the bottom of the table — the button style does not match the secondary button component in the Figma design spec. * Additionally, this ticket should be attached to t …（摘录，见原文）
- [SRC-FAIL-0123](../ticket-mapping.md#src-fail-0123) · [原文 L1174–L1181](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1174>) · 原文摘录：The filter chips on the Perps page (Trending, Top Gainers, Top Losers) are not using the same component as equivalent filter chips on other pages such as Sports. They should be consistent across the platform. * The Perps page has a set of filter tabs — Trending (active), Top Gainers, Top Losers — as well as a left sidebar (All / Stocks / Crypto) * The filter chip component used here visually differs from the standardised chip component used on Sports and other category pages * All filter chips across the platform should use the same design syst …（摘录，见原文）
- [SRC-FAIL-0124](../ticket-mapping.md#src-fail-0124) · [原文 L1183–L1191](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1183>) · 原文摘录：The TP/SL (Take Profit / Stop Loss) info in the Perps position detail view currently uses an info icon (ⓘ) to surface the tooltip. This should instead use the same underlined text hover interaction used for Margin and Leverage on the same page — for visual and interaction consistency. * The current implementation shows an ⓘ icon next to the TPSL label * Margin and Leverage already use an underlined text style that triggers a tooltip on hover * TPSL should adopt the same pattern — underlined label text that shows a tooltip on hover, no info icon …（摘录，见原文）
- [SRC-FAIL-0146](../ticket-mapping.md#src-fail-0146) · [原文 L1388–L1392](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1388>) · 原文摘录：Delete button icon changed to incorrect icon in mobile view. Should remain trash can icon.
- [SRC-FAIL-0147](../ticket-mapping.md#src-fail-0147) · [原文 L1394–L1398](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1394>) · 原文摘录：The order type adjustment button in limit order UI is using an outdated icon.
- [SRC-FAIL-0151](../ticket-mapping.md#src-fail-0151) · [原文 L1422–L1426](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1422>) · 原文摘录：Two issues: (1) Error message copy doesn't match app; (2) CTA button renders red in error state but should remain primary style.
- [SRC-FAIL-0163](../ticket-mapping.md#src-fail-0163) · [原文 L1498–L1502](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1498>) · 原文摘录：Two fixes: (1) Update chevron button to latest DS component; (2) Remove border from sports asset images on match card.
- [SRC-FAIL-0169](../ticket-mapping.md#src-fail-0169) · [原文 L1538–L1542](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1538>) · 原文摘录：Button styles misaligned with app. Padding between last row and CTAs should be 24px.
- [SRC-FAIL-0178](../ticket-mapping.md#src-fail-0178) · [原文 L1596–L1600](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1596>) · 原文摘录：Chip group component on portfolio page uses outdated style. Should adopt new library component.
- [SRC-FAIL-0179](../ticket-mapping.md#src-fail-0179) · [原文 L1602–L1606](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1602>) · 原文摘录：Team chip uses outdated style with orange outline. Next game &amp; futures chip tab also outdated.
- [SRC-FAIL-0180](../ticket-mapping.md#src-fail-0180) · [原文 L1608–L1612](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1608>) · 原文摘录："No markets available" empty state doesn't follow DS. Icon should be on top per DS spec.
- [SRC-FAIL-0181](../ticket-mapping.md#src-fail-0181) · [原文 L1618–L1622](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1618>) · 原文摘录：Nav buttons styled differently from the rest of the platform.
- [SRC-FAIL-0182](../ticket-mapping.md#src-fail-0182) · [原文 L1624–L1628](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1624>) · 原文摘录：Button style incorrect at tablet breakpoint. Should use secondary small button style.
- [SRC-FAIL-0186](../ticket-mapping.md#src-fail-0186) · [原文 L1648–L1652](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1648>) · 原文摘录：Button component on Player pages is out of sync with PROD button styles.
- [SRC-FAIL-0212](../ticket-mapping.md#src-fail-0212) · [原文 L1824–L1828](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1824>) · 原文摘录：NBA event cards still use new UI; expected alignment with Soccer/WC card styling.
- [SRC-FAIL-0299](../ticket-mapping.md#src-fail-0299) · [原文 L2428–L2432](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2428>) · 原文摘录：Applied bonus should render same size as unapplied bonus, matching the APP.
- [SRC-FAIL-0320](../ticket-mapping.md#src-fail-0320) · [原文 L2572–L2576](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2572>) · 原文摘录：Web reward popup should match app: coupon card background green (web shows dark grey), subtitle mismatch, body copy differs.
- [SRC-FAIL-0328](../ticket-mapping.md#src-fail-0328) · [原文 L2626–L2630](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2626>) · 原文摘录：Cash tab padding/spacing misaligned vs other tabs.
- [SRC-FAIL-0329](../ticket-mapping.md#src-fail-0329) · [原文 L2632–L2636](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2632>) · 原文摘录：Background color should match modal background.
- [SRC-FAIL-0354](../ticket-mapping.md#src-fail-0354) · [原文 L2800–L2804](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2800>) · 原文摘录：Icon color in notifications inconsistent with other modules.

## 未解决问题与关联

137 禁插画与 183 更新插画存在版本/范围冲突，不能推导全局禁令。

关联：[UIK-R001](UIK-R001.md)、[UIK-D011](UIK-D011.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
