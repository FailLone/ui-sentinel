# UIK-R012 · 按目标显示场景审查图像清晰度

- 类型：体验审查建议；主题：图像资源。
- 文档修订：1；首次建立：2026-10-08（Asia/Shanghai）。
- 当前状态：候选知识，待验证；未实现、未验证、未批准、未启用。
- 来源摘要：1 条（含 0 条归并摘要；不是独立验证次数）。

## 一句话原则

图像清晰度应支持其识别用途，并与实际显示比例和有意风格相符。

## 适用条件

资源已经加载，目标设备像素比、显示尺寸和图像用途可确认。

## 不适用情形和正常例外

像素艺术、纹理、故意低清效果；渐进加载的中间帧；截图压缩导致的假象；不规定统一分辨率。

## 可观察的违反条件（审查信号）

审查信号：缩放/资源质量使必要图标明显难以识别；单纯“不锐利”需原图与意图核实。

本条只形成审查意见，不因审查信号直接输出 fail；若要升级为缺陷规则，需补充可观察损害或已批准合同，并新增修订记录。

## 如何识别检查对象

按实际资源与显示实例关联，确认像素化来自源图还是显示/截图流程。 目标引用须来自当前观察；引用过期、同名多目标或操作身份不明时重新绑定或返回 unknown。

## 检查步骤

1. 取得原图、完成加载状态和设备显示条件。
2. 对比有效像素、缩放及同角色参考资源。
3. 评估识别影响并排除有意风格；形状拉伸另走 D004。

## 所需证据与不确定性

原资源、未过度压缩的截图、加载状态与显示尺寸；只有摘要描述 grainy 时 unknown。 本批只有二次整理的文字报告，未观察真实 UI，未取得截图/设计附件；因此来源记录不能直接产生实测 pass/fail。

适用性本身不明为 unknown；已确认触发条件不成立为 not-applicable。健康结果需完成适用检查并有实际证据，不能用 not-applicable 代替 pass。审查建议只记录意见及其证据充分性，运行时四态映射尚未实现。

## 缺陷或问题案例（来源报告，未复现）

025 报告分类图标颗粒感，与同票提到的图标身份错误明确为不同问题。 这是审查触发案例，不代表客观缺陷已经成立。 下方来源索引提供完整标题与原文位置。

## 健康反例

合成示例：图标在目标尺寸清晰可辨；有意像素风插图不因像素边缘被判坏。 此例为构造，未运行测试，不计入健康 pass。

## 自动化可行性

需要视觉判断/人工审查；元数据可辅助。 这是实现可行性评估，不是已交付能力。不能依靠 ticket 中的固定业务文本或选择器。

## 来源、原文依据与提炼推断

以下是原始摘要的报告/要求，均不是本轮实测事实；原 ticket ID 均未提供，epic/关联 ID 详见映射。推断：图像清晰度应支持其识别用途，并与实际显示比例和有意风格相符。 只在上述触发和例外边界内推广；原文指定色值、尺寸、业务分支及“最新设计”不会自动成为通用标准。

- [SRC-FAIL-0025](../ticket-mapping.md#src-fail-0025) · [原文 L243–L251](</Users/xietian/Library/Mobile Documents/com~apple~CloudDocs/Downloads/fail.md:243>) · 原文摘录：Politics category icons on market/contract cards appear grainy or low-resolution. * Observed on the Trending tab on the app — Politics contract cards (e.g. "Florida Governor Election Winner 2026", "South Carolina Senate Election Winner 2026") show a grainy/pixelated icon * The icon affected appears to be the Politics subcategory badge/icon displayed on the market card * Note: &lt;custom data-type="smartlink" data-id="id-0"&gt; and &lt;custom data-type="smartlink" data-id="id-1"&gt; cover a related issue (wrong icon defaulting to governor/"Politics" for all …（摘录，见原文）

## 未解决问题与关联

025 截图缺失，不能确认问题在资产、缩放还是截图压缩。

关联：[UIK-D004](UIK-D004.md)。

## 验证与维护要求

后续验证至少补违规、健康、触发不成立和证据不足样本；语义绑定另补名称变化、多目标歧义、布局变化及引用失效。审查建议以问题场景、合理取舍反例和审阅记录代替自动判错。本轮均未执行这些验证。修改触发、预期或例外需增加文档修订并更新 [去重记录](../dedup-log.md)，不可悄悄扩大范围。
