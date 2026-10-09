# 当前任务：R1 产品候选已冻结，待一次真实验收授权

2026-10-09。普通工作台/API 的显式 R1 program 接入、状态/路径/公平性、多步/边界/重查/有界交回、原始测量报告已完成工程交付。最终工程候选 `ddf1dd943f238dc71c2d3e4e6ef327e1ba44c2db`，已合入维护者 main `48b02b3fbfe7e5d95189a0d813480761b123ff6b`；后继只保存文档/证据。统一入口为 [README](README.md)，身份/摘要为 [evidence-index](evidence-index.json)。按2026-10-09正式范围裁定，在本任务完成授权后的运行、核对、必要免费修复和最终交付，不拆成反复交接；无需再裁定开发范围。

只在 `/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007` 的 `codex/r1-jev-closeout` 开发。没有修改其他工作区，没有派发 Agent、发消息、push 或将 R1 合并回 main。Roadmap/规则文档变更仅来自维护者授权的 main 合入。

免费验证：17 不同浏览器场景（13 completed / 4 预期 blocked）、31 原动作、4 固定模型响应、真实/Jev 调用0；232 不同定向测试最新结果通过。主套件26bd797 + 后续受影响路径定向复验具有各自来源记录，非最终 SHA 全矩阵重跑。最终工程源码完整 build/typecheck、14 子项离线 evaluator 和800附件核对通过；21个 main 增量文件除 executor 接点外逐字节一致。详细边界、失败修正及日志见统一入口。

唯一待决：精确 product manifest `41eb23e34527461bae8bc50e6d0b28ae53d94bb584d8d167b7eddecedbfcf510` 的28轮普通产品验收（C01–C12各两次，C04三子项），program模式、Jev关闭；最多224 Agent，新增USD14.112，旧unknown USD0.053仍保留，关联记账USD14.165，90分钟。拟批准后24小时有效；首条C10-1兼容探针已包含，400/新unknown等立即停批，无自动重试、调参、补跑。空草案在最终源码已被实际CLI拒绝，未建输出/账户/claim。

批准后才能建立新的隔离runtime，固定ddf1dd9，依据批准原文生成签署/有效期并执行。不能使用文档后继HEAD，也不能复用旧1e78runtime/旧manifest身份。执行后在同一README/index交付28行、费用及原测量结果。若失败，先在本任务完成有依据的免费修复和定向验证；无自动收费重试/补跑，额外收费只请求最小受影响范围及预算。不得绕过一次性claim或把局部补跑拼成原批全通过。

旧1e78ea6 runtime tracked clean；旧九行manifest6428f1e、原41份失败材料/DB/claim/锁摘要均未变，stop epoch1与unknown保持，canonical续验claim不存在。旧九行USD4.554提案仍未批准；旧S1更广状态验证、S2独立评分/校准和S5 72轮A/B/C已正式后置为后续优化，尚未完成，代码/证据保留；不再是本期R1结案前置。本期选择program、Jev关闭，理由为缺少收益依据，而非已证明Jev无收益。28轮真实产品验收达标、费用/unknown核对及明确限制后，即形成可合入候选和本期完成建议，由维护者审阅合入；本任务不push/merge。若有硬失败则如实列出产品阻塞，不降标准。当前仍未完成真实产品验收；仅缺明确费用及旧unknown风险授权，范围认可不是该授权。

范围裁定前的README、CURRENT-TASK、机器索引和原完成计划原样归档在 [pre-scope-20261009](history/pre-scope-20261009/)。计划总入口仍为 [r1-completion-plan](../r1-completion-plan.md)，最终结果只在当前README/index集中维护。
