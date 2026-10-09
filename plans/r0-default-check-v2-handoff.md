# R0 默认检查契约 v2：阶段性交付完成，限定内部试用

2026-10-09（Asia/Shanghai）。**当前可用范围的R0阶段性交付完成，限定内部试用；原正式真实模型/UI/业务及稳定性验收仍待办。** D1–D5实现及D6免费交接已交付，不表示F01–F14全部闭合，更不表示原正式验收通过。原持久故障仍开放，付费保持阻塞；新增真实模型请求0、费用0。接续未重建、重装依赖或重跑浏览器批次；未改产品代码、旧成绩、主工作区Roadmap，未推送或合并。

用户本轮接续授权覆盖免费开发收尾，计划文件中的历史“待审批”文本不要求再次授权。工作目录始终为 `/Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel`，分支 `codex/r0-default-check-v2`。

## 候选、构建和证据身份

- 基线 `d636d7e`；规划 `ea5f5ac`；主体实现 `d978bc958fc2193ed15c916205d1361b53dffd19`；最终产品候选 `27614b7a60293a80f3be7b321d164d3599dd0964`。新增只读验证工具提交 `fa10d9b8351c359459cdf1521d1f85353d3ee699`。交接提交以包含本文件的Git提交为准，产品候选不随文档提交改变。
- 最后产品修正：效果已测量、generic未结算时，先核对测量事件actionId；generic.actionId出现后同时核对，避免缺陷报告提前停止轮询。没有放宽完成门。
- 复用成功构建 `data/r0-default-check-v2/build-active-report-corrected.log`（约04:02）。最终API批次server SHA256 `d6d4042aa6b53607a9c1fada34dbcf4eb81788a0a0ce81ef10d42b9b2a21844f`；dist/server SHA256 `860d1356481f87a81169112c6935c1ae4f33d317ea6e4dc7409f82cc5d90792c`。二者仅sourceMappingURL文件名不同；两份source map各126份源文件逐字节匹配当前候选。未以较早构建时间冒充较晚新构建。
- server以packages external构建；锁文件、评分器、fixture、版本文件及dist全文件摘要在机器索引。历史安装依赖字节和Node版本没有完整独立证明；未来冻结仍需重核。此次离线工具使用现有Node24.21.0，无安装。
- 协议：url-scan-default-4 / bounded-ui-sampling-2 / default-check-contract-2 / public-effect-sources-1 / item-checks-2 / inspection-proof-4 / ui-check-report-2；工具29；评分ui-default-checks-3；fixture ui-contract-v2-fixtures-1。

## 实际验证结果

- 最终批次 `data/r0-default-check-v2/final-free-2026-10-08T20-46-41-537Z`：28个manifest场景均有终态，14 completed、11 blocked、1 cancelled、2 execution-error；后四类含预设负例，不能按“全completed”评分。历史进程exit code未保存，不补写“exit 0”。逐场景runId、维度、发现数、事件及动作数见delivery JSON。
- 73/73候选单测复用自d978bc9阶段，未宣称在最终HEAD重跑；最后产品差异集中在报告产物校验，另做真实事件回放。本次新增工具后的typecheck通过。
- 独立评分：6基线接纳、38篡改攻击全部拒绝。工具另带2个真实pre-generic发布窗口回归；独立评分器只导入Node标准库，报告回归使用生产校验器，二者不混称独立。回放元数据原先误写整个wrapper不导入生产校验器，已纠正，旧结果保留。
- 定向生产报告回归16/16（使用原始SQLite产物metadata）：active/settled正例、测量actionId错绑、generic错绑、缺派发、缺回执、缺反馈、缺页来源审查负例。无浏览器/模型启动。
- SQLite integrity_check=ok；28份冻结契约按报告真实投影一致；561份产物登记/下载副本/本地原文件均可读且字节一致。27个报告全部事件与库全等；取消行存在下述差异，审计命令故意以exit 1保留。
- 三个工作台场景真实POST各1次，无requiredChecks/脚本；健康空目标，partial及defect分别使用公开的非支持目标和明确效果目标。三者errors=[]、历史恢复成功；已查看现存三张summary截图，两维、未知和缺陷均可见。它们不是“空目标产生所有三类结果”的证据。

## 仍开放的具体差异与使用限制

**CANCEL-TAIL-1**：run `run-65c9ba02-1eb6-4d43-9ec9-2f0f9371b0e1`，原报告73事件是最终数据库74事件的精确前缀。数据库seq73于 `2026-10-08T20:47:24.134Z`（北京时间04:47:24）追加 `tool:finished` / page_act / error / cancelled，晚于run:completed及statistics。未见后续动作，状态仍cancelled/partial、proof不有效；这不是完整持久一致性通过。原报告与数据库不改写，F11/F13全闭合仍需诊断尾生命周期及独立的最终历史报告证据。本轮不凭此扩大修改既有取消/持久机制。

