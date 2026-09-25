# 业务契约开发交接记录

状态：**blocked**（见文末自检结论）。执行依据为[任务书](next-development-plan.md)和[验收计划](business-contracts-acceptance.md)。

只有实际运行过的命令才标为通过；本文件所有数字均来自本机 `data/` 下的原始证据，命令与退出码逐条对应。

## 版本与来源

| 字段 | 实际值 |
| --- | --- |
| base SHA / 开工时 main SHA | `1b377bb7d1bcbeb0ae607930ddc8506a486175ab`（main；= 本分支 merge-base） |
| 开发分支 / head SHA | `dev/business-contracts-export` / 最后一个**代码**提交 `8447a73`（其后仅有只改 `plans/`、`README.md`、`docs/` 的文档提交，不改变构建产物）。分支 tip 与提交数用 `git rev-parse HEAD` / `git rev-list --count <base>..HEAD` 取得——不在此写死，因为它会随本记录自身的提交而变 |
| PR 或 bundle / bundle base | 未创建 PR、未 push（push 被会话权限拒绝，见「偏差」第 6 项）。已交付 bundle `ui-sentinel-business-contracts.bundle`（仓库根目录）；**base `1b377bb7d1bcbeb0ae607930ddc8506a486175ab`**（= `origin/main` 现有提交），head = 该 bundle 内 `dev/business-contracts-export` 的 tip，用 `git bundle verify <file>` 打印。`git bundle verify` 通过 |
| Server 构建 / lockfile / 靶场构建 hash | server `c2b288c2dd49e4f2b1b8ea59fe42cff785ecfdfc37238dc1afc492f9fb19d796`；`pnpm-lock.yaml` `a83d99f740493e28ea5a0da4072cd87bf3b89f59e638970893cbc17ca6858701`；arena `a83102517b9589dbf061d371aee35fe6291ca76e4d937b9e7fab48fe19e3825f`；arena-export `0f8332916ed593764ebebe0adeab644b24290c85833f441440f4af8c941cef72` |
| checkout / export 契约 hash 与 adapter revision | checkout@1 / adapter `checkout@1` / `5f8c5307a1e31f51dcd227be3101f670a6fc7e34389e9fac44f731b1c019fc83`；export@1 / adapter `export@1` / `996f98f28ca663bf894a47ec7aafd0cc028778f4056276b5faf96b80202cb6bd`（均在默认端口 4173/4183 下计算，命令见「快速接手」§5） |
| campaign 目录 / manifest | 诊断 `data/business-validation/2026-09-25T06-04-47-808Z/`（`manifest.json` 记录 commit `283ea36`、构建 `c2b288c2…`、模型与提供方）；正式批次 `data/business-formal/2026-09-25T07-13-39-663Z/`（在当前 tip 复跑的拒绝记录；另有 `…06-24-28-394Z/`） |
| 原批准来源 / 候选 ID / 声明 hash | **不存在**。计划指定的 `data/learning/2026-09-24T10-57-41-736Z`（候选 `proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607`）在本机缺失（`data/learning/` 整个目录不存在），未伪造批准 |

hash 是按环境计算的：契约快照含 `environment.publicOrigin`，每次运行的运行期端口都不同，所以报告里的 hash 逐次不同（例如诊断 E0 `f9ffa0d6…`、预检 `ea478d91…`）。上表给的是**固定默认端口下的规范 hash**，用于比较契约内容本身；这与 C06「改变环境产生新 hash」是同一规则，不是不一致。

**诊断与 HEAD 是同一构建**：`8447a73` 重新 `pnpm build` 后 `dist/server/index.js` 的 hash 与诊断 manifest 记录的 `c2b288c2…` **逐字节相同**，且 `283ea36..HEAD` 对 `src/`、`arena/`、`evaluation/`、`scripts/build.ts` 的 diff 为空（本阶段最后两个提交只动 `scripts/validation/`）。所以 G4 的结论不受构建漂移影响，正式 runner 的 `diagnostic-not-passed` 拒绝也不是「构建不同」造成的。反过来：一旦 E2 的接口问题被修复，构建 hash 必然改变，届时**必须重新冻结并重跑诊断**，不能沿用本次诊断授权正式批次。

## 阶段进度

| 阶段 | 状态 | 变更提交/证据 | 未完成项 |
| --- | --- | --- | --- |
| P0 耦合审计 | 完成 | `e800258`（基线夹具修复，单独记录）、`c447337`、`b9395c9`；耦合表见下 | — |
| P1 配置与兼容 | 完成 | `10c8052`、`6a2f9fe`、`959c791` | — |
| P2 购物抽取 | 完成 | `1d9e4e6` | — |
| P3 导出业务 | 完成 | `bbae310`、`274b46c` | — |
| P4 工作台与评估 | 完成 | `4b1944d`、`f403561`、`791fca3`、`1416ae1`、`2e8223a`、`9f6bd29`、`51ec0eb`、`2f52d7f`、`9659ca6`、`8447a73` | — |
| P5 真实验收 | **blocked** | 诊断 4 轮（`9659ca6`、`35f56ce`、`5ded01c`、`23d674a`、`65c6c0b`、`283ea36`）；正式入口 `c5a6e01`、`844e152` | G4 E2 一条断言未过 → G5 未执行 |
| P6 交付 review | 进行中 | 本文件、README 更新 | push/PR 未做 |

