# R2 产品资料真实主模型小批验收

2026-10-10。状态：**本轮已获用户授权并完成唯一真实批次；预定验收未通过（0/6）**。实际运行冻结在 `3668f5446404e04f5ea332e338cc0147af8a48fd`，结果交付仅更新审阅材料，不变更运行配置。不能把固定模型、浏览器真值检查或旧 R0/R1 成绩当作本轮能力成绩。基线 main/origin/main 均为 `1db982428ffe4735450f2fca6a601d72f4b965dc`，建工作区时无新增提交差异。

## 唯一真实批次结果（2026-10-10）

结论：**此冻结配置下，真实主 Agent 没有完成该限定任务，未达到预定门槛。** 六行均实际派发并终止，五行 blocked、一行 execution-error；成功登记路径0、真实动作0，四个可执行任务的八个必要效果全部未验证。两个缺陷任务均未执行到第二步，命中0/2；没有误报或虚报健康，但零发现不代表识别可靠。

| 行 | 对照 | 请求数 | 原产品状态 | 语义审阅结果 | usage费用/USD |
| --- | --- | --- | --- | --- | --- |
| R1 | 健康 | 6 | blocked | 重复读取未推进；无登记、无动作 | 0.01188685 |
| R2 | 功能缺陷 | 6 | blocked | 重复读取未推进；无登记、无动作 | 0.00641250 |
| R3 | 前置不足 | 5 | blocked | 重复读取未推进；无登记、无动作 | 0.00873775 |
| R4 | 前置不足 | 8 | blocked | 理解前置不足，登记因引用偏移错误被拒 | 0.01129635 |
| R5 | 功能缺陷 | 7 | blocked | 重复读取未推进；无登记、无动作 | 0.00677195 |
| R6 | 健康 | 6 | execution-error | 输出上限耗尽，无工具调用，触发停止 | 0.01165310 |

六行都自主调用资料工具，完整609个UTF-16字符的原文确实出现在后续供应商请求中，且原 `product-path-2` 指引存在。R1/R2/R3/R5在重复读取和检索后触发 `run:no-progress`，没有登记或操作。R4经 `page_inspect` 看到“暂不可用”和禁用按钮，草案能正确说出两个效果、两级前置条件、不支持范围及“不是功能错误”，但唯一的登记尝试被 `product-citation-mismatch` 拒绝。四处引用均错位：预览效果提交 `[293,344)` 而该引文实际是 `[283,323)`；前置提交 `[243,293)` 而实际 `[217,281)`；详情效果及其前置都提交 `[344,384)` 而实际 `[356,406)`。引用文字本身来自原文，但位置不符，不能视为可追溯登记成功。

R6最后一次请求收到完整供应商响应与usage，但 `finish_reason=length`，completion tokens为4096，没有内容或可执行工具调用；产品记录 `model-stream-incomplete:length` 并终止为 execution-error。单次耗时约14.6秒，小于60秒请求上限；本批各任务耗时13.8–53.4秒，没有达到180秒总预算。不能把本批归为旧15秒超时，也不能据此擅自加大预算。按冻结协议，最后一行的 execution-error 写入 `stop.json`，阻止继续派发；此时六行均已运行，无未派发行。没有补丁、自动重试、替换行或付费补跑。

**正面证据与限制分开：** 原文读取交付6/6；R4在草案中的前置不足解释可记语义边界子项1/2，但正式计划/前置测量均未建立，不能当作未知对照全通过。六份持久报告均保持partial/unverified，无默认采样豁免、无全站或全文通过声明；恢复前后完整报告JSON完全相同（6/6），79份附件原件及副本逐项hash与字节核对一致。被测模型没有交付可用的最终说明，只有产品程序的保守报告；R4的正确解释仍停留在被拒绝的工具参数中。

38次实际主模型请求全部有已知usage结算，本批 **USD0.0567585**；unknown=0、held=0，低于授权新增预留USD7.56。Jev/视觉调用0，历史unknown预留USD0.116保持原账。供应商usage已核对，不宣称已核对账户总账单。真实推理时间区间为2026-10-10 23:44–23:47（Asia/Shanghai）。授权由维护者会话 `01a1116d-7621-7962-b4fe-5f904b5fbf13` 转交用户原话“授权”，绑定hash `8696ca212edfc619e6ecffdab95360e9a1ae5a4335071c22b8cbe79a1b6141bc`，有效至2026-10-11 23:44:11（Asia/Shanghai）。本地一次性claim已消费，时间尚未过期不表示可以再次执行。

