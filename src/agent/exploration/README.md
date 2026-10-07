# R1 纯探索规划模块（S3 领域部分）

本目录是 `plans/r1-completion-plan.md` 中 S3 的**纯领域**实现。它只消费调用方给的事实，产出计划或交接对象。

## 边界（不可越过的约束）

- **不操作浏览器**，不派发点击，不接生产执行器。
- **不授予权限**：`planNext` 的提案必须由调用方重新授权与执行。
- **不写 verified**：只有调用方给出带 `itemId` 与 `evidenceRef` 的已测量后置观察，`verified` 才为真。
- **不接默认开关**，不改生产路径；不读环境变量、文件、数据库或网络。
- **不另建评分器**：排序复用 `src/agent/decisions/exploration/ranking.ts` 的 `r1-exploration-policy-2`。
- 导入图不得到达 `jev-provider`、`scripts/`、`evaluation/`、`executor`、`inspection`、`report` 层（由 `boundaries.test.ts` 固定）。

## 模块

| 文件 | 职责 |
| --- | --- |
| `facts.ts` | 事实入口。复用 `r1-exploration-input-1` 契约，外加一个**不构成权限**的已声明角色/视图上下文。 |
| `trajectory.ts` | 状态与路径记忆。`visited`（访问过）/`selected`（选择过）/`verified`（实际验证过）严格分离。 |
| `frontier.ts` | 候选前沿、路径、前后置条件、未探索分支；被阻断与越界候选带可核对原因保留。 |
| `strategies.ts` | 边界输入、返回/刷新、重复操作、状态切换的适用条件、预算与必需后置测量；反例调查策略。 |
| `scheduler.ts` | 有界可解释调度：选下一项或交回。 |

## 接口

```ts
// 事实入口：不抛异常，拒绝是结构化结果
normalizeFacts(raw: unknown): { ok: true; value: PlanningFacts } | { ok: false; reason: string }

// 事件折叠为轨迹；不修改入参
reduceTrajectory(events: readonly TrajectoryEvent[]): Trajectory

// 候选前沿
buildFrontier(facts: PlanningFacts, trajectory: Trajectory): Frontier

// 策略适用性（applicable / proposable 分开）
assessStrategies(facts: PlanningFacts, frontier: Frontier): StrategyAssessment[]
planCounterexampleInvestigation(facts: PlanningFacts, claim: CounterexampleClaim): CounterexamplePlan

// 调度：提案或交接
planNext(request: PlanRequest): Plan   // Plan = ActPlan | HandoffPlan
```

`ActPlan` 携带 `basis`（覆盖缺口、重复观察、风险依据与来源、连续步骤、前置条件、策略版本）。
`HandoffPlan` 携带原因、已执行动作、未验证事项、可继续候选、**禁止盲目重放**的目标、剩余预算与**分开统计**的 visited / verified 覆盖。

## 后续执行器接入要求（S4）

S3 **不**接线执行器。S4 接入时须满足：

1. **唯一执行器派发**：`ActPlan` 只是提案，须经现有执行器重新校验版本、权限、预算与取消。
2. **前置条件必须真实**：`basis.precondition` 是规划时所在的相关状态；执行前须重新观察确认，状态已变则丢弃提案。
3. **verified 只能来自测量**：`HandoffPlan` 的 visited 与 verified 必须分别计数，访问记录不得继承为验证记录。
4. **禁止盲目重放**：`handoff.forbiddenReplays` 中的目标不得自动重放副作用。
5. **恢复上限**：`RECOVERY_CAP` 为每分支一次；达到上限即交回，不放宽。
6. **不建第二台账**：覆盖与完成仍由 inspection-host 单方记账，本模块只读投影并申请选择。
7. 集成前另写 `execution-contract.json`，冻结 R0 接口快照 SHA、本模块 SHA 与允许改动路径。

## 本模块**不能**证明的事

模拟状态转换测试**不等于**探索闭环完成。实际动作、真实浏览器后置测量、有界恢复与产品场景达标属于 S4/S5，需要独立证据。