### P0 耦合表（任务书第 2 节，逐项最终归属）

| 现有位置 / 符号 | 通用或业务责任 | 新位置 | 行为变化 | 关联测试 |
| --- | --- | --- | --- | --- |
| `src/agent/policy.ts` 购物目标、固定五秒重试、十秒反馈、一笔订单限制 | 业务 | 由 `BusinessContractSnapshot` 参数化（`requirements` / `effects`）；`buildAgentInstructions` 只描述契约声明的业务，无契约（legacy）不声明任何要求 | 每个 run 拿到**自己契约**的要求与写入上限；此前所有 run 都被读作购物并且都被限一笔订单 | `src/execution/tool-guidance.test.ts`、`src/agent/policy` 相关断言；`5b50e6a` |
| `src/execution/executor.ts` `businessResponses`、`orderObserved`、`verifiedBusiness`、网络监听、动作后等待、Agent 输入、结束摘要 | 通用（机制）+ 业务（解释） | 机制留在 executor；解释全部经 `BusinessAdapter` / `BusinessRuntime`。新增 `business:observation`→`business:fact` 规范化事件；新增保留资源（`retainResource`）；事实按派发写入的动作归属 | 不再嗅探响应体字段；异步业务的 GET 轮询不再被认领为无关动作的响应；事实按 `operationId#attempt#version` 去重 | `src/execution/executor.test.ts`（含 "asynchronous business response attribution"、`retained business resources (F04)`）、`src/business/facts.test.ts` |
| `src/execution/rule-binding.ts` `retryTrigger` 要求 `orderId`、购物失败字段、当前页面关联 | 通用 | `retryTrigger(events, pageText)` 只读规范化触发；实体身份为 `operationId` | 同一份已批准声明可绑定订单或导出任务，不依赖 `orderId` | `src/execution/rule-binding.test.ts`、`src/business/normalization.test.ts`（R01） |
| `src/execution/task-state.ts` `payment-success`/`payment-rejected`；处理中不得提前完成 | 通用 + 购物兼容 | 新增一等触发 `business-success` / `business-rejected`；`payment-*` 仅由 checkout 适配器的 `compatibilityEvent` 映射；`processing` 不清空待验证范围 | export 不伪造支付事件；处理中不再被当作「未触发」 | `src/execution/task-state-normalized.test.ts`（B08） |
| `src/rules/builtin/business-outcome.ts` 订单 ID + 页面反馈关联 | 业务耦合（已移除） | 读规范化事实的 `operationId`，与页面可见文本关联 | 此前读 `response.orderId`，export 永不产生该字段 → 导出 run 上该规则**根本无法触发** | `src/rules/builtin/business-outcome.test.ts`、`src/business/normalization.test.ts`；`5c1a1ff` |
| `src/rules/builtin/response-time.ts` 固定 10000ms | 业务 | 阈值来自当次快照的 `feedbackWarningMs`；无声明时判 `unknown`，不套用记忆中的十秒 | 需求变化即生效；缺证据是 unknown 而非 default | `src/execution/response-time.test.ts`、`src/execution/executor.test.ts`（R07）；`f403561` |
| `src/execution/journeys/library.ts` 仅按 `environmentId` 复用、order 文本过滤 | 通用 | 按契约身份（profile、contract hash、adapter revision、origin）复用；移除 `/order[- ]\d/i` 业务过滤；无契约的旧 Journey 不参与新 run | 同标题同路径但不同契约不再复用；旧记录仍可读 | `src/execution/journeys/journeys.test.ts`（含 "never loads a legacy journey that carries no contract"） |
| `src/execution/browser.ts` 页面/导航边界 | 通用 | 边界由 run 自己记录的 entry 派生；export 的 origin/端口/私有控制单独断言 | 新靶场未放开任意地址；`4173` 的验证不蕴含 `4183` | `src/execution/security.test.ts`（P08 export 用例） |
| `src/execution/temporal-investigation.ts` / `finish-contract.ts` | 通用 | 未改；`finish-contract` 的措辞参数化（不再声称购物与一笔订单） | 调查窗口与四态结果不变 | `src/execution/temporal-investigation.test.ts`、`src/execution/finish-contract.test.ts` |
| `src/agent/decisions/blocker-review.ts` | 通用 | **未改动**（本分支零 diff，保守跳过条件未扩大） | 无 | 既有 blocker-review 预检 8 断言 |
| `src/shared/types.ts` / `execution/run-manager.ts` | 通用 | `RunSpec.businessContract` 新增；run-manager 传递 | 快照先持久化再入队 | `src/server/routes/business-runs.test.ts` |
| `src/server/routes/runs.ts` 原仅允许 `ARENA_PORT` | 通用 | `businessProfile` 解析、注册表校验、环境匹配、legacy checkout@1 兼容；非法请求 400 且不入队 | 省略 `businessProfile` 的旧 arena 请求仍解析 checkout@1；显式错误配置不回退 | `src/server/routes/business-runs.test.ts`（C01–C08） |
| `src/server/reports/run-report.ts` / `storage/database.ts` | 通用 | 报告增加业务摘要；旧记录 `legacy-unversioned` | 不重写旧记录，不伪造历史要求 | `src/server/routes/business-runs.test.ts`（C08） |
| `src/server/evaluation-access.ts` | 通用 | **未改动** | 私有控制、准入锁、重置边界沿用 | 预检 `workbenchHidesPrivateControl`、`resetIsRepeatableAndIsolated` |
| `src/web/main.tsx` 创建任务与报告界面 | 通用 | 业务选择器（真实 API 字段）、当次要求/hash/adapter/环境、`legacy-unversioned` 显式呈现 | 刷新后仍显示当次快照 | 预检 U01–U05（含 `U02successReportShowsBusiness`） |
| `scripts/validation` / `evaluation/private` / `evaluation/support` | 通用 | 新增 `business.ts`（preflight/diagnostic/formal 分派）、`business-diagnostic.ts`、`business-formal.ts`、`evaluation/private/export/*` | 无付费请求的预检与真实网关分离，`--preflight` 会清空真实凭据 | 见验收追踪 |
| `scripts/build.ts` / `dev.ts` / `pnpm-workspace.yaml` | 通用 | 增加 `arena-export` 包与 `dist/arena-export` 构建目标 | 购物端口未覆盖 | `arena:export:start`、`test:fixtures:export` |

