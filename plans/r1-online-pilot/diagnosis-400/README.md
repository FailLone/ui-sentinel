# R1 首请求 HTTP 400：有限诊断交付

2026-10-09（Asia/Shanghai）。本轮有界诊断已完成并停止。**根因未确证，实际总费用仍未知，保留 1 笔 USD 0.053 unknown。** 没有新增真实推理、付费请求、重试、Jev 调用或供应商消息；没有恢复旧批次。仅增加未来响应关联头取证，26 项免费定向测试及类型检查通过。R1 未通过，默认关闭。

唯一机器入口为 [evidence-index.json](evidence-index.json)。失败原件仍由 [paid 索引](../paid/evidence-index.json) 定位；本页不改写失败结果。任务入口已收敛到 [CURRENT-TASK.md](../CURRENT-TASK.md)，接手时的原始任务文本（包括前任未提交修改）逐字保存在 [历史副本](../history/20261009-pre-diagnosis-CURRENT-TASK.md)。本轮未发现适用的 AGENTS.md。

## 请求事实与网关边界

| 身份 | 已保存值 |
| --- | --- |
| 运行源码 / 失败交付基线 | `de54a7ee7c141e719f212852e774b304162cd3dc` / `4bf887cb6150975145abc62cad3c61bc9f5fea56` |
| 输入交付 | `d63352c79aec5ff24e0f91bd75730052850075e7` |
| manifestHash | `9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75` |
| run / 本地 request | `run-70e34b02-2d84-4498-b133-15405529861b` / `0ddb03d5250db453759b72ee` |
| 派发时间 | `2026-10-09T07:54:35.109Z`（北京时间 15:54:35.109） |
| 接口 | `POST https://openrouter.ai/api/v1/chat/completions` |
| 模型 / provider | `deepseek/deepseek-v4.1-flash` / `Wafer` |
| 服务错误 | HTTP 400，`invalid_request_error / model_request_rejected`，`param=null`；Wafer `request_id=a0d1d4a1a35a` |
| 响应边界 | 708ms、原始 458 bytes、transportComplete=true、streamEventCount=0、usage=null；无 OpenRouter generation ID，旧响应头未保存 |

失败在第一条 semantic-agent、第一次主调用，尚无 assistant/tool 历史，动作及交互测量为 0。错误体中的 `[redacted-provider-user-id]` 是前次脱敏占位，故新 fixture 的响应字节数不是原始 458 bytes。HTTP 400 说明收到了服务拒绝，不说明具体参数，也不证明零收费。

实际请求的完整 [脱敏 fixture](../../../evaluation/support/fixtures/r1-http400/request.json) 与 `bindings.jsonl` 的 actual-wire-binding 摘要一致；[结构审计](evidence/request-audit.json) 留有 wireHash、full request 字段、消息和每份 schema 的摘要。网关将 `max_tokens` 固定为 4096、移除 `max_completion_tokens`；将 SDK `reasoning_effort` 转为 `reasoning:{effort:"low"}`（none 时关闭），然后移除旧字段；固定 provider 与流尾 usage 选项。已保存的是转换后的实际 body，未保存 SDK 转换前完整 body，也看不到 OpenRouter→Wafer 的内部转换。

| 实际字段检查 | 结果及边界 |
| --- | --- |
| messages / 工具配对 | 仅 system、user 两条非空字符串（5190、8470 bytes），无 assistant tool_calls、无 tool 结果，不存在本次历史配对缺失。用户消息是公开页面状态 JSON 文本。 |
| tools / schema | 16 个唯一合法函数名，type=function；每份 parameters 为 Draft-07 object，strict 均未设置。Ajv 8.20.0 以 strict=false 验证全部新旧 30 份 schema 通过；该选项容许 x-optional 等扩展注解，不代表 Wafer 支持每个关键词。 |
| schema 具体疑点 | 新 exploration_update 含 sourceCandidates/sourceSpan 的 tuple `items:[…]`、additionalItems:false；其他工具含 anyOf/null、default、x-optional。均是可识别差异，没有供应商 param 或详细错误把 400 绑定到它们。不能为消除猜测而删除字段。 |
| 路由 | `provider.only:["Wafer"]`、allow_fallbacks=false、require_parameters=true；失败 metadata 指向 Wafer。模型/provider 未换，未发视觉。 |
| tool_choice / reasoning | `required` 与 `{effort:"low"}`；没有 temperature、top_p、parallel_tool_calls 等额外采样字段。 |
| response_format | 未设置，也未要求 json_schema 输出格式；不能把工具 parameters 与 response_format 严格输出混为一谈。 |
| 输入输出界限 | 40,719 bytes < 131,072 bytes 本地上限；max_tokens=4096 < 公开 max_completion_tokens=943,718，context=1,048,576。没有实际 tokenizer/usage，不伪报精确 tokens；现有证据不支持上下文超限归因。 |

