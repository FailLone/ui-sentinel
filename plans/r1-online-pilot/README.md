# R1 在线三组接线：唯一交付入口

## 当前执行结论：已授权批次停止（2026-10-09）

用户已明确授权manifestHash `9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75` 对应一次批次。已在干净隔离候选de54a7e执行：首条semantic-agent派发1次主模型请求，Wafer返回HTTP400/model_request_rejected，无usage，整批立即停止；Jev0次，其余8行未运行，不记成功或失败。已知费用0、总实际费用未知，unknown1笔/预留US$0.053、held0；claim已消费，不恢复或重试。没有三组差异或采用Jev收益的依据，R1仍未通过、默认关闭。

本次唯一结果入口：[逐行结论与费用](paid/RESULT.md)、[机器结果](paid/result.json)、[脱敏原始证据索引](paid/evidence-index.json)。以下实现和待授权文字是执行前冻结记录；本段及paid结果优先，旧未用预留不构成追加许可。

## 冻结实现与执行前方案（保留历史）

2026-10-09。本轮交付是在线 runner、共享费用停止入口和免费接线证据；不是旧八状态任务，也不是 R1 阶段验收。运行候选 **de54a7ee7c141e719f212852e774b304162cd3dc**，基线 aa35a9544d11dd57b85d7efcc4088dc8538977cc，分支 codex/r1-jev-closeout。交付文档提交在候选之后，不改变运行源码身份。

**三项有限缺口已修复并免费验证；新在线真实验证未执行、未授权。** 本轮只修复报价、窗口停止接线和指标命名；没有浏览器运行、真实 HTTP 或付费调用，不 push/main 合并。默认关闭。旧2182042候选及bc41f90交付原样保存在Git，旧草案/说明/索引副本见 `history/v1/`。当前任务锚点见 [CURRENT-TASK.md](CURRENT-TASK.md)，全部证据身份与摘要见 [evidence-index.json](evidence-index.json)。

## 执行链与实验范围

三个模式共用原执行器、页面/候选/检查事项、动作许可、后置测量、报告与证据规则；每轮独立 API 进程、数据库、端口和证据目录。Agent 模式不安装程序决策 host；program 优先执行确定性排序，必要时交回 Agent；jev 先用相同程序过滤/排序，只有剩余多个合格候选的公开优先级仍有歧义，才由 Jev 给分。明确唯一目标和单候选不花 Jev 请求。Jev 不授予权限、不判断效果真伪或宣布完成。

Agent 使用原 `evaluation/support/model-gateway.ts`；Jev 使用既有提供方适配器。两者进入同一个 CampaignSession/SQLite 费用账本、reserve/dispatch 原子停止门与停止 epoch。父 runner 在实际 fetch 前记录 requestId、parentRun、manifestHash、完整 state/messages 摘要及 wireHash；Jev 另保存完整 frame、题目映射、原始回执，按原始响应重算，失效结果不能变成动作。子执行进程只收到本地网关令牌，没有真实提供方密钥。复用既有执行器扩展口，不另建执行器，不改 R0 分支或生产默认开关。

本批最多 3 场景 × 3 模式，各一次，顺序固定为 semantic 的 agent/program/jev，再 ambiguity 三组，再 expanded 三组。只新增一个小型 ambiguity fixture；另两项复用既有 fixture：

| 场景 | 实际要检查的事实 | 评价边界 |
| --- | --- | --- |
| semantic | 明确 Reveal 目标，点击后 Ready，健康反例 | 程序直接处理目标；不能为制造竞争调用 Jev |
| ambiguity | Configure 与 Learn more 均在范围；前者公开预期 Ready、实际 Wrong，后者 Information | 两者都合理，无唯一正确首选；看实测发现、覆盖及首次结果，不能用按钮选择判通过 |
| expanded | Reveal 后出现 Continue，继续操作才能测得公开预期失败 | 复用有界局部扩展；真实 Agent/Jev 是否完成仍待验证 |

