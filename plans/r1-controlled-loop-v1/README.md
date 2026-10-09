# R1 受控执行闭环：本批统一交付

限定免费闭环批已实现并有实际浏览器证据：程序读取当轮页面候选，经原工具入口执行、测量、更新原检查账本，再继续或有界交回。六个本地场景三组共18轮，加1个取消反例，该批模型均为明确固定替身。随后单独授权的一次真实请求结果如下。没有默认启用、push或合入main。**不宣称真实Jev收益或R1阶段验收完成。**

本文件是本批唯一交付入口。旧8状态离线建议与零分母结果是历史证据，本批不改写、不用它们替代执行闭环结论。

## 2026-10-09：唯一真实请求已执行并停止

用户经维护会话对“1请求、5问题、预留US$0.003”回复“好”，授权转达及24小时执行窗口已记录；该窗口由维护者指定，不冒称用户原话包含有效期。原冻结源码/请求未改，干净隔离checkout固定`6acae6e`，从`187c3e1`原字节复制输入。凭据仅从已有本机配置私密传给CLI子进程，未复制.env或输出密钥；未作额外凭据探针。

**本条真实协议兼容性通过**：2026-10-09 05:52:25–05:52:26 UTC，现有frame-cli唯一派发返回HTTP200，`typesafe/jev-1.13-20260917` / `TypeSafe`，5题完整。全frame、候选映射、wire、attempt与持久账本一致，从原始响应重新运行normalizeResponse，与保存回执一致。请求attempt=`88d0b618-00f2-4733-b502-9f593ff5768a`，provider响应ID=`gen-dec-1791525146-gkzNmoxdJdgOrusgGrbd`。

- 实际usage：输入5972、输出125 tokens；服务报告 **US$0.000250824**，与5972×0.042/M一致。已结算pending=0、reserved=0、overrun=false；原预留0.003。未用差额0.002749176不是追加调用授权。
- readiness原答`scoreable`，概率0.90、confidence 0.85；重算回执为scores。既有readiness阈值0仅诊断用，未经过质量校准。
- 同一公开frame上，纯程序顺序Other→Reveal；Jev评分后顺序Reveal→Other。归一化relevance/informationGain分别为Other约0.210/0.333、Reveal约0.963/0.740。这是单状态描述性结果，符合公开目标对Reveal的点名，**不是检查推进或排序收益证明**；Other仍有generic义务，不能永久丢弃。未执行任何新浏览器操作。
- 真实请求1、重试0、补调用0、主模型调用0。持久claim已消耗，保留在原R1工作区共享授权目录及证据副本；隔离checkout通过同一目录避免新工作区重置授权。

[机器结果](paid/real-result.json)与总索引`realExecution`对应；原始响应在`artifacts/r1-controlled-loop-v1/real-semantic-frame-1/campaign/response.json`的`responseText`中，账本、prepared/dispatch、claim、授权、命令及离线重算脚本均列入总索引。实际命令退出0，离线审核退出0。未补跑免费测试或浏览器批次，未恢复其他付费批。

本次到此停止。真实收益尚未验证；本条通过不等于所有服务场景验证、评分实验或完整R1完成。

## 源码与身份

- 分支 `codex/r1-jev-closeout`；工作区 `ui-sentinel-r1-jev-closeout-20261007`。
- R0固定基线 `60c315a04e30b84356381763e33dd976a3ace836`；原R1 `e5b39f764313aade8380ee8fde10b5e9b9d6d1b3`；隔离合并 `8d0ecb6`（保留无共同祖先的两父历史）。未修改R0原工作区。
- 实现链 `5903c41` → `bcae181` → `48116e8` → `e95bd2a` → `c390ba4`；最终运行/测试源码 **`6acae6edd91ffebd020ff3dd90174bbb3d7a30b4`**。
- 取消反例来源 `c390ba45e6626f995ad06e150d53aa62e6bfeed5`。与6acae6e只有host测试文件差异，运行源码相同。
- 最终三组及取消服务构建 SHA-256 均为 `fe1021ed00c6f3b803642410130e5db58abdbf2c5dcd87e26f612111151f3058`。逐构建142项source-map内容均与记录提交一致；不是靠目录名判断最新版本。
- 本次收尾只新增证据核对脚本、索引、冻结请求和文档；不改既有运行实现、不重跑整批。

