# R1 前置工作：Jev 探索决策模块与离线验证

计划版本 r1-jev-prework-1，2026-10-07（Asia/Shanghai）。状态：规划及开发输入准备；未实现，未验收，不代表 R1 或 R0 完成。本计划为远端开发的完整任务合同，不需要聊天记录、本机 data、会话或环境变量。

## 1. 产品方向与证据边界

目标是由程序提供页面状态、候选控件和动作历史，让 Jev 承担常规探索中的高频评分与下一步决策，实际替代完整主 Agent 的逐步调用。现有 Jev 只用于可选、默认关闭的业务阻断收尾判断，ui-scan 不走该分支。本项先验证“Jev 候选评分、程序排序”；不把每轮主 Agent 调用前加一次 Jev 称为节省调用。

未来流程：主 Agent 给检查方向和范围；程序枚举公开候选和确定事实；Jev 判断相关性/信息价值；程序排序并连续完成常规交互，重新测量后继续；复杂语义、多步调查、生成新调查程序、候选不足、恢复不可靠或不确定时交回主 Agent。Jev 预测不能证明真实点击效果、操作权限、产品缺陷或任务完成。展开、内容更新、导航可同时发生，效果不是互斥分类。

未来三组对照为当前 Agent、纯程序、程序加 Jev；同样本、任务、预算、冻结配置和判定，评价有效非重复发现、误报漏报、状态覆盖、主 Agent 调用实际减少量、Jev/交回开销、总时间和总成本、恢复失败及预算耗尽。先约定质量/覆盖容许变化和收益门槛，失败全部保留。目前方向待验证，收益未证明。本项不设虚假的收益通过率，不执行这些端到端实验。

## 2. 基线与实际核查

- 原源码来源 SHA：`8adc93a422398c61a9a738562bfb23710f36bcc6`，读取时为 `codex/r0-closeout` HEAD。不是“最新 main”，不是 R0 通过声明。
- 独立导出根提交：`3c002b849369d730788e689553e70344163038eb`。交付计划 tip 及 bundle 身份见外层 `delivery.json`。开发必须从该 delivery tip 建分支；返程须以该 tip 为开发基线。
- 导出采用新仓库的完整历史、无前置提交，**不是原仓库完整历史**。原历史中有 R0 私有答案/保留集，故不传递。生产源码按上述 SHA 原字节导出，逐文件 SHA-256 在 `plans/r1-jev-input/source-provenance.json`。
- 原工作区存在 Roadmap 与 R0 context/interaction/investigation 的未提交修改；没有复制这些产品代码。Roadmap 单独复制到导出仓库，摘要 `1e1196545ecd98664c666df7e1a5317891dbe0eebd3874b0d225058724313ad8`。它写的代码现状 main@3cdd68f 是维护快照，不替代本项源码 SHA。
- 只读取 R0 冻结身份：一个较早清单为 `3cdd68fc5db205e39d8629db246f8d629dab6c75`；读取时 authorized 清单为上述 `8adc93a...`，buildHash 均为 `b405b4c5d7560f26323da9a3f2229e92eb4ca042fe0c6ba115082abee8fd23b9`。不复制私有清单、不推断最终验收状态；R0 以后变更不自动推进本项基线。必要边界已抽取到 `plans/r1-jev-input/r0-boundary.md`。

| 已核对源码/文档 | 当前事实及本项用法 |
| --- | --- |
| docs/product-roadmap.md / architecture.md / execution-engine.md / development.md | 产品方向、唯一执行器、模型建议与证据分离、运行模块不得依赖评价目录；本项运行命令以本计划为准 |
| src/agent/decisions/blocker-review.ts | 既有有界请求、响应校验和取消参考；同时导入 config/Page，且要求费用存在，不能直接作为本项纯模块入口 |
| src/agent/decisions/completion-choice.ts | 既有 choice/probabilities 结构示例，只适用于阻断，不直接复用其问题或结束语义 |
| src/agent/model/request.ts | abortable、尝试生命周期参考；有配置和主 Agent 耦合，不为复用一个 helper 引入运行态副作用 |
| src/shared/config.ts | 已配置 Jev alias 与 expected snapshot；仅为源码事实，不代表现在服务支持任意新评分协议，不在本期访问提供方 |
| src/execution/executor.ts recordUiObservation / src/execution/element-store.ts | 当前机械候选、snapshot/ref 与实际节点绑定存在；下一步仍主要由 Agent 选择。ref 只在相应观察有效，不是永久控件身份 |
| src/execution/observation-version.ts | 动态/复杂表面保守禁用缓存；新模块不假设所有页面都可稳定 hash，也不读取 DOM |
| src/inspection/scope.ts | 候选/已选/证据账本是执行器责任；本项不写账本，不导入完成证明 |

