# 单次真实 Jev 诊断：协议通过，已封存

2026-10-10 12:27（Asia/Shanghai）。按维护者会话转达的用户明确“授权”，只执行了一笔冻结 Jev 请求。**HTTP 200，原 createPopupProvider 协议校验通过，选择 Details，置信度 0.99。费用已结算 USD 0.000040614；unknown=0、held=0、活动账户 lease=0。没有重试或后续请求。**

这仅证明修正后的这一份请求被服务接受，并产生符合模型/供应商身份、选项集合、概率分布及 binding 要求的可解析选择。不证明当前页面的入口操作、弹窗几何、并发或完整目标通过；也不能倒推出旧批次具体 HTTP 状态码。没有启动主 Agent、浏览器或完整批次，没有恢复 P02/P03，旧 unknown 不变。

## 授权与冻结核对

- 实现 `87a2816deb8885e42c3785731846a0a6f9791372`；批准交付 `f62e82718f7d85f06199960a8210ba6ae60d9dca`。
- manifest SHA-256：`986698d6b163ad207c37c32746461bf33b80159a26ccc26ea8ac3c606f169299`。
- 1838 字节原始 wire SHA-256：`1e40c1e698c6ef061f2ed457d4634966f6eb71c6348b85dcdf1ddb7f8c08b7bd`；packet 文件 SHA-256：`37f0a36e4df8481a7b2ea445598fcf1e55980f24c4be729d9ba29d8c733c5ca1`。
- Node v24.21.0、安装锁及 723 份源文件均与冻结清单一致。未改代码、重建或重跑免费测试。
- scope `single-popup-jev-diagnostic-1`，最多 1 次、USD 0.003、8 秒请求期限、25 秒整体取消期限、0 重试、禁 fallback。
- 真实人类批准来源为维护者会话 `01a1116d-7621-7962-b4fe-5f904b5fbf13` 用户于 2026-10-10 直接回复“授权”，由维护者转达；[授权记录](evidence/approval.json)自记录时起有效 24 小时，只允许一个 claim。[单次 claim](evidence/single-use-claim.json)已消费。
- [启动前公开报价](evidence/quote-preflight.json)通过；冻结入口也沿原产品报价门执行。未读取、解封或修改旧费用账户。凭据仅注入子进程，不进入文件或输出。

## 真实请求与费用

| 项目 | 结果 |
| --- | --- |
| 本地请求 ID | `173df7cb-cd13-43cf-8805-431424f4a276` |
| 新原账户 campaign ID | `ff8686d4-64fd-4461-873c-af882bdf0e08` |
| 供应商 generation ID | `gen-dec-1791606475-bUM8EvyGwtNN5RqyXrWv`，正文与 x-generation-id 一致 |
| 请求 / 响应模型 | `typesafe/jev-1.13` / `typesafe/jev-1.13-20260917` |
| 供应商 / HTTP | TypeSafe / 200 |
| 传输开始 / 完成 | 12:27:55.736 / 12:27:56.190，约 454ms；仅此笔观测 |
| 选择 | `item-eda214c7-bcb6-4a5b-a420-ee0fc1310cd0`，`button "Details"` |
| 分布 / 置信度 | Details 0.99、handoff 0.01，其余 0；confidence 0.99 |
| 原 usage | input_tokens 967、output_tokens 171、cost USD 0.000040614 |
| 原账本 | 1 次 reserve/dispatch，1 笔 settled，actual_usd USD 0.000040614 |
| 未知 / 占用 / lease | unknown 0、held 0、活动 lease 0 |
| 进程 / 首错 | exit 0；无首错、无停止错误事件 |

成功后入口正常结束，原账户没有人为添加错误停止事件；单次 claim 已消费且输出目录存在，不能重复启动该许可。未消费剩余额度，也没有附加费用查询或生成请求。

## 原始证据

[请求](evidence/popup-jev-request.json)、[响应](evidence/popup-jev-response.json)、[传输记录](evidence/popup-jev-transport.json)、[原 provider 事件](evidence/provider-event.json)、[原结果](evidence/result.json)、[账本只读导出](evidence/original-ledger-readonly.json)、[原账户 DB](evidence/account/campaign.db)、[进程结果](evidence/process-result.json)均已归档，原输出保留于 `data/popup-single-diagnostic/approved-01/`。成功响应未含凭据，无需改写；归档经过凭据模式检查。

原 provider 事件的 wireHash 沿用 `hash(JSON.stringify(wire字符串))`，不是原始字节 SHA；packetHash 则是紧凑对象哈希，不是带缩进 packet 文件的 SHA。实际发送正文按 transport.wireSha256 和冻结 manifest 对齐，原字段没有被替换或伪造。

[摘要](summary.json)和 [归档哈希清单](archive-manifest.json)记录本次独立结果。封存期间只读查询新账本，原 DB 字节未变；请求身份、generation ID、费用和原始 wire 相互一致。本轮工作结束，没有自动修补或重跑，没有合并或推送 main。
