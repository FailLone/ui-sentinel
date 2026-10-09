# 当前任务：R1 HTTP 400 支持交接（已完成并停止）

2026-10-09，接续基线 `3a4e30162efa63e9be59229a5917fcedc1a66bd0`。唯一当前交付：[support-request.md](diagnosis-400/support-request.md)；完整既有诊断：[diagnosis-400/README.md](diagnosis-400/README.md)；机器索引：[evidence-index.json](diagnosis-400/evidence-index.json)。

已完成：可直接复制的英文请求与中文使用说明；只读核实 OpenRouter 官方支持入口；1 个既有脱敏错误附件及准确 SHA；回复后身份/最终费用核对、原账本追加步骤和恢复决策。未提交表单、发送工单/邮件或联系供应商。

免费整改结论：现阶段无必要新增代码工作。提示/schema 差异未构成根因；取证边界不能补回旧身份。本轮没有改产品代码、重跑旧诊断或 26 项测试，没有真实推理、付费、浏览器、认证账户查询、密钥读取、Agent 派发或 Roadmap 改动。

需要用户：从支持请求文件进入 OpenRouter 官方支持页，提交英文正文并附现有 error.json，再带回官方回复。需要 OpenRouter（必要时协调 Wafer）：将 Wafer request_id `a0d1d4a1a35a` 映射到其请求/generation 或官方结算身份，说明具体拒绝字段/服务原因，提供本笔最终账户收费或明确零元证明。

固定失败：`2026-10-09T07:54:35.109Z`；model `deepseek/deepseek-v4.1-flash` / Wafer；本地请求 `0ddb03d5250db453759b72ee`；run `run-70e34b02-2d84-4498-b133-15405529861b`；manifestHash `9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75`；body SHA256 `ff003c650b1f55787934e4d8043cdc6c821bb4d464debfaf2bcf649d9e9d9631`。

未解/停止：拒绝根因与最终费用尚缺官方证据。USD 0.053 是 unknown 预留，不是确认扣费；实际总费用未知，unknownCount 1、held 0、stop epoch 1。原 claim 已消费，DB/log/artifacts/claim/锁保留，本轮未写账本。若回复没有 generation 但给出可靠收费凭据，先保留证据并评估窄契约追加方案，不伪造 generationId。

有根因依据可准备免费最小修复；可信绑定和金额仅解除对应费用未知，不解除旧停止/claim。真实验证仍需另核当前报价、停止账户准入和新授权；不复用旧未用额度，不换库绕过 unknown。默认关闭，R1 未通过。本地提交后停止，不 push/合并 main，不自发轮询或探针。

此前诊断任务锚点完整保存在 `3a4e301:plans/r1-online-pilot/CURRENT-TASK.md`；更早接手文本见 [历史副本](history/20261009-pre-diagnosis-CURRENT-TASK.md)。历史不作为并列当前任务。
