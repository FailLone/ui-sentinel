# 可直接交给 dev Agent 的 P3 指令

此文件保留 P3 原始开发指令；主 Agent 复查进展与交付分支见 [P3 交接](visual-focus-p3-handoff.md)。不要从旧 P2 基线重新开始已完成的 P3 工作。

请开发 ui-sentinel 的 P3：可信验收工具与可复核报告，持续修复直到 P3 ready for review。

1. 从远端 `review/visual-focus-p2` 最新提交新建 `dev/visual-focus-p3`；确认包含 `c5aa03a41fc90424127e2965c402510a3536c6bf` 和本套 P3 文档，不从 main 或原 bundle 开始。不覆盖已有未提交工作。
2. 先读 [P3 任务书](visual-focus-p3-plan.md)、[P3 验收清单](visual-focus-p3-acceptance.md)、[P2 已验收交接](visual-focus-p2-handoff.md)，再按需查 [总任务书](next-development-plan.md)、[完整验收](visual-focus-acceptance.md)、[开发约定](../docs/development.md)。本轮任务以 P3 材料为入口。
3. 顺序完成独立评分器、严格运行器与冻结协议、共享持久费用台账、完整审计、报告缺口和免费验收。已有模块尽量复用；发现产品 bug 可以修复，不降低验收门槛，不做无关重构或性能实验。
4. 独立评分器不能调用产品 verdict 算法或 P2 smoke scorer。用完整证据和私有真值交叉验证，并通过单字段伪造反例测试。所有必要脚本/输入必须在 Git，不能依赖另一个开发者机器里的 data/learning。
5. 本轮不调用付费模型，不运行真实 18/45 轮；实现这些入口并用固定本地模型和真实 SDK/API/浏览器验证。缺 key、错误配置、错误来源必须明确失败，不能以 mock 冒充 real。
6. 逐项执行验收清单，把实际代码/测试映射、命令与退出码、结果、证据重建方式写入新建的 `plans/visual-focus-p3-handoff.md`。不要提前勾 pass；失败要修到通过。新 holdout 由主 Agent 在 P4 准备，不伪造 review，不将旧六例称为新盲测。
7. 最后 commit + push `dev/visual-focus-p3`，不合并 main，提供 HEAD、实际测试数和未完成项。正确交付结论为“P3 ready for review；P4 尚未执行”，不是“整个功能已 accepted”。若仍有硬阻塞，保留真实失败证据并准确说明，不能改标准制造完成。

历史批准输入已经在 `evaluation/fixtures/approved-retry/`，按任务书 verify/import 即可，不需要再找用户批准或获取本机 learning 文档。P2 的本地运行日志只是历史参考，不是本轮开发依赖。