[真实交付索引及完整逐行审阅](../../evaluation/private/r2-product-acceptance/real-acceptance.json)保存冻结身份、五项逐行判定、费用、停止原因、原始材料目录及hash。原始 `review.json` 位于 `data/r2-product-acceptance/real-authorized-20261010/`，由**本实验设计与审阅Agent**完成，不是人类已复核，且存在同作者偏差。原机械 `results.json` / `summary.json` 的 `pending-human-review` 原样保留，新增Agent语义审阅完成状态另列；原 `completedRows:6` 是六行已收尾，不是六个产品任务通过。

下一步只建议一项：**以本批真实轨迹做免费离线回放，改进“原文检索→精确引用→路径登记”的接口，避免模型手算偏移；保留逐字校验和动作前冻结，然后另行授权复测。** 本次没有实施该修改或发起新批次；也不能把全部失败归因于单一组件或推断公网泛化。

## 受限判定修复（2026-10-10）

原交付 `df644309664a4d3e1ab757dc33020b84a23f59d1` **不适合真实执行**：缺陷行把“引用含查看详情且步骤 verified”当作假通过证据，第一步的合法完整引用也满足该条件，会错误停止。原六次免费 API 接线只返回 unverified，未覆盖这条判断；原637份证据及准备收据原样保留，不能用它们证明此分支判定正确。

实验修订 `r2-product-acceptance-2` 仅修 runner 的私有判定，代码候选与证据见[修复交付索引](../../evaluation/private/r2-product-acceptance/detail-fix.json)。`detail-verdict.ts` 通过同一 run 的原 actionId/itemId、动作前 product binding、对应 effect requirement 与哈希、generic 原始前后节点、measurement 回执及附件字节摘要识别详情检查。私有事实限定实际按钮属于 `#next`、结果是原 `details-state` 节点；可用已观察的 selector/path 别名定位，不把模型标题、引用关键词或固定步骤序号当依据。序号仅用于关联冻结记录。引用范围可以变化，预期须是足以区分成功/失败的完整“详情已就绪”，且原动作完成时测量明确为“详情未能展示”，同一效果仍被核销为 verified，才触发 `false-verified-detail`。

正确的详情 failed 不硬停；仅预览 verified 记 `partial-detail-unchecked`；无法唯一关联、缺失/篡改附件、过宽 contains、不同取证点或不支持的节点定位记 `unverified-or-missed-detail` 并交人工语义审阅，不冒充健康或充分假通过。这是有意保守的硬停止门，不能代替人工审阅全部语义。结果写入 `results.json[].evaluation.detailVerdict`；识别依据始终留在操作者侧，不进入模型输入。费用、安全、持久化及其他停止门保持原样。

新增验证仅为12个合成持久记录反例与必要类型/格式检查，未重跑旧34项、动态六场景、夹具矩阵或任何真实模型。构建复用原产物，并核对产品源码与构建 hash 未变；不称新构建全量验收。原开发类型检查错误记录也另存保留，最终检查已通过。矩阵仍为6任务/最多120请求，新增预留仍为 USD7.56。原 manifest 留作历史，**新授权必须绑定修复提交生成的 `manifest-detail-fix.json` 的新 hash**，不能使用旧 hash `d83a3fb09fc93ea7420db0627fee0271387b3313a1914f21d7b9c829ff9df365`。

## 问题、假设和资产

要回答的问题是：普通用户只给网址和自然语言产品资料，主 Agent 能否读原文、提取可追溯的短路径、登记来源与预期、执行真实操作/测量，并交付能恢复且不夸大的报告？主假设是在以下限定合成页面上六行都满足下文对应条件；任一失败保留，不把它改为“多数成功即通过”。分别报告能力子项，便于定位材料理解、路径准入、实际执行和报告的问题。

