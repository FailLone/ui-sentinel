# 业务契约开发交接与主 Agent review

状态：**G0–G4已通过，主Agent已review并更正；G5同构建完整45轮仍待验，未accepted，未合并main**。以[任务书](next-development-plan.md)和[验收计划](business-contracts-acceptance.md)为依据。开发交付原文保留在 Git 提交 e915105；以下是主 Agent 接手后的结论，不把历史或 dev 自检成绩当作当前版本验收。

## 交付与架构

原 main 766615b，收到 fail 22 bundle 的 dev head e915105，审查分支 review/business-contracts-export。当前候选已包含条件指引、原子调查收尾与完整事件历史校验修复（见文末最新批次；历史 30e02e4 不是当前验收版本）；完整构建身份以实际批次 manifest 为准。

沿用 Mastra/Playwright/Midscene-Qwen/Hono/libSQL/React。新增业务契约和导出业务，不引入新 Agent 框架或通用业务 DSL。Agent 负责探索、语义选择与证据判断；确定性执行器负责动作边界、事实归属、测量和可靠结束。

- src/business：版本化 profile、adapter、严格 schema、不可变契约快照及规范化事实。
- src/execution：通用执行、写入资格/额度、时序调查、规则绑定、结束及隔离；不解释订单/导出私有协议。
- arena/export：React 页面、真实异步导出 API、独立私有控制器；正常、恢复、受阻、合理拒绝、改名布局五例。
- evaluation/private/export：独立真值、私有评分和反例；Agent 无权读取。
- evaluation/support：批准来源导入、构建指纹、模型网关、证据下载和停服审计。
- scripts/validation：免费预检、真实诊断、四组正式编排；购物继续复用原评分器。

## 主 Agent 发现并修正

1. 原子调查无法引用业务资格依据：调查与规则检查增加受当前 run 归属验证的 evidenceRefs，缓存身份也包含依据与语义 target。资源保留公开原文，测量仍单独生成。
2. 重试只有次数限制：调度前核验本轮创建的 operation、最新 attempt/version、允许重试、先决条件、冷却和剩余额度。损坏的持久化契约在浏览器/模型启动前拒绝。
3. 旧事实和迟到响应影响结论：事实按版本更新，响应按入队顺序处理；观察/检查/结束前有界 drain，终止后关闭；新 processing 或失败撤销旧成功，导航不抹掉已验证终态。
4. 未知写入结果可漏掉隔离：5xx、断流、无法解析的 2xx、缺操作身份的成功响应都不得重放，进入 reconciliation-required。新增真实创建后错误回执回归。
5. blocked 缺失未覆盖路径：未知业务结果强制保留尚未验证范围，不接受 scope-covered 冒充清洁完成。调查结果给出继续恢复或显式结束的工具指引。
6. 正式 runner 未实现 C/D、分组数据库未接入、gate 写死：补齐 45 行、独立环境/规则状态、原评分器、共享预算、全部结果和停服审计；普通质量失败继续采样，真实隔离/持久化/预算问题停止。
7. 评分器可被错误来源、目标或失败行骗过：核对实际 create、同一 job、来源事件、当前事实、选择和产物、实际测量目标、支持资源、发现来源、规则判定及覆盖范围；缺字段也失败。
8. 删除审计/哈希重复实现，抽取公共支持模块；修正免费和付费诊断的边界、完整构建指纹及文档的过期来源说明，补齐导出环境变量。

资源证据是合理的独立产物类型；环境属于冻结快照，端口不同导致契约 hash 不同是预期的隔离行为。公开导出协议区分业务重试资格和 UI 入口可用性，不泄漏私有变体或评分答案。原 approved rule 的声明和人工批准未改变。

## 免费门槛

最终候选实测：format:check、typecheck、build 全通过；73 文件 / 632 测试通过；购物六例与导出五例 fixture 全通过；持久化六轮、原子调查、有限审查通过；扩展业务预检 32 断言通过、付费调用为零。浏览器工作台检查和真实截图包含在预检。

