# UI Sentinel

用 Agent 探索 Web 应用、检查已有规则、验证未知体验问题，并留下可复查的证据。产品是本机 Server，React 工作台由同一端口提供；当前使用 Mastra Core、Playwright、Midscene、Hono 和 libSQL。

## 启动

要求 Node.js 22.18–22.x 或 24.x、pnpm 10。当前仅绑定 loopback，是受信本机应用，尚无多用户认证和分布式 Worker。

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env
# 配置主模型、视觉模型和私有靶场控制 token
pnpm dev
```

工作台默认 http://localhost:4111，购物靶场默认 http://localhost:4173，导出靶场默认 http://localhost:4183。主模型使用 AGENT_MODEL 和对应提供方密钥；视觉模型使用 VISION_MODEL、VISION_API_KEY、VISION_BASE_URL、VISION_MODEL_FAMILY。缺配置明确拒绝运行，不静默模拟。导出靶场的端口与私有控制 token 见 `src/shared/config.ts`（EXPORT_ARENA_PORT / EXPORT_API_PORT / EXPORT_CONTROL_PORT / EXPORT_CONTROL_TOKEN）。

构建后运行：

```sh
pnpm build
pnpm start
# 在另两个终端启动内置靶场：
pnpm arena:start
pnpm arena:export:start
```

工作台可以创建任务、恢复历史报告、查看日志/截图/红框证据、确认发现、生成和审批规则候选。关闭浏览器不会终止服务端任务。创建任务时选择业务配置（购物 / 导出），报告会显示该次运行自己的契约版本、hash、要求来源与 adapter 版本；刷新或重开历史报告后显示的是**当次**快照，不是今天的默认配置。

## 目录与开发入口

```text
src/business/       业务契约配置、注册表、规范化事实、公开协议适配器
src/agent/           探索政策、上下文、模型请求、有限结束判断、规则提案
src/execution/       单写入队列、浏览器、执行器、工具契约、测量、取证
src/rules/           规则接口、路由、内置规则与声明式规则
src/server/          HTTP/SSE、报告组装、受保护的评估入口
src/storage/         数据库与迁移
src/web/             React 工作台
arena/checkout/     React 购物靶场与私有控制服务
arena/export/       React 导出靶场与独立私有控制器
evaluation/         私有评分器、独立业务靶场、验证模型网关
scripts/cli/        重置、评估、模型 smoke、报告导出
scripts/validation/ 可重复验收和本地集成验证
docs/               当前设计、开发约定、验收基线
plans/              下一阶段开发计划与交接记录
data/               本地运行与验收证据，不提交 Git
```

[开发约定](docs/development.md)说明模块边界与检查方式；[业务契约交接记录](plans/business-contracts-handoff.md)记录本阶段的实际进展、耦合归属与未决项。

## 两个业务与契约

同一个执行器运行两个业务。是否为新业务写特判不是可选项——通用执行器不按 checkout/export、页面标题或 case ID 分支，业务差异全部来自版本化配置与可信适配器：

- 业务配置（`src/business/profiles/`）声明公开要求、反馈阈值与写入上限；解析后**冻结**为快照并随任务持久化，含一个排除自身的规范化 SHA-256 `hash`。要求、策略、环境或 adapter 版本变化都会产生新 hash。
- 适配器（`src/business/adapters/`）按 origin、method、path 与响应 schema 识别业务请求，产出统一的 `business:fact`；`sourceEventId` 引用公开响应证据。业务字段嗅探已移除，`orderId` 只由购物适配器在兼容层产生，导出不伪造。
- 环境是显式白名单（`default` / `arena` / `export-arena`），契约不能放宽网络边界；配置与环境不匹配、未知 ID/版本、`default` 缺明确配置一律 400，不静默降级。
- 旧记录没有该字段：报告显示 `legacy-unversioned`，绝不套用今天的默认配置；未完成的旧任务重启后仍为 interrupted，不重放。省略 `businessProfile` 且使用旧 arena 入口的新请求解析为 checkout@1。

导出靶场有五个固定变体，公开协议**不含**变体编号、故障描述或私有开关。E1 与 E2 发布完全相同的失败载荷与重试条款，唯一差别是工作台能否操作恢复控件；E2 的后端确实允许重试，其资格由公开资源 `GET /api/exports/:jobId/eligibility` 发布——所以缺陷的判别依据是业务自己发布的文档，而不是客户端渲染出来的样子。运行中保留的公开业务资源会作为可引用的 `resource` 证据一并持久化。

## 当前执行方式

完整 Agent 负责探索、语义目标和未知问题。规则与有类型原子调查负责测量与证据保存；原子调查默认开启，EXECUTION_ATOMIC_INVESTIGATION=0 可回退。规则未知不是通过，业务成功也不等于质量检查完成。

可选 EXECUTION_BLOCKER_REVIEW=1 开启 Jev 有限阻断收尾。设置 COMPLETION_REVIEW_API_KEY，或省略它以使用 OPENROUTER_API_KEY（显式空字符串不回退）。使用 OpenRouter Decisions API，固定已验证快照；仅证据充分的 observed-blocker 建议可进入执行器复核。复杂/变化页面、恢复入口、未解决工作和审查失败继续交给完整 Agent。默认关闭，不隐式增加模型依赖。

页面操作串行。写入权限来自当次契约声明的副作用策略，不按按钮文案决定：购物允许购物车准备性写入、只有结账消耗创建额度，且订单产生后仍禁止这些写入；导出不声明准备性写入，允许一个实体及其一次被明确允许的重试，重试必须属于该实体、不能被实现为第二次创建。创建额度在请求派发前预留，不等响应回来才计数。未声明的写入默认拒绝并记录 `write:denied` 与证据完整性干预，受干预证据不能证明原站点缺陷。后台视觉分析试验已移除，Qwen/Midscene 视觉定位保留。未知结果不自动重放。

每轮默认 300 秒、40 动作、40 次模型请求；.env.example 与正式 minimum 使用 30 次请求。单工具默认 15 秒，模型响应默认 60 秒，至多一次符合条件的重试。失败、未知 usage、取消与收尾均计入原预算。详见[执行层](docs/execution-engine.md)。

## 检查与验收

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:fixtures
pnpm test:fixtures:export
pnpm validate:persistence
pnpm validate:investigation
pnpm validate:blocker-review
pnpm validate:business -- --preflight
```

