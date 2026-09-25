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

## 导出业务与业务契约验收

arena/export 是第二个完整业务：异步数据集导出。公开协议 `POST /api/exports`（创建）、`GET /api/exports/:jobId`（查询）、`POST /api/exports/:jobId/retry`（重试同一任务），另有只读的 `GET /api/exports/:jobId/eligibility` 发布恢复资格。页面用原生 radio 提供至少两个数据集与两个格式、初始均未选择，所以 Agent 必须实际填选而不能点一个预置按钮；jobId 随机且不含变体名；公开响应、URL 与浏览器资源都不暴露变体编号、根因或私有开关。

| 变体 | 实际业务 | 独立真值 | 期望 |
| --- | --- | --- | --- |
| E0 | 处理中后成功 | create=1 retry=0 job=1 产物=1 | completed + success，无虚假缺陷，显式 finish |
| E1 | 首次失败且允许恢复，控件正常 | create=1 retry=1 job=1 attempt=1 产物=1 | 实际恢复后 success，不能仅 probe 就结束 |
| E2 | 同样允许恢复，但控件始终不可操作 | create=1 retry=0 job=1 failed 产物=0 | blocked + unknown，一个有效的不可操作发现 + 完整五秒证据 |
| E3 | 权限/配额等合理拒绝 | create=1 retry=0 job=1 rejected 产物=0 | completed + rejected，不把预期拒绝当缺陷 |
| E4 | E1 的布局与文案变化 | 与 E1 相同 | 实际选择新目标并恢复成功，不报按钮丢失 |

E1 与 E2 的失败公开载荷**完全一致**，重试条款也一致；差别只在工作台能否操作恢复控件，而 E2 的后端确实接受重试。因此 E2 的判别依据必须是业务自己发布的资格资源（`prerequisite.met: false` 与 `backendPermitsRetry: true` 的矛盾），不能是客户端渲染的样子，也不能是按钮文案。健康变体的恢复控件在五秒窗口内可操作并保持到点击，消除「模型来晚了」对正反例的歧义；缺陷变体持续不可操作直到重置。

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
# 导出靶场：五变体真值与动作计数，真实 Chromium，无付费请求
pnpm test:fixtures:export
# 业务契约免费预检（编译服务 + Mastra + Chromium + 本地固定模型）
pnpm validate:business -- --preflight
# 业务契约真实诊断：smoke + 导出 E0–E4 各一次
pnpm validate:business -- --diagnostic
# 正式四组 45 轮（诊断必须来自当前冻结构建）
pnpm validate:business -- --formal --diagnostic-source <通过的诊断目录> \
  [--approved-source <已关闭学习目录，默认 data/fixtures/approved-retry>] [--groups A,C]
