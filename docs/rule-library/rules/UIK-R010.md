# UIK-R010 · 焦点样式变更应审查键盘定位是否保留

- 类型：体验审查建议；主题：焦点与键盘。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：1 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

调整指针点击后的焦点样式时，应同时审查键盘用户是否仍能定位当前焦点。

## 适用条件

设计拟隐藏/替换按钮 focus 样式，且控件在键盘路径中可聚焦。

## 不适用情形和正常例外

点击后保留浏览器焦点环是健康行为；可用自定义焦点指示；不可聚焦装饰无焦点义务；不要求点击后必须隐藏轮廓。

## 可观察的违反条件（审查信号）

审查信号：变更导致键盘路径失去可感知焦点位置；本批并无已观测的键盘失败，不将来源点击焦点环判成缺陷。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

按可聚焦交互控件和实际焦点归属定位，不把所有 CSS outline 当装饰边框。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 分别以指针及键盘进入同一控件。
2. 记录变更前后的活动元素和可见焦点指示。
3. 沿相关路径继续移动焦点，评估定位是否清楚；确认未把背景模态控件纳入可操作路径。

## 所需证据与不确定性

输入方式、活动元素、前后截图与键盘轨迹；仅点击截图或样式代码不足以断言键盘问题。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

071 请求鼠标点击时不显示默认环，同时保留键盘可访问性；这是一项变更风险，非已证实焦点缺陷。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：按钮点击或键盘聚焦均显示清楚焦点环；也可采用能保留键盘可见定位的自定义样式。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

确定性焦点跟踪 + 视觉判断/人工审查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：调整指针点击后的焦点样式时，应同时审查键盘用户是否仍能定位当前焦点。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0071](../ticket-mapping.md#src-fail-0071) · [原文 L673–L681](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:673>) · 原文摘录：Remove the browser focus outline that appears on buttons when clicked on web (reported on Brave browser). * Reporter sees a visible focus ring/outline appear around buttons when clicked on the Brave browser * This is likely a browser default \`:focus\` or \`:focus-visible\` outline not being suppressed on click interactions * Should be suppressed on mouse/pointer click while still being accessible for keyboard navigation (\`:focus-visible\` pattern) * Screenshot shows the Game Lines tab selected on a sports event page (Rams vs Broncos), with an …（摘录，见原文）

## 未解决问题与关联

本轮不引入 WCAG 条款/数值；若将来升级规范检查，需核对权威原文、版本和范围。

关联：[UIK-D010](UIK-D010.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
