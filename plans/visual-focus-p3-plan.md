# P3 开发任务书：可信验收工具与可复核报告

状态：P3 ready；主 Agent 已完成复查修复及全部 G0–G3 免费验收，记录见 [P3 交接](visual-focus-p3-handoff.md)。P2 已由主 Agent 修复并验收；本文件只安排 P3，不启动 P4。配套文件：[逐项验收](visual-focus-p3-acceptance.md)、[可直接转交的指令](visual-focus-p3-dev-prompt.md)。产品语义仍以[总任务书](next-development-plan.md)和[完整验收计划](visual-focus-acceptance.md)为准，本文件细化 P3 的交付接口与阶段边界。

## 1. 基线、开工与完成定义

起点为远端 `review/visual-focus-p2` 的最新提交，必须包含 `c5aa03a41fc90424127e2965c402510a3536c6bf` 及本套材料。不要从 main、原始 P2 bundle 或 `dev/visual-focus-discovery` 继续。

```sh
git fetch origin
git switch -c dev/visual-focus-p3 origin/review/visual-focus-p2
git merge-base --is-ancestor c5aa03a41fc90424127e2965c402510a3536c6bf HEAD
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm fixture:approved-retry -- --verify
```

已有同名开发分支时先核对其祖先与工作区，不用 reset/force push 覆盖已有工作。使用 package.json 声明的 Node/pnpm 版本。阶段性 commit、push 到 `dev/visual-focus-p3`，不合并 main。

P3 完成意味着：G0–G3 全部免费验证通过；正式诊断/矩阵运行器可以执行、拒绝非法输入、保存完整失败和费用；独立评分器及停服审计能拒绝损坏证据；报告能通过真实 API 恢复。**不意味着真实 G4/G5 已通过，也不意味着整个视觉功能 accepted。**

本轮不调用付费模型，不运行真实 18/45 轮，不更换模型、不扩大运行预算、不调 prompt 提高已知六例通过率。发现免费测试揭示的产品错误应修复并加针对性回归；不只交测试清单或 TODO。

P2 基线为 90 文件 / 844 测试通过，真实开发 smoke 六例通过；这些是历史证据，不能替代 P3 新结果。[P2 交接](visual-focus-p2-handoff.md)中的本机 data 路径不是必需输入，缺失不阻塞开发，也不用索取该机器的 learning 数据库。

## 2. 现状与模块分工

先阅读以下代码，明确复用与缺口；路径是仓库相对路径。

| 已有模块 | P3 要做什么 |
| --- | --- |
| `scripts/validation/visual-focus.ts` | 保留免费预检，增加严格的 diagnostic/formal 分派；把共用准备/收尾抽成小模块 |
| `scripts/validation/visual-focus-p2.ts` | 可提取隔离服务、模型记录、API 收集流程；保留 P2 smoke 身份，不直接改名充当正式验收 |
| `evaluation/preflight/visual-smoke-score.ts` | 调用了产品 `focusReceiptVerdict`，只能做开发 smoke，不能是独立评分器 |
| `evaluation/fixtures/visual.ts` | 私有六例真值可复用；现有 `scoreVisualCase` 证据检查不足，不能直接用于正式通过判断；清理“旧六例仍是 holdout”和未提交脚本的过时注释 |
| `evaluation/support/model-gateway.ts` | 固定模型、提供方、计量和脱敏复用；补可持久化的共享 campaign 费用接入 |
| `evaluation/support/build-identity.ts` | 复用完整构建 hash；补明确协议/fixture/profile 标识，不能只记录 server bundle hash |
| `evaluation/support/campaign-evidence.ts` | 复用 API 下载和停服读取；补完整事件、hypothesis、字段及文件集合对照，不能只比较最后 seq |
| `evaluation/private/export/campaign.ts`、`scorer.ts` | 保留原 A/B/C/D 矩阵、批准门槛和业务判定；新视觉评分另设模块 |
| `evaluation/support/approved-retry.ts` | 校验并导入 Git 内历史批准 fixture；不产生一次新批准 |
| `scripts/validation/business-{diagnostic,formal}.ts` | 接入同一费用台账与冻结身份，显式关闭视觉发现，保留旧业务评分 |
| `src/server/reports/run-report.ts`、`src/web/main.tsx` | 补缺失的范围、完整性、采样和视觉用量展示及恢复测试；已有能力不重写 |

