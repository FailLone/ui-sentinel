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

工作台默认 http://localhost:4111，购物靶场默认 http://localhost:4173。主模型使用 AGENT_MODEL 和对应提供方密钥；视觉模型使用 VISION_MODEL、VISION_API_KEY、VISION_BASE_URL、VISION_MODEL_FAMILY。缺配置明确拒绝运行，不静默模拟。

构建后运行：

```sh
pnpm build
pnpm start
# 在第二个终端启动内置靶场：
pnpm arena:start
```

工作台可以创建任务、恢复历史报告、查看日志/截图/红框证据、确认发现、生成和审批规则候选。关闭浏览器不会终止服务端任务。

## 目录与开发入口

```text
src/agent/           探索政策、上下文、模型请求、有限结束判断、规则提案
src/execution/       单写入队列、浏览器、执行器、工具契约、测量、取证
src/rules/           规则接口、路由、内置规则与声明式规则
src/server/          HTTP/SSE、报告组装、受保护的评估入口
src/storage/         数据库与迁移
src/web/             React 工作台
arena/checkout/     React 购物靶场与私有控制服务
evaluation/         私有评分器、独立业务靶场、验证模型网关
scripts/cli/        重置、评估、模型 smoke、报告导出
scripts/validation/ 可重复验收和本地集成验证
docs/               当前设计、开发约定、验收基线
plans/              下一阶段开发计划
data/               本地运行与验收证据，不提交 Git
```

[开发约定](docs/development.md)说明模块边界与检查方式；[下一步计划](plans/next-development-plan.md)以业务配置和第二个完整业务场景为目标，不继续做框架/模型优化矩阵。

## 当前执行方式

完整 Agent 负责探索、语义目标和未知问题。规则与有类型原子调查负责测量与证据保存；原子调查默认开启，EXECUTION_ATOMIC_INVESTIGATION=0 可回退。规则未知不是通过，业务成功也不等于质量检查完成。

可选 EXECUTION_BLOCKER_REVIEW=1 开启 Jev 有限阻断收尾。设置 COMPLETION_REVIEW_API_KEY，或省略它以使用 OPENROUTER_API_KEY（显式空字符串不回退）。使用 OpenRouter Decisions API，固定已验证快照；仅证据充分的 observed-blocker 建议可进入执行器复核。复杂/变化页面、恢复入口、未解决工作和审查失败继续交给完整 Agent。默认关闭，不隐式增加模型依赖。

页面操作串行。当前购物策略限一笔订单；后续写请求会被拦截并记录干预，受影响证据不能证明原站点缺陷。后台视觉分析试验已移除，Qwen/Midscene 视觉定位保留。未知结果不自动重放。

每轮默认 300 秒、40 动作、40 次模型请求；.env.example 与正式 minimum 使用 30 次请求。单工具默认 15 秒，模型响应默认 60 秒，至多一次符合条件的重试。失败、未知 usage、取消与收尾均计入原预算。详见[执行层](docs/execution-engine.md)。

## 检查与验收

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:fixtures
pnpm validate:persistence
pnpm validate:investigation
pnpm validate:blocker-review
```

以上不会调用付费模型。后三个命令运行编译后的真实服务、Mastra SDK 和 Chromium，模型响应明确使用本地固定测试服务，验证持久化、原子调查与有限结束判断的集成。

以下会调用真实模型：

```sh
pnpm smoke:model
# OpenRouter；自动隔离端口/数据库/靶场，运行真实 smoke + 固定 18 轮：
pnpm validate:acceptance -- --minimum-only
# 已有服务上的固定验收：
pnpm evaluate -- --suite minimum --repeats 3
```

validate:acceptance 无参数只跑六例诊断；--minimum 为诊断通过后再跑 18 轮。真实验收要求干净提交，记录模型、提供方、编译哈希和全部失败。费用通过网关估算预留，未知费用不当成零；可配置 VALIDATION_MAX_COST_USD、VALIDATION_AGENT_PROVIDER、VALIDATION_VISION_PROVIDER。复现当前基线时指定 Wafer/Alibaba 并显式启用有限审查。参见[靶场与验收](docs/arena-and-evaluation.md)。

pnpm arena:reset -- --case C0 是受控制 token 保护的私有入口，活动/排队/待核对任务存在时拒绝重置；不要提供给被测 Agent。pnpm report -- --run RUN_ID 导出报告。

## 反馈、规则与中断

确认发现后可以生成声明式规则候选，校验异常/健康/unknown 输入，再人工批准并启用。候选代码不能任意执行，确认问题不等于批准规则。已有批准的同一规则可以复查，无需再次批准：

```sh
pnpm validate:learning -- --recheck <已关闭且已批准的学习目录>
```

生成、修订和首次批准的命令见[规则文档](docs/rules-and-rule-library.md)。历史报告从持久记录恢复；缺少结束证据或记录不一致时不声称完成。

服务重启将未完成任务标为 interrupted。操作者核对业务副作用后，以私有 token 调用 POST /api/evaluation/reconcile，提交 {"verified":true,"reason":"核对过程与结果"}。此操作只解除阻塞，不重放任务、不自动回滚订单。

## 当前依据与边界

已采用架构的真实基线为独立布局 12/12、正式 minimum 18/18、获准规则复查 6/6，包含停服数据库与证据审计。它不是任意业务、视觉发现召回或全局最优证明。原存储异常根因仍未知，当前有拒绝假完成和阻止重复执行的保护。

- [架构与 Agent 职责](docs/architecture.md)
- [执行层](docs/execution-engine.md)
- [规则与规则库](docs/rules-and-rule-library.md)
- [知识、上下文与探索方向](docs/knowledge-and-context.md)
- [验收基线与历史证据](docs/validation-baseline.md)

格式使用 Biome，类型检查使用 TypeScript 7。当前不启用严格 lint；运行 pnpm format 整理格式。密钥、数据库及原始证据留在本机。
