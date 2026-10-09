# Check task contract v1

> 第二轮已完成原动作/Jev 产品整合，当前使用与交付见 [INTEGRATION.md](INTEGRATION.md)。本文件保留第一轮记录。

Host source: `src/execution/check-tasks/contract.ts`; Mastra tools: `src/agent/check-tasks/tools.ts`.

A parent UI run exposes `check_task_submit`, `check_task_status`, `check_task_wait`, `check_task_cancel`. Submit returns immediately after durable acceptance, then independent children execute concurrently (maximum TWO total, one level). Identity is parent run + caller idempotency key; changed input under the same key is rejected. Status/wait return executor results, never model-authored coverage. Wait is bounded and may return running.

Input: version, key, kind, purpose, target CSS, entry URL, viewport, prerequisite list, public facts and evidence refs, optional original action/item links, anonymous/read-only permissions, action/model/read quotas and absolute deadline. Parent/child IDs, effective permissions, contract hash and namespace are host assigned. Deadlines may only narrow the parent. A reference to an original item is context, NOT permission to resolve it.

V1 production handler is `element-measurement`: anonymous reentry of the exact parent entry URL, zero prerequisites, zero actions/models, at most two bounded original `inspectElements` reads plus screenshot and raw measurement artifacts. Alternate viewport is allowed. Unsupported prerequisites/permissions are rejected before resources open. Missing/ambiguous/unsupported/intervened targets are unverified. Measurement completion is not a popup verdict or a parent's selected/required-item receipt.

Resources are independent original `launchBrowser({uiScan:true})` workers (separate Context AND process because the denying proxy belongs to that worker). Original `installRunNetworkBoundary` is installed before navigation. No Page/Browser or arbitrary JS is exposed through model tools. A trusted handler receives only guarded serialized measurement/capture capabilities, signal, budget lease and progress callback. An adapter that needs actions/Jev must first wire the original action and approved fee-account paths; v1 does not silently permit paid model calls.

Results: parent/child identity, task hash, queued/running/terminal timestamps, status (completed/defect/unverified/failed/cancelled), original action/item/measurement links, evidence refs, explicit unchecked scope and actual usage. Artifacts use the original parent run artifact table with child identity/hash metadata; lifecycle uses original run events. No second facts ledger. Artifact bytes are hashed and checked on report read. Failed, interrupted, missing or swapped evidence remains unfinished; child results never clear the parent's obligations.

Reservations happen synchronously before async dispatch. Parent usage plus all outstanding reservations cannot exceed limits; consumed amounts are charged immediately, unused quota released after cleanup. Parent signal/deadline cancels children; late result publication is refused. Parent finalization drains children before terminal commit. Durable accepted events without terminal events project as unverified after process loss; no automatic replay of unknown work.

Shared patches: executor imports/host lifecycle/tools/input/finish gate; report summary and artifact validation; finalization tool allowlist. No global run-queue changes, no routes schema changes (operator opt-in `EXECUTION_PARALLEL_CHECK_TASKS=1`, tools on normal UI-scan entry). Popup directories remain untouched. Integrate independent modules first, then small executor/report hunks alongside popup wiring.

## Accounting and narrow replay details

Parent and both children share ONE original network request/body budget (500 requests, 10 MiB per response, 50 MiB total wire/decoded bytes), with synchronous admission before dispatch. Children additionally narrow navigation to one entry page/depth zero; they cannot multiply the parent page allowance. This uses optional inputs on the original network boundary/session; default callers keep their original behavior.

Production child action/model quotas must be zero. The shared quota primitive can reserve these counters, but a future action/Jev adapter must also make the parent's pre-dispatch checks subtract held reservations and use the approved account. The current host does not claim that future integration is complete. Child wall time is the shared parent's absolute deadline, not a fresh timeout per child; child elapsed time is recorded separately and is not summed as parent wall time.

`source` carries parent context only. Fresh URL reentry cannot prove the same DOM state, action or item identity. Therefore the v1 measurement has its own original `measurementId`; its action/item IDs remain absent. A popup adapter must supply genuine receipts through the original executor, not copy these hints into a verified action/item link. Partial artifacts remain attached to the terminal child even after failure or cancellation.

At explicit partial finish, remaining child gaps are recorded through the existing inspection host's permanent `recordGap`; they are not invented covered items. Completion commit and report reads recheck child artifact owners, bytes, receipt binding and terminal history. No unknown-cost or business claim/account behavior is changed.

## Committed popup compatibility checkpoint

`popup-adapter.ts` maps upstream runtime states conservatively, and requires a trusted binding of the original receipt before any completed/defect result. `scripts/validation/parallel-popup-compat.ts` loads exactly popup commit `b25748e7d20faeb8ce934b2d63d9f692ca35f55a` into an isolated temporary snapshot and runs its actual runtime/collector in two protected child workers. Already-visible panels need no action or Jev: original geometry yields fail at 320px, pass at 640px. It preserves original receipts and keeps action-budget handoff unverified. This adapter is not registered as a popup tool in the ordinary production entry; that still requires the original executor action/item/Jev resource adapter. The probe does not claim to validate the whole popup product merge.
