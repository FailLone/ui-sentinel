# R1 当前统一交付与恢复请求

2026-10-09。**400 兼容候选、显式续验门和 main 整合已准备；新增真实调用0，R1 未验收完成。** 候选已完成必要免费验证并放入干净隔离运行区。下一步需要对下述具体恢复批次的授权；不用先等供应商回复才能推进，但不能自行接受未结费用风险。任务状态只在 [CURRENT-TASK.md](CURRENT-TASK.md) 维护，本文件为当前统一交付入口，[机器索引](evidence-index.json)保存本次与复用证据的身份。

## 候选与 main 整合

| 身份 | 冻结值 |
| --- | --- |
| 源码/运行候选 | `1e78ea6dea5098944b5d53d6cbe4630c3b53c246` |
| 修复与整合 | `8d187a6` schema/续验门；`e3cfafe` main合并；`1e78ea6`自包含测试夹具 |
| 已整合 main | `da7adc873ee2143843b7dbfc828551285b1f43b0`；只合入 R1 分支，没有向 main 合并或 push |
| 实验基底 | `aa35a9544d11dd57b85d7efcc4088dc8538977cc`；固定 R0 基线 `60c315a04e30b84356381763e33dd976a3ace836` |
| 新 manifest | [manifest.proposed.json](manifest.proposed.json)；对象摘要 `6428f1ecc473922766f598cc390b052d2a5d4a3f7eae370a72027c77eaa72197`（JSON.stringify 摘要，不是文件字节摘要） |
| 干净运行区 | `/Users/xietian/.codex/worktrees/r1-recovery/ui-sentinel`；detached HEAD，锁定依赖已离线安装 |
| 当前交付分支 | `codex/r1-jev-closeout`，工作区 `/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007` |

本文件及索引提交是源码的文档后继，运行区继续固定上表源码。唯一合并冲突在 `executor.ts` 顶部 import，保留 R1 的 `createExperimentalHost`/扩样开关及 main 的 `createUiRuleObservation`。main 的 DNS、规则采集、D005/R005 与报告接线保留；108 项 main 变更文件逐字节一致，两个合并接点是 executor 和 package。`pnpm-lock.yaml` 与 main 相同。没有操作维护者其他工作区、Roadmap 或规则分支。

相对新 main 的运行实现依赖是：新增 `src/agent/{decisions,exploration}/`，共享 `src/agent/model/request.ts` 的程序工具 attempt/取消守卫、`src/execution/executor.ts` 的显式宿主/一次扩样桥、`experimental-decision-host.ts` 和 sourceSpan schema；package 只增加 R1 CLI 命令。服务路由、网络、规则、报告、前端及依赖锁均沿用新 main，逐文件差异见机器索引。不能只摘最后文档提交或覆盖 main 的执行器。

## 400 修复的实际结论

沿真实 Zod → Mastra → OpenAI-compatible → 网关链确认：旧 `exploration_update.sourceCandidates[].sourceSpan` 是位置式 `items:[...]`，改为同质整数数组并明确两元素约束。运行时仍拒绝少/多元素、非整数、start<0、end<1；新旧44种输入接受集相同，Mastra 在非法输入时不执行工具。itemId/sourceRef/sourceHash/sourceSpan、严格字段及原执行器的实际来源绑定全部保留；没有删除工具、权限、required 或 reasoning 参数。

真实浏览器产生的完整16工具请求已无位置式 items。模型、`tool_choice:required`、`reasoning.effort:low`、stream/usage、4096输出上限、Wafer only/no-fallback/require_parameters 与原失败完全相同。**这只是兼容候选；未向真实供应商发送，不能证明 tuple 是400根因或问题已恢复。** 历史同供应商/同顶层参数成功的反证仍有效。首条 `semantic-agent` 将同时作为真实兼容检查和既定9行的第一行，不另加收费探针；若再次失败立即停批，不自动换参数或模型。

## 本次验证与既有证据的边界

