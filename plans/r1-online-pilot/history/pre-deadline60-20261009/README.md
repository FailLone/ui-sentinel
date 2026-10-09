# R1 正常产品候选与统一验收入口

2026-10-09。**修复候选98f7854的获准续验在首行因主模型超时/transport-error停止，产生新增unknown USD0.063；未重试，其他27行未运行。本期R1尚未验收完成，不能建议合入。** 先前发现的歧义缺陷已免费修复并定向验证；本次没有足够真实执行证据判定修复后的产品出口。program/Jev关闭的选择及后置S1/S2、72轮研究范围不变，当前阻塞是未结费用和未完成的真实产品验收。

## 最新获准续验：超时停批与未结费用

用户在维护者会话听取具体提案后回复“ok，继续”。[授权记录](product/recovery/authorization-record.json)忠实保留上下文和原先“批准本次验收及旧未知费用风险”的接受；金额来自明确提案，不伪称用户逐字复述。批准绑定98f7854 / manifest f7fa8326db127c1821cc038e50f65e5c02bd68989cb36ba42fa95e05a3e6abc9，期限至北京时间2026-10-10 21:58，不含再次付费补跑。

2026-10-09 21:59（北京时间），C10-1的1次Agent请求 `1e9f2f841ecebbaa0b06a09d` 已派发。原模型记录15004ms超时，网关约14960ms记录downstream-disconnected，未保存response headers、stream事件、usage或generation ID；之后transport-error停批、取消运行。实际动作0、Jev/视觉0，报告cancelled/persistence=not-final。完整[28行审计](product/recovery/paid-20261009/audit.json)记录：0行通过，C10-1因超时未完成，其余27行未运行。它不是新增false-covered的实证，也不是修复通过。

| 费用事实 | USD |
| --- | ---: |
| 本次已知费用 | 0（没有usage；不表示实际免费） |
| 本次新增unknown预留 | 0.063 |
| 前一产品失败批已知usage费用 | 0.00502455 |
| 最早失败批unknown预留 | 0.053 |
| 累计unknown预留 | **0.116**（2个未结请求） |
| 关联记账合计 | **0.12102455** |
| 另加历史已结frame 0.000250824 | 0.121275374 |
| 实际总费用 | **未知** |

[账户/停止记录](product/recovery/paid-20261009/accounting.json)与原请求、8份附件均已核对，held预留为0；旧41份证据和前一产品失败批固定摘要不变。本次新的product continuation claim已合法消耗，所有旧账本/claim/停止状态保留，不清unknown、不改成零、不重建账户绕停。原始本机文件及摘要见[清单](product/recovery/paid-20261009/raw-local-files.json)，未上传。

本地诊断只能确定15秒原冻结期限到达，不能区分供应商延迟、传输故障或响应验证缓冲耗时。runner在释放响应前读取完整副本验证，因此网关receivedBytes=0不能证明上游没有传来任何字节。无新产品实现缺陷的可核实依据，本次不猜测修改产品代码、不延长超时、不换模型/provider、不额外调用。取消后的未最终验证报告是停止的后果，不拿它制造第二个产品缺陷结论。

当前明确停在**新增unknown与真实验收未完成**边界。没有可依法核对本次费用的generation ID或账单回执，不伪造对账；现有授权明确要求遇新unknown停止并禁止额外补跑，不能因有效期未到或预算剩余继续运行。后续需有权账单/回执厘清新增费用，或对新增风险和具体后续批次另行明确裁定；本交付没有发起第三次付费批次或新增风险批准申请。后置评分实验不构成当前阻塞。

## 前一产品批次硬失败及已完成的免费修复

原批准绑定 `ddf1dd9` / manifest `41eb23e34527461bae8bc50e6d0b28ae53d94bb584d8d167b7eddecedbfcf510`。2026-10-09 21:40（北京时间）通过正常API实际运行 C10-1：4次Wafer Agent请求均HTTP200、有真实usage和response ID，Jev/视觉0。真实兼容请求已成功，但不能据此断言历史400根因。程序检测同名歧义并交回后，Agent先观察/读取详情，再通过investigation_run的唯一CSS目标分别点击两个Open按钮；实际2动作、最终completed/covered，不符合冻结的0动作/合法交回要求。原测量链存在并不使这一完成结论合法。验收器标记falseCovered并停止，未发生付费重试或补跑。

