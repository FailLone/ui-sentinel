# 历史与证据

这里提供历史范围和原始证据入口，普通使用从[文档首页](../README.md)开始。历史阶段名、分支、费用和通过数仅描述当时样本与构建，不代表当前默认行为或新的运行授权。

## 阶段与证据入口

| 历史范围 | 可随 clone 查阅的记录 | 如何理解 |
| --- | --- | --- |
| R0 匿名扫描与完成证明 | [已知问题](../known-issues.md)、[冻结输入](../../evaluation/archive/legacy-runs/README.md)；更早设计在 Git 历史 | 阶段用途已接收，正式真实模型稳定性缺口及持久异常仍保留 |
| R1 探索规划与 Jev 研究 | [模块说明](../decision-scoring.md)、[研究工具](../jev-research.md)、[开发夹具](../../evaluation/fixtures/decision/README.md) | 程序探索的有限验收不证明 Jev 排序收益；旧离线零有效分母、传输失败等不能并入新成绩 |
| R2 产品资料 | [最终真实批次索引](../../evaluation/archive/results/product-sources-real/real-registration-recovery-acceptance.json)、[工程索引](../../evaluation/archive/results/product-sources/registration-recovery.json)、[合并记录](../../evaluation/archive/results/integration/product-sources-closeout.json) | 六项有限页族验收含两项仍 partial 的有据弃权；旧失败/阻断/超时不改写；本批未触发纠错恢复 |
| R3 路径复用 | [原四运行](../../evaluation/archive/results/path-reuse/real-acceptance.json)、[D定向复验](../../evaluation/archive/results/path-reuse/handoff-real-result.json)、[合并记录](../../evaluation/archive/results/integration/path-reuse-closeout.json) | 原A/B/C加修复后D行为支持有限范围；原D失败保留，模型额外解释未验证，不称原四项同批通过 |
| R4 重复检查 | [工程索引](../../evaluation/archive/results/regression/acceptance.json)、[合并记录](../../evaluation/archive/results/integration/regression-closeout.json) | 工程/固定回复验证，不是语义变化后的真实模型验收 |
| 规则与 DNS | [规则证据目录](../rule-library/evidence)、[DNS证据](../evidence/network-dns-compat.json) | 合成规则样本不等于原 Jira 复现；公网解析观察不代表缺陷判定 |
| 历史工作树存档 | [原始归档清单](../../evaluation/archive/results/integration/legacy-branch-archives.json)、[分支清理清单](../../evaluation/archive/results/integration/path-reuse-branch-cleanup.json) | 只读记录，不是可在新机器执行的恢复说明 |

R0–R4 的逐轮交付、维护者时间线和已完成计划通过 Git 历史查询。重整前文档基线为 `796348f75abbc1bee10ed1197f5e0b2dcaf6f385`：

```sh
git show 796348f75abbc1bee10ed1197f5e0b2dcaf6f385:docs/product-roadmap.md
# 历史复现使用证据中记录的执行提交；不要在当前树套用旧 manifest。
```

本地归档标签或未推送提交未必随 clone 存在；无法解析时需由保管原仓库的人提供对应 Git 对象，不伪造新的历史版本。

## 冻结协议与当前工具

三个历史协议已原字节移入 `evaluation/archive/protocols/`。其中相对链接和命令按原提交解释，不作为当前执行指南：

- [资料历史协议](../../evaluation/archive/protocols/product-sources.md)。
- [路径历史协议](../../evaluation/archive/protocols/path-reuse.md)。
- [定向交回历史协议](../../evaluation/archive/protocols/path-handoff.md)。

现用资料/路径工具分别冻结[资料协议](../testing/product-sources-acceptance.md)和[路径协议](../testing/path-reuse-acceptance.md)。定向交回仍属于依赖封存真实来源的历史研究工具，读取原协议；无法无损变成普通 clone 的通用回归，便携验证使用 `pnpm validate:path-reuse`。

`evaluation/archive/legacy-runs/` 的冻结来源、说明和 JSON 保留原字节。当前代码/目录更名后不更新历史清单的哈希，历史复算使用对应执行提交。迁移关系和仍固定原费用来源的工具见[scripts导航](../../scripts/README.md)。

## 不随仓库分发的材料

原始数据库、截图、模型请求、浏览器证据和日志通常位于运行时 `data/`，不在普通 clone 中。Git 保存的 JSON 索引给出稳定 runId、批次 ID、manifest/文件摘要和当时位置；索引不能替代原件。需要历史复核时按这些 ID 向原运行材料保管者索取封存包，再逐项核对摘要；当前没有统一下载地址或已声明的保管联系人。未知取得方式明确为未知，不能把本机路径改成貌似可用的仓库链接。

规则来源 `FAIL-20261008-01` 的 `fail.md` 不随仓库分发，SHA-256 为 `4a7507c440a8ca3eb7260a662a5f511770348d2d4a873aa20a96f3445e73c614`，2820行。规则页保留 `SRC-FAIL-*` 和原行号供恢复定位；原 Jira ID、附件和设计上下文未提供，取得渠道未记录。见[来源索引](../rule-library/ticket-mapping.md)。

不可变 JSON、冻结来源 Markdown 和历史协议中可能仍含旧绝对路径或会话标识；它们只作为原始事实保留，不是当前执行指令。整理仅清理正式叙述，未声称仓库所有字节都无路径，也没有删除或改写原始失败和费用未知记录。
