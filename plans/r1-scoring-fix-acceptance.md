# S0 定向修复验收结论

2026-10-07。结论：维护者提出的两处评分证据遗漏在约定范围内通过定向验收。不是整个 Jev 真实评分验收，也不是 R1 阶段完成。

开发 Agent 提交：`80d0f99b36c63439a2a2a5464e9159e6470486d7`，基线 `c47f496405524db9fc3f66683266f3c5dc3ecedf`，分支 `codex/r1-jev-closeout`。只有三文件：

- `scripts/r1-jev-real/score.ts`：在逐行计分前/全批结束时调用证据审查；交回指标读取回放结果。
- `scripts/r1-jev-real/score-audit.ts`：按 case/repetition/attempt 建立 prepared、dispatch、response、failure、result 和账本双向关联，核对完整请求、摘要、映射、冻结 quote、原始 usage 与结算；语义交回由同 profile 下原始 response 重算。
- `scripts/r1-jev-real/score-audit.test.ts`：空/漏账本、缺/多/重复/错绑派发、原始费用不符、篡改 quote/usage、丢失整组请求证据、scores 冒充 handoff、伪造/缺失 handoff 回执，以及合法 handoff/非语义失败反例与正例。

证据：[开发验证说明](../artifacts/r1-jev-real/targeted-scoring-fix/README.md)、[运行清单](../artifacts/r1-jev-real/targeted-scoring-fix/verification.json)、[摘要索引](../artifacts/r1-jev-real/targeted-scoring-fix/SHA256SUMS)。准确命令与原始日志均在此目录，最终定向测试 2 文件/30 项通过（19 项新增，11 项直接受影响工具测试），局部 strict TypeScript 检查退出 0。两次类型检查命令选项问题及早期29项通过日志保留；最终文件内容与所记提交一致。

验收侧本次只做差异审查、反例覆盖审查、日志/退出码核对、摘要及所测源码与提交一致性核对；未重跑测试、未重新克隆、未调用模型。开发反例在修改证据后重建摘要/索引，因此验证的是跨文件归属和响应语义，而非只靠旧摘要失配拒绝。

已有 `c47f496` 的181+55项及干净复验继续复用，计数不与这次30项简单相加。此次没有改变提供方、核心排序、runner、样本预期、阈值或执行器。

接受边界：本地证据内部一致性与合成反例成立；不能证明服务商真实收费、提供方协议兼容性、模型质量或产品探索效果。超时/取消/服务失败无可核对原始语义响应时不计正确交回；未知费用维持未知。此前对这两个受影响指标的通过推断不应沿用，但未受影响的免费证据有效。

没有追加实现事项或要求开发 Agent 再跑全套。下一步按[R1 收尾计划](r1-completion-plan.md)推进，真实协议、费用依据、标签复核、探索执行和整轮对照仍属未完成批次。