## 3. 隔离、文件归属与非目标

独立分支、独立 checkout，依赖/输出/费用账本都在本工作区，禁止链接 R0 的 node_modules、dist、数据库、证据、浏览器 profile。离线工具不启动服务或浏览器，不占测试端口；如将来局部 HTTP 替身确有必要，使用自身临时 loopback port=0 并清理，不与 R0 共用固定端口。

本期允许写入（dev 归属）：

- `src/agent/decisions/exploration/`：新契约、纯排序、问题构造、注入传输、响应适配、缓存、预算、回执及相邻测试。
- `evaluation/r1-jev-dev/`：本项独立公开输入、评价标签、固定回复及测试；禁止从 R0 私有集复制或衍生调优。
- `scripts/r1-jev/`：离线 CLI、免费预检与工具测试。
- `docs/r1-jev-decision.md`：实现接口、命令、明确未接入边界。
- `plans/r1-jev-input/` 的本期测试配置、manifest 可追加；不得降低计划、标签与验收预期来变绿；有依据的样本错误以显式勘误及前后证据记录。
- `package.json` 仅可增加 `r1:jev:*` 命令/必要依赖；锁文件同步。优先现有 zod/vitest/tsx/Node API。新增依赖说明理由、版本、锁文件与安装方法。其余共享配置变更列后续集成，勿修改。

禁止修改其他现有 src，尤其 R0 主执行器/浏览器动作循环、生产探索提示、网络/副作用限制、检查账本/结束证明/报告、R0 fixture/评分器/冻结配置、工作台和默认开关。原源码与规范的参考副本只读；不得新建自动接入或自动调用模块的入口。本期不合入 R0 候选分支。原仓库的全量 build/test/fixture 命令因私有材料有意不交付，不是本期复验入口；不要补造这些材料或改写原脚本伪装全量通过。

## 4. 决策契约（P1）

以 `r1-exploration-input-1` / `r1-exploration-result-1` 定义严格运行时 schema 和导出 TS 类型；非法输入返回结构化 invalid-input，不启动传输。独立 JSON 种子使用该输入字段，不要求远端猜测格式。

输入字段：

- schemaVersion、requestId、task={goal,localTask,revision}；goal/localTask 为调用方正常任务。
- state={pageId,url,documentVersion,observationVersion,relatedStateVersion,cacheable}；调用方拥有版本，模块不能自行宣布当前页面未变。
- candidates[]：id（当前集合唯一）、targetKey（调用方可选稳定身份；缺失不得猜跨状态同一性）、observationVersion、text、role、publicState={visible,enabled,expanded,selected}（未知用 null，仅 visible=true 且 enabled=true 可进入可执行建议，不能由文本推断）、geometry={x,y,width,height,inViewport} 或 null、context（公开附近文本）、allowedActions[]、estimatedCost（非负确定性排序成本）。动作枚举首版限 click/inspect，inspect 仍只建议，无执行。
- history[]：targetKey、candidateId、action、beforeStateVersion、afterStateVersion、actualEffects[]、outcome。actualEffects 可含 expanded/content-changed/navigated 的任意组合；只接受调用方实际观察，不把预测灌入历史。outcome=observed/failed/unknown；历史不足显式保留 unknown。
- scope={revision,executableCandidateIds[]}：调用方给定的当前可执行子集；必须引用当前候选。不是模块授予权限。歧义/绑定不足由调用方不列入子集。
- budget={revision,remainingDecisions,remainingActions,remainingMs,maxRequestMs,remainingCostUsd}；cost 可 null 表示未知，不能转 0。真实传输未知预算时不发请求。离线替身需显式声明 nonBillable，不用缺费用推导免费。
- limits={maxCandidates,maxInputBytes,maxHistory}：上限不得被输入提高到模块硬上限之外；首版硬上限 32 候选、32 KiB 最终请求 UTF-8、32 历史项；超限交回（不静默删义务/候选）。字符串/数组/数值有限、有界，NaN/Infinity/重复 ID/悬空 scope/候选观察版本冲突拒绝。

