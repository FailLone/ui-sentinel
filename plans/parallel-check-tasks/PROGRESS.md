# Progress

Isolated from 3f21842 at `/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel`, branch `codex/parallel-check-tasks`.

Public contract: CONTRACT.md and adapter-example.ts. Shared touchpoints are explicitly listed in CONTRACT.md. No other worktree is modified.

Mastra locked/local SDK 1.67.0 supports Agent `agents`, delegation start/complete hooks, bail, usage and nested tool results (`dist/agent/types.d.ts`, `agent.types.d.ts`). Native delegation wraps model/subagent generation; it does not own this application's Chromium/network resources, action/fee reservations, durable task lifecycle or original item receipts. Use native Mastra createTool on the existing parent Agent with a small bounded scheduler for deterministic checks. Do not start an unnecessary child LLM or bypass the existing request/fee accounting. Future semantic child adapters still require explicit accounting integration.

Production v1: anonymous exact-entry read-only measurement tasks, zero replay actions. Popup integration pending a committed compatible adapter; no placeholder is presented as integrated popup checking.

## Host delivery state — 2026-10-10 (Asia/Shanghai)

Implemented real Mastra delegation tools on the ordinary parent Agent, two-slot scheduler, idempotency, durable lifecycle, shared read/request/byte quotas, child deadlines and parent cancellation, serial guarded original measurements, independent original protected browser workers, original-table evidence and report/workbench projection. Parent obligations stay intact. Partial child gaps use the existing inspection host. Original completion commit validates child artifacts before accepting final persistence.

Free validation: typecheck; 76 targeted tests across 12 test files; compiled ordinary API + real Chromium with local scripted model. Latest successful browser bundle: `data/parallel-check-tasks/2026-10-09T17-59-09-753Z/`. Actual intervals overlap by 455 ms; each child reads localStorage visit count 1 at its own 320/640 viewport. Child failure, POST/private-address denial, parent cancellation, worker cleanup and default global serial execution passed. No paid model requests or account operations.

Popup candidate arrived before delivery: `b25748e7d20faeb8ce934b2d63d9f692ca35f55a`. A pinned-source compatibility probe now loads its real `createPopupRuntime` and `popupCollector`, runs two protected child contexts, and maps ORIGINAL receipts through `popup-adapter.ts`: visible dialog fails at 320px and passes at 640px. Zero actions/model calls; handoff stays unverified. This verifies the read-only adapter boundary only. Ordinary API popup action/Jev delegation is NOT integrated: the candidate's act/frame callbacks still close over the original executor's node/item/action owners. Enabling those safely requires a child original-executor capability adapter and parent held-quota admission. The production host intentionally remains zero-action/zero-model. No uncommitted source was used.

Compatibility command: `node --import tsx scripts/validation/parallel-popup-compat.ts`. Host verification remains the 76-test suite plus ordinary API browser proof; two new adapter counterexamples also pass (5 tests in the evidence test file).

Shared files: `executor.ts` (host/tools/input/finish/final cleanup plus network shared budget); `browser.ts` (exception-safe, idempotent cleanup); `network/boundary.ts` and `session.ts` (optional shared budget/narrower scope); `completion-integrity.ts`; `run-phase.ts`; report builders and `web/ui-scan-report.tsx`. `run-queue.ts`, HTTP request schemas, popup directories, maintainer roadmap and all prior accounts/claims are unchanged.

Merge order: independently review this branch's new check-task/network-budget modules; merge the popup candidate independently; reconcile small executor, completion/report/workbench hunks by preserving BOTH sets of additions (do not take a whole file from either branch). Then add a separately reviewed popup adapter against its committed runtime, enabling original action/model reservations only with parent held-quota checks and existing fee-account ownership; repeat a small free browser adapter test. Do not enable paid semantic validation implicitly.

## 第二轮冻结整合（2026-10-10）

完整合入弹窗 `3225754`，原 executor 子运行、原 Jev/动作/测量/持久化/报告、父配额预留、账户共享独占会话及 drain 全部接通，实现 SHA `e7139716ca9c902a84846f2a70ed9c1373870b6e`。产品免费脚本与旧只读回归通过；TypeScript 和构建通过。21 文件 172 项相关测试通过，另 32 项 DNS 隔离通过；组合复跑存在原 DNS 计数波动，原失败日志保留。详细边界与用法见 [INTEGRATION.md](INTEGRATION.md)，本轮证据单独存放 `product-evidence/`；第一轮证据未覆盖。

## 真实并行小批次准备（2026-10-10，未收费）

同步接收后的 main `5595a14`。发现并免费补齐主通道/子 Jev 共用原账户的受信任启动接点，以及子几何目标收窄后保留父完整目标的接点；候选运行源码更新为 `c8f59a24bbb8465107ed35f24837206bf32f4e59`。3 行冻结计划、请求/费用/时间上限、机器摘要、单次批准闸门和执行命令均见 [real-preparation/PLAN.md](real-preparation/PLAN.md)。定向 26 项、类型检查和构建通过；最终 P01 免费单行原 API/Chromium/provider/ledger 检查通过，5 主请求 + 2 Jev 请求逐笔对齐，实际付费 0。未重跑旧矩阵或 DNS 全套；等待维护者统一确认新的 USD 1.86 批次授权，不沿用旧提案。
