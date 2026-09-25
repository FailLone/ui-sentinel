# 可移交的已批准重试规则

这是原学习验收资料的最小摘录，随 Git 提供。它恢复已有人工批准，不执行新的审批；只有私有开发/评估工具读取，不能把这些资料提供给被测 Agent。

## 在任何新 checkout 中使用

```sh
pnpm install --frozen-lockfile
# 离线校验，不需要模型密钥：
pnpm fixture:approved-retry -- --verify
# 生成本机可用的封闭学习来源：
pnpm fixture:approved-retry
```

默认输出 data/fixtures/approved-retry/，包含 runs.db、source.json、prepared.json、approval.json 和证据。为兼容现有下载 API，同时将五个原始证据恢复到本机 data/artifacts/<原runId>/；已有同名文件必须字节一致，否则拒绝覆盖。可指定 --out <新目录>；已有目录会拒绝覆盖，需保留旧结果并选择新目录。导入无需原作者的 data 目录、绝对路径或模型密钥。

交给开发计划中的正式命令：

```sh
pnpm validate:business -- --formal --diagnostic-source <通过诊断的目录> --approved-source data/fixtures/approved-retry
```

validate:business 属于下一阶段需要实现的命令，当前不可用。现有真实学习复查可使用：

```sh
pnpm build
pnpm validate:learning -- --recheck data/fixtures/approved-retry
```

后者调用真实模型，要求干净提交、模型凭据并消耗验收预算；导入和离线校验本身不会调用模型。不要把导入得到的数据库作为日常工作台主数据库使用。

## 来源与内容

- 历史来源：learning/2026-09-24T10-57-41-736Z。
- 候选：proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607；原数据库状态 enabled，reviewed_by=user。
- 原批准时间：2026-09-23T08:27:07.432Z。approval.json 保留原记录；approval-inherited.json 保留复查继承来源。
- 原规则声明 SHA-256（递归排序 key 的紧凑 JSON）：f3ac227c94ea3c16471bbf00ee4e2f811d3b005600049520271979bf1792161e。
- records.json 保存相关原始数据库行：一个来源任务、两个业务/测量事件、一个发现及假设、最后一条确认反馈、一个获准候选、五个相关证据条目。
- artifacts/ 保存原始截图、快照和五秒测量；healthy-counterexample.* 保存当时独立浏览器测得的健康反例。规则与证据内容不修改。
- prepared.json 保留生成时状态 validating；最终批准以原批准文件及 records.json 的 enabled 行共同核对，不能只看 prepared。
- recheck-summary.json 是历史六轮摘要，不包含完整运行，不代表新的代码通过验收。

来源数据库整体不提交；其中无关任务、其他候选和模型日志未打包。只将数据库 artifact.file_path 改成包内相对路径，将 source/prepared.source/继承记录的旧目录改成 archive: 标识。导入时为新机器重建符合现有证据访问边界的绝对路径，不修改 API 的文件白名单。

manifest.json 记录每个载荷的原始字节哈希与大小、声明哈希及历史数据库哈希。Git 承载来源审阅，哈希用于完整性校验，并非数字签名或新的人工授权。导入生成 portable-source.json，明确列出历史数据库和新建摘录数据库的不同哈希，approvalActionPerformed=false。

## 完整性与范围

校验检查文件哈希、路径边界、声明一致、人工批准关联、证据归属和 fail/pass/unknown 三类历史输入。字段篡改、丢失批准、外部路径/符号链接、无效 JSON/PNG 会拒绝导入；导入不覆盖已有数据库，不重新分配候选 ID 或批准时间。

这是历史资料摘录，不是完整历史 run；缺少完整事件链是有意的。来源任务的性能、终结与全量覆盖不能根据这份摘录重新评分。开发仍须运行新的 B/D 正式复查，不能把历史六轮摘要计入新成绩。

.gitattributes 禁止换行转换，Biome 跳过此目录，避免格式化改变已记录证据的字节。不要手改文件后更新哈希以使校验通过；原声明修订仍走正常提案与批准流程。

完整历史过程见[原学习记录](https://github.com/FailLone/ui-sentinel/blob/48419bc/plans/learning-validation-results-2026-09-23.md)。
