# R0 → R1 离线依赖交接

2026-10-09（Asia/Shanghai）。**R1离线接入所需的R0状态依赖已交付；R1侧读取、保留v2语义及使用验证待其分支确认。** 这不是R1完成结论，也不是原正式真实模型/UI/业务验收通过。当前窄目标没有需要先补R0产品能力或重跑浏览器的阻断项。

冻结产品：`27614b7a60293a80f3be7b321d164d3599dd0964`；阶段交付：`5070fb227684cbad821c51a8310280b12505787f`；工作区和分支保持原隔离位置。本次只增加提取工具、公开小包及文档，不改产品、评分器、完成门、R1源码或旧8状态，不启用默认功能，不扩大权限、不付费、不推送/合并。

R1直接从这个绝对路径开始，不依赖旧会话：

`/Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel/plans/r0-r1-dependency-v2/index.json`

## 能依赖的能力及证据

| R1依赖 | 已有接口/公开事实 | 版本与证据 |
| --- | --- | --- |
| 稳定已选事项身份 | inspectionScope.candidates.itemId、ref、snapshotId；前缀scope事件selected/status | url-scan-default-4、bounded-ui-sampling-2；V02→V03相同run/事项从未选到固定三项，未用重建后的新ID替换 |
| 通用与效果未完成义务 | inspectionScope.checks中的sourceReview、generic、effects；outstanding及整体counts | default-check-contract-2、item-checks-2、public-effect-sources-1；V04通用已收集与另一待办，V05效果pending，V06晚到未完成 |
| 候选/公开DOM/规则事实 | 原实际输入observation、inspection、knownRules、pendingKnownRuleChecks、observedRuleTriggers及公开工具回执 | 六份public.actualInput；有界页面事实与规则结论不是私有答案，也不是页面文本授予权限 |
| 原动作与只读恢复关系 | checkRef/itemId/actionId、generic receiptRef、checkInteractions及attemptsRemaining | 工具契约29；V04–V06有已派发动作/回执；既有R0免费repeat和recovery-budget材料证明重复派发拒绝与两次共享恢复约束 |
| 完成、partial与真实缺陷区分 | 未完成效果或来源仍是gap；完成必须所有义务有据；failed可为已结论缺陷 | inspection-proof-4、ui-check-report-2；阶段交接28场景记录、独立6基线/38攻击、报告回归16项；本包不把终态反馈回填较早时点 |
| 无权限/预算/不确定时交回 | 匿名、同源、有界、禁止业务写入的contract事实；历史预算与显式unknown | scope/access由执行器核验；离线建议只inspect，无法建议则handoff；没有获得click、支付、重放或新增预算授权 |

R0阶段构建、API/SQLite/产物身份及失败详见 `plans/evidence/r0-default-check-v2-delivery.json`。本次读取的是确定性provider驱动真实执行的历史状态，不是新的真实模型决策轨迹；不得把后续工具选择当“Agent最优答案”。

## 离线接口兼容与实时边界

已阅读R1的 `plans/r1-decision-pilot/offline-advice-v1/README.md`、旧公开状态README，以及纯数据contracts和offline-advice适配边界。输入继续采用严格 `r1-exploration-input-1`，State envelope沿用既有结构；新 `r0-v2-public-state-1` 在public和candidate.context.r0V2表达两维摘要、完整文件hash及公开原始状态。

旧offline-advice CLI固定8状态，本次不绕开其限制或替换原路径。旧makeAdvicePacket会丢弃新facets；R1须在自己的实验分支选择新包并保持完整v2事实，给程序和未来Jev同样的候选/事实/hash。6份inputs已经过原parseExplorationInput只读解析，但这只证明输入兼容，不代表旧CLI直接支持它们或新适配已完成。

离线排序可依赖“当时已选且未完成”“公开可调查的问题”“先前已看见的规则/操作事实”。未知实时permission、动作时长、费用上界、节点连接或后续读取价值只限制实时派发/执行收益结论，不能据此把所有候选判为不可建议。已知禁止、越界、未选、无inspect范围、已完成且无明确复查理由仍须排除。V02有控件但没有冻结选中项，应交回选样；不是网页无候选。

实时执行前才必须核对当前页面/节点身份、同源与副作用权限、剩余时间/请求/金额、冻结来源、原动作未被打断、恢复次数及完成/证据完整性。离线包不提供这些现时保证：documentVersion为unknown、cacheable=false，美元上界未知；不自动重放，也不靠“generic已经完成”覆盖必需效果。

V05的效果在截断时是pending，原批次最终成为unverified；本包保留前者。这是时点包，不是挑选最终成绩后改写的状态。V06晚到来源不能追溯核销旧动作。V04原生select只能提出调查问题，不能把fill改成inspect已经执行。完整operations保留，旧history为空不能被当作没有派发记录。

## 公开包与对照材料

六个时点按已有结构差异固定，数量不强凑8；表格、字段和unknown解释见包README。单个候选、多项已选、已选池为空、原生待办、效果未完成、来源未完成均有材料。没有页面零控件样本，没有排名真值或Jev收益标签。

- `inputs/`、`public/`、`states/`和index随当前分支提交，约220KB的小型JSON包，可直接离线读取。每份文件有hash，来源runId、cutoff seq、contract hash、原观察摘要、actualInput/prefix摘要明确登记。
- `evaluation/`独立保存历史选择及选点记录；仅在新建议固定后作对照，不进入程序/Jev输入。未导入私有评分器或未来动作结果来填充公开事实。
- 原始大材料仍在 `/Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel/data/r0-default-check-v2/final-free-2026-10-08T20-46-41-537Z/`；其中runs.db、packets.json的SHA256在index。原观察文件仍由数据库artifact路径指向本机data/artifacts。Git提供小包不等于提供全部原材料；完整复现提取需另取得这些文件，按hash核对。
- 只读提取入口：`python3 scripts/validation/export-r0-v2-r1-states.py`。不启动模型、浏览器或运行队列。6份旧契约解析、文件摘要、事件前缀和两维对应已核对。没有运行R1排名器或任何模型适配器。

## 这一窄目标的剩余事项

R0侧没有需要先跑原71任务、复现seq49、补齐全部F子项或恢复付费才能提供离线输入的缺项。原持久故障、取消诊断尾差异及未覆盖项继续列在原风险清单；本次选用的6个前缀来源及状态已经核对，没有把那两条故障轨迹作为新材料，也没有关闭它们。

R1接下来只需在其分支：读取index并校验hash；让消费适配保留两维与完整事实；确认V02交回、V03有多项已选待办、V04完成项不被无故重开、V05/V06效果/来源未完成不被generic抵消。由其结果确认R0依赖可用。是否有可靠可判别的排序参照、是否值得接Jev、是否推进真实模型/业务正式验收是后续独立结论；本包没有替这些问题给出passed。

本次交接后停止R0扩展工作。没有新增模型/浏览器调用或费用，累计账本和预算未动。
