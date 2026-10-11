# R2 产品资料真实主模型小批验收

最近真实结果：2026-10-11 推进反馈候选的新授权批次已完成Agent审阅，按原标准 **1/6**，仅R1健康路径完整执行。R5第6请求超时且费用未知，原闸门停止批次，R6未派发；六任务和八效果分母不变。已知USD0.040360993，新增unknown预留USD0.063、held 0，本期R2未达原完成条件。详见文末第五批结果及[交付索引](../../evaluation/private/r2-product-acceptance/real-progress-acceptance.json)。此前四批原结果、费用和授权记录保持不变。

2026-10-10。状态：**本轮已获用户授权并完成唯一真实批次；预定验收未通过（0/6）**。实际运行冻结在 `3668f5446404e04f5ea332e338cc0147af8a48fd`，结果交付仅更新审阅材料，不变更运行配置。不能把固定模型、浏览器真值检查或旧 R0/R1 成绩当作本轮能力成绩。基线 main/origin/main 均为 `1db982428ffe4735450f2fca6a601d72f4b965dc`，建工作区时无新增提交差异。

2026-10-11 追加：引用修复后的新授权批次也已完成；合法登记4/6、实际动作0、严格完整任务0/6。详见末尾“引用修复后真实复测”；以下旧结果原样保留，费用独立记录。

## 首次真实批次结果（2026-10-10）

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

### 引用修复后小批复测提案（后续已授权并执行）

保留同一 MD/三对照、两次各对照共六行与原顺序，继续 deepseek/deepseek-v4.1-flash、Wafer、reasoning low、4096 输出、每任务20请求/8动作/180秒、单请求60秒、自动重试0、整批120请求。沿用历史 USD7.56 作为待审阅的最高预留提案；运行前必须重新核对报价，不能把历史报价当现价。没有新增需求覆盖、hint、正确引用或答案注入，无模型比较，不因 R6 加大 token/time。

正式运行前应在干净最终候选上重建并生成新的冻结清单，审阅源码/构建/工具 schema/Skill、三对照以及费用停止边界后另获与新 hash 绑定的授权。旧 manifest/claim 已消费，不能复用。机械判据、诚实 partial、原报告和语义人工审阅保持；同时记录登记错误、资料重复请求和到登记的调用数，比较方向而不把微小六行结果当泛化稳定性。本节形成时只是提案，未产生授权或请求。用户之后明确回复“好的，授权”，由维护者转交，实际绑定与结果单列如下。

## 引用修复后真实复测（2026-10-11，已完成审阅）

**引用整改后模型开始登记，但仍没有开始浏览器操作，严格完整任务0/6。** 新批次6行全部派发并结束为 blocked/partial/unverified，成功登记4行、绑定0、动作0；8个必要效果全部未验证，两个缺陷均未到达详情，命中0/2。R4正确识别前置不足，边界判断子项1/2通过；它把原文明确事实填入assumptions，不满足第一项“不用假设替换资料”的完整标准，因此不能把该行计为全部五项通过。没有功能误报、强行点击或虚假covered，但这不代表识别可靠。

执行候选为 `da3ebb8f46b5742769dffeafc4c41e2b98bcb792`，实现仍为 `b7608b5c744e95c48e342c438287487ed8257be2`。干净HEAD的源码、runner、Skill、原规格和私有判定与已审阅实现一致；构建hash与免费收据一致，未重建或重跑53项/九场景。未更改产品、提示、实验配置或元数据版本；manifest源码/构建条目冻结了product-path-3接口。用户原话“好的，授权”经维护者消息转交，记录为具体内容授权；实验Agent完成新hash绑定，不虚构用户事先看过该hash或人名。收到时间上海10月11日00:21:29，有效期至10月12日00:21:29。

新冻结 hash 为 `2272b82fcad4d6357568c04a6ffea2ee56659c7755fb5b467c40f9b9ae603e86`；清单 `data/r2-product-acceptance/manifest-citations-authorized-20261011.json`，新授权 `citations-authorization-20261011/approval.json`，实际目录 `data/r2-product-acceptance/real-citations-authorized-20261011/`。本claim已消费，不能复用。新报价在冻结前及启动时核对，Wafer prompt/completion分别为 USD0.00000005/0.0000016每token，未高于原预留依据；同一MD、原六行顺序、模型/provider、reasoning low、4096输出、20请求/8动作/180秒、单请求60秒、重试0及USD7.56上限全部保持。凭证只在内存读取既有安全来源，未写入证据。

| 行 | 对照 | 请求数 | 首次成功登记请求（含本次） | 动作 | 主要观察 | usage费用/USD |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 健康 | 6 | 无 | 0 | 已获得引用ID与ready-to-register提示，仍重复读取，无计划 | 0.00962700 |
| R2 | 缺陷 | 13 | 3 | 0 | ID登记成功；把可用状态写为假设，绑定返回product-requirement-not-explicit，之后反复读取 | 0.02051715 |
| R3 | 前置不足 | 5 | 无 | 0 | 已读原文并查找前置；第3次空stop回复，无来源充分的弃权说明/计划 | 0.00569780 |
| R4 | 前置不足 | 7 | 3 | 0 | 登记且观察到暂不可用/禁用，正确保留边界；把明确原文事实写入assumptions | 0.01386065 |
| R5 | 缺陷 | 9 | 6 | 0 | 短引文ID登记成功；可用状态假设使绑定被拒，详情前置只写limitation未登记 | 0.01121880 |
| R6 | 健康 | 8 | 3 | 0 | ID登记成功后保持assumed状态，重复查状态/页面，没有绑定尝试或动作 | 0.01174255 |

4次登记全部采用citationId，16个引用字段逐项核对：ID在对应登记请求前已经发出，程序解析范围与原文相等，旧严格验证器通过。引用范围较宽不是自动扣分；R2引用[131,609)，R4/R6引用全文，R5用精确短引文，均符合允许不同引用边界的协议。登记拒绝0、引用字段错误0，因此本批没有真实模型错误修复样本，不能声称纠错能力已验证。

真实阻碍是语义分类和阶段推进：4份已接受计划的assumptions均非空。R2/R5/R6把可测的当前可用状态记作假设；R4把“状态区域各自展示”这一明确规格记作假设。冻结后不能改计划，原执行门正确保留unverified。R2/R5实际尝试绑定，各返回一次product-requirement-not-explicit；另有尚未走到的风险：这两行availability用contains“可用”，也匹配“暂不可用”；R5漏了详情步骤的显式预览就绪前置。上述问题不是引用合法性或位置计算问题，不能以工具合法代替语义正确。

六行均出现无进展并以未验证收尾，共8个run:no-progress事件。原文read/search合计29次，其中工具名和参数完全重复的额外调用9次（不含overview/status/tool_result_read，也不包含不同查询反复覆盖同一区间）。相较旧批37次read/search、7次完全重复，不能仅以总读取下降声称效率提高：本批请求从38增至48、费用也增加，动作仍为0。调用到成功登记为3/3/6/3；没登记的两行不能从该均值剔除后宣称稳定。新批没有length或4096耗尽，单次最大输出2030；旧R6问题仍未被修复。R3第3次是stop且无内容/工具，不是length。各任务13.1–70.7秒，均未用完180秒。

本批48次真实请求全部settled，usage已知费用 **USD0.07266395**，unknown/held均0，未出现硬停止文件；原六行正常终止，没有重试、补跑、换行或中途修改。旧批 USD0.0567585、历史unknown USD0.116继续原账，不冲抵、不归零。两批已知费用可作独立账目对照，不能把新授权解释为旧余额复用。

本实验Agent已读全部48份请求/响应、六行工具轨迹与报告，按原五项逐行完成语义review，**不是人类复核或独立盲测**。六份完整报告重启JSON相同；95份附件通过只读SQLite找到原件，和下载副本逐项hash/字节一致。原机械pending-human-review输出保留为原始数据；新增reviewCompleted=true的Agent审阅已经交付，未把任务停在待审。

完整五项理由、事件ID、每行费用、引用审计、重复请求计数、恢复与证据hash见[新真实交付索引](../../evaluation/private/r2-product-acceptance/real-citations-acceptance.json)。首次[真实交付](../../evaluation/private/r2-product-acceptance/real-acceptance.json)只追加后续批次指针，原review与原始证据不变；免费成绩不计入本批。建议下一步只做**免费回放这四份假设计划，改进登记前的事实/前置/假设分类与反馈**，保持假设不得执行及冻结边界，再决定是否申请新的真实复测；本轮不继续派发付费请求。

## 登记前可执行性整改免费结果（2026-10-11）

本轮在完整基线 `92cd3cffc9b4b2f8201323a5924f52885bd2a0bb` 上新建 `codex/r2-plan-readiness`，仅授权免费整改。两个真实批次仍分别0/6、0/6；其38/48请求、USD0.0567585/USD0.07266395与历史unknown USD0.116原样保留，不混入免费成绩。没有生成approval、调用供应商或价格校准，没有改费用、安全/取消/DNS/Jev/模型/时间/token预算，没有推送或合并。

原锁死点是 register 接受 assumptions 并不可逆冻结，而 bind 无条件拒绝含假设计划。v4 把可证明的结构阻断项前移到同一登记入口：非空假设、非明确要求、缺少谓词、未完成步骤来源核对均在保存前返回字段反馈。模型应把可测的未知状态登记成待实测前置，把明确规格保留为要求；真正无依据/不支持内容仍可用 unverified-scope 结束，不生成误导性的成功计划。失败沿用三次上限和原无进展门，不增进度、不消费动作、不核销事项；成功后仍不可改预期。

另外，文本包含检查只对原文引号文字做子串碰撞提示：实际可发现 R2/R5 的“可用”也匹配“暂不可用”，但不会推断整个自然语言状态机。改用精确比较，或对合理 contains 提交来源解释；不全局禁止 contains。每步 review 要求显式确认原文前置已完整登记、谓词能区分状态；缺前置若模型谎报确认，程序仍不能自动识别。本轮测试明确保留这个能力边界，不把布尔确认当语义通过。前置实测失败的目标另记 itemId，普通动作同样拒绝，防止只绕过失败绑定就点击。