[28行逐项与审计](product/paid-20261009/audit.json)：C10-1失败，其余27行全部因首行硬失败未运行，**不计为通过、也不计为模型质量失败**。[原批汇总](product/paid-20261009/summary.json)的fullRealAcceptancePassed=false；这是原批最终事实，之后的免费修复不回写原批。

四份供应商usage.cost相加为 **USD0.00502455**，与新账户4条settled记录逐条一致；无新unknown/held。账本priceSource字段为gateway-estimate，但此次金额直接核对了供应商usage.cost，不冒称独立正式账单。加旧unknown USD0.053，关联记账 **USD0.05802455**；另加历史已结frame USD0.000250824为USD0.058275374，总实际账单仍未知。原41份失败材料/原DB/claim/锁摘要不变；本次已合法消耗原一次性continuation claim，新产品批账户保持停止，不能重复使用旧批准、claim或换账户绕停。

根因是planner handoff没有约束原执行器，也没有记录持久缺口。修复在公共performAction入口拒绝本运行的歧义后动作，覆盖page_act及investigation_run；同时记录原检查账本的永久缺口。此有限版本在公开目标/结果歧义交回后只允许只读调查和partial收尾，唯一选择器不视为已消歧；不新增自动恢复动作权限。

[修复核对](product/recovery/evidence/audit.json)：本地替身主动尝试直接点击和investigation点击，两次均到达共享拒绝门，实际0动作、原歧义缺口保留、blocked；三步健康、恢复失败、预算不足三条相邻路径定向复验通过。11项受影响测试及完整build/typecheck通过；首轮新增测试类型注解错误的日志保留。另一次runner免费自检漏传行筛选，误启动较大范围，发现后停止：21行判定通过、C08-2因人工停止执行错误、6行未运行；这是额外工程执行失误记录，**不是完整通过或付费证据，不并入必要回归覆盖数**，未使用真实凭据或canonical claim。没有因此再重跑套件。


[机器索引](evidence-index.json)记录源码、逐项结果及证据摘要；[当前任务](CURRENT-TASK.md)维护交接状态。原入口已原样归档到 [pre-product-20261009](history/pre-product-20261009/README.md)，旧失败、旧候选及旧九行 manifest 没有覆盖。2026-10-09 维护者转达用户认可的本期范围裁定，已同步[当前完成计划](../r1-completion-plan.md)；裁定前文档原样保留在 [pre-scope-20261009](history/pre-scope-20261009/README.md)。范围认可不构成费用或未知风险批准。

## 冻结身份与普通入口

| 项目 | 当前值 |
| --- | --- |
| 修复候选源码 | `98f7854472c3df9e3baa913ab3e74f97d8cff3c7` |
| 已停止的真实批次源码 | `ddf1dd943f238dc71c2d3e4e6ef327e1ba44c2db` |
| 已整合 main | `48b02b3fbfe7e5d95189a0d813480761b123ff6b`，合并提交 `3cabb048b1d98609ec25d16756364b2f1b58761b` |
| 本地分支/工作区 | `codex/r1-jev-closeout` / `/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007` |
| 已停止批次 manifest | [product/manifest.proposed.json](product/manifest.proposed.json) |
| 已停止批次 manifest 对象摘要 | `41eb23e34527461bae8bc50e6d0b28ae53d94bb584d8d167b7eddecedbfcf510`（JSON.stringify 对象摘要；文件字节摘要另见索引） |
| 原付费授权状态 | 已执行并因硬失败停止，不能再用；[授权原文/来源](product/authorization-record.json)、[正式批准文件](product/approval.authorized.json)；有效至北京时间2026-10-10 21:35，空草案保留为历史拒绝证据 |

原ddf1dd9运行区和证据保持原样；修复为新的98f7854候选。后继文档提交不替代各批精确源码绑定。只将 main 接收到 R1 分支，没有 push 或将 R1 合并回 main。D001/D002 交付和其文档更新均来自维护者 main；此次 main 增量除 executor 的 R1 接点外，21 个文件与 main 逐字节一致，见 [整合核对](product/evidence/main-integration.json)。DNS、D005/R005、新规则观察/报告接线保留，D004 默认关闭；未重跑 R0 或全规则矩阵。

在原工作台选择“网址 UI 检查”，勾选“R1 有界探索”即可使用。普通 `POST /api/runs` 示例：