原持久故障另见 `plans/r0-persistence-repair-handoff.md`：根因、修复及独立关闭依据仍缺失。本轮成功不能关闭它；取消尾差异也不能被推断为旧故障根因。

通用检查完成只表示限定范围内证据齐备，不代表功能正确；无规格效果仍未知，明确要求未验证仍阻止完整完成。以下未覆盖项保留为后续验证事项，不因它们尚未闭合而拒绝本次限定内部交付；不得用历史测试数量、场景名或source-map相同推断全部通过。

## D1–D6实现与复用

| 项 | 交付与证据 | 保留界限 |
| --- | --- | --- |
| D1 | 新合同/政策/版本、普通入口；合同及展示单测、F13实际UI | 旧三协议与proof2/3历史UI未全部实际重开 |
| D2 | 有界来源、同item两维reducer、高级别名/late；F02–F05/F08 | 来源/入口攻击组合不是全穷举 |
| D3 | 原performAction接线、两反馈采样、一次派发、两次共享恢复；F01/F05–F10 | 有界真实页面与明确单测范围 |
| D4 | proof4、在线/历史产物校验、报告两维；F11–F13 | CANCEL-TAIL-1与F12部分子例未闭合 |
| D5 | 独立评分器、公开fixture矩阵、未执行manifest草案；F14 | 未来H0–B1整页矩阵未运行，未付费 |
| D6 | 本交接、机器索引、原始材料摘要、失败与复用映射 | 免费交付可审阅；不是正式准入 |

复用73项时明确它们来自主体候选而非本轮重跑；最后27614b7产品差异用本次报告回放补充。5f41285的66项相关测试、5项取消/未知写入回归、14个接口负例只作为计划已列历史背景，本轮未重新审计，不计入新proof4分数。candidate-final与final-legacy-guard仍是不同历史构建，旧默认12场景未重新评分。

## F01–F14实际覆盖与未覆盖

所有行均有范围限定；不合计成“14/14通过”。case名指最终批次对应report、artifacts和run；unit指unit-candidate.json中相应具名断言。

| ID | 本轮有效证据/已核对 | 未覆盖或限制 |
| --- | --- | --- |
| F01 | neutral-change, neutral-no-change, missing-operation, positive-probe；完整通用回执、有/无变化、零误报、缺派发及缺反馈产物拒绝；effects为空仍未知。 | 未逐一删除两次后态的每个字段；没有陌生网站泛化结论。 |
| F02 | explicit-pass, explicit-fail, explicit-unfinished, numeric-pass, numeric-fail；同item效果verified/failed+发现/unverified；未完成要求保持partial。 | 有界文本/数值场景；非所有现有谓词。 |
| F03 | numeric-pass, numeric-fail, advanced, explicit-pass, unrelated-program；原目标、页面公开数值声明、高级要求、自动规则来源；拒无关系/裸字面；源码/产物哈希核对。 | 伪造来源hash、跨run来源、每种多工具入口的真实API攻击未全部单列执行。 |
| F04 | unsupported-goal, late-source；无法编译目标与晚到来源保持gap；缺描述/截断/歧义、冲突/超12条及不删义务由单测覆盖。 | 分页遗漏、冲突/overflow没有各自真实浏览器场景；不把单测当实际页面证据。 |
| F05 | unrelated-program, incidental-clock；无关稳定段落不能核销效果；时钟变化不充当控件功能；不伪造发现。 | body存在、焦点、原本为真谓词与所有UI工具入口的交叉负例未全部覆盖。 |
| F06 | repeat, recovery-budget；重复本地click拒绝（2次实际派发是原click+导航）；混合purpose共用两次恢复，第三次seq101明确exhausted。 | 换checkRef/别名的全部API变体未穷举；没有重设预算。 |
| F07 | replaced-result, other-action, changed-evidence, explicit-pass；结果节点替换、另一动作、证据篡改保持未完成；合法动态新结果可验证；效果/动作错绑拒绝。 | 动作前控制节点替换、跨文档恢复未新跑v2专项。 |
| F08 | more-than-three, native, advanced；固定三项、未选不算通过、真实导航；单测覆盖小池全选、失败不换样、重访、池外高级要求。 | 部分选样边界仅宿主/ledger单测，未各跑真实API；沿用既有8候选/3页面上限。 |
| F09 | native, advanced, explicit-pass；原select的fill局部状态和按钮效果分开；高级明确结果槽与直接路径单动作取证。 | 独立文本input/其他native类型未单列新v2浏览器行。 |
| F10 | intercepted, positive-probe, neutral-no-change；拦截有supported发现；健康probe不抵操作；无反馈健康零误报。 | 不是所有物理拦截/规则组合；独立评分回放未纳入A2整页未来fixture。 |
| F11 | cancel, execution-fault, post-denied, changed-evidence；取消/执行错误/POST干预不变covered；proof4缺facet及缺产物拒绝。 | 开放CANCEL-TAIL-1：报告73事件、最终库74事件；未重跑旧持久失配，不能关闭旧故障。 |
| F12 | late-source, more-than-three；未闭合来源不能完成；缺页来源审查离线拒绝；已有proof4缺facet/取消否决单测。 | 未专门构造同响应末动作之后排队导航/新增来源、未结规则、伪造empty-source的完整API组合；此行部分覆盖。 |
| F13 | workbench, workbench-partial, workbench-defect；真实普通POST、三类报告和历史恢复，无脚本/requiredChecks；UI截图两维及未知；27/28报告事件与最终SQLite全等。 | 仅workbench健康行为网址+空目标；partial/defect使用公开目标；旧三协议/proof2/3历史UI未实际重开，旧合同/展示仅单测复用；取消尾差异保留。 |
| F14 | neutral-change, neutral-no-change, explicit-pass, explicit-fail, numeric-pass, numeric-fail；独立评分6基线接纳、38攻击拒绝：删样本/规格、伪造回执、小分母、全部unknown、无效发现和健康误报。 | 这是实际API证据的离线攻击，不是未来H0–B1完整fixture运行；A2/B1独立评分整行未执行。 |

