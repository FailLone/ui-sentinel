# 主动视觉发现：P3 交接

状态：**P3 ready for review，P4 尚未执行。**

代码来源：基于 `origin/review/visual-focus-p2` 尖端 `6946df9`，分支 `dev/visual-focus-p3`。

- base：`6946df9`
- head：本文件所在提交（P3 的最后一次 commit）；分支尖端以 `git log -1 --format=%H dev/visual-focus-p3` 为准
- 最后 build hash：`26cb557196e657f3ae2dbdbe9ad3bfbae53b853e98a8f0adddc73bafee9f5f1a`（评审修复后的最后一次 `pnpm build`，88 个文件；由 `buildIdentity()` 覆盖 `dist`、两个 arena、`evaluation/`、`scripts/` 与 lockfile 计算）
- 免费证据目录：`data/visual-focus-preflight/2026-10-06T02-37-02-780Z/`（其 `manifest.json` 记录同一 commit 与 hash）

**付费请求数 = 0。** 本阶段所有免费命令的产物均标 `mode: fixed`（preflight）或由测试直接断言；P2 smoke 入口存在但未执行（见 R03/R07）。没有任何 real diagnostic 凭证被生成，P4 门槛未被提前满足。

## 一、测试层次与总量

| 项 | 结果 |
| --- | --- |
| Biome `format:check` | 退出 0（282 files） |
| `typecheck` | 退出 0 |
| `test`（全量） | **105 个测试文件 / 1034 个测试全部通过**，退出 0 |
| `build` | 退出 0 |

B01 要求不沿用 P2 的 844：本次实测 1034，文件数 105。基线与本次的分差来自 P3 新增的独立评分器、协议、台账、计划、审计与 CLI 测试，以及本轮评审修复新增的网关证据、运行 profile 与模块图测试。P2 基线的 90/844 已在 setup 时记录于 ledger，未作为本阶段结果。

（评审修复期间有一次全量运行报 1 failed / 1034，其开始时刻与我为验证边界测试而临时把 `focusReceiptVerdict` 走私进 `witness.ts` 的时间窗重叠，而该 symbol 正是新边界测试断言不存在的对象。回滚后的连续两次干净运行均为 105/105、1034/1034 全通过，已在 ledger 记录归因。）

## 二、逐项验收

### G0 构建、兼容和可移交

| ID | 结果 | 证据 |
| --- | --- | --- |
| B01 | pass | 上表四项均由本机实跑，退出码 0，测试数如实记录 |
| B02 | pass | 产品默认视觉关闭：新增 `evaluation/support/freeze-identity.test.ts` 覆盖全部旋钮被 pin；`scripts/validation/cli-args.ts` 显式要求模式；P2 smoke 关闭 blocker review（`EXECUTION_BLOCKER_REVIEW: '0'`），visual/atomic 显式 `1` |
| B03 | pass | `src/server/reports/run-report.ts` 对旧 receipt 缺 `observedWindowMs` 显示 `null`（"未记录"），`visual.costStatus: 'not-recorded'`；`src/server/reports/run-report-focus.test.ts` "reports an unrecorded window as null, never as 0" 与 "reports visual spend as unknown rather than zero" |
| B04 | pass | `fixture:approved-retry --verify` 退出 0，`verified:true`，`files:14`，`ruleConfigSha256:f3ac227c…`，`paidModelRequests:0`；Git 批准 fixture 原样校验，未发生新 approval |
| B05 | pass | 新增输入全部在 Git（见"交付物"）；`data/` 已在 `.gitignore`；无凭据、DB、临时脚本进入提交 |
| B06 | **partial** | `buildIdentity()` 覆盖 `dist`、两个 arena、`evaluation/`、`scripts/` 与 lockfile，任一内容变化即改变 hash（`evaluation/support/build-identity.ts`）。见下节说明 |

**B06 说明（如实记录，不宣称 pass）**：identity 已覆盖评分器与协议所在目录，因此改动它们会被识别。但我没有为"换 arena/web/scorer/protocol 任一内容被识别"编写逐项的自动化反例测试——验收要求的是"能识别",当前是"由实现结构保证"，不是"有测试证明"。这属于 P3 未做的一个测试，不改现有代码行为。**判为 partial。**

### G3 反例矩阵（独立评分器）