[机器证据索引](evidence-index.json)逐行给出19轮的源码、构建、原运行配置、runId、实际动作、工具调用、检查计数、主模型替身请求、耗时、报告及附件摘要。[原执行前契约及修正记录](CONTRACT.md)保留当时冻结和失败演进。

## 实现及最小共享接口

| 文件 | 本批职责与边界 |
| --- | --- |
| `src/agent/exploration/integration/host.ts` | 当前公开frame、确定性选择、禁止重放原动作、一次只读恢复、有剩余事项/原动作/checkRef/DOM/证据的交回 |
| `src/execution/experimental-decision-host.ts` | 进程内显式安装；默认无host、无扩样窗口 |
| `src/execution/executor.ts` | await前后核对ObservationVersion，验证原工具schema/activeTools，再走原串行工具；不新增完成证明 |
| `src/agent/model/request.ts` | 程序工具复用原AsyncLocalStorage attempt与取消/超时守卫，不伪造模型请求 |
| `src/agent/exploration/integration/jev.ts` | 完整公开frame编译；2–3候选、最多7问题、32768字节；超限拒绝，不截断事实 |
| `src/agent/decisions/jev-provider/http.ts` | 仅新增可注入编译函数，默认编译不变；复用原审计传输 |
| `scripts/r1-jev-real/frame-campaign.ts`、`frame-cli.ts` | 请求前持久预留、原始回执重算、完整状态绑定、unknown停止、精确一次授权入口 |
| `scripts/r1-controlled-loop/` | 本地fixture/API/固定provider验证、证据只读索引；不接默认生产路由 |

连续探索的真实接口缺口是：R0冻结初始选样后可能自动covered收尾，额外候选缺少WorkBound而拒绝。实验三组共同显式安装同一扩样窗口：原选中义务无gap、至多一个新local事项、单项准入；原 `admitOptionalScope` 核对1动作、4调用位置、4工具+4模型时限，另留2调用和20%时间收尾。通过后用已有advanced选样接口并重新observe/reviewSelected。5秒工具/模型时限下需52秒，仍受原60秒剩余预算约束。拒绝仅尝试一次后交回。

这是一项需要后续单独集成评审的**实验执行器依赖**，不是声称R0原接口已天然支持任意扩样。原action权限/目标绑定/网络副作用/预算/检查语义仍由执行器裁定。`network`、`inspection`、`inspection-host.ts`、`docs/product-roadmap.md`相对固定R0无改动。尚未验收任意多级扩样、导航、业务写入或通用恢复；单一role/name无法唯一绑定时也不能猜测点击。

## 六场景三组：按实际运行解释

每格为“实际动作数 / 主模型固定替身请求数”。三组使用相同fixture源码、goal、6动作/12模型额度/60秒；budget均1动作。每组隔离cwd、数据库、证据、浏览器上下文和loopback端口。API服务二进制一致，仅实验模式不同。Agent组也使用固定策略生成工具调用，经完整模型传输路径；**不是现有真实Agent的能力基线**。

| 场景 | Agent固定路径 | 纯程序 | 程序+固定Jev | 实际结果（三组一致） |
| --- | ---: | ---: | ---: | --- |
| healthy | 1 / 1 | 1 / 0 | 1 / 0 | completed；generic已收集，无功能预期时保持effect unspecified；无发现 |
| semantic | 2 / 2 | 2 / 0 | 2 / 0 | completed；真实动作后required effect verified=1 |
| expanded | 2 / 3 | 2 / 0 | 2 / 0 | Reveal→Continue；公开要求Ready，测得Wrong；required effect failed=1、finding=1 |
| recovery | 1 / 4 | 1 / 1 | 1 / 1 | blocked；一次page_inspect及一次interaction_verify后effect仍pending，不重放动作 |
| late | 1 / 2 | 1 / 1 | 1 / 1 | blocked；晚到声明使source unresolved=1、effect pending=1，交回 |
| budget | 1 / 2 | 1 / 1 | 1 / 1 | blocked；generic incomplete=1，动作未越过1次上限 |