输出判别：ranked（含所有 eligible 候选的 scores、稳定 orderedCandidateIds，可含一个 suggestedAction={candidateId,action}）、insufficient-information、uncertain、handoff；非法/超时/取消/预算/过期也必须为无建议的明确结果及 reasonCode。可采用统一 handoff + reasonCode 表达失败，但报告须区分原因。输出绑定输入 requestId 和全状态/任务/scope 身份、contract/policy/prompt/model 版本。不存在 finish/pass/defect/authorized 等结论字段。

评分按每候选 relevance、informationGain、uncertainty（有限 [0,1] 或 unknown）表达；短理由仅为不可信模型文本，无可执行解释力。缺少评分不能默认高分/0 分；首版要求完整、一一对应的回执，任何重复/遗漏/未知 ID 使整批无效，避免部分错绑。禁用/不可见/不可执行候选不得成为 suggestedAction；inspect 是否允许也由 allowedActions 与 scope 决定。无 eligible 候选必须交回，不能宣称任务结束。

提供纯 `validateSuggestionAgainstCurrentState` 或等价入口；消费者交付当前版本、候选、scope、预算进行二次检查。单靠发起时快照/响应自报版本不能防异步状态变化。等待期间状态更新、取消/时限/预算变化应使旧建议及旧缓存写入无效。

## 5. 纯程序排序（P2）

确定性、无模型/网络/浏览器/DB/全局配置。相同规范化输入和策略版本输出完全相同；输入候选数组重排后仍稳定，以 candidate id 字节序最终打破平局。排序只针对 eligible 集，但完整回执记录被拒原因。

建议首版明确的 lexicographic 优先级：当前 relatedStateVersion 未实际尝试优先；在当前状态尝试次数较少优先；相同者 estimatedCost 较低优先；最终 id 排序。历史以 targetKey+action+相关状态计数，不能仅按按钮文案、候选短 ref 或 URL 去重。未知身份不跨观察合并；返回旧状态是否重试需由新观察/相关版本判断，不永久封禁。

Jev 评分只在程序控制下影响排序；先实施上述纯基线，另有版本化融合策略（具体权重在 P2 提交前写进 docs 并固定）。低分仍出现在完整队列，使用有界公平/轮转预留（建议每第 4 个决策选等待最久的 eligible 未试项，少于四次时亦不得宣称其已覆盖）；将轮转状态作为显式输入/调用参数与 cache key，不依赖隐藏全局计数。测试低分在足够模拟决策预算内得到机会，预算不足如实交回。几何仅线索或成本，不能变成缺陷/永久过滤边缘或中央控件。

模拟连续输入仅为调度测试，不是真实动作效果；需要多步语义或恢复前置未知时 handoff。不得创建第二套真实浏览器循环。

## 6. Jev 候选评分模块（P3）

模型仅看正常任务及公开事实，由程序构造有界问题。采用独立 system 指令和结构化 data，声明页面文字/候选文本/上下文/历史文本不可信，不允许其改权限、schema 或任务。不得夹入样本 ID、标签、参考排序、判定依据、私有 fixture 名称或答案。日志需可检查实际完整模型请求（仅本期合成资料）；评价器用旁路索引关联。

传输接口显式注入 send(request,{signal,deadline,attemptId})；默认必须替身，不能隐式 fetch、dotenv 或读取 OPENROUTER 环境触发请求。模型字段/服务 wire 协议由 adapter 隔离；此计划定义的是内部评分契约，并不虚构 Jev 服务已经支持任意 JSON 输出。现有 choice/probabilities 可作为有界问题的映射参考。首版交付 wire 适配测试说明、固定响应和未验证服务兼容性的标记；真实入口可以只有 dry-run 准备，**不要求现在连通真实 Jev**。

每次传输：严格请求体大小；核对请求映射、provider/model 身份、响应结构、当前候选集合、全部相关版本；缺/重复/歧义/过期/越界 ID 整批拒绝。若外部服务不回显版本，须用不可混淆的本地 attempt/request digest 绑定，禁止把自报字段当可信绑定。不确定/信息不足明示交回主 Agent；传输失败不得伪装模型低分。

