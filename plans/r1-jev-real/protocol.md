# Jev 协议核对记录

2026-10-07，公开文档核对，未调用 Jev。代码在 `src/agent/decisions/jev-provider/`，调用方在 `scripts/r1-jev-real/`。这是 R1 独立实验入口，生产任务不导入。

本文件在本批（`codex/r1-service-exploration-prep`）被更新，记录可说明依据的核对结果与**明确缺项**。凡文档未写明者一律标记未知；不使用均价估计，也不通过把布尔字段改成 `true` 绕过缺项。

依据：[OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)、[Jev 使用教程](https://openrouter.ai/blog/tutorials/how-to-use-jev/)、[OpenRouter Jev 指南](https://openrouter.ai/docs/guides/community/jev)、[TypeSafe API](https://docs.typesafe.ai/api)。协议字段以 OpenRouter 为准，TypeSafe 直连仅辅助理解评分语义。

## 1. 已核对事实（附原文）

### 1.1 请求

`POST https://openrouter.ai/api/alpha/decisions`；Bearer 认证。必填字段为 `model`、`state`、`questions`。

- `state`：原文 "The content to evaluate: a plain string, or a JSON object or array of related context."，接受 string / object / array。
- `questions`：原文 "A Decisions question using a boolean, choice, or ordered score evaluation."，判别字段 `type` 取 `noul`（布尔）、`choice`、`score`（有序）。
- `provider`：**文档接受**。原文 "Provider routing preferences for the request."，含 `allow_fallbacks`、`data_collection`、`sort`、`only`、`order`、`require_parameters`、`quantizations`、`zdr`、`max_price`、`preferred_max_latency`、`preferred_max_throughput` 等。本版本仍不发送猜测参数，只做响应身份校验。
- 另有 `session_id`（maxLength 256）、`trace`、`user`。

问题类型与 `criteria` 形状：

- `noul`：`criteria` 为对象，含 `'true'` / `'false'` 两个键；每个值为 "A plain string, or a JSON object or array of structured guidance."。
- `choice`：`criteria` 为自由对象，label 映射到 string / object / array / null 指引。上限原文 "a maximum of 255 options"。
- `score`：`criteria` 为数组（`minItems: 1`）；TypeSafe 原文 "A Score should have at least two levels; the API accepts up to 10."。

每个问题另有 `instructions`，原文 "A plain string, or a JSON object or array of structured guidance."。

### 1.2 响应

`id`、`model`、`provider`、`answers`、`usage`。顶层必填为 `model`、`answers`、`usage`（`id`、`provider` 见于示例但不在必填列表）。

- `usage` **恰好**含 `cost`（number, double）、`input_tokens`、`output_tokens`；仅两个 token 字段必填。
- 答案形状：`noul` 为 0..1；`choice` 含 `choice`、`probabilities`、`confidence`；`score` 含 `score`、`legend`、`probabilities`、`confidence`。
- **`usage.cost` 的币种**：指南原文明确 "Every Jev response includes a `usage.cost` field that tells you the cost of the response in USD."，即 **USD**。注意 schema 本身未标注单位，此结论来自指南正文而非 schema。

### 1.3 计费方式 —— 本批取得的关键事实

指南原文：**"Jev charges for input tokens, and output tokens are free."**、**"You pay per input token at the price on the model page."**、**"Output tokens are free."**

教程原文：**"A request to Jev consists solely of text, with a token budget being consumed by both the state and the questions asked."**、**"five questions cost one round trip"**。

结论：多问题**不是按问题计费**，而是**按输入 token 计费**；输出 token 免费；多个问题共用一次往返。

**上下文长度 32,000 token**，原文两处："Context length is 32,000 tokens."、"32,000 tokens. That's the `state` you send plus the questions."

### 1.4 模型身份

请求使用 `typesafe/jev-1.13`；响应返回带日期的快照，教程原文称其为 "the dated build of `typesafe/jev-1.13` that produced it"，示例 `"model": "typesafe/jev-1.13-20260917"`。另一别名 `~typesafe/jev-latest` 原文 "tracks the newest release"。

**`typesafe/jev-1.13` 自身是否为会随时间解析到新快照的别名：文档未说明（NOT STATED）**。本客户端继续在响应身份不符时拒绝，不自动接受或重试。

### 1.5 错误与重试

OpenRouter 文档状态码：`400` "Invalid request parameters"、`401` "Missing Authentication header"、`402` "Insufficient credits..."、`403`、`404`、`413` "Request payload too large"、`429` "Rate limit exceeded"、`500`、`502` "Provider returned error"、`503`、`524` "Request timed out. Please try again later."、`529`。

速率限制仅 `429` 条目，**无数值配额、窗口或响应头说明**。重试指引仅 `524` 的 "Please try again later."，**无退避或幂等性说明**。TypeSafe 文档另列 `401`/`422`/`429`/`529`，对后两者建议 "retry the request with exponential backoff"。本版本仍执行零自动重试。

## 2. 有依据的最坏费用上界

**上界结构成立，但缺一个数字，因此配置中 `quoteUsd` 仍为 `null`。**

可推导的结构（依据均来自原文）：

```
最坏输入 token 上界 = state 字节 + questions 字节        （教程："consumed by both the state and the questions"）
上界费用(USD)       = 最坏输入 token 上界 × 每输入 token 单价  （指南："You pay per input token at the price on the model page"）
```

本批 6 个状态的实测线上载荷为 5155 字节（`artifacts/r1-jev-real/smoke-dry-run/requests/s01.json` 的 `byteLength`），最坏情形约 5190 字节。UTF-8 中单 token 不可能少于 1 字节，故 **5190 是 5190 个输入 token 的保守上界**；输出免费；5 个问题一次往返。

**缺失的事实：`typesafe/jev-1.13` 的每输入 token 单价。**

- 本批核对时 `https://openrouter.ai/typesafe/jev-1.13` 返回 **HTTP 404**，模型页价格无法取得。
- 指南原文只把读者指向该页："The Jev model page currently shows the budget and pricing."，正文未给费率。
- **上一版本文件曾记录"输入 $0.042/百万 token、输出 $0/百万 token"。该数字在本批无法重新核实（模型页 404），因此不得当作已核对事实使用。** 它既不能支撑 `quoteUsd`，也不能支撑 `billingBoundVerified=true`。
- 教程中的示例费用（如 24 条 × 5 问题约 $0.001131）**不得**用于反推单价 —— 那是均价估计，正是计划禁止的做法。

一旦取得该单价，应按「最坏线上输入 token 上界 × 单价」写入 `protocol.basis`，记录 `source` 与 `checkedAt`，并**重新冻结与授权**；届时 5190 token 的结构上界可直接复用。

### 2.1 其他明确缺项

- **每请求问题数量上限：文档未说明（NOT STATED）**。`questions` 是无 `maxProperties` 的开放对象；文档只给每问题的选项/等级上限（choice ≤255 选项，score 2–10 等级）。本地 65 问题上限是**实验策略，不是提供方承诺**。
- **失败或取消请求是否计费：文档未说明（NOT STATED）**。模块继续保持未知费用占用、不自动重放。
- **退避与幂等性：文档未说明**。
- **`typesafe/jev-1.13` 是否随时间解析到新快照：文档未说明**。

这些缺项是明确的真实调用阻塞：`plans/r1-jev-real/smoke-config.json` 中 `questionsVerified=false`、`billingBoundVerified=false`、`quoteUsd=null`，只能 dry-run。运行 `pnpm r1:jev:real -- --dry-run` 仍返回阻塞项 `question-limit-unverified`、`billing-bound-unverified`；退出码 0 只代表材料生成成功，不代表允许付费。

## 3. 本地限制（实验策略，非提供方承诺）

32 候选 / 65 问题；完整 JSON 32768 字节；响应 1 MiB；默认 15 秒；并发 1；自动重试 0。长问题可能让 32 候选在字节预检时交回，禁止静默删减候选。S1 六个状态每状态 2 个 eligible 候选、共 5 个问题，第三个禁用候选由程序排除。

归一化只接受精确问题集合、类型/等级/legend、身份和有限数值。概率总和容差 0.025；原始 score 与归一化期望相差最多 0.085（3 倍概率总和误差加 0.01 显示舍入）。全部合法后才除以实际概率和。舍入策略属于本地版本，不是额外放宽缺失字段。重复 JSON 键在解析时拒绝，包括转义后相同的键。usage 中未知/非法 cost 保持 unknown，不以 tokens 捏造费用。已知费用与建议有效性独立。

重要局限：超时后未读到的响应正文不能当作费用证据，保留 pending 并停止；不为核对费用自动重放请求。若已经读到合法 usage 但状态/截止失效，费用仍可记录，结果保持交回。新会话不能绕过持久批次账本中的未知占用。未提供经过核实的账单查询入口，因此本次没有自动费用 reconciliation 工具。HTTP 禁止重定向；API 服务端内部行为无法靠本客户端证明。

## 4. 本批未做的事

- 未调用真实 Jev，未读取或交付任何密钥，未生成授权记录。
- 未把任何布尔字段改为 `true`，未写入 `quoteUsd`。
- 未反复搜索或安装 SDK 制造进展；核对在公开文档内一次完成，并如实记录缺项。