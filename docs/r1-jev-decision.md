# R1 前置：Jev 探索决策模块与离线验证

本模块验证“程序提供公开状态与候选，Jev 评分，程序排序”的可实现边界。目标是让程序连续完成常规交互，必要时交回主 Agent，减少完整主 Agent 的逐步决策调用。本期只有独立决策模块与离线工具；生产执行器、实际点击、可靠恢复及三组端到端实验等待 R0 验收后另行集成。不能由建议推出权限、点击效果、缺陷或任务完成。

当前 Agent、纯程序、程序加 Jev 的后续对照须评价发现质量、覆盖、主模型调用减少量、总时间、总成本。当前方向仍待验证：本期固定响应不能证明真实 Jev 判断质量、抗注入能力或整轮收益。不将本项或 R1 标为完成。

独立真实适配与评分工具现见[真实 Jev 适配说明](r1-jev-real-adapter.md)。已增加免费实现与验证，真实调用及评分验收仍未开展；旧模块的默认行为不变。

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

## 离线命令与证据

环境：Node 24.x、pnpm 10.17.1、Git。先 `pnpm install --frozen-lockfile --store-dir .r1-pnpm-store`。当前只支持专用前置工具；导出树不包含 R0 私有夹具及原 scripts，所以不要用顶层通用 build/test 来代替本期验证。

```sh
node plans/r1-jev-input/preflight.mjs
pnpm exec tsc --noEmit
pnpm r1:jev:test
pnpm r1:jev:offline -- --output artifacts/offline
pnpm r1:jev:offline -- --real --dry-run --output artifacts/real-plan
```

22 个独立开发种子不含 R0 私有答案。离线两列分别保留纯程序与程序加固定响应的排名。`stale-reply` 真正改变当前观察后返回有效评分，要求 stale-state；`low-score-fairness` 实际连续执行四次会话决策，记录 c1 获得机会。它们是给定状态下的模拟调度，没有实际操作页面。每步保存原始公开输入、发送请求、固定原始回复、归一回执、结果、attempt/digest、真实计时及 usage；评价期望只留在评价侧。两次重放只剥离明确的计时/attempt 等易变字段，其他嵌套字段全部比较。CLI 期望不匹配返回非零。

提交后在干净克隆中运行：

```sh
# 仅本克隆的生成物排除，不改变共享仓库或全局配置
printf 'artifacts/\n.r1-pnpm-store/\n' >> .git/info/exclude
node scripts/r1-jev/collect-evidence.mjs artifacts/final-evidence
```

收集器记录实际 argv、源码 SHA、配置摘要、时间、退出码及原始日志。测试与离线子进程都通过 NODE_OPTIONS 加载 `network-trap.cjs`，并用 fetch/https/net 正向拒绝测试确认陷阱生效。该陷阱是 Node API 运行时保护，不是操作系统防火墙。静态测试同时检查模块不引入网络 API；真实模型没有运行。

返程包 `SHA256SUMS` 覆盖除自身以外的全部文件；`evidence/index.json` 覆盖全部证据叶子文件，不对自身生成循环摘要。`tools/verify-package.mjs` 检查完整索引、摘要、bundle、前置关系、源码 SHA、允许修改范围和工具与提交一致性；`--rebuild` 创建独立目录、独立 pnpm store，安装锁定依赖并重新采证。压缩包外单独给出压缩包 SHA-256。

## R0 与后续路线

冻结源起点为 `8adc93a422398c61a9a738562bfb23710f36bcc6` 的脱敏导出；交付输入 tip `c15f0ff3af50bc8c77da429a706432e8df739cde`，原 dev tip `a3e03eeffb94358dda7cf4a4ebca0dfdd34dc070`。收尾分支独立保存，最终 SHA 见返程包 delivery.json。不跟随 R0 正在发生的提交变化；原执行器、提示、网络限制、账本、证明/报告、冻结评分器、工作台和默认开关均不改。

R0 结束后只集成允许路径的最终 diff，不能把脱敏导出树覆盖原仓库。先完成状态采集与可信适配器、唯一执行器接线、动作后实际观察、恢复和交回，再进行当前 Agent/纯程序/程序加 Jev 三组端到端对照。Roadmap 只可登记“独立前置模块及离线防御逻辑有证据；真实质量与收益未验证”，并链接最终返程证据；本次不直接修改正在维护的 Roadmap。