```json
{
  "kind": "ui-scan",
  "entryUrl": "https://example.com",
  "exploration": { "mode": "program", "jev": false }
}
```

省略 exploration 时维持原默认行为。运行快照固化策略，客户端不能扩大限制：同页最多 3 个局部检查、最多 24 个程序步骤、2 次返回/刷新额度，且仍受原执行器动作、时间、导航、权限及收尾预留约束。返回/刷新目前只接受明确的有限目标 `检查公开控件后刷新页面` 或 `访问详情后返回上一页面`（英文同义句见源码）；前者重新导航当前 URL，后者重新访问实际观察过的同源 URL，不承诺恢复浏览器历史栈或登录会话。

实际产品 host 已调用 `planNext`、`assessStrategies`、frontier、公平性、trajectory 和反例调查规划。目标身份绑定实际 document/DOM 节点，公开相关状态变化后重新登记原检查项；DOM 引用过期、歧义或不支持的上下文会交回。多步操作仍使用原 page_act/checkRef/item/action/measurement 链，只有已完成的真实动作和原始测量才投影成已测路径。报告显示操作顺序、前后状态、策略、未探索/遗漏项、交回原因、模型调用和原证据链接；历史重载投影一致。

公开输入边界限于原生 text/search/textarea 的 `maxlength`（0–256）；根据公开约束尝试 max+1 并记录浏览器实际值。number 类型、影子 DOM、无法可靠绑定的画布等会交回。恢复只调用已有只读检查/验证，不重放未确定副作用。预算不足、恢复未决和无法绑定的返回目标均保留原缺口。

Jev 另需请求 opt-in 和部署显式配置 `EXECUTION_R1_JEV=1`、`R1_JEV_ACCOUNT_DIRECTORY`、`R1_JEV_LIMIT_USD`、`R1_JEV_API_KEY`。缺配置的请求入队前被拒绝；账户必须预先存在。只读检查旧 stop/unknown 后才可取得 lease/报价/凭据，不新建隐式收费账户；使用已有 campaign 账本、TypeSafe only/no fallback、有界 frame、最多 2 次评分，并占原运行模型/时间额度。显式目标、唯一候选、已由公平性决定的选择不评分。评分响应必须精确匹配 frame/hash/binding/候选，之后仍重新检查 eligibility。新 unknown 或费用超限立即停止。免费协议/账本测试通过，但本轮没有真实 Jev 调用，也没有真实收益结论。

## C01–C12 免费证据及边界

下表来自真实浏览器和普通产品入口，模型服务固定只返回 `run_finish(unverified-scope)`，从不提供动作或答案。fixture 私有名称不放入产品 URL（中性 `/sample-NN`）；产品只读取公开页面。`completed` 是运行收尾状态，不等于所有页面功能健康。

| 条件 | 免费观测与证据边界 |
| --- | --- |
| C01 菜单健康 | 1 动作，1 个 required effect verified，0 supported 误报。 |
| C02 标签异常 | 1 动作，1 个原 effect failed、1 个 supported 发现，保留选择状态/内容测量链。 |
| C03 公开输入边界 | 1 次填入；maxlength=3，请求 4 字符，原 generic receipt 两次实测均为 `xxx`，0 误报。功能 effect 保持 unspecified，不伪称业务健康验证。 |
| C04 返回/刷新/公开视图 | 刷新 3 动作，返回 2 动作；实际导航凭据、新 document 和重新登记的原检查项成立。健康视图切换 3 动作、2 个 verified、0 误报。另有视图缺陷对照 1 verified/1 failed，以及无法绑定刷新 0 动作、原义务未决。限匿名公开视图，不代表登录角色切换。 |
| C05 三步缺陷 | 中性任务下连续 3 步才暴露异常，原 effect failed=1，supported=1，完整原动作/测量路径。已达到同页 3 项上限，不虚构额外替代路径调查。 |
| C06 匹配三步健康 | 普通工作台发起，同样 3 步、verified=1、0 误报；报告重载后路径/测量一致。 |
| C07 公平性与反例 | 实际顺序 Primary → Secondary → Quiet control；低优先级项得到检查，failed=2、verified=1；失败后执行同角色候选对照，未增加同页采样额度。 |
| C08 滚动/裁切同页 | 2 动作，原 D001 产生 1 个有证据裁切发现；正常滚动无 supported 误报，超出有限规则范围的 unknown 保留。D002 无额外误报；没有宣称规则完整矩阵重验。 |
| C09 重复/新状态 | 同控件两次动作，相关新状态后重新检查，verified=1/failed=1；额外状态循环例 2 动作后去重停止。 |
| C10 同名歧义 | 0 动作、有界交回、blocked，无任取第一个匹配、无虚构发现。 |
| C11 无法可靠恢复 | 1 动作后保留 1 个 pending effect，有界交回、blocked，不重放副作用。 |
| C12 预算不足 | 上限 1 动作，实际 1 动作后 blocked，原缺口保留，无假 covered。 |

