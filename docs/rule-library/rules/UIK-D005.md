# UIK-D005 · 承载必要信息的前景不得在背景上消失

- 类型：缺陷检查规则；主题：可读性与主题。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：2 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

已呈现且承担当前任务信息的文字或图形应能从实际背景中辨认。

## 适用条件

对象是必要信息；已达到稳定绘制状态；使用受支持的主题和显示环境。

## 不适用情形和正常例外

装饰性网格可省略；合法隐藏；不承担信息的背景图；禁用状态不是单凭低对比就判错，但必要说明仍需可读。

## 可观察的违反条件

实际合成后字形/图形与背景融为一体，必要信息不可见且无等效可感知表达；仅颜色不是指定 token 不能 fail。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

按按钮可见名称、图表刻度/坐标辅助信息等作用定位，并读取实际背景层、透明度和前景。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 确认信息用途和当前主题。
2. 记录合成后的绘制结果，对比另一主题或可见参考。
3. 检查是否存在等效表达；将不可见与仅“不够好看”分开。

## 所需证据与不确定性

原图/当前渲染、前景背景合成证据及信息必要性。细微对比差异、不可验证网格用途时 unknown；不输出未经核对的 WCAG 合规结论。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

054 报告白底白字按钮不可读；333 报告浅色主题坐标/网格消失，需确认其解释作用。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：浅色主题按钮使用可辨认文字；图表刻度清晰，装饰网格按设计隐藏。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要视觉判断 + 语义绑定；同色检测仅辅助。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：已呈现且承担当前任务信息的文字或图形应能从实际背景中辨认。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0054](../ticket-mapping.md#src-fail-0054) · [原文 L517–L525](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:517>) · 原文摘录：The last button on the web staging page has white text rendered on a white background, making it completely unreadable/invisible. * Reported on web staging (staging B) * The affected button appears to be the final/last button in a sequence on the page * Text colour and background colour are both white — likely a contrast/theming issue * Screenshot attached shows the OG.com web sign-up / onboarding screen (Welcome to OG registration form with Sign up with Google, Sign up with Apple, email input, and Login link); the right panel shows a dark prom …（摘录，见原文）
- [SRC-FAIL-0333](../ticket-mapping.md#src-fail-0333) · [原文 L2662–L2666](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2662>) · 原文摘录：Radar chart grid lines/axis invisible in Light Mode on Web; expected visible grid.

## 未解决问题与关联

054 原票已废弃不否定其候选机制，也不证明实际缺陷已成立。

关联：[UIK-R004](UIK-R004.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