**被修改而非删除的原测试（替代覆盖）**：`src/execution/journeys/journeys.test.ts` 的「仅按环境复用」断言被改写为契约身份断言（原文断言的正是 R06 禁止的行为）；`arena/export/src/server/api.test.ts` 中「E2 retry 返回 409」被改写为「返回 200 且推进 attempt」（原文锁定的正是 F04 禁止的行为）；`src/execution/executor.test.ts` 的购物夹具改经规范化形状表达，购物场景在 `src/business/facts.test.ts` 重建。基线 `e800258` 修复的 `/bound-page` 夹具单行缺陷（缺少 message 导致反馈关联等待耗尽工具预算）单独提交并说明，不是本阶段的回归。

## 验收追踪

命令与退出码均为本机实测。代码门槛在冻结提交 `8447a73` 上运行（`pnpm test` 592/592、`pnpm validate:business -- --preflight` 28/28、`pnpm test:fixtures:export`）；文档提交之后又重跑过 `format:check`、`typecheck`、`build`（重建产物 hash 不变）、`preflight` 与全量 `test`，结果相同。`dist/*` hash 见版本表。

**一个会偶发非零退出的已知 flake**：`src/execution/browser.test.ts` 的 500ms 试点击竞态（详见「偏差」第 7(c) 项）。本文件所有「592/592」都是实际运行结果，但其中至少一次中间运行曾因该 flake 显示 591/592 后重跑通过；不要把它读成"从未失败"。