当前收尾修复预检：/private/tmp/ui-sentinel-rule-completion/data/business-preflight/2026-09-26T14-51-42-724Z（30断言、零付费）。此前下载修复主工作区预检：data/business-preflight/2026-09-25T17-02-16-311Z（30断言）；隔离工作树验证位于 /private/tmp/ui-sentinel-download-review/data/business-preflight/2026-09-25T16-53-02-346Z。测试日志仅本机 /tmp，核心可复现命令在 README 与验收计划；数据目录不提交 Git。

## 原批准与兼容

原规则 proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607，声明 SHA-256 f3ac227c94ea3c16471bbf00ee4e2f811d3b005600049520271979bf1792161e。Git fixture 的14个文件校验通过；本地导入沿用 reviewedBy=user，未新增 approve/enable。

新增 GET /api/business-profiles；POST /api/runs 可指定 businessProfile:{id,revision}。省略配置的旧 arena 新请求解析 checkout@1，显式非法配置返回400。旧报告仍标 legacy-unversioned，不回填今天的契约；旧 Journey 不跨契约复用。重启未完成任务仍 interrupted，不重放写入。

## 真实模型、失败记录与费用

固定 DeepSeek deepseek/deepseek-v4.1-flash（Wafer）与 Qwen qwen/qwen3.7-plus（Alibaba）。本批原子调查=1、有限 Jev 审查=1；产品默认 Jev=0。单轮 300秒、40动作、30模型调用，工具15秒、请求60秒，未放宽上限。

| 构建/批次 | 结果 | 已计费用 |
| --- | --- | --- |
| dev 原交付诊断 | E2引用未通过，正式未运行；原记录保留 Git | $0.04401488（dev报告，保守扣除） |
| f033992 诊断 14-52-37-068Z | 6/6；后查出诊断未核验完整 coverage | $0.05291288 |
| f033992 正式 14-56-32-809Z | 6通过、2失败、37未运行；8轮停服审计通过 | $0.07482584 |
| 86197d5 诊断 15-07-56-989Z | 6/6，完整覆盖和引用通过；后补异常写入保护，不能授权新构建 | $0.10222320 |
| 2433b3f 诊断 15-19-02-263Z | 6/6 | $0.08153276 |

上述目录分别位于 data/business-validation 或 data/business-formal。前次正式失败是未知范围丢失以及模型两次耗尽输出后正常执行错误被 runner 误判为完整性故障。原记录未覆盖、未删减；修复后重新完整验收，不拼接成功行。曾因工作区有未提交文档被冻结检查拒绝启动，未发生模型调用。

新诊断/正式共用 $1.72602320（$2 扣除此前本地批次和 dev 报告费用）；正式再扣除引用诊断 $0.08153276。此余额已用于下列完整复验，并未重新获得预算。

## 每组 ID → 实际测试映射

- **C01–C05**：`src/business/selection.test.ts`（`describe` 内具名 C0x 用例）+ `src/server/routes/business-runs.test.ts`
- **C06、C08**：`src/server/routes/business-runs.test.ts`；**C07**：同上 + `src/business/facts.test.ts`
- **B01–B06、B09、B10**：`src/business/facts.test.ts`、`src/business/normalization.test.ts`；**B07**：`src/execution/executor.test.ts` `describe('verified business state across navigation (B07)')`；**B08**：`src/execution/task-state-normalized.test.ts`
- **P01–P03、P05、P06、P10**：`src/execution/side-effect-policy.test.ts` `describe('side-effect policy (P01, P02, P03, P06, P10)')`；**P04/P07**：`src/execution/executor.test.ts` `describe('export side-effect and cancellation boundaries (P04, P07)')`；**P08**：`src/execution/security.test.ts`（export 边界用例）；**P09**：`arena/export/src/server/api.test.ts` `it('refuses to reset while a run is active, queued or awaiting reconciliation')` + `it('requires the control token for every private operation')`
- **R01**：`src/business/normalization.test.ts`、`src/rules/builtin/business-outcome.test.ts`；**R02**：`evaluation/private/export/scorer.test.ts`（含 declared-target 与 drift 两例）；**R06**：`src/execution/journeys/journeys.test.ts`；**R07**：`src/execution/response-time.test.ts`、`src/execution/executor.test.ts`
- **F01/F03/F05/F06**：`arena/export/src/server/{state,api}.test.ts`；**F02/F04/F07**：`pnpm test:fixtures:export` + `src/business/facts.test.ts`「retained business resources (F04)」；**F08**：`scripts/build.ts`/`dev.ts` + `arena:export:start`
- **E01–E10**：`evaluation/private/export/scorer.test.ts` `describe('scorer counterexamples (E01-E10)')`



