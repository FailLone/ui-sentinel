# 可直接发送给远端 dev Agent 的实施提示词

你是 UI Sentinel 的开发 Agent。请实施“R1 前置工作：Jev 探索决策模块与离线验证”，仅在你自己的独立工作区开发。R0 正在验收；本任务不能标 R0/R1 完成，不与 R0 候选合并，不自行派发其他 Agent，不调用任何付费模型。

你将收到完整文件夹 `ui-sentinel-r1-jev-package-20261007`（可为同名压缩包）：`source-and-plan.bundle`、`delivery.json`、`SHA256SUMS`、`verify-package.mjs`、`files-in-bundle.json`、`IMPORT.md`、`DEV-AGENT-PROMPT.md` 和 `preparation-evidence/`。全部文件摘要和用途在外层清单中。没有其他必需附件，不需要当前聊天、本机 data、未提交文件、环境变量、浏览器、Cookie 或密钥。

原源码来源 SHA 固定为 `8adc93a422398c61a9a738562bfb23710f36bcc6`。导出根提交为 `3c002b849369d730788e689553e70344163038eb`，不是原历史的后代。开发输入 tip 与 branch 以随包 delivery.json 的完整 SHA 为准，外层 DEV-AGENT-PROMPT.md 也给出字面值；导入后逐字核对。从该 tip 建 `codex/r1-jev-decision-dev` 分支。bundle 包含独立筛选源码仓库的完整历史，无前置。不要把该树覆盖到原产品 repo，也不要找“最新 main”替代基线。

先读 `plans/r1-jev-decision-prework-plan.md`（权威任务合同）、`plans/r1-jev-input/input-materials.md`、`import-and-preflight.md`、`return-and-acceptance.md`、`r0-boundary.md`。包内已提交最新未提交 Roadmap 的已识别副本，以及 architecture/execution-engine/development 等参考规范；任务所需方向与 R0 边界已独立写入计划。原 R0 答案/保留集/脚本/历史不交付且本任务不需要；不得要求读未传递资料或借原 data。

产品目标是用 Jev 参与高频探索评分来真正减少主 Agent 逐步决策：程序采集候选/状态/历史，Jev 评分，程序排序，未来连续执行常规交互；主 Agent 保留方向、复杂语义、多步调查、新调查程序。先做“评分+程序排序”，收益尚未证明。Jev 预测不代表真实操作效果、权限、缺陷或完成。未来对照当前 Agent、纯程序、程序+Jev 的发现质量、覆盖、调用减少、总时间和总成本；本期不进行端到端收益实验。

实施 P0 导入/环境预检 → P1 严格版本化契约/独立样本 → P2 确定性程序排序与 P3 Jev 注入模块（契约稳定后可独立推进）→ P4 免费离线工具/返程。用现有 Node 24、pnpm 10.17.1、zod、vitest、tsx；冻结安装，不假定全局工具。所有新增生产模块在 `src/agent/decisions/exploration/`，tests 就近；开发样本在 `evaluation/r1-jev-dev/`，离线 CLI 在 `scripts/r1-jev/`，长期说明在 `docs/r1-jev-decision.md`。package.json 仅新增本项命令/必要依赖，同步 lock。完整写入白名单及验收 T01–T16 见计划，必须逐项落实。

模块无浏览器/数据库/终态/执行权限，不导入运行配置以触发网络。候选身份与观察/相关状态/任务/scope/budget 都需绑定和复核；同控件不同状态可重查，多效果可并存。低分不永久删除，几何不能直接判缺陷。缓存随相关状态及语义依赖变化失效，缓存命中不能绕过取消和预算。处理无视 signal 的迟到传输、超时、并发额度、无效/遗漏/重复/过期回执；失败保留 usage，缺 cost 保持 unknown。输出可明确交回主 Agent，不用模型结论代替证据。

独立合成 public 输入、评价标签和 stub 已提交。评价标签/理由/fixture名绝不进入模型输入；页面注入文字是 data。固定回复只证明接线与防御逻辑，不证明 Jev 语义质量。真实 Jev 入口可仅 dry-run 计划，不得借 R0 预算/授权调用模型；wire 服务兼容性尚未核实应如实写明。

禁止修改 R0 主执行器/动作循环、生产提示、网络/副作用、账本/结束证明/报告、fixture/评分器/冻结配置、工作台和默认开关。不要共用构建、数据库、证据、profile、端口或费用账本。不要运行被省略的全产品脚本来猜依赖或把失败删掉。需要共享文件修改则列后续集成，保持本期独立。

交付前在最终干净提交及空目录 clone 复验：预检、冻结安装、typecheck、专用 Vitest、两次 stub offline、修改文件格式检查。输出实际命令、退出码、原始日志、工具版本、源码/配置/fixture 绑定。缺材料、环境问题、实现失败分别报告；不得降低计划标准或捏造通过。

按 `return-and-acceptance.md` 返回完整导出历史 `source.bundle`（默认无前置）、完整 SHA/branch/摘要、完成项映射/偏差/文件范围/限制/集成要求、必要原始证据和 SHA256 索引，路径一律包内相对。全部代码/测试/fixture/依赖入 Git，附 git status 与未纳入内容说明，不只发文字报告或开发机路径。接收者必须仅凭返程包独立复验。未通过将逐项整改；不自动更新 Roadmap 或发送其他 Agent。
