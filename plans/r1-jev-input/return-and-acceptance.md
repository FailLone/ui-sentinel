# 返程交付协议与独立验收检查表

协议 `r1-jev-return-1`。本次开发输入经 Git 分支取得；返程仍为自包含压缩包。inputDeliveryTipSha 表示本次交接提示提供的 Git 输入 tip，不是旧输入压缩包的 tip。接收者只依赖这个返程包、公开依赖注册表和通用 Node/pnpm/Git 环境。开发机绝对路径或“本地有”不能替代文件；不要求接收者找开发机器。不得传密钥、环境变量全集、真实会话、R0 私有答案/保留集。

开发结束后将下述完整目录压缩为 `r1-jev-return-<finalTip前12位>.tar.gz`（或 .zip），另外给出压缩包 SHA-256，供用户传回验收方。无需验收方事先拉取开发分支。

## 返程目录（所有引用相对包根）

```text
r1-jev-return/
  return.json
  SHA256SUMS
  verify-package.mjs
  source.bundle
  DELIVERY.md
  REPRODUCE.md
  evidence/index.json
  evidence/environment.txt
  evidence/commands.json
  evidence/logs/<command>.log
  evidence/config/<effective-config>.json
  evidence/offline/<run>/...             # 报告引用且必需的逐条输入/回执/输出
  evidence/path-map.json
  evidence/source-status.txt
  evidence/source-diff.txt
```

必要非 Git 产物也在该目录，全部列索引；不打整个 data。README 可增加，不能代替以上信息。全部实现/测试/fixture/依赖变更入 Git；日志等证据可为附件。返程优先**独立导出仓库完整历史 bundle、无前置**，不要创建包含其他项目分支的 `--all` bundle。

`return.json` 至少包含：schemaVersion、sourceOriginSha、inputExportBaseSha、inputDeliveryTipSha、developmentBaseSha（必须等于 inputDeliveryTipSha）、finalTipSha、branch、bundle={path,sha256,type,prerequisiteCommits[]}、implementationCommits、planPath、planSha256、commandsIndex、evidenceIndex、attachments[]、gitStatus、uncommittedExplanation、limitations。所有 SHA 必须完整 40 位；SHA-256 为64位；相对路径无 `..`/绝对路径/越界 symlink。bundle 不得只含实现 diff 却声称完整历史。

如果改为增量 bundle，只能在接收者明确确认具备**全部**前置提交后使用；该确认及所有前置写入交付说明。为避免返程隐含依赖，本任务默认完整历史。

`DELIVERY.md` 逐项映射 P0–P4/T01–T16：完成项/commit/文件/证据，计划偏差及原因，修改文件范围，限制、失败、未完成和后续集成。不得以测试数代替条目。固定回复与真模型证据分开；本期真模型未运行。

`evidence/commands.json` 每次运行保存 id、完整 argv/工作目录相对映射、开始/结束时间和时区、退出码、源码完整 SHA、配置相对路径及摘要、原始日志相对路径及摘要、fixtureManifestSha256、运行模式。验证最终提交时工作区干净；如果运行后改了影响验证的代码，提交后重新运行受影响检查，旧失败保留，不能拼接不同版本作为一次通过。工具版本和 package lock hash 同时保存。

`evidence/index.json` 每文件列 path/用途/sha256/bytes/sourceCommit/configRef/commandId；证据文件自索引用 SHA256SUMS 覆盖，不循环自哈希。所有报告引用必须解析到交付文件。日志绝对路径通过 `path-map.json` 映射包内 artifact 或 bundle checkout 相对路径，无法映射的非必需机器信息说明；不能指向不存在的开发机文件。

## 开发最后的实际命令

在最终 commit 的干净独立 checkout，执行：

```sh
git status --porcelain=v1
node --version
pnpm --version
git --version
node plans/r1-jev-input/preflight.mjs
pnpm install --frozen-lockfile --store-dir .r1-pnpm-store
pnpm exec tsc --noEmit
pnpm exec vitest run --config plans/r1-jev-input/vitest.r1.config.ts
pnpm r1:jev:offline -- --output artifacts/r1-jev/run-1
pnpm r1:jev:offline -- --output artifacts/r1-jev/run-2
```

