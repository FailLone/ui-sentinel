# UIK-D004 · 应保形的图像不得被非等比拉伸

- 类型：缺陷检查规则；主题：图像资源。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：1 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

需要保留形状的标识或图像应按其约定比例渲染。

## 适用条件

原资源及有效可见边界可取得；当前设计要求保形；对象并非可拉伸纹理。

## 不适用情形和正常例外

有意艺术变形、九宫格背景、经批准的不同构图变体；等比裁切是内容保留问题，不直接等于拉伸。

## 可观察的违反条件

同一资源的横纵缩放不一致，并形成可观察的形状压扁/拉长，且不是授权变形。

只有适用事实、目标绑定与违反证据均完整时才可判 fail；缺证不视为通过。

## 如何识别检查对象

按图像语义和实际资源身份绑定，例如品牌标识或插图；比较内容边界而不只比较透明画布尺寸。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 取得资源原始比例与当前变体/设计意图。
2. 记录容器、object-fit/变换和图像有效显示边界。
3. 对照关键形状是否因非等比缩放失真。

## 所需证据与不确定性

原资源、显示截图、尺寸/变换记录及变体意图。只有“modal too large”或原图不明时 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

028 报告二维码内标识 squished；没有扫码失败证据，不能扩张为二维码不可用。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：宽容器里标识等比缩放并留白，或按批准构图等比裁切。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

确定性比例测量 + 需要视觉判断/语义绑定。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：需要保留形状的标识或图像应按其约定比例渲染。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0028](../ticket-mapping.md#src-fail-0028) · [原文 L274–L283](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:274>) · 原文摘录：The "Get the App" modal (triggered from the footer or side menu) has two design issues: 1\. The modal size does not appear correct — likely too large or incorrectly sized vs. Figma spec 2. The QR code has the OG.com logo squished/distorted inside it The reporter has flagged this for team guidance before proceeding with a fix. * Triggered via: Footer → "Get the App" link, or Side menu → "Get the App" link * The modal shows a QR code with tagline "Trade anywhere, anytime. Never miss a winning move." and a "Download the OG.com App" header * Screen …（摘录，见原文）

## 未解决问题与关联

需补 028 原资源，排除源图本身已有变形。

关联：[UIK-R012](UIK-R012.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