## 收尾与下载的后续完整复验

| 冻结版本 / 本地批次 | 结果 | accounted USD |
| --- | --- | --- |
| 2433b3f 正式 data/business-formal/2026-09-25T15-25-37-712Z | A15/15、B5/6、C18/18、D6/6，总44/45；四组停服审计通过 | 0.485128228 |
| 2f84c84 诊断 data/business-validation/2026-09-25T16-05-48-495Z | smoke+五例6/6 | 0.119910560 |
| 2f84c84 正式 data/business-formal/2026-09-25T16-17-13-482Z | A15/15、B5/6、C18/18、D6/6，总44/45；四组停服审计通过 | 0.543640718 |

2433b3f 的 B/E2/2 在规则和证据均完成后连续两次耗尽输出，没有发出 finish。2f84c84 统一已知规则/自主调查的完成指引，消除“一概只读”与允许重试的矛盾，并明确安全重试后的下一动作或显式结束；unknown 不被描述为检查完成。没有提高模型预算或扩大 Jev 结束权限。随后 B/E2 三轮全部通过。

2f84c84 的 B/E1/3 实际重试成功，但 Agent 点击公开 Download export 链接被旧导航边界拦截，因此报告诚实标为 blocked/success、带干预范围；不能计为健康路径通过。20b6406 新增适配器 downloadOperation 声明及通用下载策略，只允许同源 GET、本轮拥有且最新事实 succeeded 的实体。其他实体、私有路径、写方法、陈旧/失败状态均拒绝；既有导航限制及每次重定向检查保留。增加真实浏览器下载/拒绝测试和预检实际下载步骤。

615→619项测试全部通过，扩展预检30断言通过、零付费调用。首次扩展预检因断言误用内部 integrity 状态名 clean 而非报告状态 no-recorded-intervention 失败；实际下载和 completed/success 已成功。已修正断言接口并完整复跑通过，未弱化无干预要求。

截至上述批次，含 dev 报告历史费用及保守预留累计 accounted=$1.504189066，其中唯一未知费用预留$0.0154398（前一正式批次2次请求）；$2预算余额$0.495810934。此前请求把整个审查/修复轮次累计上限提高到$3；用户于2026-09-26回复“继续”，已按该累计上限执行下述复验。此记录不增加单轮上限，也不重新授予已消耗额度。

当前修复代码已推送 review/business-contracts-export：格式、类型、构建、628测试与30预检已通过；各构建真实验收见下节。在完整45轮及停服审计全过之前不标 accepted、不以两批44/45拼接通过、不合并 main。

## 范围和限制

本轮覆盖购物与异步导出两种明确声明的业务。它不证明任意网站、所有视觉体验问题、模型稳定最优或永不超时。已有通过样本仍存在重复检索与收尾耗时波动，记录保留；本轮不继续扩展性能实验。

原审批、未知写隔离、原子测量和证据完整性要求不变。下载权限来自可信适配器和当前事实，Agent 无权新增路由或豁免。准备文件和历史成绩均不能代替实际规则执行。诊断引用及批准来源汇总在 manifest.json 内，逐轮原始报告/真值/请求/下载索引在各组 record.json；顶层保留45行 runs.jsonl、scoreboard、artifact-index 与 durability-audit。


## 下载修复候选的诊断与完整复验

