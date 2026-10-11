# 旧分支归档与恢复

2026-10-12。当前本地工作分支仅为 `main` 和 `codex/r3-path-reuse`，远程分支仅为 `main`。这次只整理历史引用和文档，不修改产品或R3工作区，不重跑验收。

| 原分支 | 本地归档标签 | 保存提交与用途 |
| --- | --- | --- |
| archive/r2-product-sources-draft-20261010 | archive/r2-draft-20261012 | 90498c0，R2早期草稿，正式实现已在main |
| codex/jev-benefit-study | archive/jev-benefit-study-20261012 | 27c4b7b，40行历史研究及实验代码，不作为现产品实现 |
| codex/r0-closeout | archive/r0-workspace-20261012 | 96aec50，基于d636d7e原样保存33个未提交文档 |

R0资料包括旧Roadmap、28个规则库文档及4份分析/计划文件。逐文件SHA-256与提交内容核对一致；它们是历史材料，不覆盖main当前版本。原项目目录固定在此归档提交，工作区干净，忽略的数据与证据未删除。其他已完成工作区亦保留，不创建新的归档开发分支。

标签和恢复包均在本机，**没有推送归档内容**；推送到main的是此说明及[机器索引](legacy-branch-archives.json)。索引保存完整提交、33个文件的哈希、恢复包位置和哈希。恢复包约448KB，包含三条归档标签的独有历史，依赖现有main历史；`git bundle verify`已通过。它不包含Git忽略的原始数据，不是所有验收证据的备份。

在本仓库直接读取Jev冻结报告：

```sh
git show archive/jev-benefit-study-20261012:plans/jev-benefit-study/resilient/RESULT.md
```

读取R0历史文件可用同样方式，不需切换现有工作分支：

```sh
git show archive/r0-workspace-20261012:plans/r0-v2-context-recovery.md
```

若需在另一份已有main完整历史的仓库恢复，先复制机器索引所指的bundle，再执行（路径换成实际位置）：

```sh
git bundle verify /path/to/legacy-branches-20261012.bundle
git fetch /path/to/legacy-branches-20261012.bundle 'refs/tags/archive/*:refs/tags/archive/*'
```

需要继续某项旧工作时，从对应归档标签新建独立工作区和分支；不要在历史证据工作区直接重做验收。