| 门槛 | 命令、测试文件/用例 | 退出码/实际结果 | 原始证据 |
| --- | --- | --- | --- |
| G0 免费基线 | `pnpm install --frozen-lockfile` / `format:check` / `typecheck` / `test` / `build` / `test:fixtures` / `validate:persistence` / `validate:investigation` / `validate:blocker-review` | 全部 exit 0（见下方逐条） | 本机终端；`data/persistence-preflight/`、`data/atomic-fixture-check/` |
| G0 `pnpm test` | vitest run | exit 0，**70 文件 / 592 用例全通过**（当前 tip 上重复运行亦然） | — |
| G0 `pnpm test:fixtures` | `scripts/verify-fixtures.ts` | exit 0，C0–C5 六例真值全部核对 | `data/verification/` |
| G0 `pnpm test:fixtures:export` | `scripts/verify-export-fixtures.ts` | exit 0，E0–E4 五变体，含 F04 判别（E1 usable/recovered，E2 inoperable/not recovered，两者 `backendPermitsRetry=true`） | `data/verification/export-fixtures.json` |
| G0 `pnpm validate:persistence` | 编译服务 + Mastra + Chromium + 本地固定模型 | exit 0，runs=6 durable，`paidModelRequests: 0` | `data/persistence-preflight/2026-09-25T07-04-41-674Z/`（另 `…05-51-47-278Z/`） |
| G0 `pnpm validate:investigation` | 同上 | exit 0，9 断言全 true，`paidModelRequests: 0` | `data/atomic-fixture-check/2026-09-25T07-05-35-593Z/` |
| G0 `pnpm validate:blocker-review` | 同上 | exit 0，8 断言全 true，`paidModelRequests: 0` | `data/atomic-fixture-check/2026-09-25T07-05-38-813Z/` |
| G1 C01–C08 | `src/business/selection.test.ts`、`src/server/routes/business-runs.test.ts` | 通过（在 `pnpm test` 内） | — |
| G1 B01–B10 | `src/business/facts.test.ts`、`src/business/normalization.test.ts`、`src/execution/task-state-normalized.test.ts`、`src/execution/executor.test.ts`（B07） | 通过 | — |
| G1 P01–P10 | `src/execution/side-effect-policy.test.ts`（P01–P03、P05、P06、P10）、`src/execution/executor.test.ts`（P04、P07）、`src/execution/security.test.ts`（P08）、`arena/export/src/server/api.test.ts`（P09） | 通过 | — |
| G1 R01–R09 | `src/business/normalization.test.ts`+`src/rules/builtin/business-outcome.test.ts`(R01)、`evaluation/private/export/scorer.test.ts`(R02)、`src/execution/rule-binding.test.ts`(R03)、`src/execution/sample-window.test.ts`+`src/rules/proposal.test.ts`(R04)、`src/execution/temporal-investigation.test.ts`(R05)、`src/execution/executor.test.ts`+`journeys.test.ts`(R06)、`executor.test.ts`+`response-time.test.ts`(R07)、`executor.test.ts:1045/1953/2023`+`finish-contract.test.ts`+`run-phase.test.ts`(R08)、`executor.test.ts:2068`+`completion-integrity.test.ts`(R09) | 通过。**R03/R04/R05/R08/R09 未按 ID 打标签**，按行为逐条核对后归入上述文件（R03/R04/R05/R08 是通用契约用例，不含业务字段）。R08 由三个具名用例共同覆盖：未决假设不得清洁完成、审查模型想早结束时仍交回探索、审查期间页面出现恢复控件则拒绝先前有效的阻断提案 | — |
| G2 F01–F08 | `pnpm validate:business -- --preflight` | exit 0，**28 断言 / 0 失败**，`paidModelRequests: 0` | `data/business-preflight/2026-09-25T06-45-26-473Z/`（`assertions.json`、`details.json`、`summary.json`、四份 `report-*.json`、三张 PNG） |
| G2 变体真值 | `pnpm test:fixtures:export`（同 G0 行） | exit 0，五变体真值与 create/retry/attempt/产物计数 | `data/verification/export-fixtures.json` |
| G3 U01–U05 | 同上 preflight 的 Playwright 段 | 全通过：`U01profileCatalogueOffered`、`U01selectionChangesEnvironment`、`U02reportShowsContract`、`U02successReportShowsBusiness`、`U03legacyStateIsExplicit`、`U04invalidSelectionRefused`、`U05businessOutcomeVisible`、`U05evidencePresent` | 三张真实 UI 截图（§5 要求的三张齐备）：`u01-create-form.png`、`u02-export-success.png`、`u05-export-report.png` |
| 评分反例 E01–E10 | `evaluation/private/export/scorer.test.ts` | 通过（在 `pnpm test` 内）。每条反例都从一个「会被接受」的 run 出发只篡改一处，正向半边同时断言，避免全盘拒绝也能满足负例 | — |
| G4 smoke + 五例诊断 | `pnpm validate:business -- --diagnostic` | **exit 非零。5/6 通过**：smoke PASS、E0 PASS、E1 PASS、E3 PASS、E4 PASS、**E2 FAIL `['defect_eligibilityCited']`** | `data/business-validation/2026-09-25T06-04-47-808Z/`（`diagnostic-summary.json`、`E2-score.json`、`E2-report.json`、`E2-truth.json`） |
| G5 A 导出探索 15 轮 | `pnpm validate:business -- --formal --diagnostic-source <dir>` | **未执行，不得填 15/15** | 拒绝证据：`data/business-formal/2026-09-25T07-13-39-663Z/`（当前 tip 复跑：`gate:false`、`exitNonZero:true`、`reasonCodes:['diagnostic-not-passed']`、45 行全 blocked 全 `planned:false`、非零退出、无模型调用）。另 `…06-24-28-394Z/` |
| G5 B 导出规则 6 轮 | 同上（另需 `--approved-source`） | **未执行，不得填 6/6** | 同上；另因批准来源缺失 `approval-source-missing: …/data/learning/2026-09-24T10-57-41-736Z/runs.db`（manifest `approval.ok:false`）。**缺失是独立原因**：即使诊断通过，B/D 仍会 blocked |
| G5 C 购物 minimum 18 轮 | 委派 `pnpm validate:acceptance` | **未执行，不得填 18/18** | 同上（formal runner 对 C/D 显式委派，不在此重复其 18 例门槛） |
| G5 D 购物学习 6 轮 | 委派 `pnpm validate:learning -- --recheck` | **未执行，不得填 6/6** | 同上 |
| 停服持久化审计 | 需在正式批次后执行 | **未执行**（无正式批次） | — |

历史成绩（`docs/validation-baseline.md` 的独立布局 12/12、minimum 18/18、复查 6/6）**不属于**本次成绩，未用于任何一格。

G4 逐例（`data/business-validation/2026-09-25T06-04-47-808Z/`）：