[逐项摘要](product/evidence/product-results.json)去重后为 **17 个场景、13 completed / 4 blocked、31 个动作、4 次本地固定模型响应、真实调用和 Jev 调用均为 0**。这里的 blocked 是预注册边界处理结果，不被改写为健康通过。正式产品验收使用其中 14 个子项（C04 分三项）各两次；其余免费反例保留为工程验证。

主要浏览器套件的源码为 `26bd797`（16 场景）；其后修正 CLI 导入副作用、D004 测试实际 ID，收窄 native input 类型并增加健康视图对照。最后 3 条受影响浏览器路径在 `575bfbc` 加记录中的 diff 上通过，相关改动提交为最终 `ddf1dd9`。不是在最终 SHA 上机械重跑全部套件：最终源码完整 build（含类型检查、普通服务端/工作台/两个靶场）通过，最终 evaluator 离线重验 14 个验收子项和 **800 份附件**全部通过，详见 [离线核对](product/evidence/offline-candidate-evaluation.json)。所有 17 场景附件均核验摘要，D004 的实际 ID `image-shape-distortion` 未启用。

定向测试累计 **232 个不同测试的最新结果通过**。来源为 23 文件 231 项中首轮 230 通过/1 失败；失败仅为新增测试夹具遗漏未验证导航必需的 reasonCode，修正后所在文件 24 项通过；最后新增的数字输入边界测试及受影响文件共 5 项通过。重复通过不重复计数，见 [首轮](product/evidence/final-targeted-tests.log)、[夹具修正复验](product/evidence/inspection-host-recheck.log)、[边界复验](product/evidence/boundary-final-tests.log)。另含共享规则接线/布局观察的必要定向验证，没有旧矩阵重跑。

正式验收 runner 自身的 `--free` 还通过 C10-1/C05-1：普通 API、原 gateway/账户、实际 runId 显式绑定、附件导出及 evaluator 均可用。固定替身费用为 0，不消费 canonical 风险 claim。这两行是 runner 工程证据，不算两行付费验收完成。轮询持久报告竞态、旧 manifest 导入副作用、健康视图未产生可绑定变化等中间失败都留在本机 data 与关键日志中；修复没有放宽原证据要求。

[工作台历史截图](product/evidence/workbench-history.png)随 Git 保存。原 DB、server bundle、PNG/JSON、网关记录等在本机 `data/r1-product/`；[原始文件清单](product/evidence/raw-local-files.json)列 1297 文件的绝对根、相对路径、字节与 SHA-256。它们未上传，也不是随 Git 完整可迁移的数据包；报告中的旧 localhost URL 应按导出的 artifact ID 查找本机附件。关键日志、摘要、身份和哈希随本交付保存。

## 历史失败保留，评分与收益实验后置

原真实失败仍是 source `de54a7e`、manifest `9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75`、request `0ddb03d5250db453759b72ee` / Wafer `a0d1d4a1a35a`：Agent 派发 1 次、HTTP400/model_request_rejected、usage 缺失、动作/Jev 0、其余 8 行未运行。旧 stop epoch=1、unknown 预留 **USD 0.053**、已知实费 0、总实费未知，均未清除。schema 兼容候选已消除 tuple items 出站，但没有证据证明它是原 400 根因或真实服务已恢复。

旧冻结 runtime `/Users/xietian/.codex/worktrees/r1-recovery/ui-sentinel` 仍在 `1e78ea6dea5098944b5d53d6cbe4630c3b53c246`、tracked clean。旧根 [九行 manifest](manifest.proposed.json) 对象摘要仍为 `6428f1ecc473922766f598cc390b052d2a5d4a3f7eae370a72027c77eaa72197`，其 USD4.554/合计4.607 提案未批准，也未被本次另行执行。新产品身份绝不能套用旧 runtime。