| ID | 结果 | 测试位置 |
| --- | --- | --- |
| S01–S16 | pass | `evaluation/private/visual-focus/scorer.test.ts`，共 37 个测试，逐项断言具体失败码 |
| import 边界 | pass | 同文件 "does not import the product verdict or the P2 smoke scorer"，读取自身源码，禁止 `focusReceiptVerdict`/`evaluateFocusVerdict`/`focusReceiptSupports`/`visualSmokeProblems`/`isFocusReceipt` |
| 无候选合法对照 | pass | "accepts H1 and H2 when no candidate is proposed at all" |

失败码按"被拒原因"命名（如 `provenance.image-sha-mismatch`），与验收"必须拒绝的原因"一一对应；S03 的错误归一化反例、S16 的伪造 verdict 字符串反例均已单测。

### R01–R08 运行器、费用、证据、报告

| ID | 结果 | 证据 |
| --- | --- | --- |
| R01 | pass | 非法 CLI 实测退出 **2**（`--bogus`、`--diagnostic` 缺 campaign、`--formal` 缺 source 均 `FAIL(2)`）；缺 key 实测 `configuration-missing: OPENROUTER_API_KEY; no mock fallback` 退出 2；provider 不符实测 `Pinned provider mismatch: agent-provider-mismatch` 退出 2；脏工作区退出 2。全部在读取凭据或发送请求之前 |
| R02 | pass | 实测：把 p2-smoke manifest 作为 formal 源 → `FAIL(2): formal-source-refused: diagnostic-source-wrong-kind:visual-focus-p2-smoke`；`evaluation/support/formal-source.test.ts` 覆盖 preflight/P2/formal kind、fixed 模式、未通过、错 build、错 campaign、未 review holdout |
| R03 | pass | `evaluation/support/execution-plan.test.ts`：smoke+3、18、45 行数与矩阵一致；`batchVerdict` 对 `not-run` 行判 incomplete，partial group 永不联合完成；评分器新增 discoveries/falsePositives/missed/businessFailures/unverifiedScope 独立计数（`scorer.test.ts` 5 个新测试） |
| R04 | pass | `evaluation/support/row-runner.test.ts`：质量失败保留该行并继续；`batchVerdict` 分母不变且非零 |
| R05 | pass | `mayContinue('provider-error') === true`（可恢复才进入下一样本）；`sameMechanismTwice` 由 `execution-plan.test.ts` 覆盖，diagnostic 连续两次同机制即停止 |
| R06 | pass | `evaluation/support/interrupt-guard.test.ts`：SIGINT 后收尾一次、退出 **130**、第二次信号不重跑收尾、正常结束 dispose 后迟到信号不生效；`visual-focus-runner.ts` 的 wrap-up 停服务、写 `interrupted:true`/`passed:false` 的 manifest、释放租约 |
| R07 | pass | 同上：中断阶段 manifest 标 `interrupted`/`passed:false`，余下行为 `not-run`，无自动 reconcile；`campaign-ledger.test.ts` 覆盖崩溃遗留预留不丢、重复结算不重复收费 |
| R08 | pass | `evaluation/support/fixture-revision.ts` + `formal-source.test.ts`：未 review 的 holdout revision 被正式门槛拒绝；test-only revision 仅在免费测试中可用 |

### C01–C05 费用台账

| ID | 结果 | 测试位置 |
| --- | --- | --- |
| C01–C05 | pass | `evaluation/support/campaign-ledger.test.ts`（10 个测试全部通过）：事务预留不双花、跨进程累加、未知预留纳入上限且不按 0 结算、重复结算/导入不重复收费、单 runner 租约（第二进程拒绝、活租约不被抢占）、价格缺失拒绝、env 改动不暗改原上限 |

### E01–E04 证据协议与停服审计