`completed`表示既定检查范围有结论，不表示页面健康。expanded的失败是**实际发现的fixture问题**，不是接线失败。后三种blocked是本批预期的partial结论；尤其恢复场景证明的是有界恢复失败及交回，不能写成“恢复成功”。程序与固定Jev剩余3次主路径请求是交回后的固定run_finish。

主路径固定请求合计14 / 3 / 3；固定Jev只在semantic调用一次（2候选、5问题），其他场景无评分请求。报告耗时总计约13.973 / 13.940 / 13.913秒，仅是本机各一轮接线观测，不能报告真实模型节省率、时延优势或成本下降。已核对expanded的截图、effect measurement、generic receipt以及原actionId/checkRef对应。

取消单独复用semantic fixture：program派发1动作后收到cancel；最终cancelled、无完成动作、取消后无新派发，未完成范围保持。它是第19轮定向反例，不混入六场景平均值。

## 证据选择、验证及缺项

最终18轮唯一来源：`artifacts/r1-controlled-loop-v1/frozen-agent-fixed/`、`frozen-program/`、`frozen-jev-fixed/`；取消来源`cancel-bound/`。各identity中的arms/scenarioCount是脚本常量，**真实运行分母取results/report**。索引包含逐份报告引用的附件，receipt/measurement引用均能定位；不依赖原运行数据库或开发者绝对路径。

以下早期结果完整保留但不混入最终统计：

- `free-5903c41`：自定义目标来源未解决及旧ref失效，出现真实execution-error后停止；后续版本修正。
- `program-fixed`：扩样接口前，expanded只操作一次；旧budget场景亦不同，不能算闭环通过。
- `agent-final`、`jev-final`、`expanded-final`、`budget-final`：源码48116e8，扩样WorkBound未补齐。名字中的final无验收含义。
- `expanded-admission`：e95bd2a仍被冻结选样拒绝，真实execution-error；c390ba4改用已有advanced入口。
- `expanded-bound`：c390ba4的有效两动作定向结果；最终比较统一使用6acae6e，不重复计数。

复用定向验证：host+frame campaign共15项通过、默认HTTP精确请求回归1项通过（39项明确跳过）、类型检查通过。日志位于索引所列`targeted-final.log`、`default-transport-regression.log`、`typecheck-final.log`。未跑完整免费套件、71任务或72轮对照。本次新增只读核对：

```sh
python3 scripts/r1-controlled-loop/index-evidence.py
```

核对19报告及相同构建、配置、动作/回执/附件、取消、恢复和固定Jev费用账本，退出0。原验证日志未内嵌argv/SHA，索引对此明示；复现命令按已运行测试选择恢复，退出码来自当时工具完成记录。运行报告lockHash=unavailable，索引补的是Git锁文件摘要，不冒称当时安装证明。运行版本Node24.21.0、Playwright1.63.0、Mastra1.67.0；已有pnpm10.17.1环境。未新增依赖。

**仍缺的能力证据**：真实服务更多场景、正式评分实验、真实Agent三组执行；成功恢复；更广泛产品场景与独立质量参照。单条真实兼容及少量固定fixture不证明自主调查、泛化发现、误报漏报率、覆盖收益或生产性能。未运行场景不记为通过。

## 真实入口与已消耗的一次授权方案（原冻结记录保留）

真实full-frame路径是R1独立费用入口，**不经过R0主模型request-stop入口**，不借用R0停止结论。已复用R1持久campaign ledger及审计HTTP：dispatch前fsync reserve；响应attempt/digest核对；从原始JSON重算readiness和scores；账单unknown保留0.003预留并停止，取消/过期/错误不能生成迟到有效建议。定向测试的unknown与abort均验证pending=1、第二次decide不再fetch；其余涵盖原始readiness、缺键、过期、超限不截断、未授权不读密钥。固定浏览器Jev那一次的prepared/dispatch/raw response/ledger均在索引内，真实HTTP=false。

已冻结 [具体小批方案](paid/proposal.json)、[完整frame](paid/frame.json)、[准确wire](paid/request.json)、[源码/请求冻结](paid/freeze.json)。只复用本批semantic第一次评分状态，不重复旧六次兼容试跑：**1请求、5问题、12171字节、15秒、0重试、禁fallback，总预留USD 0.003**。免费交付时只执行`--freeze`、HTTP0；其后新增授权和实际执行记录见本页顶部。proposal原来的not-granted/0执行字段是原冻结提案快照，不改写历史，当前状态以real-result为准。

