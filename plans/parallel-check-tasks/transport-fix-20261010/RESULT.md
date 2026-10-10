# Jev 协议及失败诊断修复

2026-10-10。实现提交：`87a2816deb8885e42c3785731846a0a6f9791372`，分支 `codex/parallel-check-tasks`。本轮只做免费调查、修复、定向验证和两次既有请求的只读费用 GET；**新增真实生成请求为 0**。没有恢复 P02/P03、重开旧账户、清除停止标记、合并或推送 main。

## 已确认的问题与仍未知的原因

封存的两份 Jev 请求均为 1833 字节，走 `POST https://openrouter.ai/api/alpha/decisions`，模型 `typesafe/jev-1.13`，限定 TypeSafe、禁止 fallback。源码发送的请求头仅 Authorization 与 Content-Type；凭据值不进入归档。对象 state、路由和正文大小未发现足以证明原失败的异常。

**已确认协议缺陷：**旧 `questions.popup` 为 `{type:'choice', criteria:说明字符串, choices:选项映射}`，缺少 `instructions`。[官方 Decisions 协议](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)的 choice 使用 `instructions` 字符串和 `criteria` 选项映射。仓库历史成功请求 `plans/r1-controlled-loop-v1/paid/request.json` 的 readiness choice 也使用后一种结构，对应真实成功回执见同目录 real-result.json。旧成功样本仅禁用 fallback，本批额外限定 TypeSafe；不能把这一差异直接判为错误。修复保持原语义、选项、状态和路由，只更正字段，正文变为 1838 字节。

**无法追溯原 HTTP 的具体根因：**旧 Jev 包装层先触发取消，未保留 HTTP 状态码、正文或最先失败的请求身份。协议缺陷是明确可修的问题，但现有材料不足以证明原服务端具体返回了 400、401、429 或其他状态，更不能归因于模型质量。没有发送新请求验证这些猜测。[逐项请求审计](protocol-and-unknown-audit.json)包含原始文件哈希、结构对比和缺失项。

补充澄清：第三笔主模型请求的原 upstream-timing 已记录 HTTP 200、10 个 SSE 事件、4178 字节；它在完整校验缓冲区释放前被取消，因此网关 ledger 记录为 receivedBytes=0。两层观测不同，不能称上游未收到响应。原缓冲内容及其中可能存在的 generation ID 没有留下。

## 交付实现

- `src/agent/popup/transport.ts` 是实际产品 provider 的 HTTP 边界。记录本地请求/运行身份、通道、模型/供应商、wire SHA-256、起止/响应头时间、HTTP 状态、供应商 ID（有则记录）及受限响应头。响应头仅允许请求 ID、generation ID、Retry-After 和 rate-limit 相关项，不保存请求头、Authorization 或 Cookie。
- 首个失败在任何异步正文读取之前取得单调 failureSequence；批次 stop.json 保留该请求身份和停止原因，后续兄弟取消不覆盖它。HTTP 失败后立即停止兄弟派发，本请求仅允许最多 250ms、8KiB 输入的错误正文采集，脱敏后最多保存 4KiB；错误流随后取消。超时、取消、网络错误与 HTTP 错误分别记录。日志回调或诊断附件写入失败不会替换原错误；诊断保存在附件及原 popup:provider 事件中。
- API key、Bearer/Basic、常见密钥/JWT 及敏感字段脱敏；正文截断/不完整明确标记。不会因 HTTP 错误推断零费用，原 reserve、unknown、账户停止及不重试规则保留。
- 原产品请求改为 `instructions + criteria`。合成传输现在独立检查官方字段结构，旧格式会返回 400，避免免费 mock 再次掩盖协议错误。
- 批次 CLI 在原收尾和结果封存返回后判断退出码：停止为 **2**，无停止但目标未通过为 **3**，运行/收尾异常为 **1**，通过或纯准备为 **0**。
- 报告对所有已结束、非 active 的终态运行执行原 completionIssues；已提交取消可标 persistence verified，同时仍为 cancelled。检查目标证明仍限 completed/blocked；取消、执行错误等不算 goalPassed。持久化缺失/失配仍触发 safetyStop，原完成门未改。

## 既有费用核对