| ID | 结果 | 证据 |
| --- | --- | --- |
| E01 | pass | `evaluation/support/audit-compare.test.ts` + `campaign-evidence.test.ts`：API 完整分页历史（`collectFullEventHistory` 走到空页，游标不前进即拒绝而非死循环），API 侧缺中段 → `events-api-incomplete`；停服后新连接逐条对比，非仅比最后 seq |
| E02 | pass | 同处：删中段 → `events-missing-from-api`、重复 seq → `events-seq-duplicated`、改 payload/evidenceRefs → `events-changed`、改 hypothesis → `hypotheses-changed`、改 finding → `findings-changed`；规则批准来源单独校验 |
| E03 | pass | `evaluateHashes`：原文件/下载文件字节与 SHA 对照，缺索引 → `artifact-not-indexed:<id>`，集合为空但 run 有 artifact → `artifact-index-incomplete`，空集合不空泛通过 |
| E04 | pass | `evidence-protocol.test.ts`：manifest 带 `mode`/`stage`/`schemaVersion`/冻结身份；preflight 声明 `real` 被拒；artifact-index 记录 runId/type/SHA/字节/相对路径；`batch-timing.test.ts` 墙钟实测而非相加，model/tool 时长未测时显示 `null`（产品只持久化 token，不持久化分项时长） |

E04 的请求/费用索引由 `campaign-ledger` 的 `ledger_requests` 承载：`requestId` 唯一、关联 run/phase、状态含 held/settled/unknown/released、失败与未知完整；网关 `redact()` 在落盘前替换 key 与本地 token（`evaluation/support/model-gateway.ts`）。

### W01–W03 报告与 Web