固定 fixture HTML 摘要、goal、源码、模型、费用和次数见 [manifest.proposed.json](manifest.proposed.json)。非 semantic 的 null goal 表示原执行器默认目标，其确切文本在 batch.ts 校验中冻结。未来动态帧只能来自此候选、这些页面和已注册 parentRun，不能把授权当任意状态通配符。参考缺陷留在评价侧；发送公共 DOM/文本/历史及原检查事实，不发送测试正确排序标签。

## 费用、问题数与停止门

报价为本地保存的 2026-10-09 官方端点快照，见 [price-source.json](price-source.json)：[Agent 官方端点](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints)、[Jev 官方端点](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints)、[TypeSafe 计费说明](https://docs.typesafe.ai/models)。本次收尾未重新联网确认报价；真实 runner 在授权校验后、取得密钥/消费 claim 前重新查询两个公开端点。

| 路径 | 固定模型 / provider | 每请求预留 | 每 run / 全批请求上限 |
| --- | --- | ---: | ---: |
| Agent（含两程序组的交回） | deepseek/deepseek-v4.1-flash / Wafer | US$0.053 | 8 / 72 |
| Jev（仅 jev 模式） | typesafe/jev-1.13，回执预期 typesafe/jev-1.13-20260917 / TypeSafe | US$0.003 | 2 / 6 |
| 视觉 | 禁止 | US$0 | 0 / 0 |

Agent 输入 US$0.045/百万 token、输出 US$1.20/百万 token；使用完整 1,048,576 context 加 4,096 输出做保守预留：1,048,576×0.000000045 + 4,096×0.0000012 = 0.05210112，上取 0.053。实际 wire 最多 131,072 bytes，输出 max_tokens=4096。预留不是估计实际花费。

Jev 对 2–3 候选发 1 道 readiness 加每候选 relevance/informationGain 两题，即每请求 5 或 7 题，最多 6 请求 / 42 题。wire 最多 32,768 bytes，复用 64,000 总 context、输入 US$0.042/百万 token、输出免费依据：64,000×0.000000042=0.002688，上取 0.003；不能把题数当独立 HTTP 请求数或重复计费次数。服务另有 32,000 prompt 限制，编译器不做精确 tokenizer 证明，若服务拒绝立即保留失败，不拆分追加请求。readiness 0.5 是预先固定的探索性交回门槛，不是校准质量声明。

**上限 9 runs、72 主模型 + 6 Jev = 78 请求；72×0.053 + 6×0.003 = US$3.834。** 每 agent/program 行 0.424、每 jev 行 0.430。不能把 9 runs 写成 9 请求；也不是新增许可或绝对账单保证。真实费用以响应 usage 记账，缺失保留 unknown 及预留。按供应商账单出现超预留仍需如实结算并停止，不能改写为零。

每 run 最多 6 actions、8 主调用、180,000ms；工具 5,000ms，模型 15,000ms，重试 0；全批窗口 1,800,000ms，从创建批次开始计时，不是授权文件失效时间的持续重验。semantic-agent 是顺序第一条烟测；无停止事件时同一授权内自动继续剩余行，质量无增益不能触发调参、扩样或重试。无 fallback、禁止视觉、禁止未批准模型。

unknown、超额、请求上限、批次到时、传输/协议失败、执行错误、重复目标、安全/持久化失败或虚假成功停止新派发，通知原 run 取消。已在途请求可迟到结算；unknown 对账后不恢复停止 epoch。已有取消/unknown 双向门和在途结算反例见定向测试。正常语义交回是 partial，不自动当错误通过，也不因为没有优势而继续追加实验。

## 已有证据及复用理由

证据均为固定服务返回配合真实本地 API/Chromium；**本轮新增真实模型请求 0**。免费服务 usage=0 是替身事实，不能据此预测线上成本或模型能力。下表不是同构建的 8 行正式对照：

| 证据目录 | 源码 | 运行与可证明内容 |
| --- | --- | --- |
| free-wiring | e59db0f | ambiguity 三组 + expanded-program 共 4 轮；实际操作和测量、三模式入口及初版共享账本 |
| free-handoff | e59db0f | ambiguity-jev 1 轮；固定 Jev 交回后进入固定 Agent，同一 run/account |
| final-smoke | ddc7357 | semantic-agent、ambiguity-jev 共 2 轮；最终报价/固定 provider 配置、缓冲主模型响应及证据评价接线 |
| final-trace | 2182042 | ambiguity-jev 1 轮；实际 wire 与各自 reserve 的 requestId/parentRun 对应；Agent+Jev 两笔均结算 |

共 8 次定向运行，只有 3 个场景，不能汇总成 8 场景覆盖或最终候选完整矩阵。每个 server.mjs 的 source map 内 133 份源码均核对到该轮提交；前 5 轮构建摘要一致，后 3 轮构建摘要一致（详见索引）。final-trace 的 identity.sourceDirty=true 原样保留：运行前已有未跟踪旧 manifest 草案；当时及本次核对跟踪源码无修改，子构建 source map 与2182042匹配。父 runner 未另存运行时完整源码快照，因此身份依赖当时提交/工作区记录，不把 dirty 标记改成 false。

e59db0f→ddc7357 的 host/server-entry 主要是格式调整，优先级及 fixture 不变；父 runner 实质增加主响应 provider 检查、两份报价门、Jev provider.only、评价与显式环境开关，不能只凭旧 5 轮宣称这些通过；由 final-smoke 和对应定向测试补覆盖。ddc7357→2182042 仅 batch/runner 增加 AsyncLocalStorage 逐派发身份、auditWire 及全批窗口定时取消（另加测试）；fixture/策略/评价/子构建不变，所以复用 final-smoke 的动作及测量证据，同时 final-trace 核对最新身份接线。以上是v1的证据边界；本轮用受控时钟闭合到期边界，见下节，不把它写成新的浏览器运行。

final-trace 的 blocked **是预期交回，不是通过场景**：固定 readiness=requires-agent-investigation，固定 Agent 随后 run_finish(unverified-scope)。0 动作、0 实测效果、2 项效果仍待检查、缺陷未发现；1 次 Jev + 1 次 Agent 同 parentRun，账本全 settled，已知费用0/held0/unknown0。证明交回和记账，不证明真实 Agent 能接住并完成任务。没有安全错误或虚假成功。

`targeted-final-18.log`：11 项 online 定向测试 + 7 项受影响 host 测试通过；`typecheck-final-18.log` 类型检查通过。日志生成于2182042提交前的同一源码内容，归属候选按版本记录及新增测试内容确认，日志本身不内嵌源码SHA；不伪装成干净checkout重跑。早期17项日志只作历史，不替代18项记录。初次 typecheck 失败（重复stage展开）保留，已修复后通过。这是上轮收尾证据；本轮新增受影响的103项定向测试、类型检查和构建，未重跑浏览器或旧18+1。

继续复用旧 [18+1 受控闭环证据](../r1-controlled-loop-v1/README.md) 的原范围（恢复、预算、晚到来源等），不把它们标为新三组真实效果。aa35a95 的单帧真实 Jev 1请求/5题，实际 US$0.000250824、pending0，只证明那个协议响应兼容；旧 claim 已消费，不是本批授权，未重跑。

## 三项修复出口与剩余边界

三项均在 `de54a7e` 闭合；原始命令、退出码、源码/构建及日志见 `evidence-index.json` 的 `gapClosure`，目录 `artifacts/r1-online-pilot/gaps-v2/`。

| 出口 | 实现 | 实际免费验证 |
| --- | --- | --- |
| 报价fail-closed | preflight.ts严格验证Agent/Jev必需prompt/completion；拒绝缺失/null/空白/非法类型或字符串/NaN/Infinity/负数/超cap；校验model/provider/context及必需能力。可选计费项缺席保持缺席，出现时必须满足支持的零费用或缓存上限策略；未知计费项/非空阶梯拒绝 | preflight.test.ts共87项：四必需单价各19类无效值、合法原价/零值、四类超上限、可选项及provider/model反例；实际runner调用的preparePaidAccess证明失败先于密钥读取、claim消费与后续派发 |
| 批次窗口 | batch.ts注入窄时钟；到期同一abort信号通知原网关和当前run取消，网关立即取消在途传输。lifecycle.ts复用原取消API，正常结束清理timer/listener | online.test.ts共13项（原11+新2）：在1,800,000ms边界到期，前1ms未停；拒绝新Agent/Jev、预留待派发及排队重试；两传输signal aborted，原run取消通知；迟到usage结算0.021测试美元、unknown清零后epoch仍1且批次仍停；正常清理不触发到时回调 |
| 测量语义 | measurement.ts、evaluate.ts、runner.ts统一firstMeasurementEventMs/Seq/At；仅有有效时间及可用measurement/receipt引用的generic/effect事件入计时，不代表事项结算/有效发现 | measurement.test.ts共3项：无事件/无引用/无效或倒置时间为null；有测量事件但无已结算事项仍是partial、0有效发现；真实0ms与缺失null区别保留 |

版本为 `r1-online-pilot-2`、`r1-online-result-2`、`r1-online-evaluation-2`，字段契约见 [measurement-fields-v2.schema.json](measurement-fields-v2.schema.json)。新结果不再输出误导性的firstSettledMeasurementMs或旧firstMeasuredSeq/At。旧报告/原字段不重写、不按v2含义回填；要查看旧测量时仍读旧事件与引用。首次finding仍需要原事项失败、measurement及finding证据，不以新的测量时间代替质量指标。

最终候选103项测试（87报价+13在线+3测量）、类型检查及父runner/子入口构建全部退出0。仅免费mock与本地网关窄集成，注入时钟不实等30分钟、不启动浏览器。初轮同范围也通过；格式化后在已提交候选上作最终验证，全部原始日志保留。没有改高单价、预留或请求数量，没有新依赖。

证据复用：2182042→de54a7e只改这三项及对应版本/启动顺序。fixture、权限、动作/后置检查、程序排序、完整帧与实际wire绑定、账本存储均未变，旧真实本地动作/测量/引用证据保留原身份；新报价门、到时取消与指标由上述新测试覆盖。旧4+1+2+1仍不是最终候选9run对照，不重算为新版模型能力成绩。

剩余启动条件仅为**用户对准确新manifest的一次性付费授权**及实际运行环境准备；届时用合法私密凭据、干净候选和未消费claim目录，真实启动会再次校验公开报价。服务不可用、报价/模型改变或前检失败即停止，不自动扩scope/cap或花钱探测。本轮未读取真实密钥，未创建批准文件/claim，旧单frame授权已消耗。

真实动态全帧兼容、真实Agent接手行为、三组效果仍未验证；这是授权批次要回答的问题，并非免费替身已证明。每模式每场景一次只能比较这3个开发场景的实测发现/覆盖、费用、调用与时间，不能推广完整R1收益。无增益则据实结束，不继续调参或扩样。默认保持关闭，R1阶段未通过。

## 精确复现与待授权运行命令

机器索引路径以仓库根为基准。artifacts/r1-online-pilot 是保留的本地免费证据，不随Git提交；转交时只复制索引列出的文件，不能仅给开发机绝对路径。报告内旧绝对路径到包内文件的映射在索引 rows/artifactMappings。不依赖整个data目录、运行数据库、浏览器profile或密钥。

当前 manifest 内容hash（对JSON.stringify(parsed)计算SHA256）为 **9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75**；文件字节SHA256在索引。原2182042草案hash14175ec1…在history/v1/完整保留，ddc7357更早草案仍在本地superseded记录；它们都不是新授权。下面的候选准备命令不是付费许可：

```sh
# 在持有上述提交的仓库内；用独立目录，保留当前工作区
R1_SOURCE=de54a7ee7c141e719f212852e774b304162cd3dc
R1_DELIVERY=$(git rev-parse HEAD) # 必须是包含本README/manifest的交付提交
R1_RUNTIME=../ui-sentinel-r1-online-runtime
git worktree add --detach "$R1_RUNTIME" "$R1_SOURCE"
mkdir -p "$R1_RUNTIME/local-input"
git show "$R1_DELIVERY:plans/r1-online-pilot/manifest.proposed.json" > "$R1_RUNTIME/local-input/manifest.json"
cd "$R1_RUNTIME"
git rev-parse HEAD
node --version # 使用Node24；已有证据24.21.0
pnpm --version # 已有证据10.17.1
pnpm install --frozen-lockfile
pnpm exec playwright install chromium # 仅缺少对应浏览器时安装；本次未重装
```

新manifest在候选de54a7e中尚未生成，因此必须从本次文档交付提交提取，不能在文档tip直接运行后声称sourceSha仍为de54a7e。源码及锁文件已包含所有运行依赖，没有本轮新依赖。

复现免费接线的既有命令如下（本轮不重新运行；对早期源码复现需checkout相应SHA，不能混写身份）：

```sh
pnpm exec tsx scripts/r1-online-pilot/runner.ts --free artifacts/r1-online-pilot/free-wiring ambiguity-agent ambiguity-program ambiguity-jev expanded-program
pnpm exec tsx scripts/r1-online-pilot/runner.ts --free-handoff artifacts/r1-online-pilot/free-handoff ambiguity-jev
pnpm exec tsx scripts/r1-online-pilot/runner.ts --free artifacts/r1-online-pilot/final-smoke semantic-agent ambiguity-jev
pnpm exec tsx scripts/r1-online-pilot/runner.ts --free-handoff artifacts/r1-online-pilot/final-trace ambiguity-jev
pnpm exec vitest run scripts/r1-online-pilot/online.test.ts src/agent/exploration/integration/host.test.ts
pnpm typecheck
```

未来 approval 结构：`approvedBy`、可追溯 `approvalReference`、准确 `manifestHash`、`maxCostUsd:3.834`、`maxRuns:9`、未来 `expiresAt`。当前未生成批准文件；旧freezeHash授权拒绝。只有取得准确新manifest的对应授权后才执行：

```sh
# 私下提供R1_ONLINE_API_KEY；不得打印、提交或把.env复制进证据
# local-input/approval.json 来自对具体新manifest的明确授权
pnpm exec tsx scripts/r1-online-pilot/runner.ts --run artifacts/r1-online-pilot/authorized-batch-1 local-input/manifest.json local-input/approval.json /ABS/CANONICAL/ONLINE-CLAIMS
```

最后一项是该批唯一、跨工作区共用的本地claim目录，须事先选定并保持不变；不能换目录绕过一次性claim。runner不跨机器统一此目录，因此本批只允许一台指定机器一个进程，不能复制授权并行执行。未知或停止后不自动恢复，不消费旧单帧未用余额。

本轮新增免费复核命令（已运行；无需为授权重复）：

```sh
pnpm exec vitest run scripts/r1-online-pilot/online.test.ts scripts/r1-online-pilot/preflight.test.ts scripts/r1-online-pilot/measurement.test.ts --reporter=verbose
pnpm typecheck
pnpm exec esbuild scripts/r1-online-pilot/runner.ts scripts/r1-online-pilot/server-entry.ts --outdir=artifacts/r1-online-pilot/gaps-v2/build --bundle --platform=node --format=esm --packages=external --sourcemap
```