| 用例 | 状态 | 业务结果 | stopReason | actions / modelCalls / elapsedMs | scorer |
| --- | --- | --- | --- | --- | --- |
| smoke | PASS | — | — | — | 连通性：1 tool call + 1 vision 命中 |
| E0 | PASS | success | goal-reached | 3 / 6 / 34,531 | pass |
| E1 | PASS | success | goal-reached | 4 / 7 / 28,162 | pass |
| E2 | **FAIL** | unknown（blocked） | blocked | 3 / 7 / 60,464 | fail `['defect_eligibilityCited']` |
| E3 | PASS | rejected | goal-reached | 5 / 6 / 26,880 | pass |
| E4 | PASS | success | goal-reached | 4 / 8 / 32,981 | pass |

E2 的 run 行为本身正确：声明 `Try again recovery button`，26 样本覆盖 5,047ms 全 false，完整性 clean，产出 source=agent 的支持性 finding。唯一失败的是该 finding 未引用资格资源（详见「偏差」第 3 项）。

## 每组 ID → 实际测试映射

- **C01–C05**：`src/business/selection.test.ts`（`describe` 内具名 C0x 用例）+ `src/server/routes/business-runs.test.ts`
- **C06、C08**：`src/server/routes/business-runs.test.ts`；**C07**：同上 + `src/business/facts.test.ts`
- **B01–B06、B09、B10**：`src/business/facts.test.ts`、`src/business/normalization.test.ts`；**B07**：`src/execution/executor.test.ts` `describe('verified business state across navigation (B07)')`；**B08**：`src/execution/task-state-normalized.test.ts`
- **P01–P03、P05、P06、P10**：`src/execution/side-effect-policy.test.ts` `describe('side-effect policy (P01, P02, P03, P06, P10)')`；**P04/P07**：`src/execution/executor.test.ts` `describe('export side-effect and cancellation boundaries (P04, P07)')`；**P08**：`src/execution/security.test.ts`（export 边界用例）；**P09**：`arena/export/src/server/api.test.ts` `it('refuses to reset while a run is active, queued or awaiting reconciliation')` + `it('requires the control token for every private operation')`
- **R01**：`src/business/normalization.test.ts`、`src/rules/builtin/business-outcome.test.ts`；**R02**：`evaluation/private/export/scorer.test.ts`（含 declared-target 与 drift 两例）；**R06**：`src/execution/journeys/journeys.test.ts`；**R07**：`src/execution/response-time.test.ts`、`src/execution/executor.test.ts`
- **F01/F03/F05/F06**：`arena/export/src/server/{state,api}.test.ts`；**F02/F04/F07**：`pnpm test:fixtures:export` + `src/business/facts.test.ts`「retained business resources (F04)」；**F08**：`scripts/build.ts`/`dev.ts` + `arena:export:start`
- **E01–E10**：`evaluation/private/export/scorer.test.ts` `describe('scorer counterexamples (E01-E10)')`

## 模型与费用

| 项 | 值 |
| --- | --- |
| Agent 模型 / 提供方 | `deepseek/deepseek-v4.1-flash` / Wafer（`VALIDATION_AGENT_PROVIDER` 显式固定，未自动选型、未 fallback） |
| 视觉模型 / 提供方 | `qwen/qwen3.7-plus` / Alibaba |
| 提供方来源 | `baseline-default`（`evaluation/private/export/diagnostic-config.ts` 的 `resolveProviders`；显式指定**其他**提供方会拒绝，不会静默纠正） |
| 有限审查（Jev） | `EXECUTION_BLOCKER_REVIEW=1`，固定已验证快照；预检同时覆盖关闭态（不修改产品默认关闭策略） |
| 原子调查 | `EXECUTION_ATOMIC_INVESTIGATION=1` |
| 冻结参数 | `totalTimeoutMs=300000`、`maxActions=40`、`maxModelCalls=30`；工具 15s、单请求 60s、至多一次安全重试 |
| 预算上限 | `VALIDATION_MAX_COST_USD=2`，**整个 campaign 共享**，含 smoke/诊断/A–D/失败请求 |
| 实际费用 | **$0.044014880000000006**（`knownCostUsd` 全额结算，`unknownCosts: 0`，`reservedUsd: 0`） |
| formal 起始余额 | $2 − $0.0440（诊断已花）= **$1.95598512**，新建输出目录不重置（已验证） |
| 单轮分布 | 见 G4 逐例表；E2 最长 60.5s，其余 27–35s，均远低于 300s 天花板 |
| 未运行条目 | G5 全部 45 轮（`not-run`/`blocked`，见验收追踪），未计费 |
| 墙钟 | 诊断批次含 smoke 与 E0–E4；单轮 elapsedMs 见上表，未把重叠时间相加 |

历史 4 次付费批次的失败与修复见 `progress.md`（P5 段）。其中两次是**我方缺陷**而非产品缺陷，已分别修复并保留记录：gateway 未开计量窗口（`accountedUsd 0`，整批作废）、提供方未固定导致 DeepInfra/Sail 负载均衡（`35f56ce`）、夹具自行用掉靶场唯一 create 后再跑 agent（`5ded01c`）。这些批次不计入任何通过门槛。

## 偏差、失败与限制