## 真实成功反证与根因置信

对照是 2026-09-24 的 `C1-current-atomic-1 / seq=1`，从仓库既有 D8 原始目录只读提取，并按 **run+seq** 连接请求、响应和账本；不按空 requestId 连接。三份提取件见 [request](evidence/success-requests.json)、[response](evidence/success-responses.json)、[ledger](evidence/success-ledger.json)。原文件路径、行号与 SHA256 在机器索引中。

成功回执为 HTTP 200、provider=Wafer、generation `gen-1790244881-8cFWHrNG61WfvpJCSl9Q`，usage.cost=USD 0.001275，reasoning_tokens=13。**除 messages/tools 外全部请求字段完全相同**：模型、required、low、stream=true、include_usage=true、4096 输出和全部 provider 约束。这是已有真实记录，本轮未查询该成功请求的账户消费。

成功请求为 25,523 bytes、14 工具。失败新增 interaction_verify/page_inspect/investigation_run，移除 journey_run；7 个共同工具定义完全相同，6 个共同工具定义有变更。包括 page_act 的 verify/requirementId、exploration_update 的来源/范围字段，以及 evidenceRefs、触发枚举和描述变化。system/user 内容也不同。全部差异路径见结构审计；较老成功记录不能证明今天服务配置或内部转换相同。

- **高置信事实**：服务拒绝、usage 缺失、本地停止/unknown 保留；同顶层参数组合曾真实成功；本次没有工具历史配对错误，wire 没有发现本地绑定漂移。
- **未证实假设**：具体工具 schema 子集不兼容、当前 provider 对 required+reasoning 的组合行为变化、服务端转换/策略变化。没有本请求的详细拒绝字段或内部日志，无法排序为确定根因。
- **不能推出**：`required` 或 `low` 单独不支持、凭据失效、预算耗尽、Jev 失败、R1 通过。没有明确依据，因此不做兼容参数修复、不改模型/provider、不重试。

## 官方依据与费用核对