| 材料 | 用途 |
| --- | --- |
| [产品说明 MD](../../evaluation/fixtures/r2-product-acceptance/product-spec.md) | 一份正常中文产品规格，含前置条件、即时约定、背景、未承诺推荐及不支持范围；不是脚本或客户 PRD |
| [页面族](../../evaluation/fixtures/r2-product-acceptance/page.ts) | 三个实现共用页面结构及名称，复用现有 `startArena` 本地服务；无新执行器 |
| [私有真值及矩阵](../../evaluation/private/r2-product-acceptance/truth.ts) | RA01–03，对照事实、六行次序、可接受计划与语义审阅规则；不得传入被测产品 |
| [公开价格原始快照](../../evaluation/private/r2-product-acceptance/price-source.json) | 2026-10-10 读取 OpenRouter 公开元数据，无模型请求 |
| [实验入口与策略](../../scripts/r2-product-acceptance/cli.ts)、[配置](../../scripts/r2-product-acceptance/policy.ts) | 默认离线 dry-run；冻结、免费接线及授权后单次实跑 |
| [免费验证收据](../../evaluation/private/r2-product-acceptance/preparation.json) | 测试与原始证据路径/hash；Git 外材料不会自动迁移 |

采用小型新页面族，是因为既有动态 R2 页面嵌在固定模型 runner 中且带额外准入攻击按钮，现有弹窗页面验证的是另一种契约。这里只把访客预览机制做成可复用页面，复用现有靶场 HTTP 服务和正式产品执行器；既有动态回归原样保留。

## 公开输入与隔离

每行经普通 `POST /api/runs` 创建，body 只有 `kind: ui-scan`、随机本地端口的 `/` 网址、`1000×900` 视口和同一 `productSource {title,version,markdown}`。本批省略可选目标，不在目标中透露第二步缺陷或工具顺序；用户可以在工作台粘贴相同的原文。服务器显式启用 `EXECUTION_URL_SCAN=1` 与 `EXECUTION_PRODUCT_SOURCES=1`，仅信任该行一个确切 loopback origin。

私有场景编号、实现变体、预期结果、选择器清单、预写计划、冻结清单、评分规则及报价均不进入 API 请求。被测模型只能使用正式工具看到资料和当前页面。页面 HTTP 只提供 `/` 及原靶场小型资源，无目录浏览、源码服务或故障切换接口；query 切换返回 404，写请求返回 405。实现中的正常 JS/DOM 属于可观察页面事实，不作为私有答案的保密屏障。

每行独立页面服务、产品服务与 SQLite，浏览器状态由产品新运行隔离。页面无外部依赖、cookie、localStorage、业务写入；新上下文或刷新即可复位。真值验证用两个新上下文及各自刷新检查，不能把前次点击留下的就绪状态带入下一行。模型无跨行会话记忆；R1 探索、弹窗专用模式、Jev 与视觉模型均不启用，不另建个人 Codex Skill，使用已合并应用内 `product-path-2`。

## 六行矩阵与可审阅分母

| 行 | 私有对照 | 相同公开规格对应的事实 | 必要结论 |
| --- | --- | --- | --- |
| R1 / R6 | RA01 健康，各一次 | 目录可用；预览点击立即就绪并创建唯一详情按钮；详情点击立即就绪 | 两个效果均有原动作及测量；路径 verified；所有原默认/已选义务有结论才可 covered |
| R2 / R5 | RA02 明确缺陷，各一次 | 第一步同健康；第二步原结果槽变为“详情未能展示” | 第一步 verified，第二步 failed，有同次动作、来源与实测不符证据；缺陷不是执行失败，满足其他义务可 covered |
| R3 / R4 | RA03 前置不足，各一次 | 可用状态“暂不可用”，预览禁用；两个原结果槽保留初值 | 说明前置不足，路径 unverified，运行 partial/blocked；不得当作功能缺陷、健康通过或强行完成 |

总分母固定六任务，不用六行乘以多个配置。四个可执行任务的必要效果分母为八个（每行预览与详情各一），未知对照有两次前置约束检查。R1–R3 与 R4–R6 分别是第一、第二次；顺序反转不构成随机盲测或统计效力声明。没有 warm-up、价格校准、备用行、换模型或自动补跑。

**允许不同合理计划。** 不比较固定的工具序列、ref、CSS、步骤标题、引用边界或资料阅读顺序。可以先查目录/搜索/原文，也可以用不同合法检查取得当前节点；精确文本等于与足以区分状态的文本包含都可接受。两个要求可引用同一段或不同完整片段，前提是逐字引用且语义支持该预期、立即时限和前置条件。只登记预览的一步计划可能是合法短路径，但对本批完整访客目标覆盖不足；记为有效局部计划与详情遗漏，不能据此给全批通过，也不因遗漏替换样本。填入无关控件、借页面实际错误反推预期、把“详情”这种无法区分成功/错误的子串当成功标准不满足语义标准。