原真实R2/R4/R5/R6的请求参数（含null、错误分类、谓词和遗漏）及原持久计划，原样保存到[最小回归输入](../../evaluation/private/r2-product-acceptance/readiness-failures.json)，包含批次、runId、requestId和请求序号。回放仅按旧SDK省略optional null，先证明四份原输入都在冻结前被拒绝且给出assumptions字段、逐步review缺项，R2/R5另外命中子串碰撞。只删除assumptions仍被拒绝。固定作者修正再按原文重建两级可测前置、分别绑定原结果槽、改为精确状态比较并完成来源核对；R5确实补齐详情前置。修正不是生产程序自动推断，不能证明真实模型会自发照做。

免费验证均在 Node24、DOTENV_CONFIG_PATH=/dev/null、loopback固定模型、正式编译服务及真实Chromium下执行：

| 验证 | 结果及限度 |
| --- | --- |
| 6文件55项定向测试 | 四份真实失败冻结前反馈、仅删假设不通过、来源修正、三次上限、动作后拒绝改计划、无假设自动执行、合理contains、语义遗漏不能自动证明、v2/v3/v4历史证据及原完成门通过 |
| 原中文MD健康/缺陷/前置不足 | 经正常API先提交原R5失败输入、再提交作者修正版；健康两步verified/2动作，缺陷第二步failed/2动作，暂不可用unverified/0动作 |
| 同页定向故障注入 | 只在测试夹具将暂不可用页面的按钮启用；前置实测失败，后续故意page_act也被拒，0动作。独立负例，不冒充原三对照的新能力分母 |
| 原dynamic-pending | 两步资料通过但其他默认项pending，仍blocked/partial；未重跑其余旧动态矩阵 |
| 历史与证据 | 新五份完整报告重启相等；原四份真实v3运行用数据库副本经新服务API恢复，完整JSON不变、无模型调用；旧原件不改。新准入附件篡改仍降为unverified并恢复字节 |

构建（含typecheck）通过。最小命令为 `pnpm build`，以及 `pnpm exec vitest run src/execution/product-registration.test.ts src/inspection/product-readiness.test.ts src/inspection/product-citations.test.ts src/inspection/product-artifacts.test.ts src/inspection/completion.test.ts src/agent/context/compact-history.test.ts` 和 `pnpm exec tsx scripts/validation/r2-product-sources.ts --readiness-only`。本轮没有重跑全套/R0/R1或旧九场景。

浏览器证据目录 `data/r2-product-sources/2026-10-11T02-44-23-491Z/`（上海10:44），含身份、工具输入/上下文、事件、报告、历史副本和SQLite；原产物仍在 data/artifacts。开发中一次编辑语法错误先由格式/typecheck拒绝，修正后才启动首次浏览器验证；保留在 `data/r2-product-acceptance/readiness-development-20261011.json`，没有覆盖旧失败。实现提交、源码/构建/回归输入hash、回放诊断、附件索引见[本轮收据](../../evaluation/r2-product-sources/plan-readiness.json)。

剩余限制：程序不能自动证明引文充分、前置完整、substringJustification合理或模型review诚实；未引用的替代状态也可能逃过字面检查。成功登记不证明页面满足条件。旧已冻结的假设计划继续按原语义未验证，不能借v4重新放行。真实模型分类、纠正后是否操作、重读是否减少、R6历史输出耗尽均待真实证据，本轮不宣称解决。

下一次真实小批仅作准备提案：仍用原MD/三对照/原六行顺序、相同模型/provider/reasoning与所有预算，先审阅本候选再冻结新的源码/构建/协议hash并另获明确授权；原两份claim不能复用。本轮没有创建approval或执行真实请求。


## 可执行性整改后真实复测（2026-10-11，已完成Agent审阅）

用户在维护者说明候选及免费证据后原话“好，授权”，允许一次固定六行真实批次。本批在 `codex/r2-plan-readiness` 的交付提交 `b3dd81cd8059dc4f759878140ba5069aa1943446`（实现 `ddbc8e2e7ff07e0fe0caa7d58cf21fb87ec4518b`）冻结新 manifest `a87b62b9178aedbb1225fd008d7084fc7993a453528876b2fb356b1f51dbe55f`；新approval/claim仅消费一次。授权按已审阅内容绑定新hash，不声称用户此前看过该hash。执行前后源码、构建和整个manifest一致，未重建、重跑免费矩阵、改提示或补样本；未推送/合并。

保留原609 UTF-16字符中文MD、RA01–03与原六行顺序，同一DeepSeek V4.1 Flash/Wafer、low、4096输出、20请求/8动作/180秒每行，120请求/USD7.56预留上限及全部原停止门。公开报价低于原价格上限，预留额度仍每请求USD0.063，未扩大预算。

**本次有真实首步动作，但完整任务仍0/6。** 六行全部结束为blocked/partial/unverified，无硬停止。按原五项标准审阅，R1/R5的原文提取与路径登记通过；六行历史恢复通过；没有一行完成全部五项。四个可执行行的8个必要效果中1个verified、7个unverified，0个failed。两个缺陷均未到详情，命中0/2；两个前置不足行未形成有来源的弃权说明，边界子项0/2。没有强行点击、该功能误报或虚假covered；无动作的保守停止不等于正确完成。

| 行/对照 | 请求 | 登记阶段 | 实际动作和结果 | 已知USD |
| --- | ---: | --- | --- | ---: |
| R1 健康 | 12 | 第3次请求一次成功 | 第6次绑定实测可用，第7次点击预览并正确测得预览就绪；随后见到查看详情及e38仍未绑定/点击，详情未验证 | 0.007446806 |
| R2 缺陷 | 6 | 未提交 | 原文读取/检索后持续只读，无动作 | 0.003122436 |
| R3 前置不足 | 5 | 未提交 | 无动作，未完成有来源的边界判断 | 0.003966258 |
| R4 前置不足 | 5 | 未提交 | 无动作，未完成有来源的边界判断 | 0.005435782 |
| R5 缺陷 | 14 | 第5次请求一次成功 | 第6次把region当CSS标签导致前置选择器零匹配；后续已看到正确section和可用状态，仍未修正绑定，0动作 | 0.008922168 |
| R6 健康 | 6 | 未提交 | 持续读资料/搜索，无动作 | 0.002597598 |

R1/R5的完整原始登记输入已审阅：assumptions初次即为空，两级前置分别是availability精确等于可用、preview状态精确等于预览就绪，两项效果分别为各自状态精确等于预览就绪/详情已就绪，时限action-complete。模型两步review均为true，审阅者对照原文确认前置与谓词实际存在，**不是仅按清空assumptions或布尔确认计分**。8处引用ID均在此前工具响应发出，恢复的原文区间与UTF-16逐字相同；R1采用整篇引用，R5采用短引用。两次登记均首次成功、invalidAttempts=0，无登记拒绝或字段修正，因此本批不能证明模型会利用readiness拒绝反馈完成修正。免费作者修正的成绩继续单独保留。

R1预览动作具有原actionId `ecad2830-831b-446a-982d-fda36941bec7`、requirementId `requirement:86ad53459e90788eda3e2882`，动作前成功绑定并实测availability单一值可用，动作完成时在原preview结果节点测得单一值预览就绪。后续原DOM与element_details已给出enabled的查看详情及真实选择器，但模型仍继续检查。R5绑定失败是 `main > region:nth-of-type(1) p` 的count=0、measurement-ambiguous，不能误称页面实际暂不可用；原门拒绝绑定，之后没有绕门动作，也没有发生“修正后重绑”的验证。

48请求、78个工具回执已逐项关联到原requestId/toolCallId/eventId。六行均有一次no-progress事件，source_read/search合计46次，完全相同参数重复12次（只统计工具名和原参数JSON相同；null/空串、不同搜索重叠文字不合并，overview/status/tool_result_read另计）。R5第3次请求四个搜索因keyword空串被输入校验拒绝，第4次改null后搜索成功；R6第6次请求又发生四次相同类型错误。合计8次搜索校验错误与1次绑定失败，不能误记成readiness登记拒绝。所有回复finish_reason为tool_calls，无length或空stop；历史R6耗尽问题不能由这一次未出现而关闭。

本批费用逐笔与供应商usage.cost相同，48请求已知 **USD0.031491048**，unknown/held均0，无重试、替补或新增行。请求总数与上一批相同，读取/重复数反而增加；公开价格已下降，不能由费用降低声称效率改善。首次0/6与USD0.0567585、第二批0/6与USD0.07266395、更早unknown USD0.116分开保留，不抵扣或清零。

六份完整报告在夹具和原服务关闭后恢复JSON相同，持久校验无问题；125份附件经只读SQLite定位原件，与下载副本逐项hash和字节一致。新证据索引335文件；此前两批236/270文件及免费361文件hash全部重新核对未变。原机械results/summary的pending-human-review保持原样，新增reviewCompleted=true代表**实验Agent完成审阅，不是人类复核或独立盲测**。同作者设计、修复、审阅与小样本偏差仍存在。

[第三批交付索引](../../evaluation/private/r2-product-acceptance/real-readiness-acceptance.json)保存逐行五项判定、原始登记/review/诊断、每请求阶段、效果证据、费用与附件索引；本地原始目录为 `data/r2-product-acceptance/real-readiness-authorized-20261011/`。上一批索引仅追加后续指针，原review不变。下一步建议只做**免费回放R1首步后停滞与R5错误选择器绑定后的原始上下文**，聚焦如何利用已观察到的目标/选择器完成下一次绑定，复用现有页面、冻结预期与原无进展/安全/费用边界；本次授权已用完，不继续补付费样本。


## 已观察证据到下一步操作的免费整改（2026-10-11）

用户同意下一步免费回放后，从第三批交付 `adfe2cd` 新建 `codex/r2-path-continuation`，复用同一工作树、MD和页族；实现提交 `b2fbf02c5c0c74739b1eb9cb518ca978ad275e2b`。本轮真实供应商请求0，没有生成新approval或复用旧claim，三批真实成绩仍各自0/6。

原轨迹核对发现：R1预览已测得通过，但registration.nextAction仍重复泛泛的bind提示，没有指出首个未完成的详情步骤；R5错误region选择器零匹配，工具只返回product-precondition-missing，未在直接回执区分“未定位节点”与“实际值不满足”。正确section选择器后来已在模型输入中，故不能把失败完全归因于信息缺失；新反馈是否会被真实模型使用仍未知。