代码20b6406，诊断时文档提交cffdc6e；诊断 data/business-validation/2026-09-25T17-03-47-620Z，**smoke+E0–E4 6/6通过**，$0.09390136，无未知费用。Server SHA-256 `6c5dad88954c43336b72407c9735c23441e4425e57dbc54aef12efaeb00ddb1b`；完整构建 hash `7f7e760d8c99a5e8e5c9bf917e0f8702ea871791d9a51e23527130296cf645a1`。之后只更新文档，不改变此构建。

| 样本 | 报告 | 模型调用 | elapsed ms |
| --- | --- | --- | --- |
| E0 | completed / success | 16 | 184110 |
| E1 | completed / success | 9 | 38532 |
| E2 | blocked / unknown | 8 | 106226 |
| E3 | completed / rejected | 16 | 171307 |
| E4 | completed / success | 8 | 41863 |

该诊断后累计 accounted **$1.598090426**。用户确认累计上限$3后，按余额运行正式批次 `data/business-formal/2026-09-26T14-05-56-678Z`：**43/45**（A15/15、B5/6、C18/18、D5/6），全部45份停服审计通过，保存1292份产物索引。此批构建仍为20b6406，文档HEAD为a5c05a5；费用$0.380172495，全部已知，墙钟2535.257秒。失败原样保留，不以其他批次补分。

- B/E2/1：完整规则检查、发现和证据已保存，随后模型连续两次耗尽4096输出额度，未结束任务。
- D/healthy/2：规则已判pass、没有缺陷，但购物契约重试额度为0。业务自身仍允许重试，通用恢复提示没有明确有效权限，模型反复犹豫是否重试或结束，两次耗尽输出。其他四个断言通过，但正式评分仍失败。

截至该批累计 accounted **$1.978262921**（含原dev报告及历史未知预留$0.0154398），$3余额 **$1.021737079**。

## 收尾修复与下一次冻结验收

`b5fb7e0` 把当前获准重试规则的失败回执接入已有有限语义审查：必须匹配当前触发事件、实体和同一个仍不可操作的目标。普通导航和表单控件交给审查模型判断是否确实能恢复当前实体，不直接据此结束；健康、未知和陈旧测量不授权该路径。提交前重新核验事实、控件、版本和未完成事项，变化则退回完整Agent。默认开关仍关闭，正式矩阵继续使用既定开启配置。

同一失败样本暴露审查输入超限：为审查单独省略重复的旧动作历史并明确标记，保留当前观察、最新工具回执、规则/发现、业务资源及未完成义务。探索Agent的历史不变；剩余输入过大时仍拒绝审查，不继续裁剪必要证据。原样失败输入加当前回执经新投影为26370字节，可在原上限内交付。

`81a9098` 从写入策略公开当前实体的剩余检查额度。健康检查通过但额度为0时，明确禁止尝试重试或第二次创建，其余检查完成后显式以unverified-scope结束，保留尚未实际验证的恢复。业务许可和检查许可必须同时成立；不改变写入保护、原规则声明或评分条件。

628测试、格式、类型、构建及30项免费业务预检已通过；新增反例包含健康控制、审查期间恢复、continue/unknown回退、输入未完成事项保留及额度消费。接下来在同一冻结构建重新运行真实诊断与完整45轮，合用余额$1.021737079。尚未获得新构建正式通过，仍未accepted，不合并main。

## 81a9098真实复验与30e02e4修复

诊断 `data/business-validation/2026-09-26T14-53-21-773Z` 为smoke+五例6/6，费用$0.080142342，未知费用0。正式批次 `data/business-formal/2026-09-26T15-03-54-137Z` 为 **42/45**（A15/15、B5/6、C16/18、D6/6）；45份停服审计通过，1337份产物索引，费用$0.423812928，未知费用0。墙钟2895.238秒；逐轮elapsed中位42432ms、最大233688ms。冻结代码81a9098、文档HEAD54c3fff，server hash `1653ca33124fb5ff7a28c8a74865658f969a40ac511729cd299f0236c51e22ae`，完整hash `b18338d6fa4082219b252a4a99e0f158842a1f336dba56bc08ed8bf2290414d0`。

