# Jev 协议核对记录

2026-10-07，公开文档核对，未调用 Jev。代码在 `src/agent/decisions/jev-provider/`，调用方在 `scripts/r1-jev-real/`。这是 R1 独立实验入口，生产任务不导入。

依据：[OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)、[TypeSafe API](https://docs.typesafe.ai/api)、[OpenRouter 教程](https://openrouter.ai/blog/tutorials/how-to-use-jev/)和[模型页](https://openrouter.ai/typesafe/jev-1.13)。协议字段以 OpenRouter 为准，TypeSafe 直连仅辅助理解评分语义。

已核对：`POST https://openrouter.ai/api/alpha/decisions`；Bearer 认证；请求 `model/state/questions`；响应示例 `id/model/provider/answers/usage`；score/choice 类型。源码示例配置与文档示例一致：请求 `typesafe/jev-1.13`，预期响应 `typesafe/jev-1.13-20260917` / `TypeSafe`。这不证明别名将持续解析到该快照。API 返回不同身份时拒绝，不自动接受或重试。没有接入聊天模型或 TypeSafe 直连，也不引入 SDK。

当日模型页价格：输入 $0.042/百万 token，输出 $0/百万 token，上下文 32,000 token。未确认多问题输入如何累计及严格计费上界、每请求问题数量上限、失败/取消费用核对接口。文档提到 provider 路由字段，但未核实可用的完整限制参数，本版本不发送猜测参数，只做响应身份校验。HTTP 禁止重定向；API 服务端内部行为无法靠本客户端证明。

这些缺口是明确的真实调用阻塞：提交的配置 `questionsVerified=false`、`billingBoundVerified=false`、`quoteUsd=null`，只能 dry-run。不能把单次均价、字节数、模型上下文或测试费用当作已验证报价。后续获得有依据的上界时，在配置 basis/source/checkedAt 中记录算法、计费项、价格快照和适用范围；须重新冻结与授权，不能只把布尔字段改成 true。

本地限制是实验策略，不是提供方承诺：32 候选/65 问题；完整 JSON 32768 字节；响应 1 MiB；默认 15 秒；并发 1；自动重试 0。长问题可能让 32 候选在字节预检时交回，禁止静默删减候选。开发输入每状态有 2 个 eligible 候选、共 5 个问题，第三个禁用候选由程序排除。

归一化只接受精确问题集合、类型/等级/legend、身份和有限数值。概率总和容差 0.025；原始 score 与归一化期望相差最多 0.085（3 倍概率总和误差加 0.01 显示舍入）。全部合法后才除以实际概率和。舍入策略属于本地版本，不是额外放宽缺失字段。重复 JSON 键在解析时拒绝，包括转义后相同的键。usage 中未知/非法 cost 保持 unknown，不以 tokens 捏造费用。已知费用与建议有效性独立。

重要局限：超时后未读到的响应正文不能当作费用证据，保留 pending 并停止；不为核对费用自动重放请求。若已经读到合法 usage 但状态/截止失效，费用仍可记录，结果保持交回。新会话不能绕过持久批次账本中的未知占用。未提供经过核实的账单查询入口，因此本次没有自动费用 reconciliation 工具。
