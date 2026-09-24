# 架构收敛验证记录

状态：执行中。对应 [计划](./architecture-convergence-plan.md)。此文记录新的持续探索目标；前轮阴性研究已经结束，不覆盖其历史成绩。

## A：评分协议与离线复评

新增 `evaluation/private/recovery-protocol.ts`，协议 `recovery-v2`。历史 minimum evaluator 不变。C2 允许保存拦截证据后通过正常输入恢复成唯一 paid 订单；必须有对应 UI 和业务结果。恢复路径是否使用正常操作仍须核查工具轨迹，自动业务评分不是安全动作证明。

C5 新增测量类型、同一订单 UI、公开 canRetry=true 响应关联要求；保留旧 evaluator 的连续时间窗口、目标绑定、假设和截图要求。所有场景必须显式接受 Agent 结束。反例测试覆盖缺失发现、重复订单、错误 UI/业务结果、无主动结束、错误测量类型、缺失 eligibility、短测量窗口。

旧批次离线复评：`data/oss-compare/2026-09-23T16-58-30-720Z/recovery-v2-rescore.json`。只有 Stagehand C2 从原协议失败变为新协议通过；原始三例在新口径下 current 2/3、Stagehand 3/3、Browser Use 1/3。此前已核查 Stagehand Tab/Enter 与实际键盘输入、唯一 paid 订单及截图证据。此处是协议诊断，不是新候选独立验收，也不把旧 `score` 改写为通过。

## B：准备同期完整任务对照

六组：current-low/current-off、stagehand-low/stagehand-off、browser-use-off/browser-use-flash。每组 C0/C2/C5 各一轮，共十八轮筛选（不是 minimum 正式十八轮）。美元硬上限 $3，单任务/单请求预算不增加；每轮网关独立冻结推理模式，后续轮次不能继承上轮覆盖值。新增测试验证该隔离。

Browser Use flash_mode 已用真实原生循环、本地浏览器、确定性模型验证质量工具链：`data/native-fixture-check/2026-09-24T05-04-15-409Z/`。实际发出的输出 schema 仅 memory/action，没有 evaluation/next_goal 字段。该测试不调用真实模型，也不证明检查质量；官方参数依据见计划中的链接。

执行命令：`pnpm exec tsx scripts/experiments/oss-compare.ts --study convergence`。必须在干净提交、构建和检查通过后执行，运行前 manifest 冻结六组配置和新旧 evaluator 哈希。旧命令模式仍使用历史评分和 low 配置，避免改变旧批次复现含义。

### 首批中止：历史隔离与原生计时缺陷

冻结 `851b226`，批次 `data/oss-compare/2026-09-24T05-06-55-086Z/`。已保存七轮完整记录，在第八轮中止；不将此批用于架构排名或推理配置的因果比较，不补齐其剩余格子后拼接成绩。

实际请求证明共享 `environmentId=arena` 导致后运行的当前执行器加载前轮生成的 journey：C0-current-low 首次输入有 0 个 availableJourneys，C0-current-off 首次输入有 1 个。这违反相同历史起点；早先报告的 45.192s 与 27.806s 不能归因于推理开关。发现后停止父调度、取消原生 worker 并关闭本批服务；没有孤立的试验进程继续运行。所有旧记录和取消输出保留。

此批共开始 92 个上游请求，91 个已落账，已知费用 $0.056840680；中止时另有 1 请求未结清，保守占额 $0.008348340，不按零成本算。详见 `invalid-batch.json` 和 `interrupted-accounting.json`。

另一个明确的接线缺陷：Browser Use flash 在 C0 中主动重新导航，导致页面内计时状态重建为 id=0/dispatchAt=0；旧适配器把首次渲染减去零，生成约 1.79e12ms 的虚假响应时长及四条规则误报。真实点击响应是 97–134ms。这是适配器错误，不是 Agent 判定能力退化。

唯一修正批次采用 `architecture-convergence-screen-2`：每轮使用独立数据库和应用服务进程，正式 API 仍使用受支持的 arena 环境；付费前检查 runs/journeys 均为空，冷启动模型输入必须不含继承的导航片段，网关在请求转发前强制验证；若违反立即停止整批。原生计时仅接受本文件内真实输入，按 documentId/actionId 去重，刷新不生成从 Unix 零点开始的伪测量。未测到的跨文档导航时延不冒充有效零时延。

测试覆盖真实历史存储的环境隔离、付费前请求拒绝、页面刷新不产生伪响应及刷新后新动作不被错误去重。修正不改变 Agent 提示词、推理预算或验收答案。两项问题在同一冻结修正批次中处理；不因模型后续质量失败再追加这一批的修正额度。

修正批次启动前验证：49 个测试文件、337 个测试全部通过；类型检查、完整构建、157 个文件格式检查和 `git diff --check` 通过。测试覆盖本次隔离与导航后计时问题；不替代真实模型筛选。
