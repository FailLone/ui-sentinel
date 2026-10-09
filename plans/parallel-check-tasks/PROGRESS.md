# Progress

Isolated from 3f21842 at `/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel`, branch `codex/parallel-check-tasks`.

Public contract: CONTRACT.md and adapter-example.ts. Shared touchpoints are explicitly listed in CONTRACT.md. No other worktree is modified.

Mastra locked/local SDK 1.67.0 supports Agent `agents`, delegation start/complete hooks, bail, usage and nested tool results (`dist/agent/types.d.ts`, `agent.types.d.ts`). Native delegation wraps model/subagent generation; it does not own this application's Chromium/network resources, action/fee reservations, durable task lifecycle or original item receipts. Use native Mastra createTool on the existing parent Agent with a small bounded scheduler for deterministic checks. Do not start an unnecessary child LLM or bypass the existing request/fee accounting. Future semantic child adapters still require explicit accounting integration.

Production v1: anonymous exact-entry read-only measurement tasks, zero replay actions. Popup integration pending a committed compatible adapter; no placeholder is presented as integrated popup checking.

## Host delivery state — 2026-10-10 (Asia/Shanghai)

Implemented real Mastra delegation tools on the ordinary parent Agent, two-slot scheduler, idempotency, durable lifecycle, shared read/request/byte quotas, child deadlines and parent cancellation, serial guarded original measurements, independent original protected browser workers, original-table evidence and report/workbench projection. Parent obligations stay intact. Partial child gaps use the existing inspection host. Original completion commit validates child artifacts before accepting final persistence.

Free validation: typecheck; 76 targeted tests across 12 test files; compiled ordinary API + real Chromium with local scripted model. Latest successful browser bundle: `data/parallel-check-tasks/2026-10-09T17-59-09-753Z/`. Actual intervals overlap by 455 ms; each child reads localStorage visit count 1 at its own 320/640 viewport. Child failure, POST/private-address denial, parent cancellation, worker cleanup and default global serial execution passed. No paid model requests or account operations.

Popup integration is NOT complete: read-only PROGRESS now describes `createPopupRuntime(deps)` and `popupCollector(page)` ownership. The other branch HEAD remains d0fab01 (planning commit), so no uncommitted popup implementation was used as a frozen dependency. Future adapter must provide original act/measure/item/source bindings and approved Jev accounting on child resources; current read-only resources intentionally cannot do that. This is the explicit remaining integration, not a placeholder task disguised as popup completion.

Shared files: `executor.ts` (host/tools/input/finish/final cleanup plus network shared budget); `browser.ts` (exception-safe, idempotent cleanup); `network/boundary.ts` and `session.ts` (optional shared budget/narrower scope); `completion-integrity.ts`; `run-phase.ts`; report builders and `web/ui-scan-report.tsx`. `run-queue.ts`, HTTP request schemas, popup directories, maintainer roadmap and all prior accounts/claims are unchanged.

Merge order: independently review this branch's new check-task/network-budget modules; merge the popup candidate independently; reconcile small executor, completion/report/workbench hunks by preserving BOTH sets of additions (do not take a whole file from either branch). Then add a separately reviewed popup adapter against its committed runtime, enabling original action/model reservations only with parent held-quota checks and existing fee-account ownership; repeat a small free browser adapter test. Do not enable paid semantic validation implicitly.