未知对照允许模型理性停止：有来源的前置不足说明可通过“边界判断”子项；如果没有登记支持范围内的计划，登记子项仍不通过。此规则避免以保守弃权抹掉资料路径能力的未验证部分。

## 主要通过标准与分类

逐行由审阅者检查原始轨迹，记录以下五项为 `pass / fail / unverified`，并给出事件、模型响应、报告字段或附件 ID。脚本 `evaluate.ts` 只做完整性/恢复/状态分流，始终输出 `pending-human-review`，不把自然语言语义交给一个只看状态枚举的自动分数。

1. **读资料和提取（6 行）**：动作前实际读取相关原文；来源版本/hash 一致；即时预期和两级前置条件有语义充分的精确引用。没有用假设替换资料；未承诺推荐及登录范围仍未检查。
2. **选择和登记（6 行）**：动作前登记一次支持的 1–3 步匿名 click/fill 路径及选取理由。四个可执行行应覆盖两个必要效果；未知行保留正确前置。第二步目标来自当前真实页面，允许第一步后出现；不得通过额外路径扩张权限。
3. **执行和测量（4 行共 8 个效果；未知 2 行）**：每个效果可追到原 actionId/requirementId、动作前引用与绑定、原结果节点和测量。第二步缺陷应被发现，两次健康均无该功能误报。未知行有观察到的前置不足，不能通过强行点击或缺少证据给结论。允许只读取证补全，禁止点击重放冒充旧动作证据。
4. **完成与范围（6 行）**：保留原默认采样及所有已选义务。只有全部必需义务有结论才能 covered；路径通过不能冲掉其他 pending。报告区分“通过、效果不符、未验证”，不声称整份资料/全站/所有需求都完成。对其他发现另审，不把未报告其他缺陷算作真值页面绝对健康。
5. **可信恢复（6 行）**：原文、计划、动作、测量、附件与来源引用一致；持久校验无问题；关闭夹具和产品服务后重启产品，只读恢复同一历史报告，状态及资料对照不变，没有额外模型请求。

整批通过要求六行五项均通过，另需四个可执行行覆盖八个必要效果、两次缺陷命中/零该功能误报、两次正确弃权；所有真实请求有费用回执且无停止事件。小样本全部通过也只支持这一页族及该冻结配置的可行性，不估计总体成功率。

分类分开保存：健康正确、缺陷正确、前置不足正确、合法但不完整、要求提取错误、缺陷漏报/健康误报、工具或预算导致 partial、取证/恢复失败、安全/费用停止、未派发行。普通 partial、读错资料或没走到详情保留原始结果并按固定矩阵继续；不得为全绿延时、重试、补资料提示或补跑。可信性硬错误按下节立即停止；未派发行仍占六行计划分母，另列实际派发数。

## 配置冻结、费用及停止

冻结模型：`deepseek/deepseek-v4.1-flash`，仅 Wafer，无 fallback；现有网关强制 `reasoning: low`，输出最多 4,096 tokens、文本请求最多 131,072 bytes。公开端点应仍为 `Wafer | deepseek/deepseek-v4.1-flash-20260910`；应答只接受现有网关/上游校验允许的模型 ID。上下文上限 1,048,576 tokens。没有 Jev/视觉请求、模型比较或价格校准。

每任务最多 20 次主模型请求、8 次产品动作、180 秒总预算、60 秒单模型请求（取剩余时间更小值）、15 秒工具时限；自动重试 0，长度恢复未启用。180 秒和 20/8 均低于产品默认 300 秒、40 次模型调用、40 次动作，没有扩大产品总预算。20 次是为阅读、登记、两个绑定及原动作测量留下合理调用余量，不承诺 20 次都能在 180 秒内完成；沿用 R1 已修正的 60 秒主模型超时，不能照搬旧 15 秒失败配置。整批 25 分钟封顶用于六行串行执行与启动/恢复；不增加单行期限。

[OpenRouter 公共端点元数据](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints)本次快照显示 prompt USD 0.00000005/token、completion USD 0.0000016/token，缓存读价不高于普通输入价，无已声明其他非零费项。保守按**整个上下文加最大输出**计算，不依赖 token/byte 猜测或缓存折扣：