## 失败保留与补测边界

- 原开发失败仍在：unit-second 53/54、sampling-v2 6/8、sampling-v2-corrected 7/8；随后sampling-v2-fixed 8/8和unit-candidate 73/73。失败名称与原错误全文保存在audit/unit-history.json。
- build-active-report-fix.log中的TS2304失败保留；corrected构建成功。不用成功日志覆盖它。candidate-free只保存2/28结果，dev-matrix为15/17、dev-remaining为12/17；均不补齐旧分母或拼入final分数，其他dev-*也全部留存。
- 本轮报告回归首次14/16：两个缺反馈样本实际被更具体的feedback-sample-bytes-mismatch拒绝，测试原先期待通用artifact错误；仅纠正测试的精确错误码，后16/16。原失败输出不改。
- 本轮首次证据审计直接比较不同投影导致28份contract误差，按源码确认budget位于报告根、integrity为派生字段后纠正审计；真实cancel事件差异仍保留，最终审计exit 1。没有将其改判为绿灯。
- 没有新API/Chromium批次；只读评分、最后产品修正正反回放、证据核对及新工具typecheck。没有重装或全量R0。

## 可直接使用的范围与启动方式

可用范围是受信单机、匿名有界的UI检查：普通网址/可选目标入口、通用操作证据、有限公开规格效果验证、partial/缺陷报告及历史查看。现有免费证据来自本地确定性provider→真实API/执行器/Chromium；不能把它扩写为陌生网站真实模型能力已验收。默认网址模式没有因此全局开启。

在本隔离目录使用已存在依赖和Node24，不安装、不重建现存dist。预览服务使用独立数据库，避免启动时reconcile旧失败库：

```sh
cd /Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel
export PATH=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH
PORT=4119 EXECUTION_URL_SCAN=0 DATABASE_URL=file:./data/r0-v2-internal-view.db pnpm start
```

打开 `http://127.0.0.1:4119`；这一步仅启动工作台，网址扫描保持关闭，启动本身不调用模型。不要用继承的真实密钥发起业务任务。用完Ctrl-C退出。

需要亲自重复一次**免费匿名有界扫描**时，在同一工作区另执行下面唯一场景入口（本次收尾没有再执行）：

```sh
pnpm exec tsx scripts/validation/r0-default-check-v2.ts internal-trial workbench
```

它只跑workbench一行：启动临时本地fixture和local-fixed确定性provider，以真实工作台“网址+空目标”创建一轮扫描，执行原工具链并验证报告/历史恢复；输出新的 `data/r0-default-check-v2/internal-trial-<timestamp>/`，退出时结束临时服务。会把源码打包到该新目录，不覆盖dist或旧材料；无需真实密钥/付费，也不是任意网站扫描演示。真实外部网站配真实模型的试用仍需另行决定配置与费用，本交付未授权或执行。