**1. 基线缺陷（非本阶段回归，已单独修复）。** 计划称基线 387 用例；实测 `1b377bb` 与 `a53c751` 均为 385 通过 / 2 失败。根因：`src/execution/executor.test.ts` 的 `/bound-page` 夹具只渲染 `Payment failed order-failed`，缺 message，而执行器的动作后反馈关联要求 orderId **与** 可见 message 同时出现，导致等待耗尽 15s 工具预算、进入 finalizing 并拒绝 `rule_check`。自 `fe0c6eb`（2026-09-23）起从未通过。修复为夹具单行（与真实靶场 `arena/checkout/src/pages/Checkout.tsx:145-147` 一致），提交 `e800258`，RED→GREEN `executor.test.ts` 41/43 → 43/43。**未**放宽执行器的关联规则——B04/B05 正要求「仅出现 success/orderId 文本不能证实成功」。

**2. 提供的方固定（`35f56ce`）。** 计划 §8.4 要求显式固定 Wafer/Alibaba。我最初未设 `VALIDATION_AGENT_PROVIDER`，网关不下发 `provider.only`，OpenRouter 在 27 个端点间负载均衡，实际由 DeepInfra(33)/Sail(24) 服务、Wafer 为 0，单次调用 20–54s（基线 4–11s），300s 天花板在调查中被耗尽。修复是**跑计划指定的条件**，不是抬高上限（300s 也是产品硬边界）。同时发现原 smoke 两处错误：用完整 300s 业务 run 冒充连通性检查；拒绝列表门让 `blocked`/`no-progress` 的 run 通过并授权全部五例。已替换为项目自带 `smoke-model.ts` 的正向断言 + freshness 窗口。

**3. G4 未过：E2 `defect_eligibilityCited`（当前阻碍，已停止盲目重跑）。** 计划 §8.4 规定「相同阻碍两次诊断/修复后仍未解决，停止盲目重跑，交付原因和全部证据供主 Agent 处理」，已照办。

- 症状：E2 恰有一条断言失败。该断言要求支持性 finding 引用一个解析后含顶层 `prerequisite` 键的产物。
- 两次修复周期与结果：
  - 周期 1（`65c6c0b`，诊断 `2026-09-25T05-53-02-064Z`）：诊断出**没有任何生产者能产出该产物**，资格 GET 完全不落痕（适配器对其返回 null，且无 `compatibilityEvent`，`commitFact` 在自己的门处返回）。修复为适配器声明的 `retainResource?`，持久化为逐字 `resource` 产物 + `business:resource` 事件 + 提交给 agent 的引用。结果：机制生效（`business:resource` 在 seq 59，引用自 seq 4 起在上下文中），但 agent 仍只引用 screenshot/snapshot/measurement。E2 仍失败同一条。
  - 周期 2（`283ea36`，诊断 `2026-09-25T06-04-47-808Z`）：诊断出资源只以「引用 + kind」暴露，等于要求 agent 引用一份**读不到**的文档——它的依据引用了 job payload 的 `prerequisitesMet: true`，而资源说 `prerequisite.met: false`。修复为让已发布正文随引用一起传递，超出预算时显式截断。结果：正文与引导语在 E2 自己的 7 次模型请求中均可验证地存在（引用与 `not available from this workspace` 自 seq 5 出现），但结果不变。
- 根因（自我更正后的准确表述）：断言并非严格不可达。旧路径（`hypotheses_record` + `transition_observe` + `findings_submit`）确实接受 agent 提供的 `evidenceRefs`（`src/execution/tool-inputs.ts:77`）。成立的是更窄的一点：在**产品自身引导所倾向的那条路径**上不可达。`temporalInvestigationInstructions` 说「prefer investigation_check … no separate hypotheses_record, transition_observe or findings_submit is needed for that same claim」，而该路径下 finding 的 `evidenceRefs` 由执行器组装、agent 无法提供：`executor.ts:1188` 取 `[...result.evidenceRefs]` ← `temporal-investigation.ts:122` 取 `measurement.evidenceRefs` ← `executor.ts:1046` 取 `[...obs.evidenceRefs]` + 测量引用（即 screenshot/snapshot/measurement）。`investigation_check` 的输入 schema 完全没有证据字段（已在该 run 自己的工具参数中核实：提交只带 `phenomenon/basis/trigger/elementRef/target/condition/durationMs/severity`）。E2 的 agent 正是走了这条被引导的路径（1× `investigation_check`、3× `page_act`、1× `page_observe`、1× `tool_result_read`、1× `run_finish`）。
- 该断言此前的夹具掩盖了这一点：`scorer.test.ts` 直接把 `eligibility.json` 手写进 `findings[].evidenceRefs`，绕过了真正填充该字段的执行器路径。夹具已改为 `type: 'resource'` 且带真实正文，并新增两条反例（只引用屏幕不引用资源；引用一个存在但无 `prerequisite` 的同名文件）。
- **未做**（均为计划明令禁止或会削弱门槛）：放宽 `eligibilityCited` 去接受工作台渲染的提示（那是客户端投影，不是业务源）；在 `complete()` 里特判塞入资源引用（业务专属分支，会让断言按构造满足）；删除断言；把 agent 引到旧路径只为点亮一格。
- **留给主 Agent 决定**：`investigation_check` 是否应像 `findings_submit` 那样接受声明的支撑证据引用（这是影响**每个**业务的 agent 证据契约变更，需要自己的验收证据），或验收计划的「资格来源」要求本就应在旧路径上满足。两者都是计划级决定，dev 端迭代不应以削弱门槛或重路由 agent 来裁定。