| 证据 | 本次结果及可以支持的结论 |
| --- | --- |
| 4文件108项定向测试 | schema等价/SDK出站、显式风险接受、跨manifest一次claim、旧来源变化、原子派发、报价与原停止链通过。测试源码8d187a6；main整合未改这些文件。最终复核将续验测试改为自包含夹具，真实SHA-256逻辑保留；5项受影响测试在1e78ea6重新通过，不能把它们另加成5项独立覆盖。正式runner继续固定原证据，运行区实际只读预检通过。 |
| 首轮失败保留 | 首轮105通过1失败（测试沿用旧单价预算）；类型检查发现注入I/O类型问题。修正后108通过及类型检查通过，初始日志保留，不计为成功。 |
| 新 main 整合 | e3cfafe上锁定依赖离线安装、`pnpm build`（含类型检查、服务端/工作台/两靶场）及2项规则默认/历史报告定向测试通过。没有重跑旧规则矩阵。 |
| 三条受影响浏览器路径 | semantic-agent：2动作、required effect verified=1、0发现；ambiguity-jev：2动作、verified=1/failed=1、1有证据发现；expanded-program：2动作、failed=1、1有证据发现。三条源码e3cfafe（最后变更仅测试注入，产品/host/浏览器代码相同），均completed、原事项/测量附件校验通过，且含新ui-rules观察事件。模型均固定替身，真实调用0；completed不表示页面健康。 |
| 干净运行区准备 | 最终1e78ea6类型检查、parent runner/child server bundle构建通过；manifest、旧来源及公开报价只读预检通过；真实CLI拒绝空署名/无有效期草案，在报价/凭据/claim/输出目录创建前退出。新风险claim不存在。 |
| 旧失败保存 | 原41项失败证据、旧DB、claim及execution-lock摘要不变；无对账写入、无新的官方账单。 |
| 复用历史 | [18+1受控闭环与单frame](../r1-controlled-loop-v1/README.md)、[旧在线接线/103项](history/pre-closeout/README.md)、[26项诊断](diagnosis-400/README.md)按各自代码/范围复用，不能叠成新版全量通过。 |

本次原始浏览器DB/PNG/build/logs保留在 `artifacts/r1-online-pilot/closeout-current/`，机器索引列绝对本机路径、字节与摘要；不是已上传或随Git可迁移的原始包。Git保存关键日志、审计和摘要。历史索引按记录提交解释：[旧根索引](history/pre-closeout/evidence-index.json)路径含原位置，其历史根文件字节应从 `0d6652f` 读取；不把后来改动的 CURRENT-TASK/报价/manifest 当作历史摘要匹配。

## 完成条件核对：有限闭环与原完整 R1 尚有范围差异

现行Roadmap要求继续修复、产品接入核对和既定有限真实验证；[受控契约](../r1-controlled-loop-v1/CONTRACT.md)及本9行冻结覆盖局部公开控件、一次扩样、测量/原事项回连及有界交回。较早的 [完整收尾计划](../r1-completion-plan.md)另承诺以下产品出口，未收到明确取消或后置决定。**不自动把9行改名完整R1，不因旧计划较大就无授权启动72轮。** 已提出范围澄清，在答复前保留全部未完成项。

| 承诺 | 实际状态 |
| --- | --- |
| 原执行器操作→测量→原事项/证据→继续或交回 | 18+1历史及本次3条免费路径有证据；真实9行待恢复。无第二账本/报告作者。 |
| 程序优先、歧义评分、有界主Agent交回 | 受控host已接入；单frame真实Jev协议成立；真实整轮交回、成本与收益未证实。 |
| 取消/预算/stale/来源不足/恢复失败不假成功 | 原反例按原版本复用，续验账本变化和新unknown反例通过；不宣称通用恢复成功。 |
| S3 状态/路径、公平性、边界输入、返回刷新、重复状态与反例策略 | 纯领域模块有单元证据，但 `planNext`/`assessStrategies` 未进入实际 `createControlledHost`；当前host不是完整策略调度器。 |
| C01–C12 产品矩阵 | C01局部健康、C11有限恢复失败、C12预算边界有部分相关历史证据；尚无整套冻结逐行验收。C02标签、C03输入、C04返回刷新、C05/C06至少3步缺陷/健康对照、C07公平性、C08滚动裁切、C09重复状态、C10导航歧义均不可用当前9行宣称通过。 |
| S1六状态/S2独立评分与S5 12×3×2=72轮 | 本次未执行，也未被单frame/9行替代。独立评分/标签和完整产品策略仍有工程准备工作，是否属于本次最终出口待明确。 |
| 产品默认与报告 | 通用API未安装实验host；只由runner专用server入口显式安装，默认关闭。R1事件、原coverage/check/effect/partial及未覆盖分支沿用现有报告；没有完整S3路径/策略产品呈现。 |

当前采用建议：**不默认启用Jev，保留有限实验opt-in**。依据是真实闭环与收益未完成，并非已证明Jev无收益。即使9行全部运行，也只对这3场景的开发参考做描述性A/B/C比较，不宣传泛化、独立保留评分或完整产品验收。真实质量平局、partial、无收益均据实结束这批，不增加样本或调参。

## 一次恢复授权的确定内容（尚未批准）

原失败：manifest `9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75`；request `0ddb03d5250db453759b72ee` / Wafer `a0d1d4a1a35a`。Agent实际派发1、HTTP400、usage缺失，Jev0、动作0，其余8行未运行。旧unknown预留USD0.053、已知实费0、总实费未知，stop epoch1和旧claim保持。完整失败见[原结果](paid/RESULT.md)，[支持材料](diagnosis-400/support-request.md)已备、未发送。