- B/E2/3：已完成规则和证据，模型再次两次耗尽输出。新审查资格已满足且输入可容纳，但原观察版本把含input的页面统一标为不可复用，因而真实导出页仍跳过审查。其他通过行也不能据此宣称Jev实际完成了收尾。
- C/C4/1及3：新增零额度恢复指引未限定结果，Agent把预期拒绝后的可选重试记录成必做未验证路径，导致blocked/rejected而非completed/rejected。这是主Agent上一轮指引修改引入的回归，不归因于原dev交付。

`30e02e4` 为收尾单独采集前后版本，支持明确跟踪value/checked/indeterminate的原生单选、复选框；通用观察缓存仍拒绝复用表单。保持对动画、媒体、文本/文件输入等不支持表面的保守处理。提交前重新验证，控件或选项改变则拒绝旧建议，先交回完整Agent，不立刻连续复审。免费预检直接访问真实React导出页，检查其可作收尾版本验证且不能复用普通观察；不能只靠无表单测试页。

恢复指引仅对failed/unknown且额度为零说明恢复未验证；明确正常成功/预期拒绝不能仅因零额度新增缺口。632测试、格式、类型、构建及32项免费业务预检通过；最新预检 `/private/tmp/ui-sentinel-rule-completion/data/business-preflight/2026-09-26T15-50-02-552Z`。原生选择变化反例首次暴露“拒绝后立即再次审查”，已修正后完整复跑，保留失败日志。

累计accounted **$2.482218191**（仍含历史未知预留$0.0154398），当前已批准$3的余额 **$0.517781809**。已提出累计提高至$3.50的请求，**尚未获答复**。在答复前仅可使用现有余额。下一步先在最新冻结构建运行诊断与B组定向复核，核对真实completion-review请求和提交；定向组不能代替整体45轮，完整通过前仍未accepted，不合并main。

## 当前30e02e4的真实诊断、定向结果与剩余门槛

冻结代码30e02e4，运行时文档HEAD `0d5cc91a43c54d0a606d41cfcff60a0b749a645b`。Server SHA-256 `56f41f63a1eae382bdfded9d13eeb0a6041f5251321df0a831944a4b0a9620a6`；完整构建hash `439ecebdb782831eab86dba3d8bbb8d3a57bef77aa1e7feb8065051c9deb2946`。之后仅补充文档，代码未改变。

| 同一构建批次 | 真实结果 | accounted USD |
| --- | --- | --- |
| 诊断 data/business-validation/2026-09-26T15-54-34-852Z | smoke+E0–E4，6/6 | 0.052265094 |
| B定向 data/business-formal/2026-09-26T16-00-32-347Z | 5/6；E2三次通过且均实际调用一次有限审查并提交；6份停服审计通过 | 0.063158568 |
| C定向 data/business-formal/2026-09-26T16-07-23-238Z | C0–C5共18/18，含C4预期拒绝3/3；18份停服审计通过 | 0.076092921 |

B/E1/2 的失败发生在任何浏览器动作之前：两次模型请求均60秒超时，动作0、调用2、elapsed121345ms。此项不能计成功；没有放宽请求超时或额外重试。该批knownCost=$0.036043368、unknownReserved=$0.0271152（2请求），不把未知费用当零。B/E2三次分别45.175/32.344/56.930秒，均有真实completion-review模型请求及accepted提交，证明原生选择页面已实际通过版本保护。健康恢复另两次通过。

C定向批18轮无失败、无未知费用，elapsed中位18.072秒、最大52.423秒，墙钟447.672秒。所有C4均completed/rejected且无虚构的必做恢复缺口。定向B/C的134+500份下载产物另行逐个校验SHA-256与字节数，通过；原批准来源保持完整。

定向命令显式带 --groups B 或 --groups C，未请求组在45行协议中记blocked，整体gate=false并非该组全部执行失败，也绝不代表完整正式验收通过。不能将B/C、此前A/D跨批拼成45/45。