**4. 原批准来源缺失（外部阻碍，未伪造）。** 计划指定的 `data/learning/2026-09-24T10-57-41-736Z` / `proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607` 在本机不存在（`data/learning/` 目录本身缺失）。按 §8.3，B/D 记 `blocked`，不伪造批准。只读导入本身已实现并针对按真实 schema 构造的来源测试通过（`1416ae1`、`evaluation/private/export/approval-source.test.ts`）。**没有**输出任何密钥或凭据内容。

**5. `.env.example` 未更新（会话限制，需人工编辑）。** 该文件（以及 `.env`）被用户的显式 `Read` 拒绝规则覆盖，我未读取、未绕过，也不通过任何其他工具、编码或子代理去取。后果：新增的导出端口/token（`EXPORT_ARENA_PORT`、`EXPORT_API_PORT`、`EXPORT_CONTROL_PORT`、`EXPORT_CONTROL_TOKEN`）未在其中记录。默认值已存在于 `src/shared/config.ts`，且每个脚本都显式设置它们，功能无缺失，但示例文件是陈旧的。

**6. 交付形态：已 bundle，未 push。** 计划要求「push 此开发分支或交付 bundle」，后者的条件已满足：

```sh
git bundle verify ui-sentinel-business-contracts.bundle
# → lower is okay；需要 base 1b377bb7d1bcbeb0ae607930ddc8506a486175ab（已在 origin/main）
git fetch ui-sentinel-business-contracts.bundle \
  'refs/heads/dev/business-contracts-export:refs/heads/dev/business-contracts-export'
```

接收者若从 `origin/main` 的 clone 取用，base 已存在，无需额外传输。**未 push、未创建 PR**：`git push` 被本会话的权限规则拒绝，我未以其他方式（改 remote、换协议、动 hook 或子代理）绕过该拒绝。`origin` 当前只有 `main`，推送可能附带分支保护等仓库设置，交由主 Agent 或用户决定。**未合并 main。**

按计划要求区分两类提交：**实际验收代码**止于 `8447a73`（其 `dist/server/index.js` hash `c2b288c2…` 与诊断 manifest 逐字节一致）；其后的文档提交只动 `plans/`、`README.md`、`docs/`，不改变任何构建产物，因此 G4 的结论仍属于这一构建。若主 Agent 修复 E2 的接口问题，构建 hash 必然改变，`8447a73` 的构建与其诊断即作废，必须重新冻结并重跑诊断后才可授权正式批次。

**7. 已知限制（非阻碍）。** (a) `P04` 的 export 夹具把不确定写入建模为 create 提交后的 5xx，而非 `req.socket.destroy()`——截断流会让 Chromium 自行重发 POST，一次点击产生两次 create，那样测到的是传输层而非执行器；与既有 checkout P04 用例保持一致。(b) `P07` 断言迟到工具调用**按名**被拒，而非只断言「没有发生 create」（第一版是空断言：迟到调用根本没到达，去掉 `throwIfAborted` 也不影响保护）。(c) `browser.test.ts` 的 "samples pointer actionability without clicks…" 在全量运行中**偶发**失败：`locator.click: Timeout 500ms exceeded`（元素已解析到，卡在 visibility/enabled/stability 检查）。该文件本分支零 diff（`git diff 1b377bb..HEAD -- src/execution/browser.test.ts src/execution/browser.ts` 为空），隔离运行 3/3 通过，同一 tip 上紧接着的全量运行 592/592 通过。属于机器负载下的 500ms 试点击竞态，**未修**且未被掩盖：本文件如实记录它会让 `pnpm test` **偶发非零退出**，主 Agent 复跑时若命中同一现象，这不是本阶段的回归。这条不应被当作"592/592 已通过"的同义反复。(d) 此 libSQL 客户端拒绝 `?mode=ro`/`?immutable=1`（`URL_PARAM_NOT_SUPPORTED`），只读来自 `PRAGMA query_only`（真实拒绝，已测）。

## 快速接手与演示

前置：Node.js 22.18–22.x 或 24.x、pnpm 10、Chromium。

```sh
# 1. 依赖与构建
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build            # 产出 dist/server、dist/arena、dist/arena-export

# 2. 两个靶场 + 工作台（三个终端）
pnpm start                    # 工作台 http://localhost:4111
pnpm arena:start              # 购物靶场 http://localhost:4173
pnpm arena:export:start       # 导出靶场 http://localhost:4183

# 3. 免费门槛（不调用付费模型）
pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm test:fixtures && pnpm test:fixtures:export
pnpm validate:persistence && pnpm validate:investigation && pnpm validate:blocker-review
pnpm validate:business -- --preflight        # 28 断言，0 付费请求

# 4. 真实模型（需 OPENROUTER_API_KEY；缺 key 明确非零退出，不 mock）
pnpm validate:business -- --diagnostic
pnpm validate:business -- --formal --diagnostic-source <通过诊断的目录> \
  [--approved-source <已关闭学习目录>] [--groups A,C]

# 5. 复算契约 hash（固定默认端口下的规范值）
ARENA_PORT=4173 EXPORT_ARENA_PORT=4183 node --import tsx -e "
  import('./src/business/registry.ts').then(({buildContractSnapshot, registeredProfiles}) => {
    for (const p of registeredProfiles()) {
      const s = buildContractSnapshot(p)
      console.log(p.id+'@'+s.revision, s.hash, s.environment.publicOrigin)
    }
  })"
```

