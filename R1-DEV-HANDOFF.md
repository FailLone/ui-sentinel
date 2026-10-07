# R1 Jev 前置模块：dev 从这里开始

这是开发输入分支，尚未实现产品模块，不代表 R0/R1 完成。输入通过 Git，最终成果由 dev 生成压缩包交回。

1. 核对交接提示中的完整输入 tip SHA；不要用最新 main 替代。
2. 按 [Git 获取与预检](plans/r1-jev-input/import-and-preflight.md) 建立独立 `codex/r1-jev-decision-dev` 分支。
3. 读取并执行[完整 dev 提示词](plans/r1-jev-input/dev-agent-prompt.md)和[实施计划](plans/r1-jev-decision-prework-plan.md)。源码、依赖锁、22 个独立合成情境及必要规范都在本分支，无额外输入附件。
4. 按[返程协议与验收清单](plans/r1-jev-input/return-and-acceptance.md)，把完整代码 bundle、交付说明、必要原始证据及 SHA256 清单装入一个压缩包，供用户传回验收。

原源码基线固定为 `8adc93a422398c61a9a738562bfb23710f36bcc6`。为排除 R0 私有答案/保留集，本分支是独立源码快照历史，不是 R0 分支的后代。生产参考代码按基线原字节保留；本期仅新增计划规定模块，之后只按允许路径集成实现 diff，不把整个导出树合并回 R0。

不改 R0 执行器/生产提示/网络/副作用/账本/报告/默认开关，不执行付费模型调用，不派发其他 Agent。Jev 收益尚未验证。所有材料和阶段边界以本分支主计划为准；旧版源码输入压缩包不再需要。