```text
1,048,576 × 0.00000005 + 4,096 × 0.0000016 = USD 0.0589824 / request
沿用现有请求账本的单请求预留                       = USD 0.063
6 tasks × 20 requests = 120 requests
120 × 0.063                                         = USD 7.56
```

这是运行前冻结并获授权的预留上限，不是已消费、预期均值或供应商账单保证。本批实耗及对账范围见上方结果；若费用回执大于预留，保留实际费用并停止。R1 历史单价配置与当前输出价不同，本入口单独验证本次报价，不沿用旧报价验证器，也不重用旧批次授权、账户或 unknown。历史 unknown USD 0.116 及旧失败继续属于原账，未核销、未重置；7.56 是本批新增上限。

真实入口复用 `startGateway → createBatch (r1-online-pilot) → openCampaignSession` 的请求级 reserve/dispatch/settle/unknown 闸门，实际请求体在账本 dispatch 内校验和记录。每次请求而非每个任务收费预留；批次最大 120、每行最大 20。共用供应商响应验证器，HTTP/传输/模型或供应商身份异常不释放内容继续使用。免费 seam 测试覆盖已知结算、缺 usage 后阻止下一请求、超预留、错误供应商、视觉请求派发前拒绝及第 21 请求拒绝。

新费用 unknown/held 不确定结算、超额、供应商/网络请求异常、取消、安全干预、证据/持久恢复失败，或可机械识别的假通过立即阻止新派发并取消活动任务。前置不足的**产品 unverified**是预先设计的对照，不等同于**费用 unknown**。费用 unknown 保留预留，不能归零；停止后不得自动恢复。SIGINT/SIGTERM 同样停止，进程被强杀时保留账本 held 与已消费 claim，必须人工核对，不允许用新输出目录“补跑”。同一冻结清单的 claim 写入仓库共享 Git 目录，跨工作区也不能再次消费；该本地保护不能替代操作者遵守授权范围。

## 命令与授权边界

在本分支根目录、支持的 Node 24 环境运行。新机器按 lockfile 安装依赖并准备 Playwright Chromium；本机已使用已有浏览器。所有命令设置 `DOTENV_CONFIG_PATH=/dev/null`，免费模式用内置假的上游函数及隔离子进程环境，真实密钥不会传给产品进程，原始轨迹由网关脱敏。

```sh
export PATH=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH
export DOTENV_CONFIG_PATH=/dev/null
pnpm install --offline --frozen-lockfile
pnpm build
mkdir -p data/r2-product-acceptance

# 公开页面启动：另一个进程按私有选择启动，输出只有普通 URL；Ctrl-C 关闭。
pnpm exec tsx scripts/r2-product-acceptance/fixture.ts --serve healthy
# 同一入口也支持 defect / unavailable，模型不接收此命令。

# 免费准备；输出目录必须是新的，旧失败/证据不覆盖。
pnpm exec tsx scripts/r2-product-acceptance/fixture.ts --verify data/r2-product-acceptance/truth-new
pnpm exec tsx scripts/r2-product-acceptance/cli.ts --free data/r2-product-acceptance/free-new
pnpm exec vitest run scripts/r2-product-acceptance/guards.test.ts scripts/r1-product/upstream.test.ts evaluation/support/campaign-ledger.test.ts evaluation/support/campaign-session.test.ts
# 原固定模型长期回归；不是给真实模型注入待测计划。
pnpm exec tsx scripts/validation/r2-product-sources.ts --dynamic-only

# 默认只有离线清单，无供应商请求，也不读取真实 key。
pnpm exec tsx scripts/r2-product-acceptance/cli.ts
# 在干净提交及已核对构建上冻结；旧 manifest 保留，新文件已存在时也不覆盖。
pnpm exec tsx scripts/r2-product-acceptance/cli.ts --freeze data/r2-product-acceptance/manifest-detail-fix.json
```

`--freeze` 固定完整提交、src/build/runner/共享费用代码/依赖锁及运行时 hash、协议 hash、公开输入、三种 HTML、私有判定与报价快照。运行前重新构造并逐项核对；任何版本、构建、资料、判定或配置变更须重新审阅冻结。报告中的 `manifestHash` 是项目 `digest` 的规范 JSON hash，不能用原始 JSON 文件的 `shasum` 冒充；文件 hash 另行记入证据索引。