还需对修改的 TS/JSON 用 `pnpm exec biome format <逐个实际变更路径>` 检查（不带 --write、不全仓重排）。根 package 增加此 offline 命令是交付要求。两次离线输出剥离时间/attempt ID 后比对确定字段；原始值必须保留。免费测试通过且隔离约束无违例才交 P4；局部失败如实交付整改，不篡改预期。

从自己的 repo 生成 `source.bundle`：`git bundle create <输出目录>/source.bundle <开发分支名>`，不是原产品仓库。保存 `git bundle verify`、`git bundle list-heads`、`git status`、与 input delivery tip 的 `git diff --name-status`。在空目录导入返程 bundle 后按 REPRODUCE 完整重跑上述相关命令，保证未借用原 checkout 依赖、证据或未提交文件。

## 接收材料完整性门禁（先于能力结论）

- [ ] 全包 SHA-256、文件索引与清单一致，无遗漏/多余敏感文件/路径逃逸。
- [ ] bundle verify、refs、history 类型、前置列表和实际一致；source/development/final SHA 对齐；不能以分支名代替身份。
- [ ] 在空 repo 导入且核对 final tip，原本机 Roadmap/未提交修改保持不动。
- [ ] P1 schema、所有 tests/fixture、新增依赖/lock、工具版本、实际命令与退出码齐全。
- [ ] 报告引用的每份原始证据都存在且可由相对路径解析；绝对路径有包内映射。
- [ ] 返程 git status 干净，任何未纳入提交项明确解释；必需实现不允许未提交。
- [ ] 仅 Node/pnpm/Git 与公开依赖网络即可重建，无浏览器、数据库、key 或本机 data 要求。

有必需缺项标“交付不完整”，列具体文件/摘要/命令及影响。可继续不依赖缺项的静态审查，不猜其内容、不宣告功能通过。

## 独立能力验收

- [ ] 比较 inputDeliveryTip..finalTip；只写允许范围；原 src 参考 hash/默认功能/提示/执行边界不变。
- [ ] 按 T01–T16 审查 schema、纯排序、真实 receipt 绑定、过期无效化、预算/取消竞态、缓存、unknown费用、标签隔离、返程复建。
- [ ] 自行增加/执行边界反例，不仅运行 dev 汇总；不要求访问其机器。
- [ ] 确认没有真实网络模型调用；固定回应只证明接线，不证明 Jev 语义/抗注入质量。
- [ ] 逐项记录环境问题、实现缺陷、方案缺口、证据不足；不可降低门槛、跳过失败或合并异构结果制造通过。
- [ ] 最终给“前置模块是否符合本计划”的结论，不能给 R1 完成或收益成立结论。

## 未通过时的整改提示词模板

你负责 R1 Jev 前置模块整改。以返程 final SHA `<完整SHA>` 为基线，在独立分支修改。原 input SHA `<完整SHA>` 和计划版本不变。验收状态为 `<交付不完整/未通过>`。逐项问题：`<编号、T条目、可复现命令、实际结果、预期依据、证据相对路径、影响>`。修复实现/补交材料，保留原失败；不要降低门槛、改写预期或省略失败。仅修改允许范围，不接执行器、不调用付费、不派发 Agent。提交全部变更并重新验证受影响项，按 r1-jev-return-1 返回完整 bundle、SHA、差异说明和原始证据。`<缺材料问题与环境问题分别列明>`。

## 验收后给 Roadmap 维护 Agent 的建议稿模板

仅在独立验收后填写，当前不发送：

- 能力/状态：在 `<finalSHA>`，前置契约/程序排序/Jev 注入传输/离线工具实际通过 `<T列表>`；未通过 `<列表>`。
- 证据：`<返程包摘要>`、`<独立复验包摘要>`、原始命令/日志/fixture/config 相对索引。
- 边界：固定响应、离线给定状态；未接执行器/恢复；未验证真实 Jev 判断、整轮覆盖/发现或调用/成本改善。R1 仍未完成。
- 下一步：R0 状态允许后单独评审接入、恢复、三组端到端同条件对照与预算阈值；不得自动启用或沿用旧授权。
