# 给 R1 Agent 的公开决策材料

来源候选 `08acc95`，原交付 `7926b4d`。8 个时点先固定于 `../r0-request-stop-state-selection.json`（2026-10-08 06:38:57 UTC），随后离线提取；本次无新 Jev 输出、模型或浏览器调用。原 R0 失败不变。

先使用 `index.json`、`inputs/S01.json`…`S08.json` 和 `public/S01.json`…`S08.json`。`inputs` 可由已有 `parseExplorationInput` 直接解析，`public` 保留完整公开账本、页面、权限、操作和来源。**`evaluation/` 单独保存原 Agent 后续实际选择，不能放进 Jev 输入；应在新的决策结果固定后再用于比较。** 本地公开压缩包不含该目录。

| 状态 | 原运行 | 事件截止 | 当时情况 |
| --- | --- | ---: | --- |
| S01 | run-1b87f757-d3b7-434f-a471-0c4e946482e1 | 53 | 初始详情读取后，正常推进 |
| S02 | 同 S01 | 124 | 本地动作已测量，导航仍待做 |
| S03 | run-2f9f51f3-a7f7-4f22-8f4d-6325de29c0ad | 61 | 动作前的信息收集 |
| S04 | 同 S03 | 98 | 一次填写及重复读取 |
| S05 | 同 S03 | 142 | 同一控件两次填写，其他义务保留 |
| S06 | 同 S03 | 179 | Apply 已测量，筛选/导航待做，时间紧张 |
| S07 | run-b512ca6c-b967-443b-825d-28503381c967 | 78 | 重复只读调查，尚无派发动作 |
| S08 | 同 S07 | 87 | 请求超时后，缓存提示预算已过时 |

接口复用 `r1-exploration-input-1`，契约 SHA 和来源提交见 `index.json`。只调用了其纯数据解析器，没有修改 R1。

| 原公开事实 | R1 字段 / 补充材料 |
| --- | --- |
| 用户目标、公开默认政策 | `task.goal/revision`；`localTask` 为当时页面文字 |
| 最后已观察页面、实际版本 | `state`；观察哈希与截止前缀哈希为离线版本；没有原版本则明确 unknown，`cacheable=false` |
| 当前 snapshot 上的原生候选 | `candidates`；ID 来自登记事项，公开文本、状态、几何、命中测试统计与原权限进入 `context` |
| 全部登记事项与状态 | `public.registeredChecks`；所有 selected 状态也放入 `candidate.context.selectedChecks`；不是用空高级检查清单宣称完整 |
| 先前操作及重复 | `public.operations/actionDispatches/nativeTargetRepeats`；候选 context 包含动作及读取次数 |
| 原检查测量关联的 click | `history` 仅在原回执提供 itemId 时归属；不推断状态效果，`actualEffects=[]` 仅表示未导出可归属的枚举效果 |
| fill、只读工具及过往失效绑定 | 保留在公开补充/候选 context；不把 fill 改为 click，不以 selector 相似合并节点身份；过期绑定不列为当前候选，原义务仍保留 |
| 实际请求/动作余量 | `budget.remainingDecisions/remainingActions` 从截止前实际开始/派发事件计数；不是最后缓存提示中的余量 |
| 剩余时间 | 原计时起点未持久化；用截止前公开请求输入生成窗口重建区间，`public.remainingTimeBoundsMs` 明示精度，R1 使用下界 |
| 美元余额 | 按归档共享账本 created/settled/reconciled 时间恢复当时 known/held/unknown；扣除预留，unknown 时 `remainingCostUsd=null` |

R1 的 `estimatedCost=1` 是“一次原子工具调用”的相对工作量，不是美元报价。未来模型费及可选扩展成本上界均为 unknown，不能据此授予付费或新动作准入。`allowedActions` 和 `scope.executableCandidateIds` 只限定离线建议候选；归档不能授予实时派发权限，实际目标有效性、同源边界与前置条件仍须原执行器验证。select 只允许建议 inspect，原生 fill 事实完整保留。

R1 现有提示投影不直接携带顶层预算/登记账本，所以相关公开事实同时映射到已有 `candidate.context`。每项 context ≤4096 字符，输入 ≤32768 字节；完整材料另存 `public`，不得把未携带的信息当成已知。目标权限为匿名、禁止业务写入，页面/深度有界；无法证明的可执行性明确 unknown。

S08 截止 05:54:43.019 UTC：该费用当时仍 held；05:54:43.020 的 unknown 和稍后的重试结果不进入输入。后来核清的费用也不回填历史时点。来源摘要覆盖截止前 SQLite 事件及实际快照；没有私有真值、评分结果、后续页面、凭据或 Agent 推理文本。

复现：在主仓库运行 `python3 scripts/validation/export-r0-public-states.py`，只读取本地三条归档与费用快照，不重跑原执行器。跨机器应取得原证据包用于来源核对；本地路径及 SHA 见原最终交付索引。该材料是有界决策对照输入，不证明 R1 效果或 R0 正式通过。
