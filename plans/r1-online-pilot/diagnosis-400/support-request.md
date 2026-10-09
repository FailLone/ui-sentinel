# R1 HTTP 400 支持请求（待用户提交）

2026-10-09。基于诊断提交 `3a4e30162efa63e9be59229a5917fcedc1a66bd0` 整理。本文件仅准备材料，尚未提交工单或联系供应商。

使用方式：从 [OpenRouter 官方支持页](https://openrouter.ai/support/) 选择 **Create Ticket**，复制下方英文主题和正文，并附唯一必要附件 `error.json`。该入口于 2026-10-09 只读核实；本轮未进入或提交表单。请求是经 OpenRouter 转发且错误 metadata 标记 `is_byok=false`，先请 OpenRouter 查关联及账户最终费用，由其协调 Wafer 查拒绝原因。这里不猜测 Wafer 联系邮箱。只复制英文部分，无需将本文内部对账步骤和本地路径提交给供应商。

## 可直接复制的英文请求

**Subject:** Wafer DeepSeek HTTP 400 — request correlation, rejection details, and final billing confirmation (2026-10-09 07:54:35 UTC)

Hello OpenRouter Support,

Please investigate this single failed request routed through OpenRouter to Wafer. We need the request correlation, specific rejection reason, and final billing outcome. We have not retried it.

- Client dispatch time: **2026-10-09T07:54:35.109Z (UTC)**. Our local dispatch-ledger timestamp is 07:54:35.108Z; the client received the complete error approximately 708 ms after request handling began.
- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Requested model: `deepseek/deepseek-v4.1-flash`
- Provider: `Wafer`; provider-reported model: `DeepSeek-V4.1-Flash`; error metadata: `is_byok=false`.
- **Wafer request_id: `a0d1d4a1a35a`**
- Client-only request ID: `0ddb03d5250db453759b72ee`
- Client-only run ID: `run-70e34b02-2d84-4498-b133-15405529861b`
- HTTP status: **400**. OpenRouter message: `Provider returned error`.
- Provider error type: `invalid_request_error`; code: `model_request_rejected`; `param: null`; message: `The model request was rejected. Check the request and try again.`
- The client received no usage, generation ID, or SSE events. Original response headers were not retained. The two client-only IDs above are not OpenRouter generation IDs.
- Exact outgoing JSON body: **40,719 UTF-8 bytes**; SHA-256: **`ff003c650b1f55787934e4d8043cdc6c821bb4d464debfaf2bcf649d9e9d9631`**. This hashes the actual compact request body, not the attached error file or a formatted request fixture.
- Request options: `tool_choice="required"`, `reasoning={"effort":"low"}`, `max_tokens=4096`, `stream=true`, `stream_options={"include_usage":true}`, `provider={"only":["Wafer"],"allow_fallbacks":false,"require_parameters":true}`. Two text messages (system and user), 16 function tools, no assistant/tool history, no images, no `response_format`. We have a prior successful request with the same model, provider and top-level options, but different messages/tools, so we cannot attribute the rejection to one option alone.

Could you please provide:

1. The associated OpenRouter request/generation ID and its explicit mapping to Wafer request `a0d1d4a1a35a`. If no generation was created, please state that and provide an authoritative request or billing reference.
2. The specific rejected field/schema path or service-side reason. Please clarify whether the rejection occurred in OpenRouter transformation/routing or at Wafer, and provide applicable compatibility guidance for this actual request.
3. The **final amount charged to our OpenRouter account for this exact request in USD**, with a request-linked billing record. If it was not charged, please explicitly confirm the final charge was USD 0. Please distinguish provider-side inference cost, any charge/refund, and the final net account charge, including whether settlement is final.

The attached `error.json` contains the saved error with the provider account identifier redacted. We have deliberately omitted credentials and full prompts. Please let us know if a narrowly scoped, redacted schema fragment is needed.

**USD 0.053 is only our internal reservation for an unresolved request. It is not an observed charge.** We do not treat HTTP 400, absent usage, a lookup miss, or an account balance change as proof of zero cost.

Thank you.

## 最少附件与本地定位

首次只附以下 **1 个现有 Git 文件**，不新建包：

| 文件 | 用途与摘要 |
| --- | --- |
| [error.json](/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/evaluation/support/fixtures/r1-http400/error.json) | 521 bytes；保存的错误 JSON，唯一 provider user_id 已替换为占位符，无完整提示或密钥。SHA256：`2e0f9c84e132185d7d1d9a14fa4059e3d5ddb10338d841e5a5730d8a40b1e9aa`。这是格式化/脱敏附件，不能冒称原响应 458 bytes 的原始字节副本。 |

身份与 body 摘要供本地复核：[request-audit.json](/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/plans/r1-online-pilot/diagnosis-400/evidence/request-audit.json)。英文正文已经包含所需信息，首轮无需附这份审计、完整 request.json、成功消费记录、DB、claim、日志包或环境文件。若支持方确实需要某个 schema 片段，再根据其明确字段提取脱敏最小片段；不默认发送全部提示。

## 回复后的核对与原账本追加步骤

以下是收到证据后的处理步骤，**本轮未执行账本写入**。

1. 保存官方回复原件、工单/结算引用、取得时间和文件 SHA256；另作必要脱敏副本。核实回复来自本次官方工单，不能把一般文档、截图里的余额或模型返回文本当作收费凭据。
2. 要求回复明确对应 Wafer `a0d1d4a1a35a`、上述 UTC 时间、模型/provider，并映射到 OpenRouter 身份。支持方不能只给一个不相关 `gen-…`。本地 request/run 与实际 wireHash 的绑定沿用现有 [结构审计](evidence/request-audit.json)，不修改原请求。
3. 若获得可信关联的有效 generation ID，只对此 ID 作有限官方只读 metadata 查询，核对模型、provider、时间和最终费用；不得枚举无关消费。采用账户最终收费证据，不把 Wafer upstream cost、预留或估算价格替代 OpenRouter 实际费用。尚未结算、金额有冲突或缺关联，则保持 unknown，先请支持方补齐。
4. 满足绑定和最终金额条件后，核对原权威账本身份并作保留原件的备份/摘要：目录 `/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-runtime/artifacts/r1-online-pilot/authorized-batch-1/account`，campaign `2063928d-77c8-46ab-8b09-5811fc52e03e`，request `0ddb03d5250db453759b72ee`。沿用原 ledger API `CampaignLedger.reconcile` 追加 `{requestId, generationId, model, provider, actualUsd, evidence}`，其中 evidence 应包含映射、官方凭据及其摘要。不能启动 runner/campaign session、另建库、SQL 更新旧请求、清锁或清 claim。准确实现见 [campaign-ledger.ts](/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/evaluation/support/campaign-ledger.ts:458)。
5. 当前契约要求 `generationId`。若官方确认没有 generation、但提供可信的明确零元或非零结算凭据，**外部费用可以查明，但当前追加契约尚不能如实表示这种凭据身份**；不得把工单号/Wafer ID 填进 generationId、伪造 `gen-` 或直接改 SQL。先保留凭据与原 unknown，再提出仅支持该凭据类型的最小追加契约方案并定向验证。是否需要这种改动取决于实际回复，现在不预先制造实现任务。
6. 追加成功后验证：只新增该请求的 reconciliation，原 ledger_requests unknown 行、原 stop_events（epoch 1）、原失败记录、已消费 claim 和 execution-lock 仍保留；有效汇总按新凭据结算，held 仍为 0，无新 dispatch。保留前后摘要及追加记录，另记新结论，不改写历史失败包。任何金额超过原预留均如实记录，不能截断为 0.053；也不因此自动恢复批次。

## 恢复决策与等待期间的工作

| 外部回复 | 能解除的阻塞 | 仍须保持的边界 |
| --- | --- | --- |
| 明确本请求的拒绝字段/服务原因，可对应现有请求 | 可将假设升级为根因依据；若确有本地缺陷，可准备最小免费修复和针对该行为的测试 | 不能据此核销费用或批准真实推理 |
| 可信身份映射 + 最终账户收费（包括明确 USD 0），且可由现有 generation 契约表示 | 可按上文追加原账本，解除该笔有效汇总的 unknown | 原 stop epoch/claim 不解除；不复活旧批次 |
| 可信最终金额，但明确没有 generation | 可确认外部收费事实 | 需先解决追加凭据类型的窄契约缺口；账本 unknown 暂留，不伪造身份 |
| 只给 generation ID、泛化“400 不收费”、重试建议、余额变化或无匹配结果 | 不足以解除收费或根因阻塞 | 要求补充本笔关联和最终结算；维持停止 |
| 根因及账本问题均解决 | 可以评估是否有必要提出新的、至多 1 次且零重试的主模型验证 | 仍需另核当前报价、停止账户准入及新授权；旧 USD 3.834 未用预留不是许可，不换库绕过停止 |

**现阶段无必要新增代码工作。** 已知提示/schema 差异不是已确认根因；现有网关前置包装层的响应头取证边界也不能解释这次完整返回的 400，扩展它无法补回旧响应身份。没有独立、必要且有确切正确行为依据的新增整改。等待期间有效工作就是提交本支持请求、保存官方回复及核对其绑定；不改参数/模型，不构造推理探针，不重跑已通过的 26 项测试。

本轮只核对支持材料身份、附件摘要和文档链接，没有重跑诊断/测试或真实推理，没有对账写入、联系供应商或修改 Roadmap。当前费用仍 unknown USD 0.053、held 0、stop epoch 1。未来报价须另行核实，不把上轮 0.058 的示例预留当新报价/预算授权。准备支持材料不代表 R1 通过；默认关闭，提交本轮材料后停止。
