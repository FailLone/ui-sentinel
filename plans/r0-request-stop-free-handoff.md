# 请求级费用停止与公开状态包交付（2026-10-08）

实现候选 **`b266089d8a46b0394e39220f66ac85260b4b19ef`**，基于最近交付 `7926b4d`。本次受限免费任务完成；**R0 原失败保留，付费验收未恢复**。没有重建/替换 `08acc95` 产品构建、修改模型/重试/预算/采样/完成门，也没有改 R1、私有评分器或 Roadmap。

共享入口 `evaluation/support/model-gateway.ts` 与原 `campaign-ledger.ts` 的顺序为：

1. 网关启动读取费用停止 epoch；请求先检查本地停止锁，再在原账本写事务中检查有效 unknown/epoch，并预留费用。
2. 请求日志落盘后，在实际传输前再次取得同一 SQLite 写锁，确认 held、准入 epoch、无 unknown、未重复派发。最后同步检查取消/运行窗口，并直接启动传输；没有检查后再异步排队的派发窗口。事务只覆盖启动，不等待上游响应。
3. 用量缺失立即锁住本网关并传播取消；`markUnknown` 在写事务中同时写 unknown 与不可逆停止事件，提交后通知其他实例。unknown 与派发争用同一写锁：unknown 先提交则新请求不出站；传输先启动则保留真实派发状态。
4. 未派发只释放预留；已派发有 `dispatchedAt`，不能被 `release` 改成未发生。取消后缺少用量保留 unknown；迟到的有效用量仍按真实成本结算。对账保留原 unknown 记录，并且不清除停止 epoch、不解除旧网关锁、不恢复已结束批次。

跨进程派发准入由原账本事务保证，不依赖轮询速度；已派发请求的跨进程取消通过25毫秒轮询传播，可能受事件循环/SQLite锁延迟影响，不能保证供应商撤销或免收费。SQLite短暂读锁争用下重查，其他账本错误关闭准入。启动/写账失败不假装请求未发生。

保护范围：经过该网关的 `/v1/chat/completions`（Agent、SDK自动重试、视觉）和 `/v1/decisions` 共用闸门。当前网址 campaign、visual-stage、业务诊断/正式都接原共享账本；acceptance/learning/programs/visual-focus-p2 等不带共享账本的旧入口获得本实例停止锁，但没有跨进程共享费用保证。现有 runner 的阶段终止记录保持原契约。

**未覆盖**：直接连接供应商的 `src/shared/model.ts`、`src/execution/visual-request.ts`、Midscene视觉请求、completion-review，以及独立 R1 checkout 的模型/Decisions 客户端；只有其请求实际经过上述网关才被保护。将来独立调用方需使用同一账本的 `stopEpoch + reserve + dispatch`，不能仅 reserve 后自行发送。未新增全局模型封装或 R1 调度器。

免费验证：费用相关6文件 **41/41**，其中新增10个同步点反例覆盖原请求/重试/视觉/Decisions、已预留排队重试、另一进程 unknown、前后派发顺序、取消前/后、真实执行故障、迟到费用、对账不恢复、账本故障及无账本停止锁。原有账本/对账/路由证据复用；修正了旧测试中“unknown后继续预留”的过时期待，多请求对账用例改为先并行预留。供应商路由 mock 显式返回合成0费用，不能把缺用量当免费。首次本地验证的清理变量错误及 mock 契约矛盾均保留在本地日志，没有筛掉 R0 失败或再次付费。Node24.21.0、pnpm10.17.1，typecheck通过；未跑产品全量、84项旧定向测试或12场景浏览器回归。

公开材料：`plans/evidence/r0-public-decision-states/README.md` 为可转发给 R1 Agent 的接口说明；`index.json` 是8状态及摘要索引，`inputs/` 复用 `r1-exploration-input-1`，`public/` 提供完整公开事实。原 Agent 的下一次选择隔离在 `evaluation/`，不放进 Jev 输入。8个冻结清单、截止前缀SHA及快照均核对，原 R1 纯解析器8/8接受，无新 Jev 输出。模型提示投影中的预算/检查映射、fill兼容性、unknown权限、相对工具成本与美元报价的区别均见 README。没有评价新策略效果。

本地文件：

- `data/r0-request-stop-free/public-state-package.tar.gz`：可转发公开包，**不含原选择评价目录**。
- `data/r0-request-stop-free/original-choice-evaluation.tar.gz`：独立评价包，应在新决策结果固定后使用。
- `data/r0-request-stop-free/free-verification.tar.gz`：免费验证日志/机器结果，包含失败开发检查及最终通过记录。
- 原来源包仍为 `data/r0-08acc95-resume/r0-08acc95-real-acceptance-evidence.tar.gz`；当前提取器只读归档，未重放模型或浏览器。

机器交付索引 `plans/evidence/r0-request-stop-free-delivery.json` 保存候选、文件/包摘要、测试、费用与覆盖边界。本轮新增付费 **US$0**；只读核对共享累计 **US$2.10880437**，余额 **US$17.89119563**，有效 unknown/held/lease均0。没有开新活动账本或新增对账请求，临时账本仅为隔离免费测试夹具。

后续仍需独立决策实验与重新授权的真实验收来证明探索稳定性；本次费用修复和离线输入不把 R0 或 R1 改判通过。主工作区维护者 Roadmap 修改完整保留。
