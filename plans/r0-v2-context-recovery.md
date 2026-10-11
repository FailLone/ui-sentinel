# R0 v2 上下文超限后的接续说明

维护者于2026-10-09只读核对生成；不是验收交付或通过结论。

## 故障与工作位置

原会话 `01a11746-4ba5-71c2-abb6-694fc81ada9a` 返回 HTTP400 / `context_length_exceeded`。随后单独发送“继续”仍返回同一错误。是编程会话上下文超限，不是UI Sentinel运行预算或费用闸门。

已有隔离工作区 `/Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel`，分支 `codex/r0-default-check-v2`。接续必须使用该工作区，不从main重做，不删除data目录，不并行唤醒原开发会话。

核对时工作区干净，HEAD `27614b7a60293a80f3be7b321d164d3599dd0964`。提交链：

- `ea5f5ac`：规划基线。
- `d978bc9`：默认检查v2主体实现。
- `27614b7`：效果已发布、generic回执未结算期间的报告关联校验修正及验证工具调整。

原会话最后报告：工作台缺陷报告曾因提前要求generic.actionId而停止轮询，已改为先核对实际测量事件的actionId，generic存在后再同时核对。已有新运行材料，需核对最终身份和完整结果，不能仅凭原会话描述宣布通过。

## 最小阅读与证据入口

以下路径相对于上述隔离工作区：

1. `plans/r0-default-check-contract-v2-plan.md`及对应`plans/evidence/r0-default-check-contract-v2-plan.json`：D1–D6实施范围、F01–F14定向覆盖。
2. `git show --stat 27614b7`及相关差异，按需阅读代码；不重新读取整段旧会话或全部历史文档。
3. `data/r0-default-check-v2/`：已有unit JSON、构建日志、开发失败、真实API/工作台证据。
4. `data/r0-default-check-v2/final-free-2026-10-08T20-46-41-537Z/`：manifest.json、results.json、runs.db、server及source map、逐场景报告/产物、工作台截图。先读汇总，再按缺口读取，不一次输出全部轨迹。
5. `scripts/validation/r0-default-check-v2.ts`、`scripts/validation/r0-v2-score-replay.ts`：已有定向入口和独立评分工具。

旧持久化故障的背景仅需`plans/r0-persistence-repair-handoff.md`。该故障仍开放，本轮成功不可替代关闭依据。

## 接续任务

接续已授权的免费开发收尾，首先核对现有最终批次是否结束、源码/构建身份、实际结果和F01–F14覆盖。复用有效材料，只补具体缺失或最新修正影响的定向检查，不默认重建、重装或重跑全套。发现具体剩余实现缺口时允许受限修复并记录，不降低标准、不覆盖失败。

完成最终交接：`plans/r0-default-check-v2-handoff.md`和`plans/evidence/r0-default-check-v2-delivery.json`（维护者核对时尚未形成），包含候选、构建、实际覆盖/未覆盖、复用映射、失败、原始大包及摘要、费用0和剩余阻塞。大文件在本机data目录，不等于已随Git交付。

仅在本隔离分支提交，不推送、不合并main/R0/R1/规则分支，不改主工作区维护者Roadmap；不调用真实模型或启动付费、不扩大预算、不重写旧成绩。新版免费实现完成不等于R0正式通过。保留无规格通用完成与功能语义未知的区别；明确要求未验证仍未完成。

将阶段进展及时保存到简短接续记录，按需读取文件、限制工具输出，避免重新灌入全部历史造成同样超限。