以上不会调用付费模型。后五个命令运行编译后的真实服务、Mastra SDK 和 Chromium，模型响应明确使用本地固定测试服务，验证持久化、原子调查、有限结束判断与业务契约的集成。`--preflight` 会**清空**真实网关凭据，因此不可能意外变成付费运行；它覆盖 E0–E4 五变体、一次注入的未知写入、一次注入的非法 finish，以及工作台 U01–U05（含真实 UI 截图）。

以下会调用真实模型：

```sh
pnpm smoke:model
# OpenRouter；自动隔离端口/数据库/靶场，运行真实 smoke + 固定 18 轮：
pnpm validate:acceptance -- --minimum-only
# 已有服务上的固定验收：
pnpm evaluate -- --suite minimum --repeats 3
# 业务契约：真实 smoke + 导出 E0–E4 五例诊断：
pnpm validate:business -- --diagnostic
# 同一冻结构建的正式四组 45 轮（见下）：
pnpm validate:business -- --formal --diagnostic-source <通过诊断的目录> \
  [--approved-source <已关闭学习目录，默认 data/fixtures/approved-retry>] [--groups A,C]
```

validate:acceptance 无参数只跑六例诊断；--minimum 为诊断通过后再跑 18 轮。真实验收要求干净提交，记录模型、提供方、编译哈希和全部失败。费用通过网关估算预留，未知费用不当成零；可配置 VALIDATION_MAX_COST_USD、VALIDATION_AGENT_PROVIDER、VALIDATION_VISION_PROVIDER。复现当前基线时指定 Wafer/Alibaba 并显式启用有限审查。参见[靶场与验收](docs/arena-and-evaluation.md)。

validate:business 的三个入口刻意是三个模块：一个误设的标志不能把免费检查变成付费批次，也不能让诊断结果被读成正式批次。`--diagnostic` 需要 OPENROUTER_API_KEY（缺 key 明确非零退出，不 mock）。`--formal` 要求 `--diagnostic-source` 指向来自**当前冻结构建**的通过诊断（逐字节校验构建 hash），严格拒绝未知或冲突选项，并在任何模型调用之前完成计划判定——判定不通过时写满 45 行 blocked 后立即非零退出，不产出半个矩阵。`--approved-source` 默认取 `data/fixtures/approved-retry`（由 `pnpm fixture:approved-retry` 从 Git 资料生成）；来源不可用或无法核验时 B/D 记 blocked，仍完成可安全进行的 A/C，最终非零退出，绝不伪造批准。诊断与正式批次**共享**同一个 `VALIDATION_MAX_COST_USD` 上限（默认 $2），新建输出目录不重置额度。组 C/D 委派给既有 `validate:acceptance` 与 `validate:learning -- --recheck`，不重复其门槛。

