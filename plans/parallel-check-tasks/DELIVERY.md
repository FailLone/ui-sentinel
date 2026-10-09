# 并发检查宿主交付

2026-10-10（Asia/Shanghai）。代码提交 `c86dab2b38c77beb5ef64b854c926a1bad2a2a3e`；基线 `3f21842`；分支 `codex/parallel-check-tasks`。证据补充提交包含本文件。未推送或合并 main，未改旧脏工作区、其他 Agent 工作区、旧费用账户或 Roadmap。

已完成普通父扫描 Agent 的真实 Mastra 工具委派闭环：至多两个独立只读检查子任务，并行受控调度，独立受保护 Chromium Context/进程，统一预算和取消，原测量及原证据表汇总，工作台可读。顶层 run 默认串行。公共接口见 [CONTRACT.md](CONTRACT.md)，工具/API/免费复现见 [API-EXAMPLE.md](API-EXAMPLE.md)。

Mastra 1.67.0 的本地 SDK 有 `agents`、delegation start/complete、bail 和子调用 usage，但这些不能代替本项目的浏览器权限、预算预留和测量证据所有权。本版复用既有父 Agent 和 `createTool`，增加小型确定性调度器；没有另造模型框架，也没有仅运行静态 Playwright worker。真实模型是否会正确选择委派仍未验证；本次没有付费调用。

免费验证通过：

- TypeScript 检查；12 个相关测试文件、76 项测试。
- 真实编译服务、普通 `/api/runs`、免费本地脚本模型主动调用四个 Mastra 工具、实际 Chromium。
- 两个子任务执行重叠 **455 ms**；两边分别读到 `visits=1;width=320` 与 `visits=1;width=640`，证据 ID/内容/所有者互不串用。
- 父取消、单子任务失败、请求/字节和检查额度竞争、过期/迟到结果、伪造或失效证据、准备失败清理、关闭互不干扰、必查未完成不能假 covered、默认顶层串行。
- 子 Context 的 POST 与未批准私网请求被原网络边界拒绝；网络请求/字节额度与父任务共享，子导航限入口页。

可审阅证据：[summary.json](evidence/summary.json)、[生命周期事件](evidence/lifecycle-events.json)、[原始测量](evidence/child-0-check-measurement.json)、[320px 截图](evidence/child-0-screenshot.png)、[640px 截图](evidence/child-1-screenshot.png)。[manifest.json](evidence/manifest.json) 记录源代码提交与文件摘要。各案例投影明确保留父任务原有未检查项；完成子测量并不表示整个 UI 扫描通过。

**真实弹窗适配未完成。** 对方最后可依赖 HEAD 仍为规划提交 `d0fab01`；仅只读其 PROGRESS 中的 `createPopupRuntime(deps)` 与 `popupCollector(page)` 说明，没有消费未提交代码。当前生产 handler 是匿名入口 URL 的只读元素测量，不支持前置动作重放、登录、写入、付费 Jev 或完整页面状态克隆。任务中的父 action/item 提示只作上下文；当前回执保留真实 measurement ID，绝不把提示伪装为在子页面上执行过的 action/item。

合入顺序与共享补丁：先合新 `check-tasks`、`shared-budget` 模块；弹窗分支提交后独立合入其模块；人工协调 `executor.ts`、`completion-integrity.ts`、报告和工作台的小接点，保留两方新增逻辑。另有原 `browser.ts` 的异常安全/幂等关闭及 `network/boundary.ts`、`session.ts` 的可选共享预算和收窄范围。没有修改 `run-queue.ts` 或 HTTP 请求契约。再以已提交弹窗 runtime 增加原动作/原事项/Jev 适配，并把父动作/模型分派检查与 held quota 接通，做一次小型免费浏览器复验。不能直接取消当前零动作/零模型配额限制来宣称完成整合。
