# UIK-D009 · 声明受容器约束的装饰层应遵守边界

- 类型：缺陷检查规则；主题：绘制与容器。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：2 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

明确属于容器内部的填充或水印不应意外绘制到其约定边界外。

## 适用条件

已确认装饰层所有权及裁剪合同；有稳定可见边界，设计没有允许外伸。

## 不适用情形和正常例外

阴影、焦点环、popover、跨卡片装饰、有意 bleed、可见溢出设计；不要求给所有容器 overflow:hidden。

## 可观察的违反条件

内部填充穿过圆角边界，或水印越出已确认归属范围；仅边界附近裁切不能说明合同被违反。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

识别卡片填充/水印与所属容器关系，单独辨认阴影、边框、焦点和内容层。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 取得有效容器边界和允许外伸层的列表。
2. 记录圆角/裁剪及装饰绘制范围。
3. 比较越界位置与合同，确认不是预期效果。

## 所需证据与不确定性

可见像素、裁剪几何、装饰归属及允许外伸约定；缺设计意图时 unknown，不能仅因水印裁了一角而 fail。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

079 报告卡片渐变从圆角漏出；130 报告水印溢出，但 clipping 与 overflow 需原图区分。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：填充遵守圆角，阴影和键盘焦点环按设计向外绘制。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要视觉判断 + 语义绑定；已知边界可确定性辅助。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：明确属于容器内部的填充或水印不应意外绘制到其约定边界外。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0079](../ticket-mapping.md#src-fail-0079) · [原文 L750–L758](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:750>) · 原文摘录：The faded background of the highlighted/selected card on mobile web extends beyond the card's border corners, creating a visual overflow where the background gradient/fade is not clipped to the card boundary. * Observed on OG.com mobile web (homepage, logged-out state) * The highlighted card's faded background should be contained within the card's rounded border corners * The overflow is visible on the featured/market cards in the homepage view * Screenshot attached showing the issue on the Featured section (Golf market — Rocket Classic) and Pr …（摘录，见原文）
- [SRC-FAIL-0130](../ticket-mapping.md#src-fail-0130) · [原文 L1243–L1251](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1243>) · 原文摘录：The OG.com watermark on contract cards is hitting overflow issues — it is clipping or extending outside the card boundaries rather than staying contained within the card area. * Reported on the OG.com prediction market contract cards (e.g. "Will the Clarity Act Become Law?" Politics category contract card) * The watermark (logo) is overflowing/not constrained within the card bounds * Screenshot shows a multi-outcome contract card with a line chart; the watermark overflow is visible on the chart area of the card * Platform not specified — filing …（摘录，见原文）

## 未解决问题与关联

130 可能是水印被裁而非越界；保留候选且待核实。

关联：[UIK-D001](UIK-D001.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