[保存核对](product/evidence/preservation.json)重新验证原 41 份证据（含 canonical DB、claim、execution-lock）逐字节不变，该核对时续验claim尚不存在；本次真实批准后已合法创建并消耗，当前状态见付费审计。没有对账写入、供应商消息、伪造 generation ID 或将未知费用记零。较早已结算的独立 Jev frame USD0.000250824 另列，不混入未知批次。

按 2026-10-09 正式范围裁定，旧 S1 六状态、更广状态验证、S2 独立评分/校准和 S5 A/B/C 12×3×2=72 轮收益比较均列为后续优化，尚未完成，不再阻止本期结案。已有适配器、代码和历史证据保留。当前缺少 Jev 收益依据，因此本期选用 program、Jev 关闭；这不表示 Jev 已证明无收益。

本期出口为：普通入口可用的有界程序优先探索、原动作/测量/报告/历史链成立，以及当前 28 轮真实产品验收满足既定健康、异常、合法交回和证据要求。28 轮逐项达标、费用/unknown 如实核对且没有产品硬阻塞时，可交付“本期 R1 产品出口完成，建议维护者审阅合入”；不再等待旧评分实验。仍不得宣称所有历史实验完成。维护者负责最终审阅及合入 main，本任务不 push/merge。

## 已停止批次的原授权范围（历史）

该次授权对象为原ddf1dd9源码、已停止产品manifest和 [固定 evaluator](../../scripts/r1-product/evaluate.ts)。C01–C12 各两次，C04 返回、刷新、健康公开视图各独立运行，共 **28 行**。逐行 scenario、目标、fixture HTML hash、次数和预算已冻结；不从不同模式中挑赢家。C10-1 排首位，其普通 Agent 交回请求同时作为真实供应商兼容性检查，不另收费探针。

| 范围 | 次数/最坏预留 |
| --- | ---: |
| C01、C02、C03、C05–C12 各项 | 每项 2 轮，每轮 USD0.504，每项 USD1.008 |
| C04a 刷新、C04b 返回、C04c 健康公开视图 | 每子项 2 轮，每子项 USD1.008，合计 USD3.024 |
| 每轮 | 最多 8 次 Agent、6 动作（C12 为 1）、180 秒 |
| Agent 总量 | 最多 224 次 × USD0.063 = **USD14.112** |
| 新 Jev、视觉、自动重试、补跑 | 0 |
| 整批时间 | 90 分钟上限 |
| 新批次加旧 unknown | **USD14.165** = 14.112 + 0.053（关联记账上限，实际总费仍未知） |
| 另加历史已结单 frame | USD14.165250824 = 14.165 + 0.000250824 |

2026-10-09 18:37（北京时间）的[公开报价核对](product/evidence/current-price.json)：Wafer 当前输入 USD0.045/百万，输出 USD1.2/百万；本提案仍以输入 **USD0.055/百万**保守上限，1048576 上下文 + 4096 输出计 USD0.06258688，向上预留 USD0.063/次。启动前重新检查 [Agent 端点](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints)；报价/版本/能力超限在凭据和 claim 前拒绝。模型仍是 deepseek/deepseek-v4.1-flash、Wafer only、无 fallback、required tools、low reasoning、stream usage、4096 输出；不自动改模型或参数。

USD0.053 是未结预留，**并非已确认账单或其最终上限**。批准须同时明确接受这一既存未知风险，以及新批次 USD14.112 / 关联记账 USD14.165。已按转发的人类批准保守设定有效期至2026-10-10T13:35:00Z（北京时间2026-10-10 21:35）。授权覆盖全部既定行、失败/partial 留存、原回执与费用核对和结果交付；首行成功后不逐行重复询问。质量不达标如实记录，不调参补跑；HTTP400、传输错误、安全/持久化/假 covered、新 unknown、费用超限或旧来源变化立即停批。未知费用时不报告完整节省率。

正式 runner 只接受精确 manifest、署名/授权引用/未过期时间、maxRuns=28、maxCostUsd=14.112 和完全匹配的 riskAcceptance。空草案已在最终源码的真实 CLI 上被拒绝，拒绝发生在报价/凭据/claim/账户/输出创建前。一次性 `continued-0ddb03d5250db453759b72ee.claim` 位于 canonical 目录，exclusive 创建；换输出/manifest/工作区不能重复接受同一失败。每次 reserve/dispatch 前复核旧来源，原账户保持停止；新账户持久记录新批次并在合计记账永久带入旧 unknown。