**可访问制品**（均在 `data/`，未提交 Git；接收者从本机或交付 bundle 取得）：

| 制品 | 位置 |
| --- | --- |
| 预检全部断言与细节 | `data/business-preflight/2026-09-25T06-45-26-473Z/{assertions,details,summary}.json` |
| 三张真实 UI 截图（§5 要求齐备） | 同目录 `u01-create-form.png`、`u02-export-success.png`、`u05-export-report.png` |
| 预检四份报告（成功/失败/未知写/非法 finish） | 同目录 `report-*.json` |
| 五变体真值与 F04 判别 | `data/verification/export-fixtures.json` |
| 诊断逐例评分与真相 | `data/business-validation/2026-09-25T06-04-47-808Z/E*-{score,report,truth}.json` |
| 诊断摘要、manifest、花费 | 同目录 `diagnostic-summary.json`、`manifest.json`、`spending.json` |
| 正式批次拒绝证据（45 行 blocked） | `data/business-formal/2026-09-25T06-24-28-394Z/` |
| 持久化预检 | `data/persistence-preflight/2026-09-25T05-51-47-278Z/` |

大制品（`runs.db`、模型请求/响应日志、PNG）不提交 Git。诊断目录中的请求/响应日志含 hub 侧脱敏后的正文，交付时按需裁剪。

## 开发 Agent 自检结论

**结论：`blocked`。**

不是 `ready-for-review`：G4 未通过（E2 一条断言），因此 G5 的 45 轮矩阵按计划顺序不得启动，且原批准来源缺失使 B/D 独立地也不可行。不是 `failed`：除该一条断言外，G0–G3 全部实测通过，诊断 5/6 通过，产品行为在 E2 上本身正确。

对照验收计划第 10 节逐项：

- [x] base/head SHA、分支、构建和 lockfile hash — 已填；PR/bundle 未做（对外副作用，见偏差 6）
- [x] P0–P6 状态与耦合表逐项归属 — 已填；设计偏差 7 项全部记录在案
- [x] 配置/API/schema/兼容说明 — 耦合表 C0x 行 + 快速接手 §5；截图 3 张
- [x] G0–G3 命令、退出码、测试名与 ID 对照 — 已填，全部实测
- [x] G4/G5 全部行及来源 — G4 逐例已填；G5 四行明确记「未执行」
- [x] 模型/提供方/flags、费用、未知计量、失败批次索引 — 已填；4 次失败付费批次在 `progress.md` P5 段
- [ ] 原批准来源、声明未变证明、停服持久化审计 — **三项都因批次未运行而不存在**，未伪造
- [x] 无私有答案泄漏、无额外业务写、无未知结果重放的证据 — 预检 `workbenchHidesPrivateControl`、`unknownWriteRefused`+`unknownWriteRecorded`（真实 `write:denied {reason: create-budget-exhausted, intent: create}` 落在真实 `POST /api/exports`，creates 保持 1）、`P04/P07` 隔离用例
- [x] README/docs 已同步 — 见下
- [x] 开发分支已交付 — 以 bundle 交付（计划允许「push 或 bundle」）；**未 push**，会话权限拒绝了 `git push`，未绕过（见偏差 6）

### 主 Agent 应优先审查的风险

1. **E2 的接口裁定**（偏差 3）：`investigation_check` 是否接受声明的支撑证据引用。这是本次唯一的产品级未决项，且会影响所有业务。建议先判定，再决定是否需要重跑诊断与正式批次。
2. **`resource` 产物类型的引入**：验收计划只列了 screenshot/snapshot/measurement，我新增了第四类以承载「资格来源」。请确认这是正确的落地方式，而非应改为在既有类型上扩展。
3. **契约 hash 随环境变化**：报告内 hash 逐 run 不同是设计结果（环境在快照内），但会让「同一份契约」的肉眼比对失效。请确认验收方对该点的期望，以及是否需要额外提供一份与环境无关的 profile 摘要 hash。
4. **原批准来源的取得**：B/D 与 D 组的「不破坏原学习闭环」结论完全依赖它。目录不在 Git，本机缺失。
5. **P04/P07 的建模选择**（偏差 7a/7b）与 (c) 的 flaky 用例。
6. **耦合表里 `blocker-review.ts` 与 `evaluation-access.ts` 零改动**：请确认「沿用而不扩大」是验收方的期望，而非遗漏。

不写「无需 review」。

## 主 Agent review 与更正

尚未进行。由主 Agent 填写发现、优先级、修复提交、复验范围/构建、最终接受或未通过结论。开发 Agent 不预填通过，不自行合并 main。