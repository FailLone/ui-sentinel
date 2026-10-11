# UIK-R008 · 审查状态过渡中的位置与动效连续性

- 类型：体验审查建议；主题：状态一致性与动效。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：5 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

不改变用户目标的过渡应尽量维持定位线索，动效应与任务和已知偏好协调。

## 适用条件

加载、对象切换、关闭或成功反馈过渡；能追踪同一控件/标识的状态。

## 不适用情形和正常例外

内容变化导致必要重排、响应式断点改变、真实状态改变、用户主动动效；暂停轮播常是正常交互，不要求连续运动。

## 可观察的违反条件（审查信号）

审查信号：目标无语义原因地跳动、与状态无关的标识闪烁、动效干扰操作或忽略已声明偏好；无统一位移/时长阈值。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

关联过渡前后同一语义目标、生命周期与状态事实，不按屏幕坐标误绑新对象。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 录下稳定初态与触发事件。
2. 跟踪过渡中的位置、状态和可操作性。
3. 区分真实状态变化、加载闪烁与有意动效；误报空/失败转 D006。

## 所需证据与不确定性

带时间的录屏、对象身份、状态变化与动画合同/偏好；只说 flashes 或依据竞争产品时不能直接 fail。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

175 报告加载时切换箭头移位；140 报告导航期间标识消失重现。293 是设计要求，不是实际动画缺陷报告。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：加载时保留切换控件位置；内容就绪后必要重排清楚发生，成功动画不挡操作。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要视觉判断 + 语义绑定/人工审查。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：不改变用户目标的过渡应尽量维持定位线索，动效应与任务和已知偏好协调。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0140](../ticket-mapping.md#src-fail-0140) · [原文 L1340–L1344](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1340>) · 原文摘录：加载新页面或 tab 时，LIVE 旁的红点不应闪烁消失再出现，应持续保持显示。当前 staging 上在页面加载过程中红点会消失又重新出现。
- [SRC-FAIL-0173](../ticket-mapping.md#src-fail-0173) · [原文 L1562–L1566](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1562>) · 原文摘录：Team chip changes size when navigating between players. Should remain consistent.
- [SRC-FAIL-0175](../ticket-mapping.md#src-fail-0175) · [原文 L1574–L1578](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:1574>) · 原文摘录：Chevron switcher moves during loading state. Should maintain stable position.
- [SRC-FAIL-0293](../ticket-mapping.md#src-fail-0293) · [原文 L2382–L2386](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2382>) · 原文摘录：Confetti + checkmark Lottie animation on Singles, Buy more, Close, and Parlay order success screens. Auto-plays once on success; confetti layer non-blocking; respects prefers-reduced-motion.
- [SRC-FAIL-0314](../ticket-mapping.md#src-fail-0314) · [原文 L2530–L2534](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:2530>) · 原文摘录：Switching coupons causes flashes; expected synced display without flash.

## 未解决问题与关联

需确认标识在过渡中是否应持续；293 提及减少动效偏好但不据此声称满足外部标准。

关联：[UIK-D006](UIK-D006.md)、[UIK-D010](UIK-D010.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
