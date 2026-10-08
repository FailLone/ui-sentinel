# UIK-R005 · 审查无图或加载失败时的替代表达

- 类型：体验审查建议；主题：图像资源与状态。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：8 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

缺少资源时应审查身份和布局是否仍清楚，替代内容不能冒充另一实体。

## 适用条件

资源 URL 缺失、请求失败或未提供头像，且相应区域承担识别作用。

## 不适用情形和正常例外

非必要图片可省略；有清楚文字无需头像；合理按需加载；默认图案明确是通用占位；不强制缩写或默认图标。

## 可观察的违反条件（审查信号）

审查信号：无图后对象难识别、布局崩坏，或替代照片容易被理解成另一个真实对象；仅空图槽不是自动 fail。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

按实体容器与图片/文字关联识别，区分真实照片、通用占位与业务类别图标。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 确认缺图与正常未加载状态的差别。
2. 观察文本身份、图槽和替代资源。
3. 与有图状态对照，评估识别和布局；错误身份需可靠实体绑定后另立候选。

## 所需证据与不确定性

资源请求状态、实体关联和缺图画面；只知“jersey missing”不知资源是否应存在时 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

204 报告缺原头像时显示另一默认头像；027 报告无图时槽位空，后者不自动构成身份错误。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：资源失败后显示中性轮廓与完整名称，布局稳定；纯装饰图直接省略。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断/人工审查；资源状态可确定性获取。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：缺少资源时应审查身份和布局是否仍清楚，替代内容不能冒充另一实体。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0027](../ticket-mapping.md#src-fail-0027) · [原文 L263–L272](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:263>) · 原文摘录：When no image is available for a contract in the limit order trade slip, the icon is not shown at all. The coloured placeholder icon should be reused in this case. * Affects the limit order trade slip on web (OG.com) * When a contract has no associated image, the icon slot appears empty instead of falling back to the coloured placeholder * The coloured placeholder icon (used elsewhere on the platform) should be reused here for consistency * Observed on the F1 Drivers' Champion 2026 event (Sports › F1), trade slip for "Alexander Albon Yes" at 1. …（摘录，见原文）
- [SRC-FAIL-0089](../ticket-mapping.md#src-fail-0089) · [原文 L843–L849](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:843>) · 原文摘录：Several design and UX issues found on OG Web player pages (e.g. og.com/nfl/players/rashee-rice-fjzxza). Issues reported: - Header box image does not load on the player page - "Next game" section has a coloured background that appears off-brand — needs clarification on whether this is intentional - No category page link or back navigation in the header, making it unclear how to return to main pages - Stats are hard to read — column spacing is inconsistent - Left/right arrow navigation between players has no indication of ordering logic (alphabet …（摘录，见原文）
- [SRC-FAIL-0154](../ticket-mapping.md#src-fail-0154) · [原文 L1440–L1444](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1440>) · 原文摘录：Three visual issues: (1) Jersey graphic not rendering; (2) Background colour missing; (3) Gradient should be removed from match card.
- [SRC-FAIL-0204](../ticket-mapping.md#src-fail-0204) · [原文 L1776–L1780](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1776>) · 原文摘录：When a player has no headshot url in the API, the hero banner area should display the expected placeholder image; currently a different default headshot shows instead.
- [SRC-FAIL-0205](../ticket-mapping.md#src-fail-0205) · [原文 L1782–L1786](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1782>) · 原文摘录：In the Career section (Stats tab) on player pages, when a season has no `icon_url` the icon slot is empty — the abbreviation of `event_kind_display_name` should be displayed as an icon with a grey background.
- [SRC-FAIL-0211](../ticket-mapping.md#src-fail-0211) · [原文 L1818–L1822](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1818>) · 原文摘录：Career section: when no icon_url, no icon; expected default soccer icon.
- [SRC-FAIL-0282](../ticket-mapping.md#src-fail-0282) · [原文 L2302–L2306](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2302>) · 原文摘录：NASCAR sport icon shows a placeholder instead of the proper logo on the Motorsports page. Icon asset fix.
- [SRC-FAIL-0342](../ticket-mapping.md#src-fail-0342) · [原文 L2728–L2732](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2728>) · 原文摘录：Avatar for event not displayed on card, and "paid out" not at lower right corner.

## 未解决问题与关联

205 与 211 分别要求缩写和特定默认图标，不能选择一种作为通用 fallback。

关联：[UIK-D001](UIK-D001.md)、[UIK-D004](UIK-D004.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
