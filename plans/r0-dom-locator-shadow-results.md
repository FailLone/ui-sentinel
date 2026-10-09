# DOM 分页定位单因素影子对照：局部支持信号（2026-10-08）

固定顺序 A、B、B、A、A、B，6/6真实请求执行、未运行0；5个有效工具选择、1个Alibaba流内502服务限流错误。没有补请求、重试、smoke、工具执行或浏览器/被测页面请求；旧R0批次仍停止，本次不是整批验收。

**按预先标准，分页信息损失作为局部贡献因素得到支持信号**：B3/3检索原`8.0`，A0/3；重复`body * / offset=0`为A1/3、B0/3。B没有直接提出DOM offset=12，三次都是`tool_result_read(resultRef="8.0",offset=0)`，此offset是JSON字符偏移。A另有一次合理的定向信息采集，不应判错；A1服务失败使有效决策为A2/B3，结论强度受限，不估计稳定成功率或严格因果效应。

| 序号 | 组 | 实际输出及判定 | 首响应 / 首工具 / 总秒 | 输入 / 输出tokens | 缓存tokens | USD |
| --- | --- | --- | --- | --- | ---: | ---: |
| 1 | A | 流内502限流，无工具选择；完整保留失败 | 12.062 / — / 20.338 | 12804 / 684 | 0 | 0.00000000 |
| 2 | B | 检索原8.0（字符offset0）；定位利用 | 8.803 / 16.855 / 17.129 | 13877 / 406 | 11264 | 0.00160902 |
| 3 | B | 检索原8.0（字符offset0）；定位利用 | 13.539 / 23.988 / 23.993 | 13877 / 705 | 13824 | 0.00127662 |
| 4 | A | 定向page_inspect查form/ARIA/隐藏/section结构；合理事实采集，非首屏重复 | 8.864 / 22.515 / 23.026 | 13856 / 559 | 13312 | 0.00123336 |
| 5 | A | page_observe＋page_inspect(body *,0)；首屏重复发生，是否无理由unknown | 11.252 / 36.417 / 36.591 | 13856 / 1132 | 13312 | 0.00192096 |
| 6 | B | 检索原8.0（字符offset0）；定位利用 | 16.530 / 28.208 / 28.432 | 13877 / 537 | 11264 | 0.00176622 |

首响应为首个非空reasoning/content/tool增量，不等于HTTP响应头；HTTP头、首流字节、完整工具名称/参数、usage及其细分均保存在原始记录和机器索引。A1 HTTP200流中返回provider_error/finish_reason=error；无超时、无参数形状错误。其余五次参数可由原工具契约接受，但未执行，不能说检查完成。A5提出刷新后重读，未获得必须刷新的当时事实；只能确认重复发生，不能确认完全无理由。

多数请求有11264–13824个可见prompt缓存tokens，A1为0。没有改变缓存设置，也没有跨请求追加生成内容；不能称严格冷启动或将延迟差全部归因定位补充。所有输入逐项核对为冻结A/B，B只恢复8.0的args、total、nextOffset，omitted=true保留；未加入后9节点、后续状态或评价提示。

费用：A **US$0.00315432**，B **US$0.00465186**，本批 **US$0.00780618**（上限0.25；保守六请求预留0.1255833）。原共享累计 **US$2.11661055**，余额 **US$17.88338945**，有效unknown/held/lease均0；未建新资金池。模型DeepSeek V4.1 Flash、Alibaba、low、4096、60秒、并发1、自动重试0均保持；逐响应身份一致。

按[OpenRouter公开费用口径](https://openrouter.ai/blog/insights/cost-vs-quality-tradeoff-framework-for-agent-models/)与原账本契约使用usage.cost。A1明确回传cost=0，但其upstream_inference_cost=0.004662另存原记录；没有把实际派发伪装为未发生，也没有用供应商内部成本替换账单费用。没有新增metadata对账请求或恢复旧批次。

唯一最值得继续验证的问题：**取得已有公开DOM事实后，待办Filters能否转成有依据的可执行操作和可测量后置条件，而不再次整页刷新？** 本对照显示了信息检索选择的变化，尚未证明任何控件验证完成；不支持继续扩大记忆开发、换模型或重构架构。

证据目录：`data/r0-dom-locator-shadow-20261008-01/`。`manifest.json`为本批新授权、顺序、输入/执行器哈希、报价、预算和事前评价；`requests.jsonl`/`responses.jsonl`/`ledger.jsonl`及6个SSE保留全部请求与失败；`evaluation.json`为当前Agent只读事实复核，不称独立Agent盲审；`raw-audit.json`对照共享SQLite；`campaign-ledger-final-snapshot.db`只是只读归档，不是活动账本。旧stage逐项未改，原unknown+reconciliation保留。机器交付索引及本地包摘要见 `plans/evidence/r0-dom-locator-shadow-delivery.json`。

复用已通过的20项DOM记忆验证、41项费用验证及原产品证据，没有重跑测试/浏览器/R0验收或修改R1、产品、提示词及评分器。完整批次已关闭，automaticResume=false，后续请求0。**原R0未通过结论保持；本结果不证明真实模型稳定性或所有长尾已修复。**
