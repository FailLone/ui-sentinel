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

## 3. Jev 候选评分模块

`requestExplorationScores(options)` 每次只做一件事：构造有界问题 → 注入传输 → 逐项复核回执 → 返回判别结果。
默认传输是包内 stub（`stub-transport.ts`），**不读 env、不加载 dotenv、不发起 fetch**。

- **问题构造**：`prompt.ts`。system 指令声明页面文字/候选文本/上下文/历史文本为不可信数据，
  不允许其改权限、schema 或任务；请求体只含公开字段，评价标签、理由、checks、fixture 名一律不进入。
  超过 32 KiB 时返回 `fits:false` 并交回，**不静默截断事实**。
- **绑定**：请求体本地 SHA-256 摘要 `requestDigest`。服务若不自报版本，绝不把自报字段当可信绑定。
- **回执**：`receipt.ts`。precise 一一对应；任何缺失/重复/越界 ID 使整批无效（`invalid-receipt`）。
  分数范围在解析与 `validateReceipt` 两处都复核，防止非解析路径绕过。
- **预算**：`budget.ts`。会话级账本，派发前预留最坏成本；`remainingCostUsd` 为 null（未知）时
  对付费传输拒绝派发；已知费用失败也保留 usage 与计费事实，缺失保持 unknown，**不推断为 0**。
- **传输**：`transport.ts`。超时 = `min(maxRequestMs, 调用方剩余时限)`，取消优先；传输即使无视
  AbortSignal 也不能拖过 deadline（`withSignal` 竞争）；迟到回执不能复活建议；等待期间版本变化
  （`currentVersions`）使结果作废（`stale-state`）。失败不伪装成低分。日志不落 authorization 或
  任意服务错误体。
- **缓存**：`cache.ts`。会话实例内、容量 64 LRU、TTL 有限。key 覆盖 contract/policy/prompt 版本、
  任务、页面、文档/观察/相关状态版本、候选公开内容与动作范围、历史、scope、公平轮转状态；
  `requestId` 故意不入 key。`cacheable:false` 不读不写；失败/不确定/取消/超时永不缓存。
- **会话门面**：`session.ts`。命中缓存只短路传输，**预算与取消每次实时检查**，命中不得绕过守卫；
  命中返回绑定当前 `requestId`，来源费用与命中成本分开记账。
- **消费复核**：`validateSuggestionAgainstCurrentState`。消费者交付**当前**版本、候选、scope、预算
  再检一次；单靠发起快照或响应自报版本无法防异步变化。此函数只拒绝，不授予权限。

## 4. 离线工具与开发样本

```
pnpm r1:jev:offline -- --output <包内相对目录>     # 默认 stub，拒绝默认网络
pnpm r1:jev:test                                  # 本期专用 Vitest 配置
pnpm exec vitest run --config plans/r1-jev-input/vitest.r1.config.ts
```

输出 `results.jsonl`（逐条 input/request/result/outcome/versions/timing/usage）与 `summary.json`。
纯程序列与程序+stub 列**分开**；真实模型行标 `not-run`；不宣称任何收益。
两次运行剥离时间/attemptId 后确定字段逐字节相同，原始值保留。

`--real --dry-run` 只输出计划（`real-plan.json`）：`authorized:false`、模型兼容性 `unverified`、
需单独授权、价格来源 unknown、未知费用即停。`--real` 不带 `--dry-run` 直接拒绝。
**未核实**提供方是否支持任意 JSON 输出；不借用 R0 的授权、预算或账本。

## 5. 明确未接入的边界

- 不接入 R0 主执行器 / 浏览器动作循环 / 检查账本 / 结束证明 / 报告 / 默认开关。
- 不做真实模型调用；`--real` 仅 dry-run 计划。未核实提供方对任意 JSON 输出的兼容性。
- 固定 stub 回执只证明接线与防御逻辑，**不证明 Jev 判断质量或抗注入能力**。
- 不宣称提高整轮扫描覆盖、发现率、时间或成本。