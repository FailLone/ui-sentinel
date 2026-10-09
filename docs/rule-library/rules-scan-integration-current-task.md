# 当前唯一入口：规则分支 main 整合准备（已完成）

2026-10-09（Asia/Shanghai）。本轮只整理现有规则分支为可审查、可合并的交付。已完成完整分支清点、实现者静态自检和交接；建议整体合入，未发现明确代码整合阻塞。没有功能修改，无需重跑测试。提交本轮文档后停止。

- 唯一交接：[rules-main-integration-handoff.md](rules-main-integration-handoff.md)。包含完整源/目标 SHA、依赖、实际检查、局限、维护者整合及回退步骤。
- 接手源：`fae4819094f79e5e84cdafc0ebdb27a7a2080fff`，分支 `codex/rule-image-proportion`；实际 main：`60c315a04e30b84356381763e33dd976a3ace836`，也是 merge-base。保留 fae4819 历史。
- 既有产品实现/运行：`156ffbea3bdbeb0ee7e4a8ace0bbe56efd3d9a44`；交付证据：`1c89b2166075a689d0ddda089cfdc1869fe55103`；产品交付基线：`ea38712ecb747759c0b57d863c4d889bb0045b46`。到接手 HEAD 无代码差异，本轮也没有改代码。
- [原产品说明](rules-scan-integration.md)和既有6场景/2定向测试、早期8算法证据继续使用；6场景不是6次完整扫描通过。此次只有静态检查和文件摘要核对，不冒称独立复核。
- [本轮静态索引](evidence/rules-main-integration-static-audit-20261009.json)：完整105文件清单、分类、摘要检查及现场信息。
- 接手时已有未提交正文已先逐字备份：[原任务说明快照](evidence/rules-main-integration-current-task-before-20261009.md)。快照、旧任务锚点及公网说明均为历史，不构成新任务。

普通入口仍仅在已启用 ui-scan 中自动使用 D005/R005；D004默认关闭，R005不是缺陷或健康pass。全局开关、业务默认、既有R0完成门保持。维护者 main 的未提交 Roadmap 未修改/提交；未在主目录开发，未触碰 R1。

本轮新增文档/快照/索引均纳入本地 Git 提交，原始大数据保持本地忽略状态。通过 `git log -1 --format=%H -- docs/rule-library/rules-main-integration-handoff.md` 取得交付完整 SHA。未合并 main、未push、未删除分支或证据；不新增规则、不重跑公网/DNS/全量、不调用付费模型、不全局启用扫描、不自动继续下一轮。
