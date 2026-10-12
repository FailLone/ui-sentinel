# Jev 探索评分模块与离线验证

独立模块接受公开状态与候选，返回排序建议；建议不能授予动作权限、认定缺陷或完成任务。它与当前[程序优先探索](architecture.md#程序优先探索)分开，离线固定回复不能证明真实评分收益。

## 源码与接口

`src/agent/decisions/exploration/` 是纯模块目录，无浏览器、数据库、环境变量、fixture 文件读取或网络默认实现。调用方必须注入 `send`。固定响应读取器在 `scripts/r1-jev/stub-transport.ts`，只供离线工具和测试使用。无新增依赖；复用 zod、Node 标准库与现有测试工具。

- `contracts.ts`：严格的 `r1-exploration-input-1`；上限 32 候选、32 条历史、32768 字节，调用方可收紧。拒绝额外字段、重复身份、失效观察版本和悬空 scope。输入经 zod 解析产生私有快照。
- `result.ts`：严格运行时输出 `r1-exploration-result-1`，检查 ranked/handoff 判别与候选集合一致性。非法输入的 binding 是显式 null；有效输入始终保留绑定。没有 authorized/defect/finished 等字段。
- `state.ts`：完整 task/state/candidates/history/scope/limits/budget revision 的摘要。版本只是调用方声明；模块不会自行证明页面未变。
- `ranking.ts`：确定性排序，策略 `r1-exploration-policy-2`。按当前相关状态下未尝试、次数、融合分、调用方估计成本、候选 id 排序。历史仅按稳定 targetKey、当前允许动作和 beforeStateVersion 归因。新状态允许重查；未知 targetKey 不跨观察合并。非完整或非法评分批次整体退回纯程序排序，避免部分分数形成非传递比较。
- 融合权重维持 `0.6 * relevance + 0.4 * informationGain`，uncertainty 保留供解释。低分候选保留队列，几何不判缺陷。每第 4 个决策提升等待最久且仍未尝试的非队首项；调用方显式提供并维护 `fairness: {decisionIndex, firstEligibleDecision}`，会话与缓存路径均传入。没有足够决策预算不能宣称低分项已被检查。

## 传输边界与绑定

`requestExplorationScores({ input, ledger, send, identity, currentInput, signal, fairness, ... })` 返回排名或明确交回原因。

`prompt.ts` 仅投影正常任务与公开事实，包括当前 eligible 候选、公开状态、几何、上下文和带状态版本的实际动作历史。候选范围与回执校验集完全相同。页面文字是数据。评价标签、期望顺序及 fixture 名不进入请求。`byteLength` 和 digest 对实际传给 send 的 `JSON.stringify({system, body})` 计算；超出调用方或模块上限就交回，不静默截断。未来真实适配器增加 HTTP/协议字段后，还必须检查真实线上载荷大小，本期没有验证该协议。

`send(request, context)` 的 context 包含本地 attemptId、requestDigest、AbortSignal 和绝对 deadline。可信适配器须返回 `bindReceipt(normalizedReceipt, context)`，形如 `{attemptId, requestDigest, receipt}`。服务本身不必回显版本；不能让服务自报字段替代本地请求绑定。模块严格校验适配器信封、attempt/digest、配置的 modelId/provider、usage、评分范围和候选一一对应。任何误路由都无有效建议。默认身份仅限固定替身 `{modelId:'stub/jev-exploration-1', provider:'stub', adapterRevision:'fixed-response-2'}`。

真实提供方协议、结构化输出支持、价格与适配器均未验证。调用方注入的适配器是可信边界；若它把错误请求的结果重新绑定成当前请求，模块不能凭相同候选 ID 识破该适配器缺陷。后续接入须对适配器本身单独验收。

调用方应提供 `currentInput: () => 当前完整输入`。等待期间会重读 requestId、完整语义快照和当前预算；只传旧 `currentVersions` 两字段接口不足以观察外部状态替换，该接口仅作兼容附加检查。未传 currentInput 时重读原输入对象可发现就地修改，但无法观察调用方把外部变量替换成另一个对象。消费时使用 `validateSuggestionAgainstCurrentState` 再检 issued/current 的请求、页面、文档、观察、候选、任务、历史、scope、预算及动作范围；候选必须在发出时已存在。通过仅表示本模块没有发现失效，执行器仍须独立授权与实际观察。

## 预算、超时与缓存

每个会话独占 `BudgetLedger`。预留前以当前输入收紧决策、动作、时间与已知成本上限。账本使用单调时钟；请求截止为请求上限、当前剩余时间及会话剩余时间的最小值。取消在发送前检查，返回前比较真实经过时间，避免事件循环延迟使过期结果成为建议。JavaScript 同步阻塞不能被定时器抢占；阻塞结束后该结果会被拒绝，不能承诺硬实时中断。

付费注入必须明确 `billableTransport:true`、模型/提供方身份、已知费用余额和有限非负最坏报价 `estimatedRequestCostUsd`，否则不派发。票据按对象身份管理，结算幂等；派发后未知费用保留占用并阻止新预留，不能因为异常、超时或取消就当免费。带严格 usage 的异常可记录实际费用，任意错误正文不落报告。迟到回执/异常的已知费用可结算原票据，并通过 `onLateUsage` 单独记录；已返回的超时/取消结果保持不变。若提供方超出报价，记录 overrun 并停止，模块无法阻止外部服务违反报价。未知真实费用不能推算为 0；明确非付费替身的账本扣款为 0，但其缺失的模型 usage 仍记录 unknown。

缓存验证输入与评分后保存副本，返回也复制。key 包括完整状态摘要、URL、几何/成本、策略/提示版本、模型/提供方/适配器身份及 fairness。requestId 可更新后重新绑定；预算量不用于命中，而每次执行实时守卫。命中不调用传输，不继承付费报价、不重复扣原费用；保留来源模型和 originCostUsd。失败、取消、超时、过期与不可缓存状态不写入。

## 离线命令

```sh
pnpm r1:jev:test
pnpm r1:jev:offline -- --output data/jev-offline
```

输出目录使用新路径，不覆盖历史。开发种子只提供公开输入，私有期望留评价侧；模拟排序没有实际操作网页。真实提供方适配和费用边界见[实验工具](r1-jev-real-adapter.md)。