建议新增 `evaluation/private/visual-focus/` 放独立评分、协议、矩阵计划与就近测试；共用 campaign 台账放 `evaluation/support/`；新入口放 `scripts/validation/`。这是建议目录，不要求机械照搬文件名。运行服务不能依赖 evaluation/scripts，私有真值不能进入 Agent 工具、公开页面配置或模型请求。

不复制一整份 business-formal 来换 case 名；不把全部职责塞进一个新大文件。评分器独立判定是必要的重复验证，共用进程管理、字节哈希、费用及 CLI 解析不应重复实现。

## 3. 按顺序开发

### P3.1：独立评分器与证据契约

先实现纯评分函数，再接运行器。输入包含：私有 fixture revision/truth、正式 API report 与完整历史、下载的证据及索引、模型网关记录、目标身份/几何的只读见证。输出为版本化分项断言，至少包含 `code / passed / expected / actual / evidenceRefs`，以及漏检、误报、证据无效、业务失败等原因。缺数据返回明确失败，不能抛错后丢掉样本。

允许复用通用类型、JSON schema、哈希和字节读取。**禁止直接或间接调用产品的 `focusReceiptVerdict`、`evaluateFocusVerdict`、`focusReceiptSupports`，也不能以 `isFocusReceipt` 的结果代替独立字段验证。** 评分器从持久原始记录重算结论，不把 report.validationStatus 当答案。用单字段损坏测试证明这种独立性，而不是只测试实现自身生成的通过样本。

必须交叉验证：

1. 图像确实发给视觉模型；发送的图像字节 SHA 与当前 run 原图相同。原始 Qwen 响应明确为 `normalized-1000`；转换依据是保存的 CSS viewport，不能用 DOM 真值推断单位。独立核对转换前后框、DPR/图像尺寸与 `visual-focus-3` 或后续显式版本。
2. candidate、截图、hypothesis、binding、receipt、finding、annotation 属于同一 run/有效 document 状态，所有引用可解析。语义绑定有 DeepSeek 工具调用记录；实际绑定的是私有真值对应原生节点，不能仅凭描述字符串或相同 bbox 判定正确。
3. 现有 runtime 的 `nodeIdentity` 是绑定时生成的 UUID，单有这个值无法独立辨认私有目标。补通用的 binding witness：同一 ElementHandle 采集的原生 tag/type、DOM 定位与公开属性、bbox、document epoch、elementRef、snapshotRef 和 nodeIdentity，保存为证据；不接收私有 selector。评分侧再用私有目标定义与保存的观察核对身份，并用真实浏览器双 input 反例验证见证对应实际节点。若 DOM 证据不足以唯一辨认则失败，不用第二个状态不同的浏览器推断当前 node identity，不为此开放远程调试端口。禁止把私有 selector/预期结果送给 Agent 或预先写入它的候选。
4. 候选与私有合理区域的交集比例沿用 fixture 的 `regionOverlapMin`（当前 0.6）；这个比例本身不能证明发现了缺陷。控制点必须在真实 input 内，左右点必须在候选/合理区域内，缺陷证据点必须在真实 input 外且不落入私有图标排除区；所有采样不得命中相邻按钮。H0 的 label 代理即使 hit 不是 input，真实焦点转交仍为健康。
5. 控制成功；每次采样都有独立未聚焦基线；左右两点有效；非聚焦必须有完整 500ms 观察记录；失败点在同一位置独立重置后复测，且再次失败。核对逐次 reset/click/sample 顺序、身份、稳定性、值变化和 integrity。只写 `windowMs:500` 不足以证明实际测满；缺少实际采样时间记录应补证据字段。
6. 真实点击事件数、receipt.actionCost、run action 用量一致，重复调用不会重复执行；每探针最多 8 点击。缺控制、缺复测、重复样本、干预或未知状态均不能变成 supported/refuted。
7. D0/D1/D2 必须完整证据 supported；H0 必须实际调查并 refuted；H1/H2 可没有候选，但有有效扫描、有限覆盖说明，无该类 supported、未解决相关假设或视觉覆盖缺口。unknown 不能当健康通过。
8. 所有案例仍完成原 C0 购买、显式 finish，符合原归属/写入/预算约束。不能因为某个 finding 正确，就忽略业务失败、其他错误 finding 或未测量分支。

