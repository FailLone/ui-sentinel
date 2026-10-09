# R1 纯探索规划（plan-2）

只消费调用方公开事实与统一执行器的事件投影，产出计划/交回；不操作浏览器、不读环境/网络/数据库、不写检查账本或任务终态。Jev 不是本模块依赖。原评分输入 `r1-exploration-input-1` 与排序策略 `r1-exploration-policy-2` 不变。新增计划版本 `r1-exploration-plan-2`，旧开发稿事件形状不再接受。

## 数据与身份

- `normalizeFacts` 校验原评分输入及 view；角色标签不构成权限。
- 轨迹必须每次运行单独创建。状态键是 `[pageId, documentVersion, relatedStateVersion, viewKey]` 的 JSON 元组；同名版本跨页/文档不相同。观察版本另外绑定在计划中，不把每次新观察误当成新相关状态。
- `dispatched`/`settled` 必须携带唯一 `attemptId`、目标、动作、前状态；要投影验证记录，派发时必须声明 `itemId`，回执匹配并带 `evidenceRef`。孤立、重复、错配、关闭后的迟到回执进入 `rejectedEvents`，不会伪增验证或完成路径。失败/未知保留原始事实，不记为完成边。
- visited、selected、verified 分开；verified 仅为调用方测量的只读投影，不自行判断产品健康或缺陷。S4 必须保证 item/evidence 来自统一检查账本。
- `frontier` 保留所有当前控件以及各状态未验证分支；路径按实际派发顺序串联成功且不重叠的步骤，保留中间状态。仅有一次观察不会产生连续步骤。

## 调度约束

`planNext({ facts, trajectory, checks?, risk?, fairness?, recovery?, repeatReasons? })`。

- 在途/未知目标不可自动重放；失败或无测量支持的旧动作交回调查。相关状态改变允许重新检查已知结果；未知仍须先调查。
- 同一状态未尝试优先。已测量动作只能在提供明确 repeatReason 时重复一次，总计最多两次；无进展交回，不靠耗光总预算终止重复。
- recovery/repeatReasons 的键由 `branchKeyOf(currentStateOf(facts), targetKey)` 构造。恢复计数按分支/状态，最多一次，不永久封禁其他状态的同名目标。由执行器记录真实消耗，不能由调用方每轮重置。
- 复用既有确定性排序；风险提示只调整合格、同尝试层级候选的优先级；公平轮转实际生效时优先于风险。风险永不新增权限、候选或预算。
- ActPlan 绑定 request/observation/scope/budget/task 版本及完整相关状态；执行前必须重验。
- 可传入统一检查账本的只读 `checks: {itemId,targetKey,stateKey}[]`。handoff 保留原始 evidenceRef、未验证 item、未检查候选（含阻断项）、不可重放目标、剩余预算。未提供 checks 时明确 checklistKnown=false，不能声称完整覆盖。

## 策略

`assessStrategies(facts, frontier, options?)` 返回 applicable/proposable、前状态/观察版本、明确步骤、动作预算与后置测量。过期 frontier/非法 options/预算不足不会产生可提案步骤；控件必须当前有效、有稳定目标、可执行且无未决重放。

- repeat-operation：测量支持 + 显式原因，最多一次额外重复。
- state-switch：公开已展开/已选中状态，必须支持 click；受当前预算和两动作上限约束。
- boundary-input：本期只支持结构化公开 max-length，maximum 为 0..256，必须带证据、当前状态/观察版本和 bridge 支持的 fillCandidateIds。产生 max+1 字符的明确 fill 意图，并预留后置观察的动作额度。页面文本里的数字、指令或业务猜测不能生成约束；其他约束类型显式不可提案，需交回 Agent。
- return-refresh：明确 navigation 上下文；back 需要到当前状态的实际导航路径及返回目标；refresh 绑定当前状态。无上下文不能返回空的“可执行计划”。
- recovery：一项带原因的当前停滞状态 + 有据的只读 back/refresh 意图；消耗一次即不可再提案。
- counterexample：已测量声明后，只提出当前合格且预算允许的同角色比较候选；其健康性待实测。没有合格候选则明确交回规划替代路径。

fill/back/refresh 是纯领域的高层意图，不扩展旧 click/inspect 评分契约，也不授予浏览器权限。`options` 只是调用方声明的公开约束/能力；S4 必须重新核对，不可原样绕过唯一执行器执行。

## S4 集成点与保留边界

另行冻结执行器 SHA 与接口：完整状态/候选身份、attempt 与检查事项、测量证据、scope/预算/取消版本、后置观察、有界只读恢复、交回与消耗记录。未知动作不可重试；旧提案不可跨观察/权限/预算版本沿用；检查及终态仍只有 inspection-host 一个写入者。

本模块的类型和模拟转换测试不能证明真实恢复、页面效果、多步缺陷发现、整轮覆盖或成本收益。复杂语义/其他输入约束/新调查程序交回主 Agent。S4 接线、产品场景及三组整轮对照仍待开发与验收；R1 未完成，默认不启用。
