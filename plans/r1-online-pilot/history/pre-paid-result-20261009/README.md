# R1 正常产品候选与统一验收入口

2026-10-09。**普通工作台/API 的 R1 工程接入和必要免费验证已完成；真实供应商兼容性及本期付费产品验收尚未完成。** 本期选择显式启用 program 模式、Jev 默认关闭；旧 S1 更广状态验证、S2 独立评分/校准和 S5 72 轮收益对照已正式后置，不再作为本期结案前置。已收到文末精确范围的费用及旧unknown风险批准，正按授权执行；无需再次确认范围或逐行许可。

[机器索引](evidence-index.json)记录源码、逐项结果及证据摘要；[当前任务](CURRENT-TASK.md)维护交接状态。原入口已原样归档到 [pre-product-20261009](history/pre-product-20261009/README.md)，旧失败、旧候选及旧九行 manifest 没有覆盖。2026-10-09 维护者转达用户认可的本期范围裁定，已同步[当前完成计划](../r1-completion-plan.md)；裁定前文档原样保留在 [pre-scope-20261009](history/pre-scope-20261009/README.md)。范围认可不构成费用或未知风险批准。

## 冻结身份与普通入口

| 项目 | 当前值 |
| --- | --- |
| 最终工程源码 | `ddf1dd943f238dc71c2d3e4e6ef327e1ba44c2db` |
| 已整合 main | `48b02b3fbfe7e5d95189a0d813480761b123ff6b`，合并提交 `3cabb048b1d98609ec25d16756364b2f1b58761b` |
| 本地分支/工作区 | `codex/r1-jev-closeout` / `/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007` |
| 新产品 manifest | [product/manifest.proposed.json](product/manifest.proposed.json) |
| 新 manifest 对象摘要 | `41eb23e34527461bae8bc50e6d0b28ae53d94bb584d8d167b7eddecedbfcf510`（JSON.stringify 对象摘要；文件字节摘要另见索引） |
| 付费授权状态 | 已批准；[授权原文/来源](product/authorization-record.json)、[正式批准文件](product/approval.authorized.json)；有效至北京时间2026-10-10 21:35，空草案保留为历史拒绝证据 |

后继提交只归档文档和证据；运行时必须仍精确绑定上述工程源码。只将 main 接收到 R1 分支，没有 push 或将 R1 合并回 main。D001/D002 交付和其文档更新均来自维护者 main；此次 main 增量除 executor 的 R1 接点外，21 个文件与 main 逐字节一致，见 [整合核对](product/evidence/main-integration.json)。DNS、D005/R005、新规则观察/报告接线保留，D004 默认关闭；未重跑 R0 或全规则矩阵。

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

[保存核对](product/evidence/preservation.json)重新验证原 41 份证据（含 canonical DB、claim、execution-lock）逐字节不变，续验 claim 仍不存在。没有对账写入、供应商消息、伪造 generation ID 或将未知费用记零。较早已结算的独立 Jev frame USD0.000250824 另列，不混入未知批次。

按 2026-10-09 正式范围裁定，旧 S1 六状态、更广状态验证、S2 独立评分/校准和 S5 A/B/C 12×3×2=72 轮收益比较均列为后续优化，尚未完成，不再阻止本期结案。已有适配器、代码和历史证据保留。当前缺少 Jev 收益依据，因此本期选用 program、Jev 关闭；这不表示 Jev 已证明无收益。

本期出口为：普通入口可用的有界程序优先探索、原动作/测量/报告/历史链成立，以及当前 28 轮真实产品验收满足既定健康、异常、合法交回和证据要求。28 轮逐项达标、费用/unknown 如实核对且没有产品硬阻塞时，可交付“本期 R1 产品出口完成，建议维护者审阅合入”；不再等待旧评分实验。仍不得宣称所有历史实验完成。维护者负责最终审阅及合入 main，本任务不 push/merge。

## 已批准的一次真实验收范围

授权对象为上表精确源码、新产品 manifest 和 [固定 evaluator](../../scripts/r1-product/evaluate.ts)。C01–C12 各两次，C04 返回、刷新、健康公开视图各独立运行，共 **28 行**。逐行 scenario、目标、fixture HTML hash、次数和预算已冻结；不从不同模式中挑赢家。C10-1 排首位，其普通 Agent 交回请求同时作为真实供应商兼容性检查，不另收费探针。

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

批准后准备**新的隔离运行区**，checkout 精确 `ddf1dd9`、离线安装锁定依赖，复制本次 manifest 和根据真实授权原文生成的 approval；旧 1e78 runtime 保持原样。注入现有 `R1_ONLINE_API_KEY`（不复制 .env 或输出凭据），在新运行区执行：

```sh
node_modules/.bin/tsx scripts/r1-product/acceptance.ts --run \
  data/r1-product/authorized-acceptance \
  data/r1-product/manifest.json data/r1-product/approval.json \
  /Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-claims
```

源码脏或 HEAD 不匹配会拒绝；不能在文档后继 HEAD 上绕过身份检查。该 runner 构建并启动正常 `src/server/index.ts`，通过普通 API 创建运行；预注册 campaign 行 ID 和 API 实际 runId 在 run-binding.json 显式关联，不伪造原 action ID。结束后在本入口更新 28 行结果、未运行原因、原测量和费用；任何扩大范围、重新冻结或新增收费须有对应授权。当前进入隔离运行准备；实际结果将在同一入口更新，尚未宣称通过。

## 批准后在同一任务连续完成

1. 将用户对精确 28 轮/金额/旧 unknown 风险的明确批准原文和时间作为 approvalReference，设置批准后 24 小时有效期；核对源码、manifest、只读旧来源及报价，使用新的隔离运行区。没有明确批准，保持本节未执行，不读取真实调用凭据用于派发、不创建收费 claim。
2. 按上述一次命令执行已冻结批次；首行兼容检查包含在 28 行内，之后无需逐行询问。保留原始请求/响应、行与 runId 绑定、账本、动作/测量、附件及未运行原因。严格执行既有停止条件和无自动重试/补跑约定。
3. 在同一任务核对所有 28 行：健康误报、预注册异常、原始证据完整性、C10–C12 缺口及权限/预算/持久化；从原回执重算已知费用，unknown 单列。固定替身成功不能代替真实结果，completed 不能代替这些条件。
4. 失败时先分类并完成有依据的免费修复和受影响定向验证，不以诊断报告代替收尾。保留原失败，不用局部补跑拼成原批全通过。若确需新增收费复验或改变冻结身份，只提出最小受影响范围、预算和所需授权；当前 28 轮授权不自动覆盖这些调用，也不能清除或绕过已消费的 claim。
5. 产品出口达标则在本 README/index 形成唯一最终结论：本期出口逐项、28 行及未运行原因、真实费用/unknown、program 采用/Jev 关闭、剩余限制、最终 SHA 和相对已整合 main 的允许差异，交维护者审阅合入。硬失败则明确具体阻塞；不因“一把结束”降低标准，不再用后置评分/收益实验拖延结案。

本次免费收口仅修订计划/状态/索引并复核既有文件身份、证据与执行顺序，没有新实验、免费整套重跑、真实调用或收费 claim。