D2 不要求模型必须输出非空 excludedRegions 才能过关；要求实际取证点均避开私有排除区。P2 已发生“模型未画出图标排除框但点击点全部有效”，不能据此宣称模型识别了全部图标，也不能倒灌真值修正模型框。

### P3.2：冻结协议、矩阵与 CLI

以下是 **P3 要实现的接口**，当前基线只有 preflight、p2-smoke 和既有 business 入口。`--campaign` 为本轮新增共享台账参数，路径指向一个持久 campaign 目录。

```sh
# 免费；本轮要实际执行
pnpm validate:visual-focus -- --preflight

# 下面为 P4 操作示例，本轮仅实现并用本地替身测试，勿实际付费运行
pnpm validate:visual-focus -- --diagnostic --campaign data/campaigns/visual-focus-final
pnpm validate:visual-focus -- --formal --campaign data/campaigns/visual-focus-final --diagnostic-source <visual-diagnostic-dir>
pnpm validate:business -- --diagnostic --campaign data/campaigns/visual-focus-final
pnpm fixture:approved-retry -- --out data/fixtures/approved-retry-p4
pnpm validate:business -- --formal --campaign data/campaigns/visual-focus-final --diagnostic-source <business-diagnostic-dir> --approved-source data/fixtures/approved-retry-p4
```

保留既有 business 单独运行方式的明确语义；本轮联合验收必须提供同一 `--campaign`。不要令旧独立入口获得联合验收资格，也不要保留两套不同的费用计算实现。P2 smoke 继续是开发入口，其旧文件格式不能作为 P4 diagnostic-source。

- CLI 参数严格解析：拒绝未知/重复参数、缺值、模式冲突；无参数维持免费默认，绝不默认付费。解析、凭据、冻结源校验失败应在任何付费请求前退出。
- preflight 使用本地固定响应，清空真实凭据，网关不允许外部转发。免费测试以捕获到的上游调用数为零作断言。固定模型入口不得从正式付费 CLI 选择，不能靠环境污染把 mock 结果标为 real。
- diagnostic 包含一次真实结构化视觉 smoke 和 D0/H0/H1 三例；formal 固定六例各三次 18 行。既有 business 固定 45 行；部分 groups 即使通过也不是完整联合通过。
- 每个阶段在开跑前保存全体计划行；每次结果落盘。结束的 `runs.jsonl` 每个 `(case,repeat)` 恰好一行，包含 not-run；若用追加事件做恢复，必须另有不含重复行的最终清单。
- 正式门槛核对 diagnostic 的 kind、real 模式、全部通过、证据/audit 完整、冻结身份及 campaign 归属；不能只相信一个 `passed:true` 文件。preflight/P2 smoke/其他 campaign/已变更 build 都不能授权 formal。
- P3 免费测试验证 18/45 行计划与调度、成功/失败/中断等分支；各六例通过真实浏览器/正式 API 免费预检。无需让每种故障都重复跑 63 个真实浏览器任务；纯计划测试不能冒充真实模型验收。

冻结身份至少包含：clean source commit、完整 build hash 及文件清单、protocol hash、fixture revision/hash、评分器版本、算法版本、公开目标 hash、models/providers、feature profile、run/model/tool 预算。收费阶段启动前重新校验，过程中不改构建。测试可能重建 Vite 测试资源，**最后一次测试之后重新 `pnpm build`，再生成用于收费的 identity**。

