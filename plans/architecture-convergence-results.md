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
