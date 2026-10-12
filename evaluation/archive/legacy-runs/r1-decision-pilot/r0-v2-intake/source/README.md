# R0 v2 → R1：六个公开离线状态

2026-10-09。入口是本目录 `index.json`，绝对路径：

`/Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel/plans/r0-r1-dependency-v2/index.json`

固定产品 `27614b7a60293a80f3be7b321d164d3599dd0964`，R0阶段交付 `5070fb227684cbad821c51a8310280b12505787f`。来源是已存在的final-free批次：确定性local-fixed provider驱动真实API/执行器/Chromium。没有新增真实模型轨迹、浏览器运行或费用。

## 读取边界

依次读取 `index.json` 和其中各状态的 `inputs/`、`public/`、`states/` 文件。文件大小与SHA256在index中。`inputs`仍是 `r1-exploration-input-1`；`states`沿用R1的State envelope，含同一input与逐候选facts；`public`以新 `r0-v2-public-state-1` 明确扩展两维义务和真实公开输入。candidate.context.r0V2携带摘要及完整public文件hash。

**程序与将来的Jev必须读取同一完整事实包、相同候选集合和hash。** 不能只用旧提示投影而丢掉sourceReview/generic/effects/checkInteractions。原 `makeAdvicePacket` 会剥离新扩展，原CLI又固定读取旧8状态；它们不自动变成v2消费者。R1在自己的分支做只读适配与消费核验。本次不改R1源码、旧包、旧参照或旧成绩，也不宣称R1已经完成。

`evaluation/selection.json` 保存提取选择，`evaluation/historical-choices.json` 保存截止后原确定性provider的工具选择。这些**不能进入离线建议或Jev事实包**，只在新的建议输出固定后作历史对照；不是正确答案或最优排序。作者已看过原批次，不声称盲审，不给偏好真值。不要把原始整份packets.json、终态report或未来事件当当前public输入。

## 六个时点

| 状态 | 截止seq | 当前候选 / 已选 / 已选未完成 | 区别 |
| --- | ---: | --- | --- |
| V01 | 35 | 1 / 1 / 1 | 单个通用检查待办 |
| V02 | 40 | 5 / 0 / 0 | 页面有控件，尚未冻结选中样本；按现有建议范围应交回选样 |
| V03 | 52 | 5 / 3 / 3 | 同一run已选三项，公开未完成义务；可比较多候选排序结构 |
| V04 | 100 | 3 / 2 / 1 | 一项generic collected且顶层verified，原生select仍pending |
| V05 | 80 | 1 / 1 / 1 | generic collected，明确效果在当时是pending，不回填最终unverified |
| V06 | 80 | 1 / 1 / 1 | generic collected，晚到来源/效果unverified，整体仍未完成 |

没有“页面零控件”的合格时点；V02只证明零**已选建议**候选。没有强凑8项。V03只有多候选结构，不证明有可区分的最佳顺序或Jev收益。

## 字段含义及unknown

- `candidate.id/targetKey`采用原itemId，ref/snapshotId来自当时实际输入；同一事项跨观察不换ID。targetKey是离线事项键，不证明实时DOM节点仍连接。
- 顶层status/selected从截止前scope事件重建，checks采用实际请求的公开摘要并核对同一截止前的generic/sourceReview/effect状态。完整公开候选、DOM/无障碍文字、规则、未完成义务、公开工具回执保存在public.actualInput。没有私有评分器、页面私有源码或未来结果补事实。
- sourceReview未封闭时，空effects不等于“无规格”。generic collected不能抵消pending/unverified效果；failed表示有结论的失败，不是效果unknown。是否完整完成还需其他scope/规则/导航义务，不能仅从local item判定。
- `checkInteractions`保留原checkRef/itemId/actionId与剩余恢复次数；其中requirements是冻结动作数据，当前状态以inspectionScope.checks为准。既有动作只能按原checkRef恢复只读验证，建议不能触发第二次点击。
- `allowedActions=['inspect']`和`scope.executableCandidateIds`只表达离线调查建议范围，后者只含当时已选候选。known禁止、越界、未选、无明确理由的已完成项应排除；没有剩余候选则交回。未知实时权限/时长/费用不能自动把所有可调查候选清空。
- 原生fill仍标nativeAction=fill；不能把inspect建议说成fill已执行。history=[]表示未压缩成旧click效果枚举，**不表示此前没有操作**；公开operations与checks/checkInteractions保存已有操作关系。不得据此清除重复派发约束。
- documentVersion=`unknown-live-document`、cacheable=false；离线observation/prefix hash不是可执行DOM身份。几何和精确hit-test样点在实际请求中不足，geometry=null、sampleCount=0只表示没导出这类样点；保留原blockedPoints，不捏造关系。
- actions/modelCalls余量与截止前派发/请求计数核对；remainingMs是原请求估值，不是独立实测下界。future dollar quote和remainingCostUsd未知；stub费用0不授予预算。estimatedCost=1是相对工具工作量。criticalInformationMissing=false只表示可形成有界离线调查问题，不表示实时执行前提齐全。

## 复核与交付

`scripts/validation/export-r0-v2-r1-states.py`只读保留库和实际输入；每个截止固定为对应agent请求开始事件之前一个seq，整包不含该请求之后的选择。packets顺序与agent请求数匹配、动作/请求余量、item两维状态都在提取时核对。源数据库、packets、公开观察文件与前缀hash明确登记；源文件仅本机，Git中的小包足以做离线读取，不等于原始大包已经随Git交付。

原合同解析器已只读接受6份inputs，文件hash/事项/截止约束已核对；没有运行R1排序或模型适配器。R1消费核验尚待完成。详见上层 `plans/r0-r1-dependency-handoff.md`。旧持久故障、取消诊断尾差异和F子项未覆盖不自动阻断这些已固定的只读输入，也没有因此关闭。