[报价快照](price-source.json)在2026-10-09 09:21 UTC获取，干净运行区又经公开端点预检确认未超出。Agent Wafer输入USD0.055/百万、输出USD1.2/百万，按1,048,576上下文+4096输出计USD0.06258688，向上预留每次0.063；Jev输入USD0.042/百万、每次预留0.003。[Agent端点](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints)、[Jev端点](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints)。每次正式启动仍先重新检查报价/参数支持，变化超限即在凭据和claim之前拒绝。

| 项目 | 上限 |
| --- | ---: |
| semantic/ambiguity/expanded × agent/program/jev | 9行，每行6动作、8主模型、180秒 |
| Agent每行/三场景合计 | 非Jev行0.504；Jev行含评分0.510 |
| 新Agent调用 | 最多72次，共预留USD4.536 |
| 新Jev调用 | 仅Jev组三行，各最多2次，共6次/预留USD0.018 |
| 新视觉/重试/补跑 | 0 |
| 新批次总上限 | 78次请求，USD4.554，整批30分钟 |
| 加原unknown的在线关联账本上限 | **USD4.607**（4.554+0.053），总实费仍未知 |
| 加已结算的独立单frame历史实费 | 另有USD0.000250824；包括它的累计记账上限USD4.607250824 |

拟议授权有效期为批准后24小时。一次批准覆盖：上述源码/manifest、对旧unknown风险的明确接受、9行兼容检查和后续整轮、失败/partial留存、费用/原始回执核对及最终有限结果交付；第一行成功后不逐步重复询问。它不授权额外探针、扩大样本、改变阈值/模型/费用、供应商消息、push或main合并，也不自动豁免原完整产品承诺。USD0.053是未结预留，**不是已知账单上限或确认扣费**；USD4.607是程序记账上限，不能承诺原unknown最终账单恰好小于0.053。

默认拒绝机制已经实现：授权必须精确绑定新manifest和 `riskAcceptance`，旧批准不再适用。原DB/claim/锁被固定路径和摘要引用；新批次只在显式接受后获得自己的持久账户，并在合计记账中永久带入原unknown。canonical目录的 `continued-0ddb03d5250db453759b72ee.claim` 以exclusive方式仅创建一次，换manifest/output/工作区不能重复接受同一旧失败。每次reserve/原子dispatch前复核旧来源；旧账本变化或任何新unknown触发停批/取消，未发请求释放占用，已发请求保留晚到费用。旧批次不复活、不清unknown、不改epoch、不删claim。该机制只为这一条固定失败，不是通用绕停平台。

若用户不接受该风险，则等有权账单/合法generation ID完成正式对账；无证据时不记0、不伪造generation ID。账单若到达，本候选会因源摘要变化拒绝，需要核对新事实后更新冻结，不暗中继续。

## 已准备的执行步骤与交接

运行区的 `data/r1-recovery/manifest.json` 为冻结原字节；[approval.draft.json](evidence/current/approval.draft.json)故意缺署名/有效期，实际CLI已证明拒绝。**批准后**才依据用户原话与时间生成 `data/r1-recovery/approval.json`（approvedBy/approvalReference/expiresAt，风险字段原样），私密注入现有 `R1_ONLINE_API_KEY`，不复制.env、不输出凭据，再运行：

```sh
cd /Users/xietian/.codex/worktrees/r1-recovery/ui-sentinel
export PATH="/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"
node_modules/.bin/tsx scripts/r1-online-pilot/runner.ts --run \
  data/r1-recovery/authorized-batch \
  data/r1-recovery/manifest.json data/r1-recovery/approval.json \
  /Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-claims
```

本次只运行了draft-rejection-probe（授权检查即拒绝）、只读readiness和bundle构建，没有执行上述有授权批次。下一执行者先核对runtime HEAD/干净状态、manifest摘要、canonical旧证据及批准原文。runner会再次检查，不预先手动消费claim。若任何前置条件变化，保留失败，不删除claim或重建账户重试。

执行后在本README和同一机器索引更新9行逐行结果、未运行原因、各组实际Agent/Jev调用和费用、测量/覆盖/有效发现/交回/partial。先从原始回执重算再给采用结论，保留旧失败及关联总账；无完整费用不报完整节省率。若未得到更窄范围的明确裁定，则仍把原完整R1产品出口标未完成，不以此恢复批次替代。

维护者可直接采用的状态稿：R1已形成与main规则/DNS共存的本地候选1e78ea6，完成schema兼容准备、显式旧unknown续验门及必要免费验证；真实供应商恢复、9行收益、原完整产品出口均待证据。Jev默认保持关闭。main尚未接收R1，没有push；批准只决定真实恢复，不代替维护者合并审阅。