v5仅补充派生的execution反馈及通用技能说明：从原报告/事件指出首个未完成步骤、已完成步骤，以及待绑定、已绑定待动作、原动作待只读核验、实际前置不满足等状态。绑定失败反馈保留字段、原选择器、冻结谓词、测量值/节点数与原因；有支持的零/多匹配允许在原预算内观察原节点后重试同一未执行步骤，实际值不满足要求停止，不支持测量仍未验证。execution同时进入每轮上下文和压缩工具回执。它不选择替代节点、不绑定/点击、不改预期或scope，不增预算/进度、不绕过原门；历史v2/v3/v4附件验证继续保留。

[原始反例](../../evaluation/private/r2-product-acceptance/continuation-failures.json)保存第三批R1/R5完整产品报告、相关原事件、原登记输入/错误bind参数及来源hash。测试作者在固定回放中解释观测DOM、选择下一工具和修正选择器，代码只在验证脚本中使用，产品不读取这些答案。

| 免费检查 | 结果 |
| --- | --- |
| 定向回归 | 5文件共50项不同测试通过；首轮48项，改动的两文件复验12项，去重为50，不重复累计；构建含typecheck通过 |
| 原R1健康路径 | 原计划不改预期；首步通过后反馈定位第二步，从page_inspect获取真实状态区域选择器并继续；2动作、两效果verified |
| 原R5错误绑定 | 原region选择器先产生count0/unverified，回执及后续上下文保持inspect-binding；作者改用观测到的section选择器后成功绑定，2动作，详情效果failed |
| 原前置不足 | 观察到暂不可用和禁用按钮，0动作，保持partial/unverified |
| 同页故障注入 | 只在测试夹具启用原禁用按钮；测得前置failed，故意page_act仍被原门拒绝，0动作 |
| 默认义务与恢复 | dynamic-pending两步通过仍partial；关闭夹具并重启服务，五份报告完整JSON相等；两份原v4真实报告在数据库副本上经新API恢复完全相同，无模型调用；新准入附件篡改仍降为unverified并恢复字节 |

验证入口为 `pnpm exec tsx scripts/validation/r2-product-sources.ts --continuation-only`，Node24、空dotenv配置、正式编译服务/正常API与真实Chromium，模型仅loopback固定响应。最终证据目录 `data/r2-product-sources/2026-10-11T03-53-02-383Z/`；260份新原始附件，716文件索引含历史引用和开发失败。此前两次测试作者错误（禁用控件被错误期待为候选、启用故障分支误落入正常动作断言）均保留原目录和说明，修正脚本后第三次完整通过，不覆盖失败。

三批真实236/270/335文件证据索引逐项核验不变；USD0.0567585、USD0.07266395、USD0.031491048与更早unknown USD0.116均独立保留。本轮收据、源码/构建hash、历史恢复与边界见[免费交付](../../evaluation/r2-product-sources/path-continuation.json)。剩余限制是模型是否利用新反馈、是否正确选中原结果节点、是否减少重读；空keyword搜索错误本轮未改。固定回放不能折算真实任务通过率；尚未推送或合并，也未启动新的真实复测。


## 最终收敛候选与复测冻结准备（2026-10-11）

维护者已接收第三批结果及v5免费续步反馈，用户要求推进本期最小真实闭环；本条仅授权一次实现、免费验证和冻结准备。从 `591f233fa916f5f11bf4d0a725280db9ce6331cc` 建立 `codex/r2-final-candidate`，实现为 `b5659c50120309fcf15dd9909302067627fcb169`，Skill v6。没有新增approval/claim、推理校准或付费请求，不扩展原任务、页族、模型或判定门。

第三批原R5/R6请求共八次传入 `keyword:""` 与有效quote，SDK在调用工具body之前校验失败；另六次 `keyword:null` 对照由原SDK正常处理。原参数字符串、解析对象、SDK回执参数和结果逐项保存到[搜索反例](../../evaluation/private/r2-product-acceptance/search-empty-failures.json)。本地兼容只允许一个明确非空模式，另一个未使用空值按省略处理；trim仅判空，不改查询文本。双有效模式、全空、类型错误及原长度/游标边界继续拒绝。工具schema先接受合法的未用空值，本工具body归一化后仍走同一原文搜索/引用逻辑；不改全局SDK。

免费回放通过实际Mastra Tool.execute包装，证明八份原错误输入修复前不进入body、修复后得到原文和程序引用；六份null对照仍成功。新增兼容38项，加受影响原文/登记/附件回归共4文件58项通过；含中文、emoji和首尾空白的quote逐字保留，keyword模式、双模式/无模式、错误类型、边界、重复匹配及无匹配均检查。构建含typecheck通过；一次测试参数类型推导错误在构建前修正并留证，不改变产品行为。复用上一候选50项/五个浏览器场景，不重复运行或折算真实成绩。

静态闭环核对覆盖读取/引用→登记诊断→绑定诊断→第一步到第二步→原动作测量→默认义务与收尾。仅修两处明确提示矛盾：要求核对已可用原文而非强制再读；冻结后上下文不再重复要求登记，readiness改为指向execution，避免与已测步骤矛盾。当前步骤仍由原报告/事件派生；不增加规划框架、审核步骤或泛泛长提示。模型理解、选择正确原节点、采用反馈和完成第二步的能力留给真实复测。旧v2至v5仍核验动态准入及附件。

本次源码、构建、六个产品工具的实际SDK输入schema、Skill及静态核对见[准备收据](../../evaluation/r2-product-sources/final-candidate.json)。三批原236/270/335证据和最新免费716文件逐项hash未变；三批0/6、USD0.0567585/USD0.07266395/USD0.031491048及更早unknown USD0.116分别保留。只读取公开Wafer元数据，报价在原价格上限内，保留每请求USD0.063及总USD7.56预留。

完成本节和收据提交后，使用原CLI在干净最终候选上一次冻结到 `data/r2-product-acceptance/manifest-final-candidate-20261011.json`；其sourceSha同时绑定代码、文档和完整候选。canonical manifest hash及复核结果另存 `data/r2-product-acceptance/final-candidate-freeze.json`，冻结后不再追加提交或改构建，不能复用旧claim。manifest包含完整src/dist、协议、runner/费用与停止代码、共享支持、锁文件、原MD、原三页族hash和私有五项判定；显式工具schema/Skill摘要与之核对。

待新授权范围固定为一次原六行：healthy、defect、unavailable、unavailable、defect、healthy；原609 UTF-16字符MD，五项标准、八个必要效果不变。DeepSeek V4.1 Flash/Wafer、reasoning low、4096输出；每行20请求/8动作/180秒、请求60秒、工具15秒；整批最多120请求、25分钟、USD7.56新增预留，Jev/视觉/fallback关闭、重试0。原unknown/held、安全/供应商/持久化/执行错误/虚假covered停止门全部保留。没有新行、替补、预算追加或中途修补授权。通过原六任务真实出口后才考虑整合main，免费通过不标记本期完成。


## 最终候选真实复测（2026-10-11，已完成Agent审阅）

用户明确“开始”后，在干净候选 `414e90ae06e46bc5799637f8ce88da458ddca1d2`（实现 `b5659c50120309fcf15dd9909302067627fcb169`）消费独立新授权一次。manifest hash为 `2fed1a672855e3efaedda78c44fdbf77182c32d8d93c18834edec440bb205ebc`，源码hash `7e2fafc0b5fbbe52df30a8d628d734afa918c1b0593ff5c0dedea7474b95bbad`，构建hash `5ce88b54accae5d4b8c5f8a69857a87cafcf8a132ed669f2ca87a703c5413023`，Skill product-path-6。沿用原609字符MD、RA01–03、六行顺序、模型/provider、五项标准及6任务/120请求/USD7.56预留；没有预热、重试、换行、补资料或中途修补。运行后、文档改动前重新构造manifest完全相等，HEAD干净；未重建或重跑免费矩阵。

**结果为3/6，整批未通过。** 可执行四行仅R2完成两步，8个必要效果为1 verified、1 failed、6 unverified；缺陷命中1/2，健康行未完成2/2、该功能误报0；前置不足正确弃权2/2。不能把正确缺陷结论说成产品功能通过，也不能把两项弃权说成效果已验证。

| 行 | 对照 | 请求 | 五项语义判定（读/登记/执行/范围/恢复） | 原产品状态与结论 | usage USD |
| --- | --- | --- | --- | --- | --- |
| R1 | 健康 | 6 | unverified / fail / unverified / unverified / pass | blocked；重复读搜，未登记或操作 | 0.003843847 |
| R2 | 缺陷 | 13 | pass / pass / pass / pass / pass | completed/covered；预览正确、详情效果不符 | 0.008488083 |
| R3 | 前置不足 | 6 | pass / pass / pass / pass / pass | blocked/unverified；有来源的只读取证弃权 | 0.006586098 |
| R4 | 前置不足 | 9 | pass / pass / pass / pass / pass | blocked/unverified；有来源的只读取证弃权 | 0.009828082 |
| R5 | 缺陷 | 6 | unverified / fail / unverified / unverified / pass | blocked；重复读搜，未到详情 | 0.004713057 |
| R6 | 健康 | 7 | pass / pass / unverified / unverified / pass | blocked；前置绑定数量不齐，未修正 | 0.004857917 |

四份登记均在初次尝试成功，assumptions为空；18处引用逐字匹配并在登记前发放。审阅逐项核对了原始参数、两级前置、精确状态谓词、立即时限、review声明和未检查范围，不以review=true直接判分。R3使用208..452片段，完整包含相关要求；其余引用整篇。R6另外把两个有来源的初始状态作为首次执行条件，语义有据，却使每步需绑定两个前置。无登记拒绝或修正过程，本批不验证该项纠错能力。

R2请求7未传前置选择器被拒，请求9补齐后成功绑定；请求10点击原预览按钮e5，action `5e03645d-fdc9-40e2-a784-767a906e286c` / requirement `requirement:c6782eb18ef58c5bb25a61a8` 在原预览状态节点测得“预览就绪”。请求11/12获得下一步反馈并观察/绑定动态详情e38；请求13点击，action `03441c21-3443-4ece-80c4-8a39cadad0c7` / requirement `requirement:ac7931162523dae4ba744ede` 在原详情状态节点测得“详情未能展示”。原始action-complete测量附件分别为 `9dd0f9f1-77ff-42f9-b3cb-fabd72947e30.json` 与 `ce3d8d8b-7dd1-4002-a8f4-dc04fe796d0c.json`，都有唯一节点及动作前前置测量，未用别处同文替代。报告保留受支持缺陷 `finding-81663f7a-caa6-45eb-b942-18c069721c43`。16个已选义务均有结论、gaps为空；20个未选自动检查仍unverified，没有伪造全站通过。

