# 冻结实现的免费验证

源码 `e7139716ca9c902a84846f2a70ed9c1373870b6e`，Node `v24.21.0`。弹窗完整流程输出目录：`data/parallel-popup-product/2026-10-09T18-31-48-512Z/`。原只读回归目录：`data/parallel-check-tasks/2026-10-09T18-30-33-922Z/`。全部付费调用 **0**，本地脚本主模型、进程内固定 Jev、实际 Chromium。

[summary.json](summary.json) 含原动作/固定 Jev 开始结束事件、子浏览器关闭事件、父子总用量和所有场景断言。两个实际 Jev 调用重叠 **383 ms**，两个原动作 executing→completed 区间重叠 **89 ms**；这些是固定响应样例的并发证据，不是线上性能数据。

| 场景 | 父主模型调用 | 子 Jev 调用合计 | 父记录模型总计 | 动作总计 | 父耗时 ms | 结果 |
|---|---:|---:|---:|---:|---:|---|
| 并行宽窄视口 | 6 | 2 | 8 | 2 | 4344 | 窄越界、宽通过 |
| 点击后无弹窗 | 7 | 4 | 11 | 2 | 4619 | 两子 unverified |
| 多面板歧义 | 7 | 4 | 11 | 2 | 4498 | 两子 unverified |
| 单子 Jev 失败 | 7 | 2 | 9 | 1 | 4066 | unverified + completed |
| 预留竞争/释放 | 8 | 2 | 10 | 2 | 6870 | 首次争用被拒，释放余额后第二子成功 |
| 两子 Jev 在途父取消 | 4 | 2 | 6 | 0 | 5317 | 两子 cancelled，先收尾再提交父结果 |

每个实际原动作、原 item、原 receipt 都归属对应子 run；独立页面均读到 `visits=1;clicks=1`。父原必查项仍未完成，覆盖结论没有变成 covered。所有场景验证子浏览器先关闭、子 run 再完成、父 run 最后完成；取消没有发布迟到测量。真实服务重启后六份父投影完全一致。原回执损坏、父封装损坏、兄弟结果互换均得到 inconsistent + unverified/unknown，测试恢复了原字节。

两份完整原子执行导出：[窄视口](child-0-original-snapshot.json)、[宽视口](child-1-original-snapshot.json)；其全部原产物位于 `artifacts/<childRunId>/`。父场景报告分别保留为 `*-report.json`。本目录是原记录的审阅导出，不是新的运行事实或费用账本。

验证结果：

- TypeScript `tsc --noEmit`：通过，退出 0。
- `node --import tsx scripts/build.ts`：通过，包含服务、工作台、两个 arena。
- 21 个相关测试文件、172 项：通过，见 [affected-tests.txt](affected-tests.txt)。覆盖调度器、配额、原弹窗、provider、独立执行作用域、原证据校验、报告、UI、路由和共享网络边界。
- DNS resolver 的 32 项隔离运行：通过，见 [resolver-isolated-tests.txt](resolver-isolated-tests.txt)。组合运行曾全部 204 项通过，但后续两次组合复跑出现原 DNS 用例计数波动：预期至多 2 次，实际 3 次；拒绝非法响应的断言仍通过。最终组合失败记录保留为 [combined-tests-dns-fluctuation.txt](combined-tests-dns-fluctuation.txt)。该测试共享请求计数且 A/AAAA 失败返回不会等待服务端请求全部排空，现象符合跨用例迟到请求；本轮未改 resolver 或其测试，未掩盖该限制。
- 新费用并发测试使用新建临时合成账户和假 HTTP，验证同父共享原账户独占锁、两请求重叠、原预算竞争、未知费用停止兄弟和迟到响应无效、关闭等待结算、之后可重新取得锁。不存在真实账户调用。
- 旧只读普通 API/Chromium 回归通过，见 [readonly-summary.json](readonly-summary.json)。

测试命令：

```sh
node node_modules/typescript/bin/tsc --noEmit
node --import tsx scripts/build.ts
node node_modules/vitest/vitest.mjs run src/execution/check-tasks src/execution/popup src/agent/popup src/execution/run-queue.test.ts src/execution/completion-integrity.test.ts src/inspection/popup-artifacts.test.ts src/server/reports/run-report-ui.test.ts src/web/ui-scan-report.test.ts src/server/routes/ui-scan-runs.test.ts src/agent/model/request.test.ts src/agent/context/progress-classifier.test.ts src/execution/network --exclude src/execution/network/resolver.test.ts
node node_modules/vitest/vitest.mjs run src/execution/network/resolver.test.ts
node --import tsx scripts/validation/parallel-popup-product.ts
node --import tsx scripts/validation/parallel-check-tasks.ts
```

未运行完整 R0/R1 或真实付费质量评测。真实主模型是否合理委派、Jev 在任意站点上的准确率和线上加速比仍未验证。
