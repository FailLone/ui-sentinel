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