R3/R4都已登记有原文依据的条件性路径，随后在原availability节点读到“暂不可用”、预览按钮disabled，两个结果仍为初始状态；均无动作、无功能误报。按原标准允许只读取证，并沿用第二批R4对执行/范围的判法，这两行可通过边界语义任务；本批来源和登记另已通过。原报告仍为unverified-scope，路径pending和no-progress未移除，没有运行时前置测量或独立最终模型说明，不改写为covered。通过依据是已接受计划加原始观察，而非blocked或保守无动作本身。R4请求3误用investigation_check，被原效果门拒绝为unknown；不把这次调用当作有效测量或缺陷。

尚未闭合的推进问题：R1/R5各读搜10次，均不登记；R6请求5只传一个前置选择器，被数量门拒绝，随后重复读取回执而未补齐。全批读搜32次、精确重复9次（仅按同工具与原参数定义，排除overview/status/回执读取）。20次搜索成功、零参数错误，但本批没有空keyword输入：17次quote配null、3次keyword配null。因此空串兼容仍以此前免费SDK历史回放为证，不能宣称真实修复场景已被触发。R2采用下一步反馈并完成动态详情，是新的推进证据；本批没有零匹配绑定，数量修正不等于零匹配反馈已实测，也不能从一次成功推断因果收益。

47次请求逐一以供应商usage与账本核对，Decimal合计 **USD0.038317084**，新unknown/held均0；五行no-progress、一行completed，无length、费用或可信性硬停止。六份完整报告重启恢复相等，143对原附件/副本hash和字节一致。此前真实三批236/270/335项证据索引及免费716/10项全部重新核对不变；旧费用USD0.0567585、0.07266395、0.031491048和更早unknown USD0.116各自保留，不核销或抵扣。

本实验Agent完成47份请求/响应、所有工具回执、六行原始轨迹/报告、来源与测量附件审阅；不是人类复核或独立盲测。原机械pending-human-review字段不改，Agent审阅单列在 `review.json`。完整身份、证据hash及五项理由见[新交付索引](../../evaluation/private/r2-product-acceptance/real-final-acceptance.json)。claim已消费，不得补跑；没有自动下一批或整合main。下一步仅建议免费回放本批R1/R5登记前重读和R6前置数量错误的原上下文，复用现有页族、原预算及执行门，再决定是否继续整改。


## 登记与前置数量反馈整改（2026-10-11，免费交付）

用户授权在上一轮剩余两处推进问题上继续实现和免费验证，本轮从 `b3f65e3` 建立独立分支 `codex/r2-progress-feedback`，实现 `6c12192`；没有新的付费授权或调用。原真实结果仍为3/6语义任务：仅R2完整执行缺陷路径，R3/R4是有来源的前置不足弃权，报告仍partial/unverified。没有改写历史成功率、费用、claim或main维护者Roadmap。

**原轨迹定位。** R1/R5停滞时已收到完整609字符MD、有效引用、成功搜索回执和可复用原文的技能说明；没有找到缺失原文或工具回执的证据。实际发送的登记工具schema却仍写“After rereading the source”，与技能相矛盾；registration的统一nextAction还把提交与纠错混在一起，即使diagnostics为空也要求修正字段。原终止事件streak=3，模型上下文有剩余预算，但未单列streak；本轮不改预算、无进展判定或进度计数。不能证明字段矛盾是重复阅读的唯一原因，剩余模型决策不稳定仍未关闭。

`product-path-7` 只校正上述说明：登记schema和拒绝诊断要求核对已经返回的原文；nextAction区分尚未取得原文、已取得原文待提取登记、登记被拒待修正。后续阅读须针对具体缺失要求、前置或截断片段；文本已返回不等于语义完整、可执行或已批准，不自动生成或接受计划。资料不足的原输入仍被拒并保持未验证。

R6原计划第一步有“可用”“尚未预览”两个前置，bind只传一个选择器；旧回执只有错误码，当前紧凑步骤上下文不列前置数组，模型转而反复读取历史回执。现在同一输入返回 `expectedCount=2`、`receivedCount=1`、每索引冻结要求/谓词/引用范围、收到的选择器、`missingPositions=[1]`；多余位置另列。位置不代表程序已经识别语义遗漏：即使现有一个选择器实际对应第二个条件，也不猜映射，要求模型重核整个有序数组。`repair-binding-input`及诊断保留在后续execution/status和工具摘要，明确复用观察到的DOM补齐原前置后重绑，不删除条件、猜选择器或绕过动作门。R2原空数组错误同样给出1/0及位置0，修正后的旧成功通路保持兼容。

数量拒绝只追加诊断事件，没有浏览器操作、成功绑定、测量证据或进度增量；原引用、唯一节点、顺序、前置实测、权限、动作效果及完成门不改。新拒绝事件与现有登记拒绝同属诊断历史，不要求伪造测量附件且不能成为完成证明；其余product证据仍强制校验原附件hash。v2–v7绑定字节与动态准入验证保留。

**免费验证。** 31项受影响测试（4文件）、构建/类型、格式与差异检查通过。使用实际SDK工具边界回放R1/R5原工具输入及R6/R2原登记和错误bind参数，保留原回执、完整审阅上下文、实际wire schema/技能和来源hash。R1/R5重复输入仍只产生overview和同一source-page两个进度key；能复用已发引用提交作者选择的原R2计划，但不会由读取自动生成计划。资料不足、少/多位置、摘要保留、旧错误不压过成功绑定或原动作、已执行步骤只读核验等边界均覆盖。

| 同一免费浏览器入口的受影响场景 | 动作 | 路径/运行结果 |
| --- | --- | --- |
| 原R6两前置计划：原缺项回执→按已观察DOM补齐 | 2 | verified / covered |
| 原R2空绑定数组→原修复，详情缺陷 | 2 | failed / covered |
| 原前置不足页启用按钮故障注入：补齐后条件为假，尝试动作仍拒绝 | 0 | unverified / partial |
| 原dynamic-pending：路径完成、另有默认必需义务未完成 | 2 | verified / partial，covered请求拒绝 |

复用原MD/页族与 `r2-product-sources.ts --progress-feedback-only`，没有新验收矩阵或付费模型。固定回复由测试作者选择工具、从实际DOM回执取选择器；只证明反馈/执行通路，不计模型采用能力。四份新完整报告重启恢复相等，旧v6 R2/R6在数据库副本上经新API恢复完全相等、无新模型调用；动态准入附件篡改仍使报告降为未验证。其他旧免费矩阵复用有效证据，不全套重跑。

开发失败也保留：测试脚本使用当前TS lib未声明的findLast，改为filter().at(-1)；第一份浏览器回放完成两步后，新诊断事件被旧通配附件检查误当测量证据，导致持久校验失败，随后明确诊断分类并补测。失败目录 `data/r2-product-sources/2026-10-11T10-45-33-429Z` 未覆盖；通过目录为 `data/r2-product-sources/2026-10-11T10-46-53-512Z`。源码hash `7de8a3d8c520ca1e351741caaa303ceda98571a8dd45d2ac113ddeadfa8deb61`，构建hash `f05e23279cbcf58c666ce168d1f620f63f45f3cda9b89eba6752c1b019162f23`。

原始反例在 `evaluation/private/r2-product-acceptance/progress-feedback-failures.json`，完整前后回执、测试/构建、原附件与失败记录由[免费交付索引](../../evaluation/r2-product-sources/progress-feedback.json)定位；此前六组证据共1939项hash重新核对不变。已有免费依据支持审阅后沿用原六行、五项、原预算冻结候选，无需新矩阵；真实模型是否停止重读并正确补绑仍需另外授权的真实验收确认。本轮未冻结可消费新claim、未运行真实模型、未合并或推送。


## 推进反馈候选真实验收（2026-10-11，已停止并完成Agent审阅）

用户经维护者审阅实现 `6c12192c26cd8a0d17c091b59934bad70adc67e4`、免费交付 `40803d9db5ae31724f6e02271498d41d56028103` 后明确“好，授权”，批准冻结此候选并执行一次原六行批次。授权时尚未生成新manifest，不能声称用户提前看过其hash。本Agent随后在干净候选上冻结 `62bcbaac3db7bb6a107cc9adfdd269bc29b84649d320477e57993e44b5ea33f5`，独立approval绑定该hash，24小时有效且claim仅消费一次。源码hash `7de8a3d8c520ca1e351741caaa303ceda98571a8dd45d2ac113ddeadfa8deb61`、构建hash `f05e23279cbcf58c666ce168d1f620f63f45f3cda9b89eba6752c1b019162f23` 与已审阅免费交付完全一致。

原609字符MD、三页族、六行顺序、五项标准、八效果、DeepSeek V4.1 Flash/Wafer、reasoning low、4096输出及原20请求/8动作/180秒、60秒模型/15秒工具、整批120请求/25分钟/USD7.56均未改。实时公开报价prompt/completion/cache-read分别USD0.000000035/0.00000099/0.000000034每token，在原冻结价格上限内；单请求预留仍USD0.063。Jev/视觉/fallback关闭，无重试、备用或补跑。既有31项/四场景/构建证据复用，未重建或重复免费测试。结束后、文档修改前再次构造完整manifest与冻结完全一致。

**结果：1/6，原整批完成条件未达到。** 实际派发5行，R6因硬停止未派发仍占六行分母。四个可执行任务的8效果为2 verified、0 failed、6 unverified（包括R6未派发的2个）；健康完成1/2、该功能误报0，缺陷命中0/2、两个均未到详情。两个前置不足对照都未登记，完整有来源弃权任务0/2；R3只读取证支持边界子项，不替代完整任务。

| 行 | 对照 | 请求 | 五项语义判定（读/登记/执行/范围/恢复） | 原产品状态与结果 | 已知usage USD | 未知预留 USD |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 健康 | 12 | pass / pass / pass / pass / pass | completed/covered；两步原效果正确 | 0.010830226 | 0 |
| R2 | 缺陷 | 11 | pass / pass / unverified / unverified / pass | blocked；登记并取得节点，未绑定/操作 | 0.010284335 | 0 |
| R3 | 前置不足 | 6 | unverified / fail / pass / unverified / pass | blocked；只读边界事实有据，但未登记 | 0.008797798 | 0 |
| R4 | 前置不足 | 5 | unverified / fail / unverified / unverified / pass | blocked；反复读搜，未登记 | 0.006313866 | 0 |
| R5 | 缺陷 | 6 | unverified / fail / unverified / unverified / pass | cancelled；第6请求超时，未登记/操作 | 0.004134768 | 0.063 |
| R6 | 健康 | 0 | 全部unverified | 未派发，无报告，不虚构恢复 | 0 | 0 |

