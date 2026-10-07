# R1 前置：Jev 探索决策模块

本文件说明 `src/agent/decisions/exploration/` 已实现的接口、命令与**明确未接入**的边界。
它描述的是前置模块（评分 + 程序排序），不是 R1 完成声明，也不包含任何收益结论。

状态：前置模块实现中；未接入执行器，未调用真实模型，未验收。

## 1. 契约

`r1-exploration-input-1` → `r1-exploration-result-1`。

- 输入字段与语义见 `plans/r1-jev-decision-prework-plan.md` 第 4 节；实现见
  `contracts.ts`。所有版本字段（task/state/scope/budget 的 revision、observationVersion、
  documentVersion、relatedStateVersion）由**调用方**拥有；本模块只能比较拿到的版本，
  不能自行宣布页面未变。
- 非法输入返回结构化 `{ ok: false, reasonCode: 'invalid-input', detail }`，**不启动传输**。
  校验顺序：schema（额外字段拒绝）→ 结构引用（重复 ID、候选观察版本过期/冲突、
  scope 悬空/重复）→ 上限（调用方上限只能收紧模块硬上限 32 候选 / 32 KiB / 32 历史）。
- 输出只有 `ranked` 与 `handoff` 两种判别，外加 `reasonCode` 区分原因。
  **不存在** finish / pass / defect / authorized 等结论字段。
- `normalizeOutcome` 把 `handoff + invalid-input` 归一为 `invalid-input`，其余 handoff
  归一为 `handoff`；原始 `reasonCode` 始终保留。

## 2. 纯程序排序（无模型）

`rankCandidates(input, options)` 是纯函数：无模型、网络、浏览器、DB、全局配置。
相同规范化输入与策略版本输出逐字节相同；输入候选数组重排结果不变。

固定字典序优先级（`POLICY_VERSION = r1-exploration-policy-1`）：

1. **当前相关状态下是否已尝试**（未尝试优先）
2. 当前相关状态下尝试次数少者优先
3. 模型融合分高者优先（仅在提供评分回执时参与）
4. `estimatedCost` 低者优先
5. 候选 `id` 字节序（最终打破平局，无随机）

尝试次数按 `targetKey + 动作` 归因，且只在 `history.beforeStateVersion === state.relatedStateVersion`
时计入当前状态。**不使用**按钮文案或短 ref 判定身份；`targetKey` 缺失时不跨观察合并（视为未尝试，
不永久封禁）。因此「同 target 新状态可重查」与「同状态重复不永久跳过」由同一条规则满足。

### 融合策略（版本化，本文件先于实现提交固定）

`FUSION_WEIGHTS = { relevance: 0.6, informationGain: 0.4 }`，`composite = 0.6*relevance + 0.4*informationGain`。
`uncertainty` 如实记录但不参与排序。无评分时 `composite = null`，排序退回纯程序基线——
**不以默认分代替缺失评分**。

### 公平轮转（有界，显式输入）

`ROTATION_CADENCE = 4`：每第 4 个决策（零基 `decisionIndex` 3、7、…）把「等待最久且在当前状态仍未尝试」
的可执行候选提到队首。轮转状态作为显式参数 `fairness: { decisionIndex, firstEligibleDecision }` 传入，
**不依赖隐藏全局计数**；轮转永远不会提升当前状态已尝试的候选。低分候选始终留在完整队列中；
轮转不足四次预算时如实交回，不宣称已覆盖。

几何字段仅作成本/线索，可影响 `estimatedCost`，**不构成缺陷判定或永久过滤依据**。

## 3. Jev 候选评分模块

（P3 实现中，见后续小节。）

## 4. 明确未接入的边界

- 不接入 R0 主执行器 / 浏览器动作循环 / 检查账本 / 结束证明 / 报告 / 默认开关。
- 不做真实模型调用；`--real` 仅 dry-run 计划。未核实提供方对任意 JSON 输出的兼容性。
- 固定 stub 回执只证明接线与防御逻辑，**不证明 Jev 判断质量或抗注入能力**。
- 不宣称提高整轮扫描覆盖、发现率、时间或成本。