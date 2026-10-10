# R0 最终交付入口

2026-10-09。**R0 阶段交付完成，可支持 R1；真实模型稳定性与正式验收待完成。** 本页是当前唯一R0交付入口，旧计划/交接保留作历史和证据，不另宣告一套当前状态。

## 本次交付

main从 `0dced2a` 快进整合 `codex/r0-default-check-v2@556f241` 的68个提交，再纳入文档收敛；没有重写历史。产品候选是 `27614b7`，阶段交付 `5070fb2`，R1依赖交付 `556f241`。全部提交SHA、排除分支、原始构建/证据摘要和清理记录见[集成机器索引](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/evidence/r0-main-integration.json)。最终集成提交由包含本页的main Git提交确定。

没有合入R1、规则或DNS分支，没有新的付费、真实模型、默认启用或权限扩展。原主目录仍停在脏的codex/r0-closeout，未切换、reset或stash，未提交Roadmap精确副本先保存于 `8e8c07a` 和本机归档。当前Roadmap整理为[阶段与后续](product-roadmap.md)，[架构](architecture.md)描述实际能力。

## 可用能力及结果辨识

受信单机、匿名有界的网址检查，普通输入为网址和可选目标。固定候选/选样、一次动作关联、通用反馈、公开来源必需效果、适用规则、真实导航、partial/缺陷报告及历史恢复已经交付。

- completed/covered且proof有效：限定义务已结算；可以含真实缺陷，不代表所有功能正确。
- generic collected但明确效果pending/unverified或来源未封闭：仍未完成；不能靠通用检查抵消。
- 无独立效果规格且来源封闭：通用完整可以结束，功能语义仍未知。
- blocked/partial、cancelled、execution-error/interrupted、干预或proof无效：保留原因，不自动重放或改成通过。

完整支持范围、F覆盖/未覆盖及原始场景见[v2阶段交接](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/r0-default-check-v2-handoff.md)与[证据索引](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/evidence/r0-default-check-v2-delivery.json)。历史持久风险、取消尾差异、未覆盖子项和正式验收统一列在[已知问题](known-issues.md)。

## R1 接入

从[六状态公开包index](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/r0-r1-dependency-v2/index.json)及[依赖说明](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/r0-r1-dependency-handoff.md)读取。public/input/state与evaluation分开；未知实时权限和预算不自动排除离线调查候选，也不授予动作执行权。

R1独立分支 `e5b39f7` 已记录6/6消费核验、程序基线及dry-run；1个多候选时点中三项合理并列，尚无可判别排序收益参照，不代表Jev或R1完成。本次仅只读核对其交接，不合入或重跑R1代码。

**保留原绝对路径** `/Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel/plans/r0-r1-dependency-v2/`、同工作区的final-free批次与data/artifacts。main有相同小包不等于旧路径无人使用；原R0工作区暂不归档或删除。

## 启动与一次免费试用

现有原R0工作区保留已核对构建和依赖。可按[v2交接的启动说明](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/r0-default-check-v2-handoff.md)启动独立预览库；网址模式默认仍关闭，启动本身不调用模型。没有在本次集成中启动服务、停服务或扫描。

需要单次免费、固定provider驱动的匿名有界试用时，在保留的原R0工作区使用现有Node24及依赖：

```sh
cd /Users/xietian/.codex/worktrees/r0-default-check-v2/ui-sentinel
export PATH=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH
pnpm exec tsx scripts/validation/r0-default-check-v2.ts internal-trial workbench
```

该命令只运行一个本地fixture工作台场景，输出新目录，不证明任意网站或真实模型能力；本次没有再执行。新main检出本身不携带ignored依赖/dist；如以后从新检出启动，需自行按README准备锁定依赖并构建，不能把复用历史构建误当新目录已生成dist。

## 验证复用

集成是祖先快进；之后只有文档和历史说明纳入，src、evaluation、scripts、package及锁文件与556f241一致，src与27614b7一致。因此复用既有构建和typecheck，没有机械重建或重跑28场景/全量/71任务。73项单测仍标主体候选阶段；最后报告修正的16项回归和38个评分攻击按原索引记账，不汇总成新候选全量通过。

新做的是文档本地链接、源树/锁文件身份、证据索引hash、6状态包逐文件一致、主目录未提交文件未变、归档逐文件可读和摘要、重复ZIP、失效工作区索引检查。原审计保留cancel报告73事件与库74事件差异，未改成绿色。

## 归档与恢复

本机归档目录：

`/Users/xietian/Documents/ChatGPT/ui-sentinel-local-archive/r0-integration-20261009T010610Z/`

其中含主目录未提交文件精确副本/patch、初始Git状态、68提交清单、37份历史导出摘要、清理计划/结果、两条失效登记管理元数据和最终批次归档。大文件未加入Git。

- `r0-v2-final-free.tar.gz`：641个文件逐字节对原目录校验，SHA256 `efadca618c80e5db534ac2bc2364b43f258168dae524a04711e9dd3784250f8e`。原final-free与data/artifacts未移动/删除。恢复时先解压到**新目录**并按原文件索引核对，数据库保存的绝对artifact路径需显式映射；不要覆盖活库。
- 仅将1份重复ZIP普通文件（12,929,819字节）移到可恢复归档，原路径保留相对symlink，旧机器索引仍可读取同字节；canonical导出也还在。复制前核对两个ZIP相同且627成员可读，无打开句柄；复制后再次比对才移除重复普通文件。要恢复普通文件，先核验清理索引SHA，再解除该**symlink本身**并从archivePath复制回originalPath；不删除归档。未声称净磁盘节省。
- 清理2条缺失`.git`的review登记；两条分支已被原main包含、索引等于分支HEAD、管理元数据已逐文件备份。**遗留目录及其全部文件仍在**，没有删除工作区目录或review分支。需要重建checkout时在新路径从保留分支创建，避免覆盖遗留数据；备份元数据仅用于人工恢复核对。

数据清理计数：1个重复普通文件归档并替换链接，2条失效登记清理，0个数据库/证据文件丢弃，0分支删除，0工作区目录删除。未知文件、全部失败/费用/授权、并行分支、本次活跃集成工作区均保留。

原始Roadmap及独立诊断/接续说明的原文件仍在主目录；重复计划已随R0保存，不再复制第二份。历史计划与证据未搬家，故没有借目录整理改写历史索引。

本次工程收尾到此结束；进一步上线、实时R1或付费由维护者和用户另行决定。