已核对 [OpenRouter 参数说明](https://openrouter.ai/docs/api_reference/parameters)、[provider 路由](https://openrouter.ai/docs/guides/routing/provider-selection)、[错误协议](https://openrouter.ai/docs/api_reference/errors-and-debugging) 与[公开 Wafer endpoint](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints)。当次报价快照及本轮公开快照都声明支持 reasoning/tool_choice/required；这不是所有嵌套 schema 与组合都受支持的证明。流式请求在开始输出前收到 JSON 错误也符合错误协议。

[DeepSeek 直营 API](https://api-docs.deepseek.com/api/create-chat-completion/) 说明 thinking 模式不支持 required/named tool choice，可产生 400。但实际服务是 Wafer，经 OpenRouter 转换，且存在上述成功反证，所以这只能提供待核假设，不能作为关闭 reasoning 的充分依据。[Wafer 文档索引](https://docs.wafer.ai/llms.txt) 可读；对应 chat-completions/errors/usage/models 正文在本轮不可访问，前任也保存了部分 403。未把不可读正文当已验证的 Wafer 协议。每个来源及读取限制见 [official-sources.json](evidence/official-sources.json)。

**费用核对结果：仍未知，未追加对账。** 原运行目录权威已关闭 DB 以 SQLite `mode=ro&immutable=1` 读取；请求 status=unknown、reserved_usd=0.053、actual_usd=null，reconciliations 为空，stop_events 只有原 1 条，dispatch 只有原 1 条。已知实际合计 0、总实际 null、unknownCount=1、held=0、stop epoch=1。原 DB 与交付 DB 摘要相同。详见 [原账本只读摘录](evidence/authoritative-ledger-readonly.json) 和 [费用核对记录](evidence/fee-check.json)。

[官方 generation 接口](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation) 要求 `id` 匹配 `^gen-[0-9A-Za-z-]+$`。这里只有本地 ID 与 Wafer ID，没有有效 generation ID；因此本轮认证 generation/usage/交易 HTTP 查询为 **0**，没有读取密钥、拼造 gen- 前缀或请求已知无效身份。不是“查询 404 所以免费”，也不是已取得零元凭据。[Analytics](https://openrouter.ai/docs/client-sdks/typescript/sdks/analytics/README) 的按端点汇总和 [Credits](https://openrouter.ai/docs/client-sdks/typescript/sdks/credits/README) 的账户总量不能绑定该请求，本轮不枚举这些无关消费，也不比较余额。已在现有证据及官方只读能力边界处停止。

精确缺项为：本地请求→Wafer `a0d1d4a1a35a`→OpenRouter generation/官方结算记录的可信映射，以及该请求最终 USD 金额（若不收费，须明确零元凭据），并匹配模型、provider、时间。原始响应 headers 不能事后恢复。

现有 `CampaignLedger.reconcile` 支持向 ledger_reconciliations 追加审计，保留 ledger_requests 的 unknown 历史和 stop_events。它验证 request/model/provider、非负金额、非空 generation/evidence 与冲突；**不会自行证明外部凭据真伪或把任意 Wafer ID 变成 generation ID**。缺少上述绑定时不得调用。如果以后取得可信账单，先保存凭据及其摘要、核对绑定，再通过原账本此接口追加；不能 SQL 更新历史、清 claim/锁或打开旧批次。原请求与停止 epoch 永远保留。

## 最小改动与免费定向验证

唯一运行代码改动位于 `evaluation/support/model-gateway.ts`：读取 body 之前，保存响应头白名单 `x-request-id`、`x-openrouter-request-id`、`cf-ray`；值只允许 1–128 个字母、数字、下划线或短横线，并排除已知真实 key/本地 token。其余头（含 cookie、authorization、账户字段）不留存。没有添加请求 headers 或 debug 参数，不改变模型输入、provider、预算、unknown 或停止行为。关联头仅供支持定位，**不自动当作 generation ID 或计费凭据**。此次增强不能为原失败补造 headers。在线 runner 会先 clone/read 完整响应再交给网关；若在这一更早边界就读取失败，网关仍拿不到 Response/headers。本轮没有扩展该包装层，新增断流测试只证明网关已经收到 Response 后的取证边界。

将 Node 24.21.0 的 bin 置于本次命令 PATH 首位后，实际执行：

```sh
node_modules/.bin/vitest run evaluation/support/model-gateway.test.ts evaluation/support/model-gateway-provider.test.ts evaluation/support/model-gateway-diagnosis.test.ts scripts/r1-online-pilot/online.test.ts --reporter=verbose
node_modules/.bin/tsc --noEmit
```

4 文件 26 测试通过、类型检查退出 0，日志在本目录 evidence，摘要见索引。新增两项以保存的失败请求/脱敏错误 fixture 和注入 upstream transport 验证：请求转换后保持完全相同、400 原样交回、只调用一次、unknown 保留 0.053、再 begin 拒绝；敏感/超长/非法头不记录，body 首字节前失败也保留有效关联头。既有 online 测试覆盖共享账本、Agent/Jev 停止门、取消、迟到结算及对账不恢复 epoch。本轮未启动浏览器、runner 批次或真实推理，也未重跑旧免费矩阵。

## 下一步与明确停止点

当前需要的是本笔服务记录与账单，不需要再花钱复现同一泛化错误。可人工向 OpenRouter/Wafer 提交下列支持摘要；**本轮仅准备文字，没有发送**：

> 请定位 2026-10-09 07:54:35.109 UTC 经 OpenRouter 发往 Wafer 的 DeepSeek-V4.1-Flash 请求，Wafer request_id `a0d1d4a1a35a`。返回 HTTP 400 / model_request_rejected / param=null，未收到 usage 或 generation ID。请提供关联 OpenRouter generation/请求身份、具体被拒字段或服务原因，以及最终收费/明确未收费凭据。客户端完整请求 SHA256 见本包 request-audit.json，必要时可按合适渠道提供脱敏 body。

本轮不生成可执行新 manifest/approval，也不建议盲目探针。若以后确需一次主模型验证，须先满足原 unknown 的可信对账及停止账户准入规则、明确修复依据与新授权；最多 1 次、零重试、同模型/Wafer、无 Jev/fallback/视觉，保留相同语义页面状态与工具契约，失败、超时、无 usage 或非预期身份立即停止。不能换库/新 campaign 绕过 unknown，也不能复用原 USD 3.834 未用预留。

本轮公开快照的 prompt 单价已为 USD 0.050/百万（原为 0.045/百万），见 [当前 endpoint 摘录](evidence/current-wafer-endpoint.json)。按原保守方法，1,048,576×0.00000005 + 4096×0.0000012 = USD 0.057344，上取需 0.058；这只是未来提案计算，**未修改现有 0.053 预留或权限**。旧报价前检应拒绝当前价格，未来报价还需重新核实；此变化不能解释已发生的 400，也不能倒算本笔费用。

完成出口：诊断、费用能力核对、有限取证增强及免费回归已交付；根因、可绑定的收费凭据、真实动态兼容及 R1 验收仍未解。原 claim 已消费、批次停止、unknown 保留；本地提交后停止，不 push、不合并 main、不派发 Agent。
