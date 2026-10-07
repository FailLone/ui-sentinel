# 可组合调查程序

`page_inspect` 与 `investigation_run` 允许 Agent 用同一组浏览器事实和操作调查规则库之外的问题。没有按缺陷类别分发的代码；已有规则和专用聚焦探针仍是快捷路径。

## 职责边界

Agent 从公开需求、页面状态和交互提出假设，选择目标并声明预期。执行层测量事实、计算比较结果、保存证据。`fail` 的精确含义是“这些事实不满足 Agent 声明的预期”，不是系统独立证明了预期合理，更不是整个页面不合格。

当前的“生成脚本”是生成可校验、可重放的 JSON 调查程序，不开放任意 Node/浏览器 JS。程序没有文件、网络、任意 eval 或绕过正常交互的能力。扩展新的问题组合应只需要生成新程序；新增可观测介质、复杂图像解释或运行时没有的测量能力，仍需实现新的通用测量原语。

## 工具

`page_inspect({selector?, offset?})` 一次返回至多 24 个主文档元素，包括非交互反馈。selector 仅接受 CSS；返回 CSS 路径、文本、边界、状态和几何事实，可分页。不主动滚动，不将事实标记成缺陷，不读取源码或输入框值。选择器和文本均是未可信页面数据。

`investigation_run` 一次注册假设、运行程序并保存结果。格式示例（示意，不是内置规则）：

```json
{
  "version": 1,
  "phenomenon": "操作后内容可能不符合公开预期",
  "basis": "公开需求要求完成操作后当前视口内可以看到反馈",
  "targets": [{"name": "feedback", "selector": "[role=alert]"}],
  "steps": [{"op": "measure", "name": "current"}],
  "assertions": [{
    "expectation": "反馈完整位于当前视口内",
    "left": {"sample": "current", "target": "feedback", "metric": "viewportFraction"},
    "operator": "gte",
    "right": {"value": 1}
  }]
}
```

目标由 Agent 绑定到当前公开 DOM。选择器不是规则的固定业务 ID；同一程序移植到不同结构时，需要重新绑定并验证预期适用性。重放不能悄悄换近似节点。

| 步骤/参数 | 行为 |
| --- | --- |
| measure(name) | 测量全部声明目标，保存截图与命名样本 |
| wait(ms) | 有界等待，响应取消 |
| act(type, target/value/scrollY) | click/fill/scroll；复用现有执行器的动作计数、网络和业务副作用策略 |
| left/right | 测量引用与常量，或两次测量引用比较 |
| eq/gte/lte | 相等、数值大于等于、小于等于；类型不符为 unknown |

上限为 6 个目标、10 个步骤、8 个断言、3 个动作、总计 4000ms 显式等待；运行器在步骤边界检查 10 秒时限，正式宿主另有工具总时限和 run 取消。每个实际动作仍消耗原动作预算。没有无限循环或自动重试。

## 事实的准确含义

- `viewportFraction`：元素矩形与当前视口的面积交集比例；不代表文字可读、未被其他元素遮盖或用户一定能识别。
- `unclippedFraction`：元素矩形未被祖先矩形 overflow 区域裁掉的比例；不包含视口，也不证明实际像素。
- `hitFraction`：三个固定采样点命中自身/后代的比例；不证明 click handler 或整个表面均可操作。
- `displayed`、`enabled`、`focused`、`text`、x/y/width/height、scrollX/Y：当次 DOM 事实；不将 disabled 自动判为错误。
- 无唯一目标、目标被替换、文档切换、采集期间发生相关变化、复杂 transform/mask/clip 等情况保留 unknown。缺失目标不会被转换成可用于“证明缺陷”的 false。

几何仅支持主文档普通矩形；iframe、shadow、自定义绘制、跨视口连续覆盖与任意视觉问题未被证明。比较只覆盖命名样本时刻，不证明两次采样间一直满足条件；持续时间问题继续使用已有连续测量工具。

## 证据与规则沉淀

原始程序作为 `investigation-program` artifact，回执作为 `measurement`，截图保留原图。回执包含每步日志、样本、断言实际左右值、计算结果、范围和错误。现有报告呈现 finding、事件和 artifact，不需要每类问题新增页面区块。

服务器记录回执摘要；将程序类假设提升为 supported/refuted 时，从服务器保存的程序及样本重新计算比较，要求同 run/同 hypothesis 的回执和截图。普通 findings_submit 不能重新命名或覆盖该结果。取消不能提交迟到回执；受干预的证据不能变成通过或缺陷。

保存的程序是一份调查配方，可下载和重放。它不等于获批的全局规则。当前没有自动审批任意程序，也没有将原有 transition 规则提案伪装成通用脚本审批。通用规则发布仍需要：预期适用性审查、独立正反例、可重放前置状态、重新绑定及版本化。该能力的自动化属于后续工作。

## 验证

- `pnpm test src/execution/investigation`：真实 Chromium 的执行/证据边界测试，不调用模型。
- `pnpm build && pnpm validate:programs -- --preflight`：真实 Server/SDK/浏览器、固定模型，只验证接线，不算自主发现。
- `pnpm validate:programs -- --real`：真实 DeepSeek、六个正常/异常页面、相同中性任务、独立私有评分与生成程序重放；缺密钥明确失败。保留每次运行、原始模型请求、成本及所有失败。
- `pnpm validate:programs -- --real --cases layout-broken,layout-healthy`：定向复测，报告明确标记 targeted，不等价于完整矩阵。
- `pnpm test evaluation/support/program-replay.test.ts`：免费重放已保存的真实生成程序，同时检查有效候选和应被拒绝的错误候选。详见 [样本来源与状态](../evaluation/fixtures/generated-programs/README.md)。

当前不宣称验证了 Qwen 的通用视觉发现；这组 DOM 可观测问题的实验刻意不依赖 input 专用视觉候选。

网址模式（`kind: 'ui-scan'`）复用同一组原语：`page_inspect`、`investigation_run`、`transition_observe` 与 `rule_check` 在运行能力允许时照常提供，共享同一动作入口、网络边界、预算与取消，不额外开模型循环，也不绕开逐跳判定。UI 运行不提供 `journey_run`——跨轮 Journey 的证据是在另一份站点契约下取得的，重放到一个它从未描述过的 URL 上会伪造身份。

网址模式的收尾**不**沿用业务完成契约：它用自己的检查账本与 `scope-covered` 证明，`businessResult` 恒为 `not-applicable`（不是 `unknown`，也不是 `success`）。业务任务（含旧记录）仍走原业务完成契约，整体报告可能为 blocked / business unknown，即使页面调查及显式收尾已经完成。验证器分别检查调查覆盖、真实计算结果和 run_finish，不把它们改写成业务成功，也不把网址任务的「检查完成」读成「网站合格」。

当前三类回归为菜单裁切、视口外反馈、异步内容挤出关键按钮。程序曾产生错误预期和错误目标绑定，异常页上的 fail 不足以证明其可复用；正常对照必须通过。尚未实现自动恢复前置状态、跨页面重新绑定与通用候选发布，新增测量介质仍需要开发通用原语。
