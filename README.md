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
docs/               当前能力、架构、开发与验证说明
data/               本地运行与验收证据，不提交 Git
```

[开发约定](docs/development.md)说明模块边界与检查方式。已完成计划和阶段验收记录从工作树移除，需要追溯时查 Git 历史；后续有明确开发任务时再创建 plans。

## 两个业务与契约

同一个执行器运行两个业务。是否为新业务写特判不是可选项——通用执行器不按 checkout/export、页面标题或 case ID 分支，业务差异全部来自版本化配置与可信适配器：

- 业务配置（`src/business/profiles/`）声明公开要求、反馈阈值与写入上限；解析后**冻结**为快照并随任务持久化，含一个排除自身的规范化 SHA-256 `hash`。要求、策略、环境或 adapter 版本变化都会产生新 hash。
- 适配器（`src/business/adapters/`）按 origin、method、path 与响应 schema 识别业务请求，产出统一的 `business:fact`；`sourceEventId` 引用公开响应证据。业务字段嗅探已移除，`orderId` 只由购物适配器在兼容层产生，导出不伪造。
- 环境是显式白名单（`default` / `arena` / `export-arena`），契约不能放宽网络边界；配置与环境不匹配、未知 ID/版本、`default` 缺明确配置一律 400，不静默降级。
- 旧记录没有该字段：报告显示 `legacy-unversioned`，绝不套用今天的默认配置；未完成的旧任务重启后仍为 interrupted，不重放。省略 `businessProfile` 且使用旧 arena 入口的新请求解析为 checkout@1。

导出靶场有五个固定变体，公开协议**不含**变体编号、故障描述或私有开关。E1 与 E2 发布完全相同的失败载荷与重试条款，唯一差别是工作台能否操作恢复控件；E2 的后端确实允许重试，其资格由公开资源 `GET /api/exports/:jobId/eligibility` 发布——所以缺陷的判别依据是业务自己发布的文档，而不是客户端渲染出来的样子。运行中保留的公开业务资源会作为可引用的 `resource` 证据一并持久化。

## 网址 UI 检查（ui-scan）

工作台和 API 支持第二种任务模式：直接输入一个完整网址做**匿名、有界**的 UI 检查，不需要任何业务适配器。请求体用判别字段 `kind` 区分，两个模式共用同一个执行器、工具集、规则和调查程序——不是第二套浏览器循环，也没有为凑模式而存在的空购物适配器。

```sh
curl -X POST http://localhost:4111/api/runs -H 'content-type: application/json' -d '{
  "kind": "ui-scan",
  "entryUrl": "https://example.org/catalog?category=books&sort=price#items",
  "goal": "检查目录浏览和筛选是否正常",
  "scope": { "maxPages": 3, "maxDepth": 1 },
  "access": { "resourceOrigins": ["https://cdn.example.org"], "dataOrigins": [] }
}'
```

202 返回 `runId/status/kind/contractHash/eventsUrl/reportUrl`。`goal` 可省略，省略时使用中性默认目标；`scope` 与预算只能收窄（`maxPages` 1–3，`maxDepth` 0–1）；`access` 只接受**精确** origin，不接受通配符或域名后缀。UI 请求不接受 `businessProfile`/`environmentId`，混入这些字段返回 400，不创建半个任务。

**入口地址**按原样执行：path、query 顺序、重复参数和 fragment 都是身份，不做规范化改写。只接受绝对 HTTP(S)；拒绝 userinfo、非法百分号转义、非标准 scheme，以及服务自身的控制面路径（`/__control`、`/evaluation` 等）。

**访问边界**是逐跳、派发前判定的。顶层导航限同一 origin、`maxPages`/`maxDepth` 内；脚本/CSS/字体等资源只允许同源或契约声明的 `resourceOrigins`；fetch/XHR 只允许同源或 `dataOrigins`，且仅 GET/HEAD。资源的许可**不**等于 API 的许可，`fetch('/delete')` 不会因为 host 获准而放行。首版明确不支持并如实报告：POST/PUT/PATCH/DELETE 与表单提交、登录态、GraphQL POST、文件上传/下载、新窗口、WebSocket、Service Worker。方法或按钮文字都不构成副作用语义——按钮叫「查询」但提交 POST 一样被拒。

私网、loopback、link-local 和云元数据地址在**入队前**拒绝。本机开发与 fixture 只能由**服务器配置**的精确 origin 放行（`URL_SCAN_TRUSTED_ORIGINS`），UI/API 无权自行添加本地例外；控制服务与评估端口即使同机也不在放行范围。

**结束语义**由检查账本决定，不由模型自述决定。空规则队列、工具调用成功、模型说「完成」都不足以让任务变成 `completed`。`scope-covered` 需要：契约 hash 有效、入口确实导航并产出可读证据、观察到的局部交互/导航义务已实际执行、适用的自动规则已执行、所选条目有同 run 同目标的证据、无在途调查或已选未验证条目、所有拒绝与不支持维度已记录。发现的缺陷**不影响**完成——`failed` 是一次完成了的测量。不满足时返回 `finish:rejected` 与 `missingFacts/itemIds/reasonCodes`，并给出可用的 partial 结束建议。已选但未验证的事项必须保留为 `partial`，不能被「清空探索分支」抹掉。

`businessResult` 对 UI 运行恒为 `not-applicable`——不是 `unknown`，也不是 `success`。报告分列执行状态、检查范围（`covered`/`partial`/`not-started`）、发现、依据/证据/未验证原因与全部执行器干预；无发现时文案是「在已验证范围内未发现问题」，不代表整站合格。一次真实的网络拦截会置位运行级证据完整性，之后的状态不能用来证明原站点 pass/fail。

网址模式默认关闭，需显式 `EXECUTION_URL_SCAN=1`。可用验证入口（不调用付费模型）：

```sh
pnpm validate:url-scan -- --preflight            # 全部样本
pnpm validate:url-scan -- --preflight --sample healthy-catalog
```

该预检主动清空所有真实凭据、把模型指向本地固定服务，驱动**编译后的**服务、真实 Chromium 和正式 HTTP/工作台接口，证据写入 `data/r0-url-scan/<timestamp>/`。它证明接线可执行，**不**证明模型能自主发现问题。

## 当前执行方式

完整 Agent 负责探索、语义目标和未知问题。已有规则、时序调查、视觉聚焦探针和可组合调查程序共用执行边界与证据存储。规则未知不是通过，业务成功也不等于质量检查完成。

- 时序调查默认开启，EXECUTION_ATOMIC_INVESTIGATION=0 可回退。
- [视觉发现与聚焦验证](docs/visual-focus.md)通过 Qwen 截图候选和真实点击验证输入区域；EXECUTION_VISUAL_DISCOVERY=1 显式启用，默认关闭。
- [可组合调查](docs/composable-investigations.md)允许 Agent 用 page_inspect 和 investigation_run 生成有界 JSON 程序，组合测量、动作及断言，调查规则未覆盖的问题。程序保存不等于批准全局规则。

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
pnpm validate:visual-focus -- --preflight
pnpm validate:programs -- --preflight
pnpm validate:url-scan -- --preflight
```

