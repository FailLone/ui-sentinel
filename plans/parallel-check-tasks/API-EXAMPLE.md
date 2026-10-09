# Ordinary entry and free reproduction

Enable `EXECUTION_URL_SCAN=1` and `EXECUTION_PARALLEL_CHECK_TASKS=1` on the server. The latter defaults off; there is no injected provider or task handler in HTTP input. Existing normal UI-scan runs then expose the four delegation tools to their real Mastra parent Agent. No special worker/CLI run type is introduced.

Normal request (requires the deployment's existing model configuration; this example itself is not a paid test authorization):

```http
POST /api/runs
Content-Type: application/json

{"kind":"ui-scan","entryUrl":"https://example.org/","goal":"Inspect the page. If useful, delegate independent read-only measurements of h1 at 320 and 640 pixel widths, and retain unfinished original checks.","budget":{"totalTimeoutMs":60000,"maxActions":12,"maxModelCalls":20}}
```

The response's `runId` and `reportUrl` are the ordinary ones. The report adds `uiScan.checkTasks`, and the workbench renders child status, actual use, unchecked scope and evidence links. Ordinary cancel `/api/runs/<runId>/cancel` propagates to children.

Illustrative model tool input (substitute `checkTasks.entryUrl` and `checkTasks.deadlineAt` from the parent input):

```json
{
  "version": 1,
  "key": "narrow-heading",
  "kind": "element-measurement",
  "purpose": "Measure heading in the narrow viewport",
  "target": {"selector": "h1"},
  "start": {"url": "https://example.org/", "viewport": {"width": 320, "height": 480}, "prerequisites": []},
  "publicFacts": [], "evidenceRefs": [],
  "permissions": {"session": "anonymous", "writes": "none", "actions": "none"},
  "quota": {"actions": 0, "modelCalls": 0, "reads": 2},
  "deadlineAt": 1900000000000
}
```

Call `check_task_submit` twice with different keys/viewport. Query `check_task_status {}`, bounded `check_task_wait {"waitMs":1000}`, or `check_task_cancel {"childTaskId":"<returned-id>"}`. Submission is idempotent for identical input; a changed body under the same key is refused. Terminal children do not release the two-task lifetime cap. Failed input admission remains an explicit failed task rather than disappearing.

Free end-to-end reproduction, Node 24 (or supported Node 22), installed locked dependencies and existing Playwright Chromium:

```sh
node --import tsx scripts/validation/parallel-check-tasks.ts
```

This compiles the real server, starts only local fixture/model endpoints with isolated database and explicit local dummy credentials, and uses real Mastra tool calls through ordinary HTTP run creation. It checks two-context overlap/storage isolation, child failure, child write/private-address denial, parent cancellation/resource close, original obligations not falsely covered, feature-off behavior and the unchanged top-level serial queue. Evidence is written under `data/parallel-check-tasks/<timestamp>/`. No real model quality claim is made.

Focused checks:

```sh
pnpm typecheck
pnpm exec vitest run src/execution/check-tasks src/execution/network/shared-budget.test.ts src/execution/network/session.test.ts src/execution/network/session-dns.test.ts src/execution/network/boundary-dns.test.ts src/execution/browser.test.ts src/execution/run-queue.test.ts src/server/reports/run-report-ui.test.ts src/web/ui-scan-report.test.ts src/execution/completion-integrity.test.ts
```