R1首次读全文后第3请求正确登记；两个效果和两级前置均引用原文，assumptions为空、精确状态谓词区分成败、立即定义支持action-complete。第7/11请求绑定原预览/详情状态区域，第8/12请求点击原控件；action `a76a451c-fa8b-42d3-812f-2cf5607780b5` / requirement `requirement:7130f3cb844540224f42c841` 测得“预览就绪”，action `2f83c230-1b19-4286-8e9f-062449ece1af` / requirement `requirement:97ed620273439ba697081443` 测得“详情已就绪”。原测量附件为 `dd4f61d8-98f5-432e-90b6-10564f0866e8.json`、`b9bb67a8-4c02-43bc-b143-23d814674698.json`；两次前置在动作前分别单节点测得可用/预览就绪。动态详情准入、事件先后、actionId/requirementId/结果节点与原附件逐项核对一致。16个已选义务均verified、gaps为空，20个未选自动检查仍unverified；无全站通过声明。第9请求仍重读全文一次，不能说无目标重读已消除。

R2第4请求登记的两步计划也正确。四处引用使用220..462片段，包含两级前置、效果、立即定义及各自状态区域，全文已在前请求读取；逐条核对review声明，不只看true。第5请求element_details传6个ref超过原上限5，被schema拒绝；第6请求缩至4个后已取得正确节点，第7请求再次确认可用和两个初始状态。此后只读status、回执和原文，从未bind或click。这个修正是element_details数组上限，不是本轮前置数量诊断修复。

R3第3请求在原节点读取暂不可用、禁用按钮和初始结果，第5请求精确查回“这不代表预览功能发生了错误”的前置段，足以支持原只读取证边界子项；但没有登记路径、完整范围声明，主要任务不通过。R4仅反复读搜，没有登记或对当前前置不足的后续核对/解释，不因初始观察存在和无动作就推定弃权已完成。两行均保留partial/unverified，不改成covered。R5超时前5次回复同样没有登记，不能猜测未返回的第6次会采取什么动作。

**修复是否实际触发。** 40份真实请求均含新阶段说明、已审阅wire schema和product-path-7技能；R1首次全文后登记并完成健康路径，但R3/R4/R5仍未登记，R2登记后仍停滞，不能声称提示修复带来稳定收益。全批只有R1两次bind，均一次给足前置数组，数量错误0、`repair-binding-input`未触发；真实模型采用数量诊断的能力仍未验证。30次读搜、精确重复8次（同工具原参数定义，排除overview/status/回执），20次搜索均成功但无空keyword输入；19 quote配null、1 keyword配null，也没有零匹配绑定修复。登记拒绝与修正仍未触发。

**停止和费用。** R5第6请求 `1ec47d9d1b0888c70901ca4a` 于2026-10-11 11:01:51 UTC派发，产品模型事件 `evt-08a799da-4dd8-45cd-8941-3a60cd670b29` 在60010ms记录 `model-request-timeout`、usage unknown；网关记录 `downstream-disconnected`、60015ms。上游有HTTP200和2950字节，但无可验证data event/完整usage，不能据此归零费用或断言未计费。原批次于11:02:51 UTC记录 `transport-error`，取消R5并阻止R6派发；最后没有实际工具调用、没有length恢复、重试或替补。

共40请求：39笔已结算usage逐一与原供应商回执核对，Decimal合计 **USD0.040360993**；1笔unknown保留预留 **USD0.063**，held 0。已知加未知预留占用USD0.103360993不是实际总费用。四批旧已知USD0.0567585、0.07266395、0.031491048、0.038317084与更早unknown USD0.116分别保留，未核销、抵扣或扩大风险豁免。新unknown和硬停止本身已不满足原整批门槛。

五份已运行报告在夹具/服务关闭后重启只读恢复完全一致，持久校验无问题；129对附件原件/副本hash与字节一致。R6没有运行和报告，恢复分母如实为5份。此前七组共2310项证据hash核对不变。40份请求/响应记录（39完整、1中断）、59个工具回执、8处登记引用、全部动作/原事项/测量及账本已完成本实验Agent审阅；非人类复核或独立盲测，原机械pending-human-review保持。

新结果、前后身份和346项证据索引见[第五批交付](../../evaluation/private/r2-product-acceptance/real-progress-acceptance.json)。第四批原3/6仍是一条完整缺陷路径加两项partial/unverified有来源弃权，不改写。当前剩余阻塞是新费用unknown、请求超时及登记前/后推进不稳定；数量诊断真实采用尚未触发。本期R2未满足原完成条件，不合并main、不推送、不修改维护者Roadmap。后续建议先审阅本次未知费用与停滞证据，再决定是否继续；本轮不自动整改、追加真实批次或申请扩大预算。


## 证据驱动阶段调度（2026-10-11，免费交付）

本轮从第五批交付 `054fe95` 建立 `codex/r2-stage-decisions`，实现提交 `3bd494b95eb5364e7df9c4703ba2f016cdcfa1e5`。用户授权的是只读查账、最小阶段调度及免费验证；没有恢复旧批次、新真实推理、付费manifest/claim、推送、合并或修改维护者Roadmap。第五批真实结果仍为1/6，历史各批不改。