| ID | 结果 | 证据 |
| --- | --- | --- |
| W01 | **partial** | 报告与 Web 已展示：原图、派生标注、模型感知框 vs 实际 input 包围盒、逐点坐标/焦点时间/**实际观察窗口**、正向控制、integrity、unknown 原因、视觉请求数与费用（未知显示"未记录"）。`run-report-focus.test.ts` 与 `main.tsx` 均覆盖。**未做**：真实页面的目视复核截图未由本阶段生成并检视（P2 阶段做过 D0/H0/H1 标注图目视）。判 partial |
| W02 | pass | `src/server/reports/run-report-focus.test.ts` "reads the rows back from the persisted artifact, so a restart shows the same thing"；p2 hydration：`validate:visual-focus --preflight` 内部停服重启后重新校验图像/SHA/采样 |
| W03 | pass | 缺原图/测量/引用显示明确错误（`samplesAvailable:false`、`points` 缺省而非空数组）；unknown usage 与旧报告显示"未记录"；费用未知不显示 0 |

## 三、必须执行的免费命令（逐条实跑）

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `pnpm format:check` | 0 | 282 files |
| `pnpm typecheck` | 0 | — |
| `pnpm test` | 0 | **105 files / 1034 tests**（评审修复后连续两次） |
| `pnpm build` | 0 | server + workbench + 两个 arena |
| `pnpm fixture:approved-retry -- --verify` | 0 | `verified:true, files:14, paidModelRequests:0` |
| `pnpm test:fixtures` | 0 | 六个 fixture 全部 verified |
| `pnpm test:fixtures:export` | 0 | 五个导出变体全部 verified |
| `pnpm validate:persistence` | 0 | 6 runs，`durable:true`，`paidModelRequests:0` |
| `pnpm validate:investigation` | 0 | 9 项断言全 true，`paidModelRequests:0` |
| `pnpm validate:blocker-review` | 0 | 8 项断言全 true，`paidModelRequests:0` |
| `pnpm validate:business -- --preflight` | 0 | `assertions:32, failed:[]`，`paidModelRequests:0` |
| `pnpm validate:visual-focus -- --preflight` | 0 | `data/visual-focus-preflight/2026-10-06T04-05-13-934Z/`（评审修复后重跑；`manifest.json` 记 `mode:fixed, paidRequests:0`），D0/H0 + 预算/取消/错绑定边界，Web reload 与停服重启复核 |

`data/` 已在 `.gitignore`，故生成证据不入 Git；重建命令即上表命令。**注**：`validate:visual-focus -- --preflight` 的产物重建依赖本机存在 `.env`（该入口按设计清空所有真实凭据，只用固定本地模型，不因 `.env` 存在而改变为付费行为）。

## 四、fixed / real 区分

| 入口 | 标签 | 说明 |
| --- | --- | --- |
| `validate:visual-focus -- --preflight` | `mode: fixed` / `stage: preflight` | 固定本地模型 + 真实浏览器/SDK/API；清空全部真实凭据 |
| `--diagnostic` / `--formal` | `mode: real` / `stage: diagnostic|formal` | 未执行（付费）；缺 key 明确失败，无 mock 回退 |
| `--p2-smoke` | `mode: real` / `stage: p2-smoke` | 未执行；kind 与 diagnostic 不同，formal 门槛据 kind 拒绝 |

零付费的完整调度与中断由注入式测试覆盖（`row-runner`/`execution-plan`/`interrupt-guard`/`campaign-ledger`），**不产生可用于 P4 的 real diagnostic 凭证**。

## 五、交付物

新增/修改的关键代码（全部在 Git）：

- `src/execution/binding-witness.ts`、`evaluation/private/visual-focus/witness.ts` — 公开 DOM 见证捕获 + 私有比对
- `evaluation/private/visual-focus/scorer.ts` — 独立评分器（不调用产品 verdict / P2 smoke 评分函数）
- `evaluation/support/` — `freeze-identity`、`fixture-revision`、`execution-plan`、`row-runner`、`campaign-ledger`、`formal-source`、`audit-compare`、`evidence-protocol`、`batch-timing`、`interrupt-guard`、`gateway-evidence`（网关日志→评分器输入）、`runner-profile`（冻结 feature profile）、`module-graph`（传递导入边界检查）
- `scripts/validation/` — `cli-args`（严格解析 + 退出码）、`visual-focus-runner`（付费 diagnostic/formal）、`visual-focus.ts`/`business.ts` 派发
- `src/server/reports/run-report.ts`、`src/web/main.tsx` — 报告与 Web 展示
- `src/execution/focus-measure.ts` / `focus-probe.ts` / `focus-receipt.ts` — 实际观察窗口

## 六、失败与修复记录

1. **独立评分器断言码命名**：初版用"正向断言名"，与验收"必须拒绝的原因"不符，改为按拒绝原因命名。无行为影响。
2. **实际观察窗口未记录**：探针等满了窗口却只写声明值，S08 在真实数据上无法执行；补 `observedWindowMs` 端到端。这是 P3 修正的真实缺陷。
3. **`provider-error` 错误地停止批次**：改为可继续（可恢复才进入下一样本），只有"连续两次同机制"才停 diagnostic。
4. **`protocolHash` 用 JSON replacer 数组丢失嵌套键**：改为深度排序序列化。
5. **非法 CLI 退出 1**：验收要求 2；引入带退出码的 `CliUsageError` 并在两个派发器映射。
6. **停服审计只传 runId**：审计无可比对内容，等于空跑；改为传入完整 report + artifactIndex，并在停服前用分页接口读全历史。
7. **P2 smoke 被标 `fixed`**：付费入口标成免费，与 `mode` 字段的存在意义相反；改为 `real`（其 kind 仍被 formal 门槛拒绝）。
8. **付费运行器把证据别处读来**（评审 Important）：运行器把 `gatewayCalls: []` 硬编码进评分器输入，并从**请求 prompt**（永远解析不出 JSON）构造 `sentVision[].raw`，导致 `binding.semantic-call-missing` 与 `provenance.normalized-contract` 在任何真实诊断上必然失败——P4 阻断级。新增 `evaluation/support/gateway-evidence.ts`，从网关自己的 `requests.jsonl`/`responses.jsonl` 读回证据：重组流式 tool call、按精确 `<case>-<repeat>` 限定范围、响应缺失或不可解析时报 `null` 而不是 `{}`。同时修掉 `requestCounts` 的 `startsWith(row.case)` 前缀泄漏（repeat 1 把 repeats 2–3 的请求算进自己）。
9. **付费运行器的冻结配置与规格不符**（评审 Important）：`EXECUTION_BLOCKER_REVIEW` 写成 `'0'`，而计划配置表对 diagnostic/formal 明确钉 `1`，且写明 P2 smoke 的 0 不能冒充；该 flag 手写在不可 import 的顶层脚本里，免费测试看不见。新增 `evaluation/support/runner-profile.ts` 给配置一个可测的家，运行器由它派生 env，并让有限 Jev 审查经网关计量（`COMPLETION_REVIEW_URL/_API_KEY`）；`REVIEW_RESERVE_USD` 收敛到网关模块，消除 4 处重复字面量。`validateFreeze` 新增 `feature-profile` 比对。
10. **`provenance.normalized-transform` 空泛通过**（评审 Minor，因修复 8 而变为可达，故提升处理）：原始响应或保存的 viewport 缺失时该断言直接通过——"无可比对"被当成"一致"。已改为"有候选就必须可核对"，只有真正无候选（H1/H2）才免比对。
11. **`settle()` 把非法成本记为 0**（评审 Minor，提升处理）：NaN/Infinity/负数原先写 0，等于把该请求整笔成本从 campaign 里抹掉（C05 禁止）。改为抛 `invalid-actual-cost`，预留保持 `held`（调用方应以 `markUnknown` 收尾）。
12. **导入边界检查可被绕过**（评审 Minor，提升处理）：原先只 grep 评分器自身源码，改名 re-export（本仓库 `witness.ts` 本身就是这种形状）即可躲过计划禁止的"直接或间接"调用。新增 `evaluation/support/module-graph.ts` 走真实导入图。

## 七、整支评审（fresh-context，最强模型）

评审范围：`git merge-base main HEAD`..HEAD 的整支 diff，含权威文档、交接件与 ledger。

**核验为干净**：S01–S16 反例矩阵（每条只损坏一个字段并断言具体失败码，非空泛）；E01–E04 审计比对（两侧 seq 缺口、API 分页丢页、同长度 id 互换、空集合不通过）；R01 退出码；R03 计划完整性；R06 SIGINT；C01–C05 台账；`recomputeVerdict` 独立性；formal 来源门槛；交接件的诚实性。

**结论**：2 Important、4 Minor、0 Critical。**6 条全部修复**——4 条 Minor 与 2 条 Important 属同一缺陷类（"没有证据却报成功"），故按效果重判后一并进入唯一一次修复 pass，无一延后。逐条见第六节 8–12；每条都以"先失败后通过"的测试收口，最后一次全量套件绿。

**一处如实记录**：修复 pass 期间有一次全量运行报 1 failed / 1034，其开始时刻与我为验证边界测试而临时走私 forbidden symbol 到 `witness.ts` 的时间窗重叠；回滚后连续两次干净运行 105/105、1034/1034。已按时间与断言吻合归因，未当作 flake 略过。

## 八、交付提交

- base：`6946df9`（`origin/review/visual-focus-p2` 尖端）
- HEAD：本文件所在提交；见 `git log -1 --format=%H dev/visual-focus-p3`
- 分支：`dev/visual-focus-p3`，本地已提交；**未合并 main**。push 因环境无可用的非交互凭据而未执行，需由你自行 `git push -u origin dev/visual-focus-p3`。

本阶段 29 个提交，分五组：

1. **证据与窗口**（`f18a7d7`、`a9fe860`）— 公开绑定见证；实际观察窗口。
2. **独立评分器与反例矩阵**（`14a8cfe`、`d894d29`）— S01–S16。
3. **冻结、计划、台账、运行器**（`9aea77c`…`4c90058`）— 冻结身份与 fixture 门槛、严格 CLI、执行计划与结果分类、共享 SQLite 台账、可注入批次运行器、付费 diagnostic/formal 入口。
4. **证据协议、审计、报告与 Web**（`67fd884`…`819f1c1`）— 统一 manifest 与索引、全历史审计、失败分项计数与实测窗口、停服后审计、非法 CLI 退出 2、SIGINT 收尾退出 130、preflight 顶层证据索引、P2 smoke 标 `real`、空审计不通过、冻结身份在 formal 门槛真正生效、smoke 行可执行。
5. **整支评审修复**（`9d93027`…`b544ea3`）— 网关证据读回、运行 profile 冻结、可核对性、成本拒绝、导入边界与模块图、identity 携带 feature profile、交接件。

## 九、残留（P3 未完成 / P4）

**P3 内的两个 partial（不影响交付判断，但如实列出）**：

- **B06**：identity 覆盖范围由实现结构保证，未写"逐项替换被识别"的反例测试。
- **W01**：报告/Web 展示已测试，但本阶段未生成并在真实页面上目视复核截图。

**评审修复后仍为 partial 的项**（同上，不新增 partial）：

- B06、W01 不变。

**P4（不属于 P3 未完成）**：

- 新 holdout fixture revision 由主 Agent 在算法/prompt 冻结后准备，确认真实页面几何与未调试状态。
- 真实 Qwen diagnostic（同构建）。
- 正式 18 轮视觉 + 同构建旧业务 45 轮。
- 付费请求数当前为 0，**没有 real diagnostic 凭证**，P4 门槛尚未满足。

## 十、结论

**P3 ready for review，P4 尚未执行。**