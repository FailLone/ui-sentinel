# UIK-D008 · 图表系列与注释必须能对应正确对象

- 类型：缺陷检查规则；主题：数据可视化。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：2 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

阅读图表所需的系列身份及注释归属应可辨认且不误导。

## 适用条件

存在多系列或多个参考/当前对象；该标签/数值含义是已确认的输入事实。

## 不适用情形和正常例外

可用图例、直接标签或可达交互替代；单系列无需冗余标注；有意简略的小图且完整解释可达；不检查业务数值真伪。

## 可观察的违反条件

必要系列无任何身份对应方式，或注释视觉锚点/关联错误指向另一对象，使读者得到错误归属。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

从图例、系列标识、轴、参考线和注释的语义关系绑定；不按颜色固定代表某一业务方向。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 取得系列/注释身份与目标用途，不推断计算逻辑。
2. 观察静态图并使用已有交互显示标签。
3. 核对每条必要系列是否可识别，以及注释锚点是否对应其所属对象。

## 所需证据与不确定性

系列映射、标签/图例、锚点和交互截图；缺少可信数据绑定、原图或替代交互证据时 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

128 报告多曲线没有对应名称；131 报告变化注释挨在参考线而非所属的当前值线上。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：曲线无内联文字但图例和可达详情清楚对应；注释用引线明确归属。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要语义绑定 + 视觉判断/人工审查；绑定明确后可检查映射。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：阅读图表所需的系列身份及注释归属应可辨认且不误导。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0128](../ticket-mapping.md#src-fail-0128) · [原文 L1223–L1231](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1223>) · 原文摘录：Chart labels are not appearing on the futures contract probability chart. Even for futures contracts, team/outcome labels should be displayed on the chart lines. * Reported on the NFL Champion 2026-2027 contract: [ * The chart shows probability lines for multiple outcomes (e.g. Buffalo 15%, Los Angeles 15%, San Francisco 13%, Kansas City 10%) but the labels for each line are missing * Screenshot confirms the issue: four probability lines are plotted over time with "All" range selected, total volume $6,886,658 — but no team labels appear on the  …（摘录，见原文）
- [SRC-FAIL-0131](../ticket-mapping.md#src-fail-0131) · [原文 L1253–L1262](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1253>) · 原文摘录：The +/- X.XX% price change label is incorrectly positioned next to the black "Target" line on the crypto contract chart. It should appear next to the current price line — placing it on the Target line is confusing to readers. * Affects both App and Web * The black Target line should display only the target price value (e.g. $81,570.62), with no % change label * The current price line should display the current price AND the +/- X.XX% change indicator (e.g. $81,625.52 +0.067%) * Related ticket &lt;custom data-type="smartlink" data-id="id-0"&gt; covers …（摘录，见原文）

## 未解决问题与关联

129 未说明标签锚点，不够支撑此规则；215 取消数值标签不必然违反身份识别。

关联：[UIK-D002](UIK-D002.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