**未知费用核查。** 请求 `1ec47d9d1b0888c70901ca4a` 的保存请求/响应、账本与上游计时均没有generation ID。响应记录没有完整事件；上游虽收到HTTP200及2950缓冲字节，但完成事件为0，在约60秒取消前没有通过完整流校验释放正文/响应头。不能由这些字节或HTTP状态推定实际费用。[OpenRouter官方只读用量接口](https://openrouter.ai/docs/api/api-reference/generations/get-generation)要求具体generation ID；现存资料不足以构造有效查账请求，因此未猜ID、试探端点或用账户总余额分摊。新增独立核查记录保留原unknown预留USD0.063、actualUsd=null；更早USD0.116未动。尚缺能对应本请求的供应商generation ID或独立账单。七份相关旧文件hash核对不变，没有重新全量核对维护者已验过的旧346项索引。

**实现边界。** `product-path-8` 复用原 `productContinuation` 和登记状态计算stage，不新建持久计划/审核框架。每轮真实SDK只收到当前stage与原全局阶段共同允许的工具；每个串行执行入口再从最新事件计算，防止同一模型回复中多个工具沿用过期阶段。原文已返回后选择登记/纠错或具体缺口；登记后处理下一未完成步骤的绑定；绑定后只允许当前原控件；动作后只允许对应原action的只读核验。已实测前置为假、效果失败和完整性未解决保持阻断，不重绑/重放；路径全部通过后，原mandatory/default工作及完成门继续有效。

模型仍负责来源解释、计划、完整前置及观察到的选择器。结构化 `product_path_gap` 要求具体问题与一种允许的只读工具，给当前阶段一次查询尝试；状态改变则失效，开始查询就消费。查询可取缺失/截断原文、DOM、历史或原回执，不自动补计划/节点/预期，不增加进度、预算或动作权限。输入校验不能证明问题真的必要，反复无效缺口仍受原无进展、时间、调用和工具限制。既有引用、登记准备度、数量反馈、前置实测、动态身份、动作效果、取消及证据完整性门未放宽。没有改模型、provider、reasoning、60秒请求、工具超时、费用或评分标准。

**原反例与验证。** 第五批R1–R5完整模型可见上下文及59份实际工具回执保存在 `evaluation/private/r2-product-acceptance/stage-decision-failures.json`，附原始文件hash。R1/R2原成功登记输入通过真实SDK工具复用已有引用；R3/R4/R5已返回原文只转入登记/缺口决策，不自动生成计划或声称范围完成。测试同时覆盖指定只读工具一次性消费、阶段变更失效、其他工具拒绝、原数量诊断、错误目标、下一步骤及原动作连续性。实际SDK固定transport验证wire工具列表，并拒绝provider伪造的未开放读取。

91项受影响测试（9文件）通过，包括既有模型取消、超时/晚回调、失败回执与登记测试；末次技能措辞对齐另复查9项相关测试。最终构建/类型、格式、差异检查通过。失败记录为两次构建测试类型错误（参数化测试数组类型、摘要字段访问类型），修正测试类型/断言后通过；所有日志保留，没有覆盖失败。本轮浏览器没有失败尝试。

| 复用原页族的必要场景 | 真实浏览器动作 | 结果 |
| --- | --- | --- |
| 健康，原缺项绑定按已读DOM修正 | 2 | verified / covered |
| 详情缺陷，原空绑定数组修正 | 2 | failed / covered |
| 暂不可用但按钮启用，故障注入 | 0 | unverified / partial，动作请求拒绝 |
| 原时限未声明的详情效果仍未知 | 2 | 原action只读核验仍unverified；重放请求拒绝、无第三次动作 |
| 路径通过但其他默认义务pending | 2 | 路径verified，运行partial，covered声明拒绝 |

五场景证据位于 `data/r2-product-sources/2026-10-11T11-58-49-702Z`。全部5份新报告在关闭页面/重启服务后完全相等，旧v6 R2/R6及第五批v7 R1在数据库副本恢复完全相等、无模型调用；准入附件篡改仍降为未验证。额外只跑健康单例验证同一回复发出两次read：第二次在第一份原文返回后被真实串行执行器拒绝，之后仍完成原两步。初次及技能措辞对齐后的最终单例分别位于 `2026-10-11T12-00-28-264Z`、`2026-10-11T12-02-38-353Z`，均保留；没有重跑全套旧矩阵。只读核验事件对应原第二动作，独立核对为read-only-recovery/unverified，无动作重放。

最终源码hash `0d46ce686bf32ee680a1bab518ad0262210062da1b1b60376f4e21106e87256f`，构建hash `8a8c3925410fe35aefcc7292a761496cc4d81e908c4e33ff940179ea5e915334`。532项本轮证据的索引hash为 `8bc5777ab0c61a79f9dc47d21b431d38dbedd850b211654c96b66c40c447342c`，逐项校验通过。实际运行开始时提交仍为基线且有实现修改，身份由源码/构建逐文件hash定位；不是干净付费冻结声明。完整查账、失败日志、SDK/浏览器回执、原测量附件和恢复记录由[阶段调度收据](../../evaluation/r2-product-sources/stage-decisions.json)索引。

固定回复是测试作者选择的决策，只证明调度与执行契约；没有证明真实模型会提出恰当缺口、正确提取所有前置或稳定完成原六项任务。该候选可供免费工程审阅，真实采用效果仍未验证；没有预授权下一批或续用旧claim。


## 直接阶段取证简化（2026-10-11，免费工程候选）

在干净 `60e39fa` 上建立独立 `codex/r2-stage-retrieval`，实现提交 `f4d655508d8bff24b7a20e1a1f971423b00fb4fd`。本轮按维护者审查和用户“先把流程跑通”的要求简化必要取证手续。没有真实模型调用、旧批次恢复、新付费manifest/claim、推送、合并或修改main/维护者Roadmap；未知费用原样保留并暂缓核对，没有继续查账。第五批真实1/6不改。

**能够确认的机械步骤。** 原SDK请求设置 `maxSteps=1`、activeTools在请求发出前冻结。在已登记待绑定阶段，尚未取得许可的page_inspect不在当前wire工具列表；正常调用product_path_gap后，必须等下一请求才有实际查询工具。把许可和查询放进同一旧SDK回复不能形成有效的已开放工具调用。因而对一项此前未授权的必要查询，旧流程为两次模型请求/两个工具调用；已有许可或初次source读取不受这个额外步骤影响。原健康回放中两次DOM取证均符合上述条件，逐项输入、输出和下一轮上下文保存为flow-comparison.json。这个代码事实不能证明之前仅有建议而没有工具限制就是真实停滞的根因，也不能证明旧gap机制影响真实模型成功率；此前将它称为已确认原因的表述过强。

**选择最小直接工具方案。** 删除product_path_gap工具、许可状态、消费/失效逻辑。保留现有stage计算、真实SDK工具过滤及每次串行执行前复核。登记前只增加原source_read/search和回执/历史读取；登记后只增加当前DOM检查/节点详情/观察和回执/历史读取。仍不开放通用调查、旅程、规则执行或无关业务动作。无需新代理、参数转发器或嵌套serial；查询完全沿用原工具schema、分页、摘要、证据和执行逻辑。资料引用、前置、身份、原action约束、效果、取消与完成门没有放宽。模型/provider/reasoning、请求/工具超时、动作/调用/时间预算和评分不改。

已有结构化信息也直接复用：每轮只给当前未完成步骤附上原冻结preconditions，包含原说明、预期与引用；不复制完整历史，不代填节点或选择器。第一次免费SDK分页测试发现长中文source回执超出记忆限额后，已返回nextOffset也被摘要省略，迫使额外查询才能找到游标。修复只保留四个已存在的文档游标字段，正文继续omitted，未增8000字节预算；不将省略正文当作已读语义事实。原始失败日志完整保留。模型仍须决定必要缺口、资料完整性、来源充分的计划、真实节点和诚实范围；无法由程序代判这些语义选择。

**验证范围。** 复用原第五批R1–R5失败/成功上下文及实际R1/R2登记输入，无新增页面族或全套矩阵。67项受影响测试（6文件）验证直接具体查询、原文截断/多段读取、原引用复用登记、重复读取无新进度、非法参数不可转成动作、阶段相关工具集合、原动作/步骤约束、摘要/原回执游标与v2–v9附件完整性。实际SDK固定回复通过原分页游标取得后段原文，随后引用原要求登记；同一回复的合法来源读取保持可执行。测试作者的固定回复只证明接口契约，不是模型采用结果。

| 本轮必要浏览器流程 | 动作 | 结果 |
| --- | --- | --- |
| 原健康路径，当前前置直接可见，直接DOM取证、数量修正、绑定和测量 | 2 | completed / covered / verified |
| 暂不可用但按钮启用，原前置实测为假 | 0 | blocked / partial / unverified；尝试动作拒绝 |
| 原未知详情效果，直接查询原动作回执后只读核验 | 2 | partial / unverified；信息未解决仍保留未知，重放请求拒绝 |

真实SDK wire与上下文activeTools逐请求一致，没有gap工具。健康同回复两次合法read成功；登记调用后同回复追加的旧source_read被真实串行入口拒绝。unknown中的tool_result_read保持原resultRef、返回原JSON片段和nextOffset，下一次核验仍绑定原第二动作，没有第三次点击。三个新完整报告重启恢复完全相等，准入附件篡改仍使报告降为unverified。缺陷效果failed/covered、其他默认义务pending时partial、既有取消/晚回调及旧报告恢复使用上次未变的证据，不全套重跑或重查旧532项索引；复用理由与文件hash单列。

固定健康流程原11次模型请求，本轮9次；两项相同参数DOM查询各由“许可＋查询”两次请求/调用减为一次。为了单独证明同回复边界，本轮另注入两次读取工具调用，因此测试的总工具调用仍是11次，不能误报为整体工具调用数下降。减掉的是两项许可手续和两次模型往返；没有计量或声称真实模型时延、token节省或成功率提升。原文分页及缺口未解决的处理仍受原预算限制，直接工具也仍可能被反复调用。

浏览器证据位于 `data/r2-product-sources/2026-10-11T13-15-56-942Z`，SDK/比较/测试/构建/失败日志位于 `data/r2-product-acceptance/stage-retrieval-free-20261011`。构建、typecheck、格式、差异检查通过。源码hash `999f8ec7cc419afef0ac8f566a506c89bebbbd806d0dbaac69e1d8abcfebd3db`，构建hash `6cf7c882cd9cda1ce3f7b791d172b856c11ef09918f975868c8c7d4c1785a065`；200项本轮证据索引hash `ede52f7a4865493fc7c9e21510efac2b8aa21a73ea29676f9632651865b64c90`，逐项校验相符。运行开始时基线提交上有这些实现修改，以源码/构建文件hash定位，不冒充干净付费冻结。

**候选结论。** 具备沿原六项标准审阅并冻结真实验收候选的免费工程依据，未证明真实采用稳定性。下一次具体范围保持原R1–R6顺序与三页族，每族两行；读、来源登记、执行或有据弃权、范围、恢复五项标准不变。保留DeepSeek V4.1 Flash/Wafer及原每行20请求/8动作/180秒，模型60秒/工具15秒，整批120请求/25分钟/USD7.56上限、原硬停止和不重试规则。仍需独立真实批次授权；本轮没有生成可消费claim，更不恢复已关闭批次。完整可审查候选见[交付收据](../../evaluation/r2-product-sources/stage-retrieval.json)。


## 直接取证候选真实验收（2026-10-11，第六批已完成Agent审阅）

用户经维护者审阅实现 `f4d655508d8bff24b7a20e1a1f971423b00fb4fd` 和交付 `3e2d1aee69c946ddef25f0e7ca0f5188e853537b`，对“唯一一次原六任务、新增US$7.56上限，历史未知费用保留并暂缓核对，新异常仍停止、无重试补跑”明确回复“好，授权”。准备过程生成的唯一新manifest为 `3cdaebb5b4074bfa5dbc68e7ada02328979e160511994d7ccc6c89b619e9126a`；授权绑定已审阅候选及此hash，不声称用户提前看过hash。独立approval在24小时内使用一次，claim已消费。

执行前干净提交、源码 `999f8ec7cc419afef0ac8f566a506c89bebbbd806d0dbaac69e1d8abcfebd3db`、构建 `6cf7c882cd9cda1ce3f7b791d172b856c11ef09918f975868c8c7d4c1785a065` 与已审阅免费收据一致。复用67项测试、3个必要浏览器流程及明确旧证据，没有重建、重跑或修改代码/提示。原609字符MD、三页族、R1–R6顺序、五项标准与8效果不变。DeepSeek V4.1 Flash/Wafer、reasoning low、4096输出、每行20请求/8动作/180秒、模型60秒/工具15秒，整批120请求/25分钟/US$7.56与每请求US$0.063预留均保持。实时公开报价prompt/completion/cache-read为US$0.000000035/0.0000016/0.000000034每token，符合冻结上限。Jev/视觉/fallback关闭，没有自动provider重试、替补、补跑或额外样本。

**结果为5/6，本期原整批门槛仍未达到。** 六行都实际派发并归档；只有三行执行完两次动作，另两项通过是有来源、有现场事实的前置不足弃权，产品报告依然partial/unverified。8个必需效果为4 verified、2 failed、2 unverified；健康完成1/2且无功能误报，缺陷命中2/2，完整有据弃权2/2。

| 行 | 对照 | 请求 | 读/登记/执行/范围/恢复 | 产品状态 | 已知usage US$ |
| --- | --- | --- | --- | --- | --- |
| R1 | 健康 | 6 | unverified / fail / unverified / unverified / pass | blocked，partial/unverified，0动作 | 0.006550743 |
| R2 | 缺陷 | 10 | 全部pass | completed，covered/failed，2动作 | 0.008745229 |
| R3 | 前置不足 | 9 | 全部pass（有据弃权） | blocked，partial/unverified，0动作 | 0.019079937 |
| R4 | 前置不足 | 6 | 全部pass（有据弃权） | blocked，partial/unverified，0动作 | 0.006443502 |
| R5 | 缺陷 | 14 | 全部pass | completed，covered/failed，2动作 | 0.014729203 |
| R6 | 健康 | 11 | 全部pass | completed，covered/verified，2动作 | 0.012292106 |

**未通过的R1。** 第2请求已获得全文，第3请求四次精确搜索全部单匹配；第4请求再次全文，第5请求又四次成功精确搜索，第6请求再次全文。11次读搜中有5次完全相同输入，没有任何登记尝试或动作。最后原无进展streak=3收尾，3项缺口继续partial。文本和引用可用不等于模型会登记；不能把直接取证或阶段提示当作已解决停滞。该行两个必需效果仍占原分母且均unverified。

**实际采用的通路。** R2–R6均在首次全文后第3请求登记原两步计划，五份计划assumptions为空、精确状态预期和两个必要前置有原文依据，21处登记引用全部在登记前已发出且UTF-16原文匹配。登记后没有再读取source，必要page_inspect/element_details/page_observe直接执行；56份实际wire工具列表逐一与activeTools一致，没有gap工具，当前一步前置在所有相应上下文中等于冻结原计划。该证据确认字段确实送达及直接工具实际使用，不证明模型依靠哪个字段，也不推出固定11→9的真实性能收益。

R2在第6/9请求绑定、第7/10请求实际操作，预览原槽为“预览就绪”，详情原槽为“详情未能展示”，分别verified/failed。R5在第6/11请求绑定、第9/14请求实际操作，同样正确检出详情缺陷。R6在第5/9请求绑定、第7/11请求实际操作，两个原槽为“预览就绪”“详情已就绪”，均verified。六项测量均逐一核对bind < action < measurement、原actionId/requirementId、原结果选择器、单节点值、动作前前置及动态身份准入，与原测量附件一致。三个操作任务已选范围gaps=0；缺陷行covered表示检查范围已评估，功能结果仍failed。未选默认检查和资料未承诺范围未升级为通过。

**前置不足不是动作测量通过。** R3/R4登记来源要求后，实际DOM/element_details记录了availability“暂不可用”、预览disabled和初始状态。R3两次、R4一次bind均在 `product-control-identity-lost` 拒绝，未生成成功绑定或绑定前置测量，更没有浏览器动作。完整有据弃权的依据是原计划加现场DOM及诚实partial范围，不能冒称bind测得前置为假。R3最终请求unverified-scope；R4经无进展收尾，分别保留1/2项缺口，均没有将未准备好解释为功能缺陷。

**仍有动作参数负担。** R5三次、R6两次page_act把itemId填入requirementId，被 `v2-requirement-not-owned` 在实际操作前拒绝；随后改为正确原requirement ID，实际动作仍各2次，不是点击重放或provider自动重试。四个首次错误请求的精简product步骤里requirementId尚未出现；R5第二步的下一请求已经有正确ID，仍重复错误一次。保留原输入、上下文和回执，不能把“后来修正”描述为接口负担消失。此轮没有数量错误、零/多匹配修复或未知效果只读恢复，相关免费证据不冒充真实触发。

**费用与恢复。** 56份请求/完整响应与56笔账本逐笔核对，Decimal合计供应商usage已知 **US$0.067840720**，新unknown/held均0，没有硬停止。批次北京时间21:27:28至21:33:48，进程总耗时380.206秒（约6分20秒）。原US$0.063及更早US$0.116留在原账本，按授权暂缓核查，不计作本批新增未知，也不清零；未修改费用代码。所有63份工具回执对应原call ID，零缺失；6份完整报告重启恢复完全相等、275对原附件/副本hash和字节一致。运行结束、文档修改前完整manifest仍与干净冻结候选一致。

本实验Agent审阅了全部六行、56份请求/响应、63份回执、原计划/动作/测量及费用，不是独立盲测或人类复核。原机械pending-human-review字段保留，完成的Agent语义审阅另列 `review.json`。所有原失败和错误回执保留；本轮657项证据索引hash为 `9229b8d0e6243d03f17fd1f9472d2b5ab7ee25c3b0761eaec7ea42dec0efb9c3`。旧200/532项及历史各批证据复用维护者已核对结果，没有重做全量检查。

[准备索引、精确运行命令、授权、原始证据和逐行审阅](../../evaluation/private/r2-product-acceptance/real-stage-retrieval-acceptance.json)一并交付。唯一授权批次已关闭，不自动补跑R1或新增样本；当前剩余阻塞是登记前重复读取，以及已绑定后的itemId/requirementId混淆。5/6比前批1/6更好是这两批的观察结果，不是稳定收益或因果估计；原六行全部通过的出口仍未满足。未合并、推送或修改main/维护者Roadmap。

## 注册决策与动作参数修复（2026-10-11，免费工程候选）

用户“好的，请你尝试吧”授权本轮有限修复及免费验证。在 `codex/r2-registration-action-handoff` 从 `86d941d` 开始，实施提交 `f4619ed8207655b0d6685334d14076f837028c7a`；没有新增真实推理、收费授权/claim、旧R1补跑、推送或合并。第六批5/6及原六行出口未达保持原样，历史费用继续暂缓核对。

原上下文、全部相关回执及五个错误ID收入 [第六批对照材料](../../evaluation/private/r2-product-acceptance/registration-action-handoff-failures.json)，带三个原审计文件的hash。R1第2请求全文已到，第3请求四个精确搜索没有新增覆盖；原流程最终无登记关闭。R5/R6四次首次错误时compact步骤没有requirementId，第五次在已有正确ID后仍重复错误；不能只归因于缺字段。

v10复用现有remaining-obligation指导的一次额度，在登记阶段无进展1–2时、原预算仍允许且尚未进入finalizing时发送注册/具体缺口/诚实结束提示。没有新取证许可工具或第二套调度框架，不重置计数、不创造进展、不延长关闭。来源覆盖由粗窗口改为精确字符区间并集，允许同窗口内真正新片段，已返回片段内换词不增加进展；语义完整性仍无法机械判定。

绑定成功后通过原检查运行时先生成来源拥有的需求记录，当前唯一绑定的 `nextAction.args` 提供原requirementId和目标/action/value，并进入绑定回执、下一请求和摘要。未改page_act所有权校验；动作前原prepare再次审阅来源，身份/前置/取消/无重放门继续执行。未知ID不会被猜测纠正，也没有程序自动点击。新增采样发生在原工具和运行预算内。

验证为81项原受影响测试加3项补充测试（共84项/10文件），真实SDK经本地固定响应、真实执行器/Chromium/隔离数据库验证五场景。健康10请求/2动作/verified；缺陷9请求/2动作/failed；原R1继续重复5请求/0动作/partial；前置不可用7请求/0动作/partial；未知效果12请求/2动作/partial且重放被拒。忽略提示的R1在第4请求收到一次提醒，第5请求后仍以原streak=3关闭；健康对照选择登记不代表真实模型采用。五个原错误requirementId逐字保留，仅目标ref适配隔离运行的实际观察；正确调用复制程序参数，在同一SDK回复串行跟随错误输入，只有正确调用产生动作。五份完整报告重启后JSON相同，篡改绑定身份仍降为partial。

必要的缺陷/前置/未知路径已重验；未变的mandatory pending完成门及取消/迟到回调、旧版本恢复复用原证据，没有扩展矩阵或重算旧657项索引。补充测试明确无effect、多个effect、来源未sealed、重复binding或其他动作后不提供参数；历史完整性覆盖v2–v10。初两次浏览器断言误用tool:result事件名，补充单测缺原目标admission事件；验证夹具修正，原失败与日志保留，产品实现未因此改变。

构建、类型、格式、diff检查通过。浏览器之后仅补充一个测试文件；最终重建的dist与已测浏览器逐字相同，生产源码无变动，单独记录最终源hash与此差异。[免费交付收据](../../evaluation/r2-product-sources/registration-action-handoff.json)包含精确源/构建hash、命令入口 `--registration-action-handoff-only`、逐轮对照、失败日志和新证据索引。工程上可审阅/冻结，真实采用仍需独立授权后按原六行/五项标准验证；本轮不生成该授权。原模型/供应商、20请求/8动作/180秒、硬停止及不重试规则未改。维护者Roadmap与main未修改。

## 注册/动作衔接候选真实验收（2026-10-11，第七批硬停止并交付）

用户在维护者会话 `01a1116d-7621-7962-b4fe-5f904b5fbf13` 对“一次原六任务、新增US$7.56、历史未知费用暂缓核查、新异常停止、不自动重试或补跑”明确回复“授权”；本Agent读取原用户消息核实。授权对象是已审阅交付 `4bc7e3a12427a16354bdbe2240794282a0ea11ea` / 实现 `f4619ed8207655b0d6685334d14076f837028c7a`，不是声称用户提前看过随后冻结的manifest。独立分支 `codex/r2-registration-action-handoff-acceptance` 上的干净候选，源码 `d014f1eb86789f12935b577e04cbbee355452de02c074d742ea385f75ffc9627`、构建 `0c63c3e8f715d44770265046ed21cf6796bda387b20b3b62baa56ff9a902e7b2` 与免费交付一致。复用84项/5场景记录，不重建、不重跑免费套件，不改产品或提示。

新manifest `0d0c1038c33a20bdf795fb445eb4bb30da780c0c8aba2e8b8bc179a373458afe` 绑定独立approval及一次性claim，在接收授权24小时内只执行一次。原609字符MD、三页族、六行次序、五项标准和8效果分母均未改；原模型/供应商、reasoning low/4096输出、每行20请求/8动作/180秒、模型60秒/工具15秒、整批120请求/25分钟/US$7.56、每请求US$0.063预留、零重试/fallback/Jev/视觉全部保留。公开报价及原费用闸门只读核对通过，runner/support/费用保护与上一冻结完全一致。

**本批未达到原完成门槛：0/6达标，只有R1派发后中断，R2–R6未运行。** 不是六次已完成任务失败，也不将上批5/6或免费回放拼入本批。R1先overview、再source_read，第二请求已返回完整609字符原文及引用，第三请求携带完整来源覆盖，剩余18请求/8动作/174211毫秒。第三请求在60秒模型时限内未完成，模型记录 `model-request-timeout`，网关记录 `downstream-disconnected`，整批首个停止原因为 `transport-error`，并将该请求记为unknown。原停止闸门取消R1、禁止后五行，未重试、补跑、替换、额外推理或中途修补。

请求 `631f848c836e5ded0f9b3f34` 的上游时序为：HTTP 200头约10298毫秒，首字节10777毫秒，首SSE data事件59094毫秒，到60秒取消时仍无完整响应/usage。既有“全部校验后才释放”边界没有释放任何内容给执行器；第三条responses记录 `transportComplete=false`、events为空。上游timing保留11082字节/20个事件的计数，但该包装器原本不持久化校验前的部分正文，因此不能还原或声称保存了完整第三次供应商响应，也不能推断其计划、工具选择或供应商内部根因。全部现存成功/失败记录原样保留。

| 行 | 本批状态 | 语义验收 |
| --- | --- | --- |
| R1 healthy | cancelled，partial/unverified；3请求、0登记、0动作 | 原文读取和诚实范围/恢复有证；登记与两步执行未完成 |
| R2 defect | 未派发 | 未评估，保留分母 |
| R3 unavailable | 未派发 | 不计有据弃权，保留分母 |
| R4 unavailable | 未派发 | 不计有据弃权，保留分母 |
| R5 defect | 未派发 | 未评估，保留分母 |
| R6 healthy | 未派发 | 未评估，保留分母 |

登记决策引导0次：前两个请求有真实来源进展，尚未发生重复读取/无进展提醒触发。无登记、绑定、nextAction或page_act，故正确参数采用0次、错误ID0次都属于未触达，不能宣称修复生效。8个要求效果全部未测，其他mandatory/source义务仍pending、范围partial，无虚假covered或功能缺陷结论。本批不能支持可靠性、因果收益或稳定性判断。

执行从UTC 14:51:59.207至14:53:08.057（上海22:51:59至22:53:08），总68.850秒，R1报告运行65837毫秒。3份真实请求、2份完整响应、1份中断响应记录，已释放2次工具调用均有原回执，无已派发工具回执缺失。原R1报告与关闭fixture后重启恢复完整JSON一致，8对原始/复制附件字节及hash相同；执行后完整manifest仍与冻结相等。

费用逐笔核对：第1笔US$0.000270555、第2笔US$0.000306815，已知合计 **US$0.000577370**；第3笔actual=null，新增 **US$0.063 unknown预留**，held为0。已知加预留US$0.063577370是账面占用，不是已结算账单或已证实的最终费用上限。本次新增unknown没有忽略或清零，并保持批次关闭。旧US$0.063及更早US$0.116仍在原账目，按用户要求暂缓核查，不作为本批新增unknown；没有历史对账或旧批次恢复。

[最终交付](../../evaluation/private/r2-product-acceptance/real-handoff-acceptance.json)内含Agent逐项审阅、原请求/响应/事件/时序/费用、精确命令及88项新证据索引，索引hash `0e9941a5d46752997ab21686056233527aa85d629380d0e2d1f8cb4e0fa941b4`。原runner机械字段pending-human-review仍保留，不冒充独立/人工语义审阅。结论是本期R2原六行出口仍未达，剩余为真实采用与完整六行验证未获得证据，以及本次最终费用未知；本授权已消费并关闭，不自动追加修复、试验、对账后续跑或旧R1补测。不推送、不合并main、不改维护者Roadmap。

## 同候选独立重跑授权：报价门阻断（2026-10-11，零推理派发）

用户在维护者会话对“一次同候选独立六任务、新增US$7.56，并接受保留上批US$0.063未知预留；新异常停止、不连续重试”回复“授权”，原用户消息已读取核实。新分支 `codex/r2-handoff-repeat-acceptance` 从仅记录上批中断的 `b3c63ae27064d4b5266426c821600988094342a8` 开始；产品仍为已审阅 `4bc7e3a/f4619ed`，源码 `d014f1eb86789f12935b577e04cbbee355452de02c074d742ea385f75ffc9627`、构建 `0c63c3e8f715d44770265046ed21cf6796bda387b20b3b62baa56ff9a902e7b2` 完全相同。与上批冻结相比仅实际HEAD和实验文档hash变化，其余manifest字段一致，未换实现、提示、模型、输入、预算或费用保护。既有84项/5场景证据复用，不重建、不重跑。

**本次在价格预检阶段被拒绝，六行均未派发。** 原 `validateQuote` 在prompt价格校验处抛出 `quote-outside-policy`。随后仅为解释差异保存一次只读公开报价快照，Wafer输入价为每token US$0.00000006（每百万US$0.06），高于既定每token US$0.00000005（每百万US$0.05）上限；输出价每百万US$1.60仍在原上限内。新增总预算授权不意味着可修改原单价保护，故未尝试启动，不轮询等待降价、不修改闸门、不换供应商或扩大预算。

初始预检助手在保存报价前执行校验，因此被拒绝的第一份原始报价正文未留存；后续快照单独注明采集时间，只能证明再次只读观察到同一拒绝及当时的价差，不冒充首份响应。准备approval时因首次冻结尚未发生而遇到manifest缺失，生成步骤未完成、launch未调用；两个准备错误均保留。没有读取推理凭据、模型请求、provider重试、新账本、浏览器动作或新unknown/held。

为阻断记录离线冻结的候选身份为 `382a066af41b7700c5fc04f964e0c64a12e7efd51b05091e7f416ab5ab8613fe`，生成于价格拒绝后；授权基于相同已审阅候选，不声称用户提前见过该hash。仅保存授权接收/阻断说明，没有生成可执行approval或消费新claim，也没有恢复旧claim。第六批5/6、第七批R1超时中断及三笔历史unknown（上批US$0.063、此前US$0.063、更早US$0.116）原样保留、暂缓核对；本次新增已知费用、unknown及held均为0。

原六行/五标准/8效果分母保留，0行得到新验收结论、6行未运行，不解释为六次模型失败。登记引导和nextAction均未触达，无原来源/动作/效果/报告恢复可评估；不能判断修复收益。R2原完成门槛仍未达到。22项阻断证据及单独的公开报价快照见[交付记录](../../evaluation/private/r2-product-acceptance/handoff-repeat-price-blocked.json)，索引hash `5588422722a7cec66f53abdb2249744ad8a4de3f185a3bf043ce21e3a09f429b`。本次尝试停止，不自动追加实验、修复或重新启动；不推送、不合并main、不改维护者Roadmap。

## 输入报价上限的新授权（2026-10-11）

在已说明Wafer输入报价每百万US$0.06、旧上限US$0.05及原六任务/US$7.56范围后，用户在本会话直接回复“接受上限，允许运行”。本次按上下文将输入报价门上限精确调整为每token US$0.00000006（每百万US$0.06），仅授权一个独立原六行批次；输出上限US$1.60/百万、每请求US$0.063预留、整批US$7.56、131072字节请求上限及原模型/供应商/样本/调用/动作/时间/硬停止/零重试规则全部保持。旧三笔unknown继续保留，未授权恢复旧claim、补跑或连续重试。

唯一执行代码变更为验收policy的promptPrice，附2项针对报价接受/超价拒绝及授权绑定的本地检查；6项未变网关/费用测试复用已有证据，不重跑免费产品矩阵、不重建产品。产品实现和构建仍为已审阅4bc7e3a/f4619ed；新批次将如实绑定包含该价格调整的实际干净HEAD及后续生成manifest。此前报价阻断和R1超时记录不覆盖、不改写。

## 输入报价获准后的衔接候选真实验收（2026-10-11，第八批已完成Agent审阅）

用户在报价阻断后明确“接受上限，允许运行”。仅将输入价门限从US$0.05/百万改为US$0.06/百万，执行commit `8ef46a110b8a46d232797302f358d1500ec680af`，产品仍为 `4bc7e3a/f4619ed`。价格边界两项针对性测试通过，未重建或重跑已审阅84项/5场景。原609字符MD、三页族、六任务顺序、五项标准与8效果分母，原模型/供应商/low/4096、131072字节、每请求US$0.063预留、批次US$7.56/120请求及全部时间、动作、停止门均未改变。

独立新manifest `8c925ab5f744bcd2fc6664bffc7c3ee4f5c2636b6e435fdde970ab21f7e0638f` 在授权后冻结；不声称用户提前看过该hash。公开报价在预检及CLI启动时均通过，独立approval只消费一次claim。执行中无代码/提示/配置修改，结束后完整manifest仍等于冻结。没有恢复第七批、复用其账本或覆盖报价阻断记录。

同一实验Agent逐项语义审阅结果 **5/6，原整批出口仍未达**，不是独立或人工审阅：

| 行 | 实际请求/动作 | 原报告 | 语义审阅 |
| --- | --- | --- | --- |
| R1 健康 | 5 / 0 | blocked，partial/unverified | 已读全文，7次读搜含3次完全重复；第4请求登记提醒后仍重读，第5请求原streak=3关闭，未登记，未达标 |
| R2 缺陷 | 11 / 2 | completed，covered/failed | 第4请求提醒当轮登记；缺前置选择器的首次绑定被拒后修正；预览verified、详情原槽failed，达标 |
| R3 不可用 | 6 / 0 | blocked，partial/unverified | 第3请求有效登记；真实节点显示暂不可用及disabled，绑定身份门拒绝；有据弃权，达标 |
| R4 不可用 | 9 / 0 | blocked，partial/unverified | 首次登记缺字段且含截短未发引用，被拒；提示当轮重读，第4请求修正登记；真实不可用/disabled节点、两次绑定身份门拒绝，有据弃权，达标 |
| R5 缺陷 | 8 / 2 | completed，covered/failed | 第2请求登记，原预览verified、详情failed，达标 |
| R6 健康 | 9 / 2 | completed，covered/verified | 一次重复全文后第4请求提醒当轮登记，两项原效果verified，达标 |

两项有据弃权不是操作路径verified，也不是成功绑定测得前置为假；三行完成两个动作。8效果仍为4 verified、2 failed、2 unverified，健康完成1/2、缺陷识别2/2、有据弃权2/2，无功能误报。五个成功计划均无assumptions，20处引用已提前发出且UTF-16精确匹配，两个前置、各自状态预期及action-complete语义由原文支持。R4失败登记的3处引用字段中1处未发且不匹配，与缺字段错误一起原样保留，不混入成功引用统计。

**两处修复的实际采用边界：** 登记提示分别在R1/R2/R4/R6的原streak=1送达，只在R2/R6当轮产生成功登记；R4当轮重复读取、下一轮才修正，R1始终未登记。没有重置streak或增加预算。R2/R5/R6的六个原模型page_act输入均显式匹配当轮`productPath.nextAction`的requirementId/ref/type/value，六动作均追溯到原独立需求测量，错误requirementId为0。R5额外填写verify，不替代原需求效果。可确认可观察参数采用，不能据此证明内在依赖、普遍消除负担或因果收益。与第六批56请求/5次ID错误相比，本批48请求/0次仅为描述性观察；费用也不据此推断下降。没有真实触发未知效果不重放或零/多选择器修复，其免费证据仍独立。

运行322.537秒，48次请求/48完整响应，57工具回执无缺失；已知usage **US$0.074159028**，本批new unknown/held均为0，未触发硬停止、供应商fallback、自动重试或补跑。三笔历史未知预留US$0.063、US$0.063、US$0.116原样保留并暂缓核查，不是结算为0。六份完整报告重启恢复一致，276对原附件/副本字节与hash相同；48份wire工具集合均匹配实际阶段，当前前置匹配原计划，成功登记后无source重读。

667项新证据索引hash为 `57b0eb3329c82b1ffbc43b573f722b9b8bc8f3c9d02a25ae2a6722d5bf6c3c9d`。原请求、回执、失败、动作、费用、恢复、冻结身份、批准/claim和精确命令见[完整交付](../../evaluation/private/r2-product-acceptance/real-handoff-price-acceptance.json)。本批已关闭；不自动补跑R1、追加样本、继续修复或核查旧账。不推送、不合并，不改main或维护者Roadmap。