[只读官方 metadata 结果](readonly-usage.json)记录两次 HTTP 200。使用原回执真实 generation ID 查询，模型为同一 dated revision、供应商 Wafer，费用分别与原账本 USD 0.00137178、USD 0.00144102 完全一致。[官方查询接口](https://openrouter.ai/docs/api/api-reference/generations/get-generation)要求真实 generation ID；本地 UUID 不能代替。

| 原请求 | 状态 | 本轮结果 |
| --- | --- | --- |
| 6a4619612495039604678496 | settled | 官方确认 USD 0.00137178 |
| 33f7cfc7a6e10d1b3c350e5c | settled | 官方确认 USD 0.00144102 |
| ace3716351457d9185dacc96 | unknown，主模型 | 缓冲取消，无供应商 generation ID；未发猜测性查询 |
| 57fb44d8-42e4-4103-a342-ff37eb938b0f | unknown，Jev | 未保留响应 ID，不能逐笔查询 |
| 816a1f91-2217-4bd1-937c-e68da2089aa0 | unknown，Jev | 未保留响应 ID，不能逐笔查询 |

已扫描原归档 JSON/JSONL/SQLite，只找到前两笔真实 generation ID。没有可对应未知请求的新费用证据，故未调用追加式 reconcile、未写任何原账户记录。**已知合计仍为 USD 0.0028128；3 笔 unknown 保守计提仍为 USD 0.066，实际总费用尚未确定。**

## 免费验证与原件保护

[61 项定向测试](free-evidence/final-targeted-tests.log)通过，涉及实际 provider、合成 400/401/429/500/503、超时/取消、两请求竞争首错、停止日志失败、未知费用不释放、脱敏截断、卡住正文、退出码，以及取消报告/原完成完整性。最终细化错误字段与评分状态后，[9 项受影响测试](free-evidence/final-transport-score.log)复核通过；[类型检查](free-evidence/typecheck.log)和[构建](free-evidence/build.log)通过。没有重跑浏览器或全矩阵。

[原数据库副本的离线复核](free-evidence/cancelled-report-recheck.json)：父 cancelled、persistence verified、issues=[]、goalPassed=false、safetyStop=false；两子仍 blocked。原结果文件完全未改。这仅修正“记录是否完整”的诊断，不把原批算成功。

[单请求入口免费证据](free-evidence/single-provider/result.json)：实际产品 provider + 同一冻结正文，1 次合成传输，0 次真实生成；[旧许可拒绝证据](free-evidence/old-approval-refused.log)显示旧批许可不能启动新入口，且没有创建对应账户。[保护核对](preservation.json)：旧 59 份归档、原 run DB、原账户 DB、原冻结 bundle 哈希均不变。

## 下一次最小真实诊断提案（尚未授权或执行）

只执行**一次实际 Jev 请求**，不启动主 Agent、浏览器或完整批次。直接调用修复后的 `createPopupProvider`，走相同 `wireQuestion`、HTTP 边界、原账户 reserve/dispatch/unknown/settle 和响应验证。重用原 P01 窄视口 ENTRY 的公开 packet，仅校正协议字段；该请求用于诊断协议和传输，不宣称当前网页状态或弹窗几何通过。

- 冻结实现：`87a2816deb8885e42c3785731846a0a6f9791372`；Node `v24.21.0`。入口 `scripts/parallel-popup-real/single-jev.ts`。
- [冻结 manifest](single-request/manifest.json) SHA-256：`986698d6b163ad207c37c32746461bf33b80159a26ccc26ea8ac3c606f169299`。运行前复验逐源文件、安装锁、Node、packet 和原始请求字节。
- [冻结请求](single-request/request.json)：1838 字节，SHA-256 `1e40c1e698c6ef061f2ed457d4634966f6eb71c6348b85dcdf1ddb7f8c08b7bd`。packet SHA-256 `37f0a36e4df8481a7b2ea445598fcf1e55980f24c4be729d9ba29d8c733c5ca1`。
- `typesafe/jev-1.13` / TypeSafe；只用 alpha/decisions；禁 fallback、禁重试；最多 1 次，新增费用上限 **USD 0.003**。真实执行前仍走原公开报价门；超限/变化则不派发。
- 保留原 **8 秒请求期限**；整体取消期限 25 秒（包含最多 10 秒公开报价 GET，及错误正文至多 250ms）；不延长为失败重试。独立输出 `data/popup-single-diagnostic/approved-01/` 必须不存在，创建一个全新的原 CampaignLedger 账户，绝不复用旧账户。
- 任一 HTTP/传输失败先保存首错身份并取消；原费用缺失继续 unknown + 原停止门。成功也只结束该一次请求，不能恢复 P02/P03、进入下一批或消费剩余额度。许可由新 manifest 哈希绑定、wx 单次 claim 消费。

维护者取得新的具体授权后，另存 approval.json，必须包括 `scope=single-popup-jev-diagnostic-1`、上述 manifestSha256、`maxRequests=1`、`maxCostUsd=0.003`、`retries=0`、`authorizeNewIsolatedAccount=true`，以及真实 approvedBy、approvalReference、未来 expiresAt。**本轮没有创建授权文件，也没有执行下列付费命令。**

```sh
DOTENV_CONFIG_PATH=/dev/null node --import tsx scripts/parallel-popup-real/single-jev.ts --run \
  plans/parallel-check-tasks/transport-fix-20261010/single-request/manifest.json \
  <新授权文件绝对路径> data/popup-single-diagnostic/approved-01
```

凭据仅在新授权后以 `POPUP_DIAGNOSTIC_API_KEY` 注入进程，不能写入命令、manifest 或归档；该入口清除无关环境变量。维护者可以直接审阅此确定请求与费用边界，再向用户申请授权。
