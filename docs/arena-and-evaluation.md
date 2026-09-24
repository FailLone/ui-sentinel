# 靶场与评估

状态：购物靶场、固定 minimum、反馈学习复查和独立恢复/阻断场景已实现。靶场是可重置的业务应用；评估器拥有私有答案，Agent 只接触公开产品界面和允许的业务事实。

## 三个边界

arena/checkout 使用 React 和业务服务实现购物流程。evaluation/fixtures 保存独立场景。evaluation/private 保存重置控制、真值和评分；它不会作为模型上下文加载。scripts/validation 负责启动隔离环境、组织运行并保存完整记录。

一个靶场可以验证多条规则，一条规则也应覆盖多个靶场。不要以“一规则一页面”固定组织；按业务状态、触发条件、反例和预期结果组合。新业务不一定需要重建全部靶场，应先看已有案例是否覆盖其新语义和状态。

## 当前 minimum

| 变体 | 预期 |
| --- | --- |
| C0 | 正常购买成功，无虚假缺陷 |
| C1 | 可关闭遮挡：发现并留证，恢复后成功 |
| C2 | 不可关闭遮挡：有依据地阻断，业务结果 unknown |
| C3 | 操作文案和位置变化，仍成功，不误报目标缺失 |
| C4 | 合理拒付，有清楚解释，结果 rejected，不当成路径错误 |
| C5 | 允许重试但入口持续不可操作；没有等价规则时自主调查并报告，业务结果 unknown |

正式协议固定每例三次，共 18 次，不能删除失败重跑后只保留成功。18 次用于开发验收，不是日常用户每个任务要执行 18 次。

## 命令

```sh
# 私有开发入口，准备并验证单个场景；需要控制 token
pnpm arena:reset -- --case C0
# 少量真实模型和视觉定位，缺配置明确失败
pnpm smoke:model
# 已启动服务上的正式评估
pnpm evaluate -- --suite minimum --repeats 3
# 自动隔离端口/数据库，先真实 smoke，再固定 18 轮
pnpm validate:acceptance -- --minimum-only
```

validate:acceptance 无参数执行 smoke + 六例诊断；--minimum 为诊断通过后继续正式 18 轮。入口要求干净提交，保存版本、编译哈希、请求、报告与评分。网关明确记录估算费用、实际 usage 或未知项，不把未知费用当零。停止/预算错误仍计入记录。

OpenRouter 验证网关的模型固定在 evaluation/support/model-gateway.ts；提供方和费用上限通过 VALIDATION_AGENT_PROVIDER、VALIDATION_VISION_PROVIDER、VALIDATION_MAX_COST_USD 设置。复现已采纳基线时固定 Agent 为 Wafer、视觉为 Alibaba，并显式 EXECUTION_BLOCKER_REVIEW=1；仅改默认开关的运行不能标成相同条件对照。

arena:reset 由私有 token 保护；排队、活动或待核对任务存在时拒绝重置。真值和变体名称不放入被测 Agent 可见目标。evaluate 通过正式 API 发起、读取和检查任务，不能直接调用执行器内部函数来绕过持久层。

## 免费本地预检

先 pnpm build，再执行：

```sh
pnpm test:fixtures
pnpm validate:persistence
pnpm validate:investigation
pnpm validate:blocker-review
```

后三项运行真实编译服务、Mastra SDK 和 Chromium，使用明确的本地固定模型响应。它们验证持久终结、取消、原子调查和有限审查集成，不证明真实模型会正确决策，也不调用付费模型。

## 结果与证据

评分区分业务结果、发现质量、证据有效性、完整测量、结束行为和副作用。截图存在不等于证据成立；需核对来源、样本和目标。检查原始报告/事件、数据库终态与事件尾，证据文件需要可读取且摘要一致。

重点保留正常、预期拒绝、恢复成功、真实缺陷、未知结果和不可操作分支。健康恢复反例不可省，否则“遇到失败就结束”也可能看似高效。

## 谁维护靶场

开发者维护真实业务行为、私有答案与评分器。产品/业务负责人确认预期。Agent 可以提出遗漏场景、生成候选页面或用例，但不能独自生成答案再宣布自己通过；合入需独立审核与验证。

产品成熟后靶场继续服务规则回归、模型/提示升级、误报漏报复盘和跨业务迁移。开发集、回归集与保留集分开；已用于调优的场景不再是未见泛化证据。新增业务只补充它引入的适用性、状态或预期差异。

学习候选的异常/健康/unknown 验证和既有规则复查见[规则流程](rules-and-rule-library.md)。当前真实成绩与限制见[验收基线](validation-baseline.md)。