**以下是本轮已执行的冻结入口示例，授权claim已消费，禁止再次执行。** 操作者将授权原文的引用与实际批准信息记入 `approval.json`，字段为 `approvedBy`、`approvalReference`、`manifestHash`、`maxRuns:6`、`maxRequests:120`、`maxCostUsd:7.56` 和未来有效的 `expiresAt`。不能由 Agent 虚构批准人/引用；不提供可误用的已批准模板。真实密钥仅从操作者已设置的 `R2_ACCEPTANCE_API_KEY` 读取，不写入文件或命令示例。

```sh
pnpm exec tsx scripts/r2-product-acceptance/cli.ts --run \
  data/r2-product-acceptance/real-once \
  data/r2-product-acceptance/manifest-detail-fix.json \
  data/r2-product-acceptance/approval.json
```

启动重新读取公共价格/能力元数据；价格缺失、抬高、额外非零费项、身份变化即拒绝，不发推理请求。普通 API payload 不带预算覆盖；服务器按上述冻结预算配置，并保留原完成门和默认采样。恢复读取在关闭模型运行窗口及页面服务后进行。

## 证据、审阅与结论边界

每批目录包含 `manifest.json`、`quote-at-launch.json`、（真实时）`approval.json`、`requests.jsonl`/`responses.jsonl`（实际脱敏原始主模型轨迹）、`ledger.jsonl`（请求回执）、`bindings.jsonl`（请求与任务绑定）、`upstream-timing.jsonl`、`account/`（SQLite 账本）、`results.json`、`accounting.json`、`summary.json`，以及失败时 `stop.json`/`failure.json`。

每行 `R1/`…`R6/` 内保存 `request.json`、`binding.json`、`snapshot.json`、`events.json`、`report.json`、`restored-report.json`、`runs.db`、`server.log`、`artifact-index.json` 与 `evidence/` 原始附件副本。报告原始产物仍在项目 `data/artifacts/<runId>/`；移动证据时同时保留原产物及数据库，不能只搬报告 JSON 便声称历史可恢复。附件索引包括 ID、原路径（报告若提供）、保存路径、字节数和 SHA-256；冻结版本与结果索引不写入模型输入。

实跑后人工在同一批目录写 `review.json`，格式至少为：`manifestHash`、`reviewer`、`reviewedAt`、`rows[]`。每行包含 `id/runId`、五项 `{state,reason,evidenceRefs[]}`、两个必要效果的观察/结论、未检查范围、`classification`；整批含 `planned:6/dispatched/completed/unstarted`、`requiredEffects:{planned:8,verified,failed,unverified}`、缺陷命中/漏报/误报分母、费用 known/unknown/held、停止原因和结论。保留机械 triage 与人工审阅的差异及依据，不静默覆盖原报告。

运行前免费准备证明的是：夹具确实可重放；正常入口能接收这份资料；历史可恢复；现有动态准入回归及本入口费用停止链路有效。**本次真实运行未通过完整任务门槛，局部理解与失败证据见上方结果。** 即使未来复测通过，也只能声称同作者合成闭环上的初步可行性：有同作者偏差、仅一份短中文资料/一种页面族/一个视口，无独立盲测、公网、登录角色、Figma、多文档、业务写入、长期或复杂异步承诺。

关联 [长期靶场目录](../counterexample-arena.md)、[维护回溯](../maintenance/arena-library-followup.md)、[原动态准入收据](../../evaluation/r2-product-sources/dynamic-admission.json)。原八场景、P1 失败反例、R0/R1 历史超时与费用未知、Journey/DNS 原全套失败全部保留；本轮没有重跑全套或 R0/R1 矩阵，也没有修改产品实现迎合材料。

## 引用与登记修复免费结果（2026-10-11）

本节是 `afd3994` 之后 `codex/r2-source-citations` 的产品修复和**独立免费回归**。上方唯一真实批次仍为 0/6；38 次请求、USD 0.0567585 及历史 USD 0.116 unknown 均不改写，不与本节相加。未发出新的供应商请求、校准或重试，也没有把旧授权再消费。完整提交与源码/构建/证据索引见[修复收据](../../evaluation/r2-product-sources/source-citations.json)。

根因范围：R4 明确暴露“引用文字正确但手填位置错误”的接口负担；R1/R2/R3/R5 另有重复检索未登记，不能仅靠偏移修复解释；R6 仍是 4096 输出耗尽，本轮不改输出/推理/模型/费用/超时配置。应用 Skill 升至 product-path-3，现有 read/search 返回程序 ID，search 支持精确 quote；登记解析回旧严格契约，返回具体字段错误和有限纠错状态。新提示说明取得引用后登记、批量独立定位及缺口处理，不注入正确计划、CSS 或页面答案。无进展阈值、默认采样、权限、动作与完成门保持原样；新搜索进度与读取共享至多六个原文窗口，换关键词不能无限续期。