正式配置固定如下；P2 开发 smoke 的 blockerReview=0 不能冒充这个配置的 diagnostic：

| 项 | 新视觉 diagnostic/formal | 旧业务 diagnostic/formal |
| --- | --- | --- |
| Agent / Vision | `deepseek/deepseek-v4.1-flash` / `qwen/qwen3.7-plus` | 相同 |
| Agent / Vision provider | Alibaba；禁止 fallback | 相同 |
| 有限阻断审查 | 现有 `typesafe/jev-1.13` 配置，记录实际路由，不冒称 Alibaba 提供 Jev | 相同 |
| `EXECUTION_VISUAL_DISCOVERY` | 显式 1 | 显式 0，不继承调用者 env |
| `EXECUTION_ATOMIC_INVESTIGATION` / `EXECUTION_BLOCKER_REVIEW` | 显式 1 / 1 | 显式 1 / 1 |
| run 上限 | 300s、40 actions、30 次共享模型调用 | 相同 |
| model / tool 时限 | 60s / 15s，继续受剩余 run 时间限制 | 相同 |

沿用现有有限请求恢复策略，每次真实尝试都计入预算；不新增隐藏的 case 重试。视觉扫描仍最多两次且第二次仅为状态失效重采集，不借此对模型无效输出反复重试。

当前 D1/D2/H2 是已知回归例。P3 增加 fixture revision/hash 及用途记录，并测试 formal 拒绝未通过主 Agent holdout review 的 revision；不要伪造 review 标记。P3 可用明确的 test-only revision 测门槛分支。P4 由主 Agent 在算法/prompt 冻结后准备新 revision，确认真实页面几何与未调试状态，再冻结完整构建。P3 不因这项 P4 工作尚未发生而阻塞交付，也不能提前宣称盲测通过。

### P3.3：一个持久费用台账与诚实的失败记录

优先用已有 libSQL/SQLite 完成小型事务台账，不引入服务、队列或新框架。campaign 只有一份权威记录，各 runner 的 ledger/summary 为其可核对导出。默认上限整个 campaign $2，来自 `VALIDATION_MAX_COST_USD`；无效、负数、NaN 拒绝。已有 campaign 的额度不会因新进程 env 自动覆盖。

台账最少保存 campaignId、上限、阶段身份、唯一 requestId、run/phase、model/provider、请求状态、预留、已知费用/未知费用标记、时间和来源。请求发送前事务性预留；并发请求不能同时花掉最后余额。完成后以实际费用结算并释放对应预留；已发送但无法确定 usage 的请求保留未知预留，不能按 0 结算。明确未发送的拒绝可释放。

重启后重新打开同一 campaign 仍计入此前所有 smoke/诊断/失败费用；重复导入或重复完成同一 requestId 不重复收费。中断时在途预留转为待核实/未知，不自动清空。请求价格来源及保守估算要落盘；实际费用高于预留应如实记录并停止后续，不宣称估算上限可撤销提供方已产生的费用。

为控制范围，campaign 执行采用单 runner 租约即可：第二个进程明确拒绝，不实现多机器调度。恢复可重建账本和读取结果，但中断阶段不能从中间自动续跑成通过；新批次保留旧费用和全部失败引用，重新满足门槛。失效租约只能在确认原进程终止后解除；不以简单超时强抢仍在运行的进程。

运行器分类至少分开：`quality-failure`、`provider-error`、`configuration-error`、`evidence-invalid`、`isolation-lost`、`side-effect-unknown`、`cancelled`、`budget-exhausted`、`not-run`。分类在评估层，不强改产品已有 run 状态枚举。

