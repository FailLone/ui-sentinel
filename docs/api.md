# HTTP 接口入口

工作台与 API 同源，默认 `http://localhost:4111`。当前是受信本机服务，没有多用户认证；不要将此接口直接开放到公网。严格字段校验和运行契约以[路由实现](../src/server/routes/runs.ts)及[网址请求 schema](../src/inspection/contract.ts)为准。

## 创建与读取任务

| 方法 / 路径 | 用途 |
| --- | --- |
| `GET /api/health` | 服务与模型配置就绪状态 |
| `GET /api/business-profiles` | 公开业务契约目录 |
| `POST /api/business-profiles/resolve` | 解析业务选择，不创建任务 |
| `POST /api/runs` | 创建任务；网址模式显式 `kind: "ui-scan"`，省略 kind 使用兼容业务请求 |
| `GET /api/runs` / `GET /api/runs/:id` | 历史列表 / 运行记录 |
| `GET /api/execution/status` | 执行队列状态 |
| `GET /api/runs/:id/events` | SSE 事件流 |
| `POST /api/runs/:id/cancel` | 请求取消 |
| `GET /api/runs/:id/report` | 从持久记录恢复报告 |
| `GET /api/runs/:id/artifacts/:artifactId` | 该运行的证据产物 |

网址请求示例、URL 身份和网络边界见[网址指南](url-scan.md)；资料字段见[产品资料](product-sources.md)。业务请求的 `environmentId` 为 `arena`、`export-arena` 或 `default`，公开配置使用 `{id, revision}`；default 需要明确业务配置。UI 请求不能混入这些业务字段。无效配置/字段返回400，不创建部分任务；创建接受后返回202及运行、事件、报告定位。

## 复用与反馈

| 方法 / 路径 | 用途 |
| --- | --- |
| `POST /api/runs/:id/path-program` | 从已有完整健康运行派生并保存路径 |
| `GET /api/path-programs/:id` | 读取声明及来源 |
| `GET /api/regression-baselines?entryUrl=…` | 查询同精确入口的健康基线，不访问目标网页或模型 |
| `POST /api/findings/:id/feedback` | 保存发现反馈 |
| `POST /api/rule-proposals` / `GET /api/rule-proposals/:id` | 创建 / 查看规则候选 |
| `POST /api/rule-proposals/:id/validate` | 验证候选 |
| `POST /api/rule-proposals/:id/review` | 记录审阅 |
| `POST /api/rule-proposals/:id/enable` | 启用满足条件的规则 |

创建任务时 `pathProgramId` 与 `baselineRunId` 互斥，均需要本次资料。详见[路径复用](r3-path-reuse.md)、[基线选择](r4-incremental-regression.md)。反馈与候选正文 schema 见[feedback路由](../src/server/routes/findings.ts)、[proposal路由](../src/server/routes/proposals.ts)；生命周期见[规则指南](rules-and-rule-library.md)。

评估控制与 reconcile 属于私有操作者接口，由控制 token 保护，不提供给 Agent。`POST /api/evaluation/reconcile` 的 `{ "verified": true, "reason": "核对过程与结果" }` 只在核对副作用后解除阻塞，不重放或回滚。相关工具用法见[评估指南](arena-and-evaluation.md)。