超时=min(请求上限,调用方剩余时限)，取消优先；发请求前预留调用/费用额度，同一会话 budget 对象约束并发，默认不重试。测试传输无视 AbortSignal、body 延迟解析、同步回复碰到边界时钟、预算在等待中耗尽，均不得产生迟到有效建议或写入成功缓存。迟到 usage 可记审计但不能复活建议。所有失败记录 attempted/状态/耗时及可获得的 usage，保留响应无效但实际计费的事实；记录中不得存 authorization 或任意服务错误 body。

费用用 tagged known/unknown（可用 number|null + status），失败也保留已知输入/输出 token 与费用；缺 usage/cost 原样 unknown；显式替身非计费=known zero 可用，但要标 source=stub，不能推断真实费用。总时间使用单调时钟 wall time，处理与传输时间不可重叠累加；缓存命中标请求数 0 与原评分来源费用分开，不重复扣费也不伪造原费用为 0。真实预算出现未知费用需阻止继续付费，不从 token 数擅造报价。

缓存限定在调用者会话实例、有限容量（建议 64 条 LRU）/TTL，并含 contract/prompt/policy/model/任务/页面/文档/观察/相关状态/候选公开内容及动作范围/历史/作用域/排序公平状态。预算与取消即使缓存命中也须实时检查。cacheable=false 无缓存；相关状态、候选、语义上下文、scope、任务、模型/策略任一变化失效；不缓存失败/不确定/取消/超时。requestId 每次不同不应导致安全的同状态缓存完全失效，但返回时重新绑定当前 requestId；当前版本不匹配绝不能命中。不会跨页面按相同文案缓存。

## 7. 离线工具与开发样本（P4）

种子包 `evaluation/r1-jev-dev/{public,evaluator,stub}` 为本计划新造的合成开发集，来自虚构文档站，无真实会话/历史运行数据，无 R0 保留集。`manifest.json` 明确每文件摘要与 scenario 关系。public 为输入，evaluator 为期望与依据，stub 为固定回复；运行时模块不得导入后两者。公开 JSON 文件名只用于 CLI 外部索引，不进入 send body。

样本覆盖菜单、折叠、标签、同文案异上下文、多效果、状态变化重试、空集、歧义/过期/禁用、连续操作、主 Agent 调查、提示注入、低分公平与几何非缺陷。dev 须补足表中 T01–T16 的定时/并发/缓存动态反例；不要求预先存在的本机历史样本。种子只提供公开情境和评价期望，不能凭 fixture 名写运行时分支。

新增 `pnpm r1:jev:offline -- --output <包内相对目录>`（或文档给出等价固定命令），默认 stub，拒绝默认网络；输出 JSON/JSONL 逐行 input/request/result/outcome/versions/timing/usage，summary 只计本期合同指标。纯程序与程序+stub 分开，缺失真实 Agent/Jev 行标未运行。前后状态序列是给定重放，不推断未执行动作真实后果；fixed responses 只证接线/错误处理，不证明 Jev 判断质量。不宣称提高整轮扫描覆盖、发现率、时间或成本。

可准备 `--real --dry-run` 计划，列精确候选模型/adapter revision、样本/次数、独立价格来源/时间、输入上限、累计账本/费用未知即停和单独授权要求；当前禁止 smoke/real/diagnostic/formal 网络调用。未核实模型能力和报价明确 unknown，不能以 R0 的 US$2 授权或账本替代本项授权。

## 8. 开发批次、进入条件与出口

| 批次 | 进入条件 / 文件归属 | 必须交付与验收出口 |
| --- | --- | --- |
| P0 导入/预检 | 本交付包完整；独立目录 | 验摘要/bundle/tip；安装冻结依赖；保存工具版本与预检日志；材料缺失不猜 |
| P1 契约与样本 | P0；exploration/contracts + r1-jev-dev | schema 与 public fixture 校验，非法输入无请求；严格标签隔离；版本/候选/权限测试 T01–T03、T13 |
| P2 确定性基线 | P1 输入类型固定；exploration/ranking | 可重复排序、状态化去重、公平机会、成本/tie 规则；T04–T06 |
| P3 Jev 模块 | P1；exploration/transport/prompt/cache/budget | P2/P3 可在契约稳定后独立推进；全部失效/错误/并发/费用 T07–T12、T14；不用付费 |
| P4 离线验证/交付 | P2+P3；scripts/r1-jev + docs | 一键免费重放、原始证据、manifest、T15–T16、干净 clone 独立复验、返程 bundle |

