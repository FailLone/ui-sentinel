# 开发约定

当前采用 Mastra Core + Playwright + Midscene/Qwen + Hono/libSQL/React。下一轮优先验证业务适配，不再扩大模型或框架对比。

## 代码放在哪里

| 位置 | 内容 |
| --- | --- |
| src/agent/context | 有限上下文、历史恢复、决策记忆与输入计量 |
| src/agent/model | 模型请求、尝试跟踪、超时、流与工具回执 |
| src/agent/decisions | 完成选择与可选有限阻断审查 |
| src/agent/policy.ts | 探索指令；不得混入私有评估答案 |
| src/execution | 浏览器执行、工具 schema、队列、调查、路径与运行记录 |
| src/rules | 规则接口、路由、内置规则、声明编译与校验 |
| src/server/routes | HTTP 输入、鉴权、响应；不承载报告领域计算 |
| src/server/reports | 持久报告组装及旧记录只读兼容 |
| scripts/cli | 面向操作者的命令入口 |
| scripts/validation | 可重复验收与集成预检入口 |
| evaluation/fixtures | 独立业务场景及私有控制器 |
| evaluation/private | 私有真值与评分器，不暴露给被测 Agent |
| evaluation/support | 隔离验证使用的模型网关、成本与请求记录 |

测试就近放置。运行模块不得依赖 scripts 或 evaluation；评估可以通过正式 API 测试运行服务。新增业务预期不能从靶场 case 编号、私有控制状态或评分答案推导。

## 本轮整理的迁移

- 采用过的原子调查与有限阻断审查保留在正式模块；后者仍需显式开启。
- acceptance、learning、persistence 和 investigation 从 experiments 提升为维护中的验证入口。
- 删除一次性对照、原生 Stagehand/Browser Use 接入和未达质量门槛的后台视觉分析。
- 删除未使用的 Mastra CLI、Mastra libSQL 集成、Stagehand 和根目录重复 concurrently 依赖；保留实际使用的 Core、libSQL 与靶场并发启动工具。
- 工具契约升级为 25；旧后台分析记录只读兼容，不重写历史数据库。
- config.optimizations 更名为 config.features；保留已采用能力的 EXECUTION_* 环境开关。

| 旧入口 | 当前入口 |
| --- | --- |
| experiment:acceptance | validate:acceptance |
| experiment:learning | validate:learning |
| scripts/experiments/persistence-preflight.ts | pnpm validate:persistence |
| scripts/experiments/atomic-fixture-check.ts | pnpm validate:investigation / validate:blocker-review |
| EXPERIMENT_AGENT_PROVIDER / VISION_PROVIDER / MAX_COST_USD | VALIDATION_AGENT_PROVIDER / VALIDATION_VISION_PROVIDER / VALIDATION_MAX_COST_USD |

后台分析试验环境开关不再生效；视觉定位配置不受影响。原始 data、数据库、密钥与历史证据保留。已结束的计划从当前目录移除，可在 Git 历史查看，汇总证据见[验收基线](validation-baseline.md)。

## 验证顺序

```sh
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:fixtures
pnpm validate:persistence
pnpm validate:investigation
pnpm validate:blocker-review
```

上述测试不调用付费模型。集成预检使用固定模型服务，但运行真实 SDK、编译后的 Server 和浏览器，不应冒充真实模型验收。

变更探索政策、业务语义或规则判定后，再按计划运行相关真实场景；正式 minimum 固定 C0–C5 各三轮，共 18 轮。日常用户任务只运行其自身一次检查，18 轮属于开发验收协议。

格式使用 Biome，TypeScript 7 做类型检查，暂不增加严格 lint。不要为移动文件添加复刻实现的测试，但必须保留真实安全契约回归。测试失败先修复，不改门槛来宣称通过。

## 文档维护

docs 描述当前能力、约束和明确标注的方向；plans 只保留下一步可执行计划。完成计划时将长期有效的结论并入 docs，短期过程留 Git 和本地运行记录。引用某批耗时与通过率时写明版本、模型配置、样本范围，不能用旧模型验收替代新语义的验证。
