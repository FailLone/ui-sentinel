# UIK-R011 · 审查滚动边缘提示的方向与含义

- 类型：体验审查建议；主题：滚动与内容提示。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：2 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

渐隐等边缘效果应与内容截断和可继续阅读的方向相符。

## 适用条件

已有渐隐或边缘提示，且区域有顺序内容、裁切或滚动；能确认新旧内容方向。

## 不适用情形和正常例外

无渐隐也可以清楚表达滚动；装饰渐变不承诺滚动；内容倒序、双向滚动、滚至边界后的差异。

## 可观察的违反条件（审查信号）

审查信号：提示让用户误以为错误一侧还有内容，或淡化当前需要阅读的内容；不能规定渐隐永远在顶或底。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

识别滚动容器、可达边界、阅读顺序与提示层，避免从固定上下坐标推断新旧。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 确认内容顺序及当前滚动位置。
2. 滚至不同位置检查真实可达内容和渐隐方向。
3. 区分装饰与提示，记录是否误导；重要信息被不可恢复裁切转 D001。

## 所需证据与不确定性

滚动范围、顺序、前后截图及提示意图；只有“add fade”时不直接判错。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

134 报告最新内容在底部但渐隐也在底部；133 的初始添加要求不足以证明方向。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：内容按另一方向排列时渐隐位置随之变化；或仅用滚动条清楚提示。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断/人工审查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：渐隐等边缘效果应与内容截断和可继续阅读的方向相符。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0133](../ticket-mapping.md#src-fail-0133) · [原文 L1274–L1281](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1274>) · 原文摘录：Add a fade effect to the play-by-play feed on the live sports contract/event detail page on web, as per the Figma design. * The play-by-play section currently lacks a fade effect; the Figma spec shows a fade/gradient treatment at the edges or bottom of the feed * Reference Figma: [ * Screenshot shows the live play-by-play feed for a Pro Baseball game (LAA @ BAL) — team badges (LAA/BAL) with play events and real-time probability sparkline charts are visible; the fade effect is absent in the current implementation
- [SRC-FAIL-0134](../ticket-mapping.md#src-fail-0134) · [原文 L1283–L1291](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1283>) · 原文摘录：The fade effect on the play-by-play feed is applied at the bottom, but it should be at the top. Since the most recent play is at the bottom, the top of the feed shows older entries — so the fade should appear at the top to indicate older content is cut off, not the bottom. * Reported on the live event card (Pro Baseball: Houston @ New York Y, Mid 4th inning) * The feed shows events like Daulton Varsho home run and Jose Altuve fly-out, with the most recent entry at the bottom * Fade gradient is currently visible at the bottom of the play-by-play …（摘录，见原文）

## 未解决问题与关联

需原图确认渐隐是否遮住必要内容，不能以存在渐隐本身判裁切。

关联：[UIK-D001](UIK-D001.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