pnpm arena:reset -- --case C0 是受控制 token 保护的私有入口，活动/排队/待核对任务存在时拒绝重置；不要提供给被测 Agent。pnpm report -- --run RUN_ID 导出报告。

## 反馈、规则与中断

确认发现后可以生成声明式规则候选，校验异常/健康/unknown 输入，再人工批准并启用。候选代码不能任意执行，确认问题不等于批准规则。已有批准的同一规则可以复查，无需再次批准：

```sh
pnpm validate:learning -- --recheck <已关闭且已批准的学习目录>
```

跨机器无需原作者的本机目录：先运行 `pnpm fixture:approved-retry -- --verify`（离线校验）再运行 `pnpm fixture:approved-retry`，从 Git 中的[原批准资料](evaluation/fixtures/approved-retry/README.md)生成 `data/fixtures/approved-retry`，再将该路径传给 `--recheck` 或 `--approved-source`（`validate:business -- --formal` 已默认使用它）。导入不调用模型、不重新批准规则，也不重新分配候选 ID 或批准时间——它是既有批准的迁移，不能用于批准新候选。

生成、修订和首次批准的命令见[规则文档](docs/rules-and-rule-library.md)。历史报告从持久记录恢复；缺少结束证据或记录不一致时不声称完成。

规则绑定读规范化事实，不再依赖 `orderId`，所以同一份已批准的重试声明既能绑定订单也能绑定导出任务。声明里的 `expectation.target`（如 "Retry button"）是**语义采样键**，不要求实际按钮文字相同——文案改成「重新生成」的页面仍应绑到同一份声明，采样值取声明的键而不是复制按钮文字。反馈阈值（`feedbackWarningMs`）与重试窗口（`retryAvailabilityMs`）同样来自当次契约：运行没有声明可靠阈值时判 `unknown`，不套用记忆中的十秒。Journey 复用按契约身份（profile、contract hash、adapter revision、origin）隔离，标题和路径相同但契约不同的页面不复用，无契约的旧 Journey 不参与新任务。

服务重启将未完成任务标为 interrupted。操作者核对业务副作用后，以私有 token 调用 POST /api/evaluation/reconcile，提交 {"verified":true,"reason":"核对过程与结果"}。此操作只解除阻塞，不重放任务、不自动回滚订单。

## 当前依据与边界

已采用架构的真实基线为独立布局 12/12、正式 minimum 18/18、获准规则复查 6/6，包含停服数据库与证据审计。它不是任意业务、视觉发现召回或全局最优证明。原存储异常根因仍未知，当前有拒绝假完成和阻止重复执行的保护。该历史成绩**不属于**业务契约阶段，也不构成其验收结果。

业务契约阶段的进展与限制以[交接记录](plans/business-contracts-handoff.md)为准。截至该记录，免费门槛（格式、类型、602 用例、构建、两个靶场夹具、持久化、原子调查、有限审查、业务预检 28 断言）全部实测通过；真实模型的五例诊断 5/6 通过，导出 E2 有一条断言未过，因此正式 45 轮矩阵未执行，开发自检结论为 **blocked**。原批准来源**已解除**（`766615b` 改为 Git 附带的 `evaluation/fixtures/approved-retry`，本机已导入并离线核对，B/D 现在唯一未满足的前置是通过诊断）；已知限制：`.env.example` 尚未记录导出端口与 token（该文件被本会话的读取拒绝规则覆盖，需人工编辑）。

- [架构与 Agent 职责](docs/architecture.md)
- [执行层](docs/execution-engine.md)
- [规则与规则库](docs/rules-and-rule-library.md)
- [知识、上下文与探索方向](docs/knowledge-and-context.md)
- [验收基线与历史证据](docs/validation-baseline.md)
- [业务契约交接记录](plans/business-contracts-handoff.md)

格式使用 Biome，类型检查使用 TypeScript 7。当前不启用严格 lint；运行 pnpm format 整理格式。密钥、数据库及原始证据留在本机。