2026-10-09核对官方依据：[TypeSafe模型说明](https://docs.typesafe.ai/models)给出64k总请求、32k state+最长问题、输入USD0.042/M及输出免费；[多问题说明](https://docs.typesafe.ai/patterns/fan-out)支持一请求多问，未宣称官方硬问题数上限；[OpenRouter价格](https://openrouter.ai/typesafe/jev-1.13)一致，[Decisions协议](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)支持现有endpoint和结构。按公开接受请求上界64000×0.042/1e6=0.002688，向上预留0.003。精确token数未知；这是按公开单价/上下文的合理预留，不是供应商异常扣款的绝对保证。超收如实记overrun并停止，不填零。真实模型/供应商版本及完整5题仍须实测，不能修改verified标记放行。

原授权要求：仅此freeze hash `6244d47af1e4e2e68de86b0e4518e656060b76e4ca2626af400aa90cbd4bb7cc`、1次、0.003美元、批准人/授权出处/有效期。已收到对应授权并执行，approval与claim完整保留；不得使用本文件或原有效期再次派发。

以下保留执行方式供审计，**本次已执行，不再运行**：在干净隔离checkout **6acae6e完整SHA** 中离线安装锁定依赖，从187c3e1取`paid/`到未跟踪的本地输入目录，私密加载key后调用：

```sh
# 仅在收到上述对应授权后；R1_JEV_API_KEY由本机私密环境提供，不写入文件/日志
pnpm exec tsx scripts/r1-jev-real/frame-cli.ts --run local-input/frame.json local-input/freeze.json local-input/approval.json artifacts/r1-jev-real/authorized-frame-1
```

CLI核对源码、packet、wire和授权摘要后才读key；固定claim目录防同一授权改输出目录重用。不要清除claim或换工作区重复该授权；它不是跨机器共享费用锁。运行前复查价格及模型协议若已变则停止并重新冻结，不能偷偷改变本次请求。

兼容通过条件：真实5题结构/模型/provider符合、账单known且不越预留、回执/候选/状态/派发账本完全对应。之后复用同一响应做**一个描述性评分观测**：Reveal有公开指定效果，Other仍有generic义务，允许并列；不能由此宣布评分实验通过。失败或无增益即保存结论停止，不自动追加调用。

真实三组整轮仍需另外冻结实际Agent模型/费用、在线动态frame授权和多次campaign配额；当前免费server-entry只支持固定模式，one-frame CLI也不控制浏览器。这些是正式对照前的明确剩余项，不能把本次1请求授权扩为执行器授权。后续沿用六场景、同预算/同执行器，预先固定有效发现、误报漏报、义务覆盖、主模型调用、总耗时/总费用及停止条件；本批不启动。

## 本地材料与状态更新

源码、fixture、锁文件、文档、paid输入及索引在Git；二进制/日志/截图等证据保留在本工作区被忽略的`artifacts/`。跨机器复核应携带索引`files`列出的全部相对路径，逐项核对SHA-256；无需整个data目录、数据库、browser profile或密钥。绝对路径映射在索引`pathMapping`；缺附件应判“交付不完整”，不能猜测。当前任务按要求只本地提交，不另打压缩包。

供Roadmap维护者使用：

| 完成声明 | 本批状态 |
| --- | --- |
| 免费开发完成 | **本批限定受控闭环完成**，18轮同构建执行+取消反例、定向免费验证有证据 |
| 真实协议验证完成 | 本条冻结frame兼容性通过；不扩大为全部服务场景通过 |
| 评分实验完成 | 否；固定评分只验接线，真实收益未知 |
| 探索闭环完成 | **最小受控local闭环已证明**；不等于通用产品探索/成功恢复全部完成 |
| R1阶段验收完成 | 否；真实三组、产品出口及独立质量证据仍缺 |

默认启用建议：继续关闭，只在明确安装实验host的隔离进程运行。本批在此停止；不为得到Jev收益扩大调用或无限修复。Jev无收益可以结束其实验，程序探索能力按自身证据单独判断。