| 报告信号 | 应如何理解 |
| --- | --- |
| completed / covered / proofVerified=true | 限定必需检查已结算；还要看功能未知和缺陷数，不代表功能都正确 |
| blocked / partial、来源或必需效果未验证 | 没完成；保留原因，不通过改目标/补点/自动重跑洗成成功 |
| completed / covered 且有failed效果、supported finding | 可以是证据完整的真实缺陷报告；不能当健康通过 |
| cancelled / execution-error / interrupted 或proof无效 | 不具有完整完成结论；停止相应路径并保留证据 |

## 简短风险分级与后续事项

本次只根据已有材料分级，没有追加全面审查。现有负例中没有确认仍能绕过的误报完整成功、越权POST、原控件动作重放或效果action错绑；这只限定于已测路径。若实际出现任一情况，立即阻断对应能力，不能用“阶段交付完成”豁免。

| 事项/证据 | 影响及当前处置 | 再触发或升级条件 |
| --- | --- | --- |
| **高：真实历史持久故障**，原seq49现场 | 根因未明，不能承诺持久可靠性或无人值守连续运行；允许隔离的单次内部试用和人工核对，保留失败停机/隔离、不自动重放 | 第一次写入/独立读回失配、产物未登记或终态丢失时停止服务任务；另行使用现有捕获工具，不碰运气重跑 |
| **中：CANCEL-TAIL-1快照尾差异** | 两边cancelled，唯一迟到事件是取消工具诊断，未见实际后续动作；影响该保存报告的完整尾一致性，不据此断言严重数据损坏，也未修复 | 出现迟到真实动作、状态/义务变化、取消被误报完成，或需要精确最终历史审计时定向处理 |
| **后续证据：F子项未覆盖** | 与已知缺陷分开；不宣称闭合，不作为本次内部交付无限前置条件 | 触及相关来源/工具/导航代码、扩能力或出现对应问题时，只补对应定向案例 |
| **待办：原正式真实UI/业务验收** | 没有运行新付费阶段，没有passed；保留UI15/业务5+45的原计划及累计账本 | 维护者决定推进、稳定性准入/冻结具备且获得新的准确付费授权后再执行 |

遇到持久失配时，先停止新任务提交；仍active的run可请求一次取消，保持隔离，不自动重放。重启或强制终止前尽可能保留runId、日志、原数据库及实际存在的 `-wal/-shm/-journal`、产物、报告/事件快照、版本与配置摘要。活文件复制注明非原子，不能删除、checkpoint、清理或覆盖原库。收集可得现场后如服务仍接受任务就停止该本地服务；不通过换库、清状态或重启来绕开隔离。现有 `scripts/validation/persistence-diagnosis.ts` 和 `scripts/validation/support/persistence-trace-hook.mjs` 留给另行选定的诊断运行，不自动重新启动原失败现场。

## 材料、再核对入口与后续闸门

机器索引：`plans/evidence/r0-default-check-v2-delivery.json`。原始大材料仅在本机 `/Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel/data/r0-default-check-v2`，**未随Git提交**；最终批次约23.44 MiB。`data/r0-default-check-v2/audit-2026-10-09T00-36-06-518819Z/final-batch-inventory.json`逐文件登记最终批次；`data/r0-default-check-v2/audit-2026-10-09T00-36-06-518819Z/inventory.json`登记此前全部开发尝试的路径/大小/SHA256。inventory是时点快照，后续收尾文件另在delivery中列摘要；不是已上传的压缩包。

`runs.db`产物路径指向工作区 `data/artifacts/<runId>`，最终批次已带逐场景下载副本。换机需取得真实文件并显式重映射只读回放路径；仅取Git/摘要不够。没有删除原始产物，故意篡改的changed-evidence源字节也原样保留，字节副本一致不等于其语义有效。

需要复核时在本隔离工作区使用现有Node24及依赖（默认无需重复运行）：

```sh
pnpm exec tsx scripts/validation/r0-v2-score-replay.ts data/r0-default-check-v2/final-free-2026-10-08T20-46-41-537Z
pnpm exec tsx scripts/validation/r0-v2-report-regression.ts data/r0-default-check-v2/final-free-2026-10-08T20-46-41-537Z
python3 scripts/validation/r0-v2-evidence-audit.py data/r0-default-check-v2/final-free-2026-10-08T20-46-41-537Z
```

第三条在当前保留材料上预期报告CANCEL-TAIL-1并exit 1；不应为了绿灯改原材料。所有工具产生新目录，原证据不覆盖。

本阶段交付不再追加追查、产品补丁或批量测试。后续按风险或路径变动补相应证据；若推进原正式稳定性验收，仍需旧持久故障的独立关闭依据、冻结候选/构建/依赖/公开来源/fixture/配置/价格及新的明确付费授权。草案仍是diagnostic6/UI15（健康9、异常6），后续业务5/45不变；本轮没有运行或授权这些阶段。