```

validate:acceptance 无参数执行 smoke + 六例诊断；--minimum 为诊断通过后继续正式 18 轮。入口要求干净提交，保存版本、编译哈希、请求、报告与评分。网关明确记录估算费用、实际 usage 或未知项，不把未知费用当零。停止/预算错误仍计入记录。

validate:business 的三个入口是三个独立模块：一个误设的标志不能把免费检查变成付费批次，也不能让诊断结果被读成正式批次。`--preflight` 主动清空真实凭据，`--diagnostic`/`--formal` 缺 key 明确非零退出、不 mock。`--formal` 在**任何模型调用之前**完成计划判定，判定不通过时写满 45 行 blocked 后立即非零退出；诊断与正式批次共享同一个 `VALIDATION_MAX_COST_USD` 累计上限，新建输出目录不重置额度。正式矩阵为四组：A 导出自主探索 15 轮（内置规则，E0–E4 各三次）、B 导出规则迁移 6 轮（载入原批准声明，E1/E2 各三次）、C 原购物 minimum 18 轮、D 原购物学习复查 6 轮。C/D 委派给既有 runner，不重述其门槛。每组独立数据库，跨组不借用任何发现、假设或规则状态。

B/D 需要的已批准声明来自 `data/fixtures/approved-retry`（默认来源），由 `pnpm fixture:approved-retry` 从 Git 资料离线校验并导入：保持原候选 ID、人工审阅者、声明 target/timeoutMs 与批准时间，不调用 approve/enable API。它是既有批准的迁移，不能用于批准新候选；`portable-source.json` 区分历史数据库与新摘录数据库的哈希，两者不同是正常现象。批次安装前可离线核对：导入的声明会被编译进批次库，其来源行状态为 `interrupted`，不会被任何批次或健康查询当作结果计数。

OpenRouter 验证网关的模型固定在 evaluation/support/model-gateway.ts；提供方和费用上限通过 VALIDATION_AGENT_PROVIDER、VALIDATION_VISION_PROVIDER、VALIDATION_MAX_COST_USD 设置。复现已采纳基线时固定 Agent 为 Wafer、视觉为 Alibaba，并显式 EXECUTION_BLOCKER_REVIEW=1；仅改默认开关的运行不能标成相同条件对照。

arena:reset 由私有 token 保护；排队、活动或待核对任务存在时拒绝重置。真值和变体名称不放入被测 Agent 可见目标。evaluate 通过正式 API 发起、读取和检查任务，不能直接调用执行器内部函数来绕过持久层。

## 免费本地预检

先 pnpm build，再执行：

```sh
pnpm test:fixtures
pnpm test:fixtures:export
pnpm validate:persistence
pnpm validate:investigation
pnpm validate:blocker-review
pnpm validate:business -- --preflight
```

后四项运行真实编译服务、Mastra SDK 和 Chromium，使用明确的本地固定模型响应。它们验证持久终结、取消、原子调查、有限审查集成与业务契约可执行性，不证明真实模型会正确决策，也不调用付费模型。

`validate:business -- --preflight` 通过实际 HTTP 创建任务（不直接调用 executeRun），跑完 E0–E4 固定模型场景，再注入一次未知写入与一次非法 finish 验证系统阻止它们，最后用真实浏览器驱动工作台 U01–U05 并保存三张真实 UI 截图（创建表单、导出成功报告、缺陷证据）。它证明契约**可执行**，不写成「真实 Agent 自主发现通过」。

## 结果与证据

评分区分业务结果、发现质量、证据有效性、完整测量、结束行为和副作用。截图存在不等于证据成立；需核对来源、样本和目标。检查原始报告/事件、数据库终态与事件尾，证据文件需要可读取且摘要一致。

重点保留正常、预期拒绝、恢复成功、真实缺陷、未知结果和不可操作分支。健康恢复反例不可省，否则“遇到失败就结束”也可能看似高效。

## 谁维护靶场

开发者维护真实业务行为、私有答案与评分器。产品/业务负责人确认预期。Agent 可以提出遗漏场景、生成候选页面或用例，但不能独自生成答案再宣布自己通过；合入需独立审核与验证。

产品成熟后靶场继续服务规则回归、模型/提示升级、误报漏报复盘和跨业务迁移。开发集、回归集与保留集分开；已用于调优的场景不再是未见泛化证据。新增业务只补充它引入的适用性、状态或预期差异。

学习候选的异常/健康/unknown 验证和既有规则复查见[规则流程](rules-and-rule-library.md)。当前真实成绩与限制见[验收基线](validation-baseline.md)；业务契约阶段的进展、未决项与失败记录见[交接记录](../plans/business-contracts-handoff.md)。

`evaluation/private/export/scorer.ts` 先证明能拒绝假阳性（E01–E10 反例：缺显式结束、业务不一致、只 probe 未真正恢复、第二次 create 冒充恢复、测量无窗口/全 null/错误目标/有干预、重复或误报、规则未执行、审批来源无效、答案泄漏、API 与数据库不一致、批次不全或混合构建）。它读正式 API 报告、独立事件/下载证据与私有业务真值组合评分，不读生产适配器给出的「正确答案」，也不接受模型自报成功。