截至上述定向复核，累计accounted **$2.673734774**，含dev报告及两批未知费用预留合计 **$0.042555**。当时因此前$3累计上限暂停，修复与记录已推送审查分支，main仍是766615b。

## 2026-09-28继续完整验收

用户在预算说明后要求“不管上线，就这样直到通过”，按上下文解释为取消此前累计费用上限、继续修复并验收到通过。已明确告知用户此解释。无需再次请求$3.50确认；原模型、提供方、单轮时间/调用预算、评分标准和安全停止条件保持不变。

继续使用30e02e4同一构建及已通过的诊断，不重复付费smoke。下一批网关为实际新增正式运行保留$1的技术性费用保护（env含所引用诊断）；这不代表重新获得历史预算，最终累计在$2.673734774上只增加新正式批次accounted费用。若触发费用保护，先核算原因，再按用户授权继续，不因此降低评分或拼接通过行。

```sh
VALIDATION_MAX_COST_USD=1.052265094 pnpm validate:business -- --formal \
  --diagnostic-source data/business-validation/2026-09-26T15-54-34-852Z \
  --approved-source data/fixtures/approved-retry
```

完整45轮和四组停服审计全过后才标accepted、按用户授权合并main并push。质量失败保留完整记录并定位；修改影响行为后重新冻结、诊断并完整复验。累计费用持续记录。


## 2026-09-28继续验收：条件指引、限流与自主调查收尾

用户已授权继续修复和验收到通过，不受此前累计费用上限约束。原单轮300秒、请求60秒、最多一次安全重试和全部评分保持不变。

本轮发现并修复：

- `e3963b2`：删除“任意业务写入后都要检查恢复”的矛盾指引，要求先验证实际结果，只在观察到恢复条件时检查恢复；适用检查和假设解决后显式结束。
- `6b9875b`：在已有一次安全重试内遵守429/503的Retry-After，包括OpenRouter错误元数据；等待可取消，剩余时间不足则失败，不提前重试、不延長总时限。
- `3d63a6d`：自主调查的完整失败测量也可交给现有有限收尾复核。必须满足当前重试事件、同一实体、测满契约窗口、原DOM节点及其测量前身份仍匹配、当前仍不可操作；不依赖重新查询selector得到相似的新节点。自主调查完成后处于verifying阶段，仅在这些证据及原有零未决事项等条件均满足时准入；finalizing仍不准入。审核中状态变化、健康/不确定结果、短窗口、按钮改名都会退回完整Agent。导出公开要求明确恢复检查的触发条件，正常成功和合理拒绝不必人为触发恢复。

两个独立诊断原样保留，不能相互补分：

| 构建/提供方 | 本地诊断目录 | 实际五例结果（另有smoke） | accounted USD |
| --- | --- | --- | --- |
| 6b9875b / Wafer+Alibaba | /private/tmp/ui-sentinel-rule-completion/data/business-validation/2026-09-27T17-13-37-363Z | E0/E1/E2通过；E3/E4失败 | 0.042159535 |
| 1b956e0 / Fireworks+Alibaba | /private/tmp/ui-sentinel-provider-recovery/data/business-validation/2026-09-27T17-19-24-798Z | E0/E1/E3/E4通过；E2失败 | 0.056902521 |

Wafer诊断known=$0.024231205、未知预留$0.017928330（7请求）；Fireworks诊断known=$0.052101096、未知预留$0.004801425（2请求）。Fireworks的E2完成测量后绕去History，暴露了上述自主调查回执和verifying准入缺口。两组都未通过诊断门槛，不能据此启动正式验收。

上游多次明确返回`429 server_overloaded`；同型Fireworks入口支持本执行器使用的工具调用参数，来源为[OpenRouter端点清单](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints)。`3656a5d`将新验收基线固定为Fireworks/Alibaba，DeepSeek/Qwen型号不变、禁止静默fallback；它不代表换提供方已解决问题。旧Wafer批次仍按原身份保存，新构建必须重新通过诊断和完整45轮。