- 普通质量失败保留，继续可安全执行的预定样本，最终非零；供应商错误也留在分母中，安全可恢复才进入下一样本，不重试当前案例以替换记录。
- 隔离丢失、未知副作用、持久化不一致、取消、额度触发立即停止，余下计划行标 not-run。取消当前正式 API run，等待停止，保存已发生的请求/动作/证据；不得自动 reconcile 后续跑。
- diagnostic 连续两次同机制失败时停止付费诊断并交最小复现；此状态也应可测试，不需要真的花钱制造失败。
- 正常通过返回 0；质量/门槛/预算/提供方等失败返回 1；CLI/必要配置非法返回 2；SIGINT 收尾后返回 130。现有 business 具体错误码可保持兼容，但全部失败必须非零，并记录分类。kill -9 无法执行收尾，下一次只做恢复审计并把不完整阶段标失败，不能伪造正常停止记录。

### P3.4：证据协议、停服审计与 Web

沿用完整验收计划 G6 的 `data/visual-focus-validation/<timestamp>/` 目录结构，business 既有目录通过 campaign-summary 关联，不搬改历史数据。manifest 标 `mode: fixed | real`、`stage: preflight | diagnostic | formal`、schemaVersion 和冻结身份；requests/ledger 关联唯一 requestId、case/repeat/runId。记录调用数、失败尝试、未知 usage、总墙钟及视觉/Agent/工具分项；重叠耗时不能相加冒充墙钟。脱敏密钥/认证头，不把私有真值或额外模型推理全文展示到产品解释中。

每个计划行都保留结果、原因、report/score/artifact 引用；未创建 run 的样本显式 `runId:null`。独立计数 assertions 区分发现成功、误报、漏检、业务路径失败、未验证范围。顶层 artifact-index 覆盖全部已有样本的证据集合，保存所有权、字节数、SHA、相对路径；原始文件不被标注替换。

停服前从正式 API 收集完整分页历史，不能把默认尾部 N 条当全历史。服务退出后新建数据库连接，逐项对照 run 状态/结果/用量、全部事件 seq/ID/type/payload/evidenceRefs、hypotheses、findings、artifacts 和批准规则身份；对比集合与内容，并验证事件 seq 无重复/缺中段。原文件与下载文件都校验字节和 hash。历史只含部分记录的 approved fixture 继续按原“selected-records”来源检查，不能对它伪造完整 run 审计。

报告从持久 API 数据恢复，不依赖 executor 内存或当前 env。视觉区域必须展示：原图、派生标注、视觉框与实际 input 的区别、逐点坐标/控制/重置/复测/焦点时间、500ms 限制、integrity、unknown 原因和视觉请求计数/费用。费用未知显示未知或预留，不能显示 0。尚未持久保存的费用可在报告领域层补小型版本化投影；旧报告缺字段显示未记录，不重算伪数据。

标注只能表达测过的点；不能把整个视觉框涂红声称全区域不可用。缺图/缺测量/损坏引用显示明确错误，不能空白后继续显示证据完整。新增轻量子组件整理已有 UI 即可，不改设计系统、不引入框架。

### P3.5：免费验收与交接

逐项完成[验收清单](visual-focus-p3-acceptance.md)，使用真实执行结果填 `plans/visual-focus-p3-handoff.md`。该交接文件由 dev 在完成过程中创建，不预填 pass。

至少包含：base/head、每个任务/验收 ID 到代码及测试的映射、命令/退出码/实际测试数、最后 build hash、fixed/real 区分、付费请求数=0 的证据、失败与修复记录、截图及审计目录、剩余 P4 事项。每项未完成都写明，不用“基本完成”覆盖失败。

新增必要输入必须进 Git；生成的 data/原图/模型记录/DB 不进 Git。免费证据可在任何机器重建，不能引用一份未提交的临时脚本作为唯一复验方式。Git 批准 fixture 原样校验，不再次批准。

最后 commit + push `dev/visual-focus-p3`，给出 HEAD；若交付 bundle，必须包含该分支的完整必要提交及可验证基线。结论只写“P3 ready for review，P4 尚未执行”，由主 Agent 复查和更正。