原隔离运行区为 `data/r1-product/runtime-ddf1dd9/`，已在此执行正式批次，保持detached ddf1dd9及原数据。首次启动辅助文件相对导入路径错误在凭据/claim之前修正，失败日志保留；之后只有上述一次真实批次。准确CLI模式仍为 `scripts/r1-product/acceptance.ts --run OUTPUT MANIFEST APPROVAL CANONICAL_CLAIMS`，旧runtime不得使用新manifest，旧source也不得消费新批准。

## 本次续验的精确授权范围（已执行并停止）

新源码 **`98f7854472c3df9e3baa913ab3e74f97d8cff3c7`**；[新manifest](product/recovery/manifest.proposed.json)对象摘要 **`f7fa8326db127c1821cc038e50f65e5c02bd68989cb36ba42fa95e05a3e6abc9`**。fixture、产品判定器、阈值、28个既定行及每行预算保持不变；只变更歧义执行约束、必要回归与显式续验费用归属。

为完成本期原定的两次逐项产品证据，获准执行范围为：**C10-1修复复验1行 + 原未运行27行，共28行**。C10-2仍是首次运行，其余26行也未曾真实运行；没有追加场景或收益实验。新批单独报告，不能与旧失败拼成原批全部通过。

| 项目 | 已批准上限 |
| --- | ---: |
| 每行 / 全部 | 8次Agent、6动作（C12为1）、180秒；28行/224次Agent |
| 失败C10-1复验 | 1行，最多USD0.504 |
| 原未运行27行 | 最多USD13.608 |
| 后续新请求合计 | **USD14.112** |
| 加已花USD0.00502455及旧unknown USD0.053 | **USD14.17002455**关联记账上限 |
| 另加已结历史frame | USD14.170275374 |
| Jev / 视觉 / 自动重试 / 补跑 | 0 / 0 / 0 / 0 |
| 整批 / 授权有效期 | 90分钟 / 拟新批准后24小时 |

该具体新源码和关联账本已获上下文明确批准并执行；本批又因新unknown停止，不能因为剩余额度自动继续。原unknown仍不是最终账单保证，已花费用永久计入新合计。当前报价依据复用原批启动前的[公开核对](product/paid-20261009/price-check.json)，启动前仍重新校验上限；模型/provider/参数与原冻结不变。

[原批准草案](product/recovery/approval.draft.json)故意为空，[正式批准](product/recovery/approval.authorized.json)及授权原文另行保存；精确当前CLI已分别拒绝空草案和原批准，均在报价/凭据/输出/新claim前退出。新续验门固定原始未知批次及本次失败产品批的DB、manifest、stop、accounting、results和已消耗claim摘要；只读preflight已通过。新一次性 `continued-product-41eb23e34527461bae8bc50e6d0b28ae53d94bb584d8d167b7eddecedbfcf510.claim` 已在本次明确批准后合法创建并消耗，不能再次使用。新门不清除旧unknown、不解封旧账户、不删改任何旧claim；任何来源/WAL/晚到费用变化或新unknown仍停止。

本次在 `data/r1-product/runtime-98f7854/` 的detached 98f7854新隔离运行区、离线锁定依赖下执行；旧ddf1dd9和1e78运行区保持原样。启动时先验证源码/manifest/签署及有效期、两批旧来源和当前公开报价，再读取私密凭据；没有复制.env或输出密钥。实际命令为正常产品runner（作为本次历史记录，**不能直接重跑**）：

```sh
node_modules/.bin/tsx scripts/r1-product/acceptance.ts --run \
  data/r1-product/authorized-recovery \
  data/r1-product/manifest.json data/r1-product/approval.json \
  /Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-claims
```

源码仍为98f7854，后继只记录授权、证据和结果。相对main48b02b3的源码差异见[候选清单](product/recovery/evidence/candidate-source-files.json)；维护者22eb132仅更新Roadmap，已只读核实，未为其修改冻结候选。没有push或合入main。未来达到本期全部出口后再交维护者审阅；当前保留修复候选并明确真实验收阻塞，不能提前写本期完成。
