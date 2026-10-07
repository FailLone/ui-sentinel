# 开发输入材料分类与索引

本包可直接用于 R1 前置模块开发；它是经筛选的源码快照，不是可运行全部 R0 服务/验收的产品分发。本任务全部必需文本和 fixture 已入 Git，不依赖开发者或规划者 data。

## A. bundle 内已提交文件

外层 `delivery.json` 记录原源码 SHA、导出根提交、交付 tip、分支、bundle 类型/前置和摘要；`files-in-bundle.json` 为交付 tip 全部文件的相对路径与 SHA-256。源码逐文件来源见 `source-provenance.json`，后者只覆盖原字节复制的参考源码/配置。

| 相对路径 | 用途 |
| --- | --- |
| plans/r1-jev-decision-prework-plan.md | 权威任务合同：方向、边界、四批开发、schema、T01–T16 与集成事项 |
| plans/r1-jev-input/input-materials.md | A/B/C/D 分类与引用解析 |
| plans/r1-jev-input/import-and-preflight.md | 可复制导入、依赖安装、预检、复验命令 |
| plans/r1-jev-input/dev-agent-prompt.md | 完整实施提示词；外层 DEV-AGENT-PROMPT.md 附最终 SHA，发给远端使用 |
| plans/r1-jev-input/return-and-acceptance.md | 返程格式、完整性门禁、独立验收、整改模板、Roadmap 建议模板 |
| plans/r1-jev-input/r0-boundary.md | 已脱离私有答案的 R0 必需边界 |
| plans/r1-jev-input/source-provenance.json | 生产源码/配置逐文件来源、Roadmap 未提交快照身份、明确排除项 |
| plans/r1-jev-input/preflight.mjs | Node 内置库预检：源码摘要、输入清单、版本与敏感路径检查；不装依赖/不访问网络 |
| plans/r1-jev-input/vitest.r1.config.ts | 仅新模块、离线工具及本项开发集测试的入口，默认无模型配置 |
| src/**（原非 test 文件） | 141 个导出参考文件的一部分；生产源码只读，仅新 exploration 子目录可写 |
| docs/product-roadmap.md | 本机未提交 Roadmap 的已识别快照；所需最新方向已完整纳入主计划 |
| docs/{architecture,execution-engine,development,composable-investigations,visual-focus,knowledge-and-context,rules-and-rule-library}.md | 原字节参考规范，保留既有能力解释；历史命令/阶段状态不凌驾本项计划 |
| package.json / pnpm-lock.yaml / pnpm-workspace.yaml | 冻结运行时/依赖/工作区定义；现有 scripts 部分属于不交付的全量产品工具，不能当本期入口 |
| arena/{checkout,export}/package.json | 保持锁文件的 workspace importer 一致性；不包含靶场代码、答案或可运行服务 |
| .node-version / tsconfig.json / vitest.config.ts / biome.json / .gitignore / .gitattributes | 原环境及编译配置；全局 vitest 配置仅参考，本期使用专用配置 |
| evaluation/r1-jev-dev/{manifest.json,README.md,public/*.json,evaluator/*.json,stub/*.json} | 独立手工设计的合成输入、评价标签和固定回应；文件和摘要均完整列入 manifest |

原 docs 的链接可能指向没有交付的历史评价材料、R0 closeout 或脚本。这些链接只解释原产品背景，**不是隐含开发要求**。对应任务所需要求均已在主计划与 r0-boundary 中独立写明；本期不需要获取、重建或猜测被排除文档/脚本。运行模块禁止读评价侧标签。

## B. 额外附件

没有必需的非 Git 业务资料、截图、历史样本或数据附件。外层交付文件是运输与校验元数据，不是缺失源码的替代：bundle、delivery.json、SHA256SUMS、verify-package.mjs、files-in-bundle.json、DEV-AGENT-PROMPT.md、IMPORT.md、preparation-evidence/ 原始准备日志及索引。每一文件均以相对路径、用途、摘要列在外层清单中。

SHA256SUMS 对除自身以外全部文件逐一哈希；自身摘要在最终交付消息中给出，以免循环自引用。任意必要非 Git 附件未来新增时，必须明确用途、相对路径和 hash，不允许“开发机已有”。

## C. 可重建材料

| 材料 | 输入 / 命令 / 依赖 |
| --- | --- |
| node_modules 与本地 pnpm store | Node 24.x、pnpm 10.17.1、包内 package/lock/workspace；`pnpm install --frozen-lockfile --store-dir .r1-pnpm-store`；需依赖注册表网络，不需要模型 key |
| TypeScript 检查结果 | 以上依赖与 src；`pnpm exec tsc --noEmit`；本次导出无旧 tests/arena/scripts，新增本期文件仍纳入检查 |
| 本期测试与离线 evidence | dev 实现后按 import-and-preflight；仅包内 fixture+stub；日志命令、退出码、commit、配置随返程保存 |
| 新决策产物（非服务 dist） | 本期 TypeScript 直接由现有 tsx/vitest 执行；无需产品 dist、浏览器或数据库；不要求全量 build |
| 原产品 dist / R0 数据 | 不是本项所需，不生成；将来集成在完整主仓库另行执行 |

无需本机历史样本，当前种子完全由计划新造并已提交，不需要生成命令才能获得输入。若 dev 追加自动生成样本，必须提交生成器、固定 seed、完整输入与命令，不能只交最终摘要。

## D. 本任务不需要且不传递

原 Git 历史、R0 私有真值/评分器/保留集及对应旧 tests/fixture；R0 现行授权清单、费用和运行日志；原 data、数据库、dist、node_modules、.env/密钥/Cookie/profile；原工作区未提交源码；与本任务无关的 arena 和脚本。避免通过完整原历史 bundle 重新泄露这些内容。

## 已知环境与外部限制

规划环境 Node v24.21.0、pnpm 10.17.1、Git 2.50.1 (Apple Git-155)。支持环境以包内 engines 为准，本期统一 Node 24.x，远端须安装 Node/pnpm/Git；不能假定有 Python、jq、tsx 全局命令或浏览器。安装依赖需要注册表可达，准备过程实际结果见外层证据，不预先承诺远端网络可达。真实 Jev API 新评分用法/现价/模型服务能力尚未核实，当前无真实调用授权；不阻塞 stub/注入模块，不得包装成真实服务验证通过。
