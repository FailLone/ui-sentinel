# 开发约定

当前采用 Mastra Core + Playwright + Midscene/Qwen + Hono/libSQL/React。当前能力包括业务契约、视觉聚焦验证与[可组合调查程序](composable-investigations.md)。模块边界和验证方法以本页及对应能力文档为准，不再依赖已完成的任务书。

## 代码放在哪里

| 位置 | 内容 |
| --- | --- |
| src/business | 业务契约配置与校验、注册表与冻结、公开协议适配器、规范化事实；不得含私有答案或控制 token |
| src/agent/context | 有限上下文、历史恢复、决策记忆与输入计量 |
| src/agent/model | 模型请求、尝试跟踪、超时、流与工具回执 |
| src/agent/decisions | 完成选择与可选有限阻断审查 |
| src/agent/policy.ts | 探索指令；不得混入私有评估答案 |
| src/execution | 浏览器执行、工具 schema、队列、调查、路径与运行记录；`network/` 逐跳访问边界、`inspection-host` 检查账本作者边界 |
| src/inspection | 网址契约与 URL/地址分类、有界导航、检查账本、完成证明；纯函数，不驱动浏览器 |
| src/rules | 规则接口、路由、内置规则、声明编译与校验 |
| src/server/routes | HTTP 输入、鉴权、响应；不承载报告领域计算 |
| src/server/reports | 持久报告组装及旧记录只读兼容 |
| scripts/cli | 面向操作者的命令入口 |
| scripts/validation | 可重复验收与集成预检入口 |
| evaluation/fixtures | 独立业务场景及私有控制器 |
| evaluation/private | 私有真值与评分器，不暴露给被测 Agent；`url-scan/` 存放网址样本的变体标签与预期缺陷 key |
| evaluation/support | 隔离验证使用的模型网关、成本与请求记录 |
| arena/export | React 导出靶场与独立私有控制器（loopback 独立端口 + token） |

测试就近放置。运行模块不得依赖 scripts 或 evaluation；评估可以通过正式 API 测试运行服务。新增业务预期不能从靶场 case 编号、私有控制状态或评分答案推导。

通用执行器**不得**按 checkout/export、页面标题或 case ID 特判；业务差异只能来自版本化配置与注册的适配器（`src/business/`）。环境是显式白名单，契约不能放宽网络边界。新增可复用行为的检查入口是 `pnpm typecheck && pnpm test`，加一次针对性的免费预检；不要每阶段跑付费矩阵。

## 验证顺序

```sh
pnpm format
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

上述测试不调用付费模型。集成预检使用固定模型服务，但运行真实 SDK、编译后的 Server 和浏览器，不应冒充真实模型验收。免费预检与真实模型入口分开；付费入口为对应命令的 `--diagnostic` / `--formal`，可组合调查使用 `--real`，缺 key 明确失败。

变更探索政策、业务语义或规则判定后，再按计划运行相关真实场景；正式 minimum 固定 C0–C5 各三轮，共 18 轮。日常用户任务只运行其自身一次检查，18 轮属于开发验收协议。正式批次只在最终候选构建上完整跑一次；源码、提示、规则或私有判定变更后必须重新冻结，旧结果保留，不能拼接新旧构建凑数。

格式使用 Biome，TypeScript 7 做类型检查，暂不增加严格 lint。不要为移动文件添加复刻实现的测试，但必须保留真实安全契约回归。测试失败先修复，不改门槛来宣称通过。

## 文档维护

docs 描述当前能力、约束和明确标注的方向；plans 只保留下一步可执行计划。完成计划时将长期有效的接口、命令、约束及未实现边界并入 docs，再删除已完成计划和阶段成绩汇总；过程留 Git 和本地运行记录，不复制到另一层 archive。没有待执行计划时无需保留空的 plans 目录。引用某批耗时与通过率时写明版本、模型配置、样本范围，不能用旧模型验收替代新语义的验证。

## R0 接手验证

采用支持的 Node 24。`pnpm test` 包含网络真实浏览器反例、完成证明篡改/丢失历史和交互后置测量回归。`pnpm validate:url-scan -- --preflight` 使用 loopback 固定模型；`URL_SCAN_FREE_CAMPAIGN_TEST=1 pnpm exec vitest run scripts/validation/url-scan-campaign.test.ts` 额外执行六行免费 campaign，验证 runner 和失败保留。修改验收预期必须说明对应产品语义，禁止为变绿删除反例。见 [R0 交付](r0-delivery.md)。

### R0 动态结果整改自测

`pnpm exec tsx scripts/validation/r0-remediation.ts` 在构建后启动本地固定模型、正式 API 和 Chromium，覆盖健康/异常动态反馈、错误引用和目标、过期动作、篡改证据、不可恢复、重复读取及新信息恢复。输出到 `data/r0-remediation/<timestamp>/`，包含构建和源代码哈希、完整模型输入、请求、报告、产物、SQLite、服务日志，以及健康/异常页面的独立浏览器回放。属于开发者 A/B 自测，不能代替独立 C 能力验收。

费用未知后的只读核对命令：

```sh
pnpm exec tsx scripts/validation/reconcile-cost.ts <campaign-directory> <batch-directory> <request-id>
```

该命令需要原 campaign-id、manifest、ledger.jsonl 和 OpenRouter key，只 GET 已保存 generation 的元数据，不生成模型请求。generation ID、模型与提供方必须匹配；只允许原模型别名到同家族八位日期版本的窄映射，账单记录实际版本，不改变运行配置。终止原因为空时，仅有正生成时长、有效 completion token 数和正账单费用的已发布记录可核对；零值或不完整元数据继续 unknown。核对表按请求/generation 唯一追加；原 unknown 行及预留数字不变，有效费用在支出投影中只计一次，重复相同结果幂等，冲突/缺失保留未知。成功及失败另写 reconciliation-audit.jsonl。新表可直接创建于原 SQLite，无需改写历史。核对不会更新批次阶段、重写旧 summary、创建批准或恢复任务；即使成本已知仍须按新构建和样本重新冻结、授权。

## 冻结夹具与历史材料

`evaluation/fixtures/legacy-runs/` 保存仍被回归或离线工具消费的历史冻结输入，保持原字节与内部来源记录；其中一次性生成脚本仅作来源材料，不参与当前 TypeScript 构建。当前 Vitest 专用配置位于 `evaluation/configs/`。Biome 排除冻结夹具及文档/评估 JSON 证据，源码和测试继续检查格式；禁止用格式化改写证据哈希。

本次整理的范围、恢复命令及验证限制见[维护记录](maintenance/pre-r2-cleanup.md)。
