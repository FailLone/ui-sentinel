# UIK-R004 · 审查主题切换后的辨识性与视觉意图

- 类型：体验审查建议；主题：主题与图像。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：9 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

主题变化后保留必要信息的辨识，并核对资源变体是否有明确设计意图。

## 适用条件

同一信息在多种受支持主题、背景或系统界面中呈现；可建立等价内容状态。

## 不适用情形和正常例外

品牌原色图像、固定深色横幅、主题专属资产、光学尺寸修正；主题间颜色/尺寸不相同不等于缺陷。

## 可观察的违反条件（审查信号）

审查信号：资源消失、轮廓融入背景或身份识别明显弱化；单纯深色组件留在浅色页不是充分违反。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

绑定承载身份/导航的信息资源与实际背景，区分浏览器 favicon 与页面主题。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 保持内容状态相同切换支持的主题/背景。
2. 比较必要标识、边界与文字的可辨认程度。
3. 确认不同资产/颜色是否有意；完全不可见转 D005。

## 所需证据与不确定性

对照画面、主题状态及资源用途；没有截图或只偏好某颜色时 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

074 报告白色旗面融入背景；056 只要求 cookie 横幅随主题变化，尚未证明可读性损害。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：浅色页保留深色品牌横幅，但文字、控件与轮廓均清楚。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要视觉判断/人工审查 + 语义绑定。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：主题变化后保留必要信息的辨识，并核对资源变体是否有明确设计意图。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0016](../ticket-mapping.md#src-fail-0016) · [原文 L157–L165](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:157>) · 原文摘录：Event icon borders should be inset (overlaid on top of the image/icon) rather than outside the image bounds. This gives the icon contrast against varying backgrounds. * Currently, icon borders appear to sit outside/around the image, meaning they don't help with contrast when the icon background colour is similar to the card/page background. * The fix is to render the border as an inner/inset stroke overlaid directly over the image, so it creates contrast regardless of the surrounding background colour. * The screenshot shows asset contract card …（摘录，见原文）
- [SRC-FAIL-0020](../ticket-mapping.md#src-fail-0020) · [原文 L194–L203](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:194>) · 原文摘录：The Crypto plain category icon renders at a smaller size in light mode compared to dark mode on web. A new icon asset may be needed to ensure consistent sizing across both themes. * Icon asset in question: [ * Issue is visible in the category filter list (Baseball, CFB, Crypto, MMA &amp; More, Pro Basketball, NFL, Soccer, Tennis) * In the side-by-side screenshot, the Crypto row is the active/highlighted state — the icon appears noticeably smaller in light mode (left) vs dark mode (right) * cc: , , * Platform is not explicitly stated — defaulting to …（摘录，见原文）
- [SRC-FAIL-0037](../ticket-mapping.md#src-fail-0037) · [原文 L364–L371](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:364>) · 原文摘录：Update the OG web favicon to support light mode. The current favicon appears designed for dark backgrounds — it needs a variant (or adaptive version) that remains visible and correct in light mode browser tabs/bookmarks. * The OG favicon uses a dark background with orange "OG" text, which works on dark-mode browser chrome but may not display correctly in light mode * A light-mode-compatible favicon should be provided (either a separate light-mode asset or an SVG/ICO that adapts) * Screenshot shows the current OG app icon (dark background, orang …（摘录，见原文）
- [SRC-FAIL-0041](../ticket-mapping.md#src-fail-0041) · [原文 L405–L413](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:405>) · 原文摘录：On mobile web, the crypto asset filter pills (e.g. BTC, ETH, XRP, SOL) on the Crypto category page display coin logos in black/white (monochrome) instead of their correct brand colours. These should follow the web designs and render in full colour. * Affects the Crypto category tab on mobile web (og.com) * Filter pills with coin logos (BTC, ETH, XRP, SOL, etc.) are showing monochrome/black-and-white icons * Expected: coin logos should use their standard brand colours (e.g. Bitcoin orange, Ethereum blue/purple, etc.) to match the web design spec …（摘录，见原文）
- [SRC-FAIL-0051](../ticket-mapping.md#src-fail-0051) · [原文 L488–L497](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:488>) · 原文摘录：The Crypto category page displays a category icon in light mode but the icon is absent in dark mode — the two modes should be visually consistent. * Reported on OG.com web (Crypto prediction markets category page) * In light mode, a category icon is present alongside the page content * In dark mode, the same icon does not appear — inconsistent behaviour across themes * Screenshot shows side-by-side comparison of the Crypto page in dark vs. light mode; light mode shows the category icon, dark mode does not * Both modes display the same markets ( …（摘录，见原文）
- [SRC-FAIL-0056](../ticket-mapping.md#src-fail-0056) · [原文 L537–L544](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:537>) · 原文摘录：Cookie consent banner currently only supports dark mode. Light mode styling needs to be added. * The banner displays a dark background with orange accent elements ("Learn more and manage." link, "Accept all" button, "Reject non-essential cookies" outlined button) * The same dark-background treatment is being shown in light mode — it should adapt to the light mode theme * Screenshot confirms the banner layout: message text, orange CTA link, filled "Accept all" button, and outlined "Reject non-essential cookies" button
- [SRC-FAIL-0074](../ticket-mapping.md#src-fail-0074) · [原文 L701–L709](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:701>) · 原文摘录：Add a grey border and border radius to logos/icons used in individual-based sports prediction (e.g. tennis, golf) to prevent flags with white or light backgrounds from blending into the page background. * Currently, Japan's flag (white + red design) is indistinguishable from the white background on player/country icons in individual sports markets * Fix should apply a grey border and rounded corner radius to all individual sport player/country logos to ensure visual distinction in both light and dark mode **Supporting detail from screenshot:**  …（摘录，见原文）
- [SRC-FAIL-0217](../ticket-mapping.md#src-fail-0217) · [原文 L1858–L1862](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1858>) · 原文摘录：Web-side container for the brand team's color-token updates. Once the design-system tokens are updated on Web, every consumer should reflect the new color values without per-route overrides, and brand orange CTAs/accents must remain readable against the new palette (no "Halloween effect"). Any Web surface where the token-level change is not visually correct should be captured as a follow-up rather than patched with a hard-coded color. Out of scope: marketing site / logged-out homepage, component-level re-skin beyond the named tokens.
- [SRC-FAIL-0247](../ticket-mapping.md#src-fail-0247) · [原文 L2060–L2064](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2060>) · 原文摘录：Under dark mode, the Weekly Trading Streak Rewards banner background renders grey; it should display black like other banner backgrounds.

## 未解决问题与关联

037 的 favicon 是否实际不可辨认？051 缺失的图标是否必要而非设计变体？

关联：[UIK-D005](UIK-D005.md)、[UIK-D011](UIK-D011.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