最新免费回归为73文件/646测试全通过，类型、格式和构建通过。测试包含自主调查与已有规则的对等复核、短窗口拒绝、原节点身份变化、审查期间控件/原生选项变化、continue/unknown回退，以及限流等待/取消/时限边界。正式45轮仍待通过，当前仍未accepted、不合并main。


## 2026-09-28后续批次、主机休眠与持久化完整性

以下均为独立批次，失败未删除，不能跨批拼接。模型保持 DeepSeek/Qwen；提供方曾因上游持续限流由 Wafer 改 Fireworks，随后由 8dcd820 显式固定为 Alibaba/Alibaba。每次修改基线后重新诊断，禁用静默 fallback。

| 类型 / 目录末段 | 位置 | 结果 | accounted USD |
| --- | --- | --- | --- |
| 正式 2026-09-27T16-46-05-733Z | 主仓库 data/business-formal | 22/45 | 0.306678012 |
| 诊断 2026-09-27T17-41-29-942Z | /private/tmp/ui-sentinel-rule-completion/data/business-validation | smoke 429，未进入五例 | 0.001210135 |
| 诊断 2026-09-27T17-43-28-469Z | 同上 | 5/6 | 0.042953915 |
| 诊断 2026-09-27T17-51-47-797Z | 同上 | 6/6 | 0.036374178 |
| 正式 2026-09-27T17-58-05-892Z | /private/tmp/ui-sentinel-rule-completion/data/business-formal | 11/45，后半持续上游429 | 0.252942682 |
| 诊断 2026-09-27T18-05-04-692Z | /private/tmp/ui-sentinel-provider-recovery/data/business-validation | 6/6 | 0.030882090 |
| 正式 2026-09-27T18-42-38-499Z | /private/tmp/ui-sentinel-provider-recovery/data/business-formal | 3通过、2失败、40未运行，隔离停止 | 0.022752065 |

加上上一节两个诊断，本轮新增 accounted $0.792855133，累计 **$3.466589907**。这是已知费用加未知费用保守预留，不等同最终账单；诊断引用到正式 campaign 时不重复计费。用户继续验收授权保持有效。

`e0b91de` 消除原子调查与旧三步调查指引同时存在的矛盾；开启原子工具时只给该工具流程，旧流程仅在关闭时提供。适用检查及证据完成后优先结束，健康且允许的恢复直接执行。两个6/6批次的E2均实际完成完整测量并由有限审查接受提交，不再仅凭任务结果推断审查被使用。

最后一个Alibaba正式批次的停止是 `run-did-not-settle`。检查主机电源日志发现 Mac 多次 Maintenance Sleep / DarkWake：有的300秒任务实际 elapsed312917ms，30秒测试也因主机睡眠花近298秒。验收期间临时运行有期限的 `caffeinate -is`，不修改永久电源设置；结束后移除本次进程的唤醒断言。休眠批次保留，不将其声称为纯模型或产品性能。

另一个独立问题出现在旧正式 B/E1/1：实际创建与重试成功，但数据库/报告只剩后段事件且seq重新连续，创建和规则检查缺失。评分器正确拒绝；仅校验连续seq和末尾事件不足以证明完整持久化。当前修复在内存保留本执行期每次已确认写入的完整event ID顺序，结束时通过独立连接逐项比对；丢失或重排必须隔离，不能报成功。libSQL本地客户端限制单连接以减少连接视图切换。新增反例重现“丢尾后复用连续seq”，并发报告读取压力测试检查全部已确认事件保留。尚未证明历史丢失的底层根因；该库连接池版本已与npm原包核对，且涉事DB使用delete journal，不归因于网上WAL缺陷或主机休眠。

当前仍未accepted。当前代码需完整免费检查后重新冻结，通过新诊断及同构建45轮、四组停服审计和全部产物哈希，才能合并main。

当前完整事件校验修复的免费门槛已通过：73文件/648测试、格式、类型、构建；持久化6轮全部durable（data/persistence-preflight/2026-09-27T19-22-22-163Z），业务预检32项全过（data/business-preflight/2026-09-27T19-23-10-658Z），均零付费调用。接下来冻结并运行Alibaba基线的新诊断及45轮。