以上不会调用付费模型。validate 系列预检使用真实服务、SDK 和 Chromium，但模型响应来自明确的本地固定测试服务，仅验证集成，不证明自主发现。具体场景、付费入口和冻结要求见[靶场与评估](docs/arena-and-evaluation.md)。

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

validate:acceptance 无参数只跑六例诊断；--minimum 为诊断通过后再跑 18 轮。真实验收要求干净提交，记录模型、提供方、编译哈希和全部失败。费用通过网关估算预留，未知费用不当成零；可配置 VALIDATION_MAX_COST_USD、VALIDATION_AGENT_PROVIDER、VALIDATION_VISION_PROVIDER。对照实验需固定并记录提供方与功能开关。参见[靶场与验收](docs/arena-and-evaluation.md)。

validate:business 的三个入口刻意是三个模块：一个误设的标志不能把免费检查变成付费批次，也不能让诊断结果被读成正式批次。`--diagnostic` 需要 OPENROUTER_API_KEY（缺 key 明确非零退出，不 mock）。`--formal` 要求 `--diagnostic-source` 指向来自**当前冻结构建**的通过诊断（逐字节校验构建 hash），严格拒绝未知或冲突选项，并在任何模型调用之前完成计划判定——判定不通过时写满 45 行 blocked 后立即非零退出，不产出半个矩阵。`--approved-source` 默认取 `data/fixtures/approved-retry`（由 `pnpm fixture:approved-retry` 从 Git 资料生成）；来源不可用或无法核验时 B/D 记 blocked，仍完成可安全进行的 A/C，最终非零退出，绝不伪造批准。诊断与正式批次**共享**同一个 `VALIDATION_MAX_COST_USD` 上限（默认 $2），新建输出目录不重置额度。组 C/D 复用原 minimum 和获准规则评分器，在本批次的独立服务、数据库与共享模型网关上执行。

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

## 当前能力与边界

购物、导出业务、输入区域聚焦验证与可组合调查均已实现；网址 UI 检查（ui-scan）已实现并完成免费接线验证，**尚未**做真实模型能力验收（见下）。当前仍为受信单机服务，未实现任意网站全覆盖、PRD/Figma 自动接入、多机调度或通用规则自动发布。业务调查仍沿用业务完成契约，调查结束并不意味着整体报告会显示业务成功；未知与未验证范围必须保留。

- [产品目标、现状差距与 Roadmap](docs/product-roadmap.md)
- [架构与 Agent 职责](docs/architecture.md)
- [执行层](docs/execution-engine.md)
- [可组合调查程序](docs/composable-investigations.md)
- [视觉发现与聚焦验证](docs/visual-focus.md)
- [规则与规则库](docs/rules-and-rule-library.md)
- [知识与上下文](docs/knowledge-and-context.md)
- [靶场与评估](docs/arena-and-evaluation.md)

格式使用 Biome，类型检查使用 TypeScript 7。当前不启用严格 lint；运行 pnpm format 整理格式。密钥、数据库及原始证据留在本机。