可立即开始 P0/P1，依赖满足后 P2/P3 在文件不冲突的前提下并行，最终 P4。这里是工作依赖设计，不授权 dev 派发其他 Agent。每批可独立提交，但最终整体交付验收，不将批次成功当 R1 完成。

## 9. 必验矩阵（全部通过，不降低门槛）

| ID | 反例/操作 | 通过条件及证据 |
| --- | --- | --- |
| T01 | schema 正常/额外字段/非法数值/超界/重复候选 | 严格校验，非法输入零传输，reason 明确 |
| T02 | 缺/未知/重复/歧义候选、disabled、scope 外动作 | 无有效建议，不以文案猜身份，不扩权 |
| T03 | request/观察/文档/page/scope 变更；响应误路由 | 异步返回前及消费前复核，旧结果不可用 |
| T04 | 输入重排、同分、重复重跑 | 排序稳定且可解释，最终 id tie；无随机隐藏状态 |
| T05 | 同 target 不同状态重查；相同文案两个上下文 | 状态历史正确计数，不永久跳过或合并 |
| T06 | 低分/中央/边缘控件，足够/不足预算 | 公平队列不永久排除，不把几何或 DOM 变化判缺陷 |
| T07 | oversized/public 注入文本/标签隔离 | 超限不静默漏事实；请求只有公开字段；不执行页面指令。stub 不能证明真实模型抗注入 |
| T08 | malformed JSON/缺评分/错 model/provider/HTTP失败 | 结构化失败、无建议、保留失败次数与已知 usage |
| T09 | 超时/取消/忽略信号/迟到 parse/边界时钟 | 有界返回，无迟到建议和成功缓存，无 unhandled rejection |
| T10 | 预算0/并发争抢/等待中耗尽/缺费用 | 预留不超限，不重置账本，不派发或不再接受结果；unknown 不等于0 |
| T11 | 同状态缓存及任一相关因素单独变化 | hit/miss 有计数证据；旧状态、失败、不可缓存输入不复用；容量有界 |
| T12 | 缓存 hit 后取消/预算0/新 requestId | 不绕过实时守卫；合法重绑定，来源费用与命中成本分开 |
| T13 | 同步展开+内容变化+导航；多步/语义复杂 | 保留多效果真实历史；需要调查时 handoff，不输出完成/缺陷结论 |
| T14 | 服务失败带费用、缺 usage、未知 cost、晚到 usage | 状态真实，失败计量不丢，缺失保留 unknown，敏感错误内容不落盘 |
| T15 | CLI stub 两次、无 key、网络陷阱 | 确定字段稳定，变动 timing 独立；请求零外网；两组输出分开，无收益宣称 |
| T16 | 全新 clone、仅返程包和公开依赖注册表 | 按命令重建复验；索引/摘要/版本全；原 src 与 R0 边界不变 |

验收者先按 `return-and-acceptance.md` 完整性门禁，再审代码和独立执行；分类记录交付不完整/环境问题/实现缺陷/方案缺口/证据不足。不能因缺本机路径猜数据或宣布通过。保持实际失败和未完成项。

## 10. 之后集成与 Roadmap 同步

R0 验收结束后单独立项：候选适配及状态采集、唯一执行器接入、连续常规交互循环、动作后实际差异、可靠恢复与恢复核对、交回完整 Agent、三组端到端实验及冻结预算/阈值。完整生产回归在原源码仓库进行，由验收者保有 R0 私有集；不要把导出树覆盖回原仓库。只应用允许路径的最终 diff，解决共享依赖/配置冲突，新的完整基线重新冻结，原 R0 结果不自动沿用。

本次不更新 Roadmap、不发送其他聊天。返程独立验收后提供给维护 Agent 的建议稿须包括：实际能力与版本、原始证据索引、未验证边界、失败、下一步实验建议；由维护者决定状态，不能写“R1 已完成”或“Jev 已节省成本”。
