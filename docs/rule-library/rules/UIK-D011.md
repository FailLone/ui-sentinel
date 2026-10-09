# UIK-D011 · 同一设计变量在同一解析上下文应一致

- 类型：缺陷检查规则；主题：设计系统变量。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：1 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

消费者在同一版本、模式与作用域引用同一变量时，解析值应一致。

## 适用条件

可访问实际变量定义、别名链、消费者绑定和解析上下文；需区分设计文件与运行时。

## 不适用情形和正常例外

不同主题、版本、继承作用域、明确覆盖；透明度/混色导致像素不同；消费者合法引用不同变量。

## 可观察的违反条件

完全相同解析条件下，消费者解析结果不同于该变量的实际有效值。像素颜色不同不是解析不一致的充分证据。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

按 token 身份、别名链和作用域关联消费者，不以颜色值近似寻找组件。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 锁定定义/消费者版本和主题模式。
2. 展开别名、继承与覆盖，记录最终解析链。
3. 比较有效解析值，并将像素混合另行记录。

## 所需证据与不确定性

可访问的定义与绑定快照、版本/模式/覆盖信息。只有来源写的两个十六进制值时 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

049 报告变量面板和按钮解析色不一致，但相关设计链接丢失，不能认定为已证实缺陷。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：同变量有效值一致，半透明按钮在不同背景上呈不同像素色，仍是健康解析。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

确定性检查（需可用变量元数据）；缺上下文时人工审查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：消费者在同一版本、模式与作用域引用同一变量时，解析值应一致。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0049](../ticket-mapping.md#src-fail-0049) · [原文 L468–L476](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:468>) · 原文摘录：Investigate and resolve a color token inconsistency in the OG App Design Library for \`border/status-neutral\` in light mode. * Token \`border/status-neutral\` (light) maps to \`neutral/300\`, which is defined as \*\*#E8D0B5\*\* in the Figma variables panel * However, where this token is applied to the button component, the resolved colour shows as \*\*#BFC6D8\*\* — a different value * This discrepancy needs to be verified and corrected so the token value is consistent across its definition and all usages Reference links: - Variables definition …（摘录，见原文）

## 未解决问题与关联

需核对是否同库版本和 mode；本轮不选择哪一个报告色值作为标准。

关联：[UIK-R002](UIK-R002.md)、[UIK-R004](UIK-R004.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