免费证据：

- 定向单测 7 文件、53 项通过：原 R4 错误偏移仍失败，三个不同原文引文得到程序 ID 后原有两个步骤与两个前置可通过旧严格校验；无验证证据时仍 unverified。新增负例覆盖伪造/未发出/篡改/跨版本、重复候选及分页、未命中、跨读取块和代理对、具体字段、三次拒绝、动作/计划后拒绝再登记、v2/v3 绑定与准入校验；既有完成门和上下文摘要测试继续通过。
- `--citations-only`：同一609字符中文 MD 和原三对照页面，经 loopback 固定模型 → 正式 API → 原执行器/真实 Chromium。健康两步 verified/2动作；缺陷第二步 failed/2动作；前置不足 unverified/0动作。健康先提交原 R4 错误偏移，收到诊断，再用 ID 成功登记。三份完整报告重启后 JSON 相等，准入附件篡改降为 partial/unverified 后恢复原字节。
- `--dynamic-only`：复用旧六场景，健康/缺陷/缺失/重名/额外控件/默认样本 pending 均符合原断言；六份完整报告重启相等，准入篡改拒绝。资料路径 verified 但其他默认义务 pending 仍为 blocked/partial，没有清空分母。
- `pnpm build`（含 typecheck）及修改文件格式检查通过；未运行全套、R0/R1 或付费矩阵。

新增浏览器证据位于 `data/r2-product-sources/2026-10-10T16-10-48-214Z/`，旧动态回归本轮结果位于 `2026-10-10T16-10-59-318Z/`（UTC 目录名，对应上海10月11日）。目录含 identity、原模型请求包/工具输入、事件、前后报告、隔离 SQLite、acceptance 与源码/构建/原产物 hash。产物仍在原 `data/artifacts/<runId>/`，收据列出路径；缺附件时不得只凭报告宣称恢复有效。

开发时两次免费失败保留：`2026-10-10T16-08-57-348Z/` 按三个独立模型回合定位已读原文，之后错误登记触发原无进展门（0动作）；未放宽门，最终固定模型把三个独立查找置于同一回复，Skill 给出相同的通用建议。`2026-10-10T16-10-10-653Z/`：健康已完成两步，测试却要求自动完成后仍发起晚登记，断言失败；移除不可达测试分支，晚登记拒绝由执行层测试直接覆盖。两次失败均不计入最终通过矩阵、不隐藏或覆盖。

精确草稿保存在私有 `r4-registration-draft.json`，包含原错误位置、引用文字与 `value:null`；回放仅省略 optional null，符合原 SDK 行为。浏览器三对照用相同引用/效果/前置，但将 R4 针对 unavailable 的说明改为中性固定模型测试说明，省略其页面限制文字；不能把这个固定计划作为真实模型理解成绩。所有模型输入构造都只在免费固定 provider 内，未接入真实入口。

结论只到接口、拒绝/修复、原动作测量及持久恢复的程序闭环。真实模型是否减少重复阅读、能否可靠登记和完成两步尚未证明；没有声称 Agent 能力验收通过。

### 下一次小批复测提案（未授权、未执行）

保留同一 MD/三对照、两次各对照共六行与原顺序，继续 deepseek/deepseek-v4.1-flash、Wafer、reasoning low、4096 输出、每任务20请求/8动作/180秒、单请求60秒、自动重试0、整批120请求。沿用历史 USD7.56 作为待审阅的最高预留提案；运行前必须重新核对报价，不能把历史报价当现价。没有新增需求覆盖、hint、正确引用或答案注入，无模型比较，不因 R6 加大 token/time。

正式运行前应在干净最终候选上重建并生成新的冻结清单，审阅源码/构建/工具 schema/Skill、三对照以及费用停止边界后另获与新 hash 绑定的授权。旧 manifest/claim 已消费，不能复用。机械判据、诚实 partial、原报告和语义人工审阅保持；同时记录登记错误、资料重复请求和到登记的调用数，比较方向而不把微小六行结果当泛化稳定性。本节只是提案，不产生授权文件、不派发请求。
