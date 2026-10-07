# R0 K4/K5 执行交付：正式 UI 阶段未通过

执行候选 `97d39eda8fcbae9a6e163c6dfc5219668d67043d`，产品构建及源码未改动。用户恢复授权见 `evidence/r0-k45-resume-authorization.json`；原计划见 `r0-k45-execution-plan.md`。本次是实际验收执行及原始证据审查，不是新增实现自测，也没有声称另一个Agent已复核本次C证据。

## 逐阶段结论

| 阶段 | 实际结果 | 出口及后续 |
| --- | --- | --- |
| K4-1 / C11诊断 | 6/6通过；5个UI完整完成，边界可信blocked | 原始证据审计及独立出口接受，准入正式UI |
| K4-2 / 正式UI01 | **13/15通过，2/15未通过**；完整执行固定矩阵，无拼接、无重跑 | 必需15/15不满足，阶段未通过 |
| K5-1 / 业务诊断 | 未运行，0/5及smoke未运行 | 前置K4失败，不具备准入条件 |
| K5-2 / 业务正式 | 未运行，0/45 | 不具备准入条件 |
| R0 | **未通过** | 不能宣布完成，不能进入R1 |

正式UI分组：healthy-catalog 3/3，overlay-healthy 2/3，overlay-defect 2/3，dom-healthy 3/3，dom-investigation-defect 3/3。健康共8/9、异常共5/6满足完整标准。所有健康行均零supported误报；异常失败行仍保留有效遮挡发现，完整性失败不抹掉发现事实。

两项阻塞及前次覆盖缺口详见 [专项分析](r0-k4-formal-failure-analysis.md)：

1. 第6行健康对照：排序已验证，随后反复读取隐藏区域，未履行已选Filters及导航；有界恢复后诚实blocked，不能算健康完成。
2. 第7行遮挡异常：只读probe的预期不可点击结果，被统一UI动作catch当成致命执行错误；没有接受结束证明。真实错误、取消、未知业务写入的隔离要求仍然保留，不能统一改成partial。

本轮没有补丁、新全量免费自测、模型/提示词/任务/布局/时限变更或下一付费批次。首次普通质量失败后继续的是同一个已固定15行矩阵，符合执行计划第6节；未出现取消、未知写入、费用unknown或安全停止。全部失败均保留。C10原自动passed仍在历史账本中，但原独立否决不变，未用它准入。

## 可审阅证据和复核方法

- [C11独立出口](evidence/r0-c11-exit-review.json)：manifest、每行报告、归档审计、异常/健康重放摘要。
- [正式独立出口](evidence/r0-k4-formal-exit-review.json)：15个runId、准确终态、逐行判定及证据文件哈希。
- [交付及费用索引](evidence/r0-k45-delivery.json)：完整压缩包绝对路径、字节数、SHA-256、账本快照与费用。
- [归档审计脚本](evidence/r0-k45-audit-ui.py)：独立Python/SQLite，不导入生产代码；核对每个产物字节、所属run、事件完整payload/refs/seq、DB终态、scope投影及证明摘要。
- [通过出口辅助脚本](evidence/r0-k45-exit-ui.py)：用于C11通过门，断言终态、可信拒绝、正常/异常重放对照。正式批次失败，没有强行使用此脚本产生通过；正式否决另按原始行检查记录。

两个实际阶段的所有原始证据都在冻结工作区的 `data/r0-url-campaign/`，交付包同时包含manifest/approval、命令日志、请求/响应、截图、测量、数据库、独立重放与健康反例，以及停止后的共享账本快照。包保存在主工作区 `data/r0-k45-delivery/r0-97d39ed-c11-and-formal01.tar.gz`；Git推送的是结论、脚本、摘要与哈希，忽略目录中的大体积原始包不随Git推送。远端复核需同时获得此包；不能只凭13/15摘要审核。

归档审计两批均archiveVerified=true；正式allComplete=false与失败事实一致。第7行report.persistence=not-final说明它没有合法的检查完成证明；新SQLite连接仍读到完全相同的execution-error事件与终态，durability=true，不是数据库丢失或篡改。

真正的能力判定另外核对了站点请求、动作后结果、自动命中几何及异常/健康独立浏览器重放，不能将archiveVerified当作质量通过。第6行正常Filters重放成功；第7行异常Filters失败、健康反例成功，实际节点五点均被无关span截获；DOM异常各行实际行文本与健康排序不同，确认原发现有依据。首个正式任务由真实工作台表单创建，入口路径/query完整；工作台历史恢复的免费证据按计划复用，没有声称本轮重新执行全部免费路径。停止后的全事件/终态历史读已重新审计。

## 实际命令和结果

工作目录 `/Users/xietian/.codex/worktrees/r0-k45-candidate/ui-sentinel`，Node v24.21.0，pnpm10.17.1。先设置该Node PATH，使用主工作区 `.env` 的路径引用，不复制/输出凭据。

```sh
export PATH=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH
DOTENV_CONFIG_PATH=/Users/xietian/Documents/ChatGPT/ui-sentinel/.env VALIDATION_MAX_COST_USD=20 URL_SCAN_APPROVAL_FILE=/Users/xietian/.codex/worktrees/r0-k45-candidate/ui-sentinel/data/r0-k45/ui-diagnostic-11/approval.json pnpm validate:url-scan --diagnostic --manifest data/r0-k45/ui-diagnostic-11/manifest.json --batch r0-ui-diagnostic-97d39ed-11
DOTENV_CONFIG_PATH=/Users/xietian/Documents/ChatGPT/ui-sentinel/.env VALIDATION_MAX_COST_USD=20 URL_SCAN_APPROVAL_FILE=/Users/xietian/.codex/worktrees/r0-k45-candidate/ui-sentinel/data/r0-k45/ui-formal-01/approval.json pnpm validate:url-scan --formal --manifest data/r0-k45/ui-formal-01/manifest.json --batch r0-ui-formal-97d39ed-01
```

诊断exit0；正式exit1 `url-campaign-not-passed`，这是固定门槛对真实失败的正确退出。两条完整日志在交付包 `stage-authorizations-and-logs/`。不应直接再次执行上述命令作为重跑授权。

主工作区执行原始审计：

```sh
python3 plans/evidence/r0-k45-audit-ui.py /Users/xietian/.codex/worktrees/r0-k45-candidate/ui-sentinel/data/r0-url-campaign/r0-ui-diagnostic-97d39ed-11
python3 plans/evidence/r0-k45-audit-ui.py /Users/xietian/.codex/worktrees/r0-k45-candidate/ui-sentinel/data/r0-url-campaign/r0-ui-formal-97d39ed-01
```

已有免费A/B证据复用映射继续以原执行计划为准，不声称在97d39ed重复全部1499项。受影响范围仅本次验收文档、审计辅助及证据；产品冻结工作区最终HEAD仍97d39ed且干净。外部Roadmap工作区差异未修改、未纳入提交。

## 费用与剩余授权

实际执行21个任务及2个UI smoke请求；没有业务模型/业务smoke调用。C11花费US$0.07304775，正式UI花费US$0.20778033，本次合计 **US$0.28082808**。共享账本累计US$1.82777604，原首批独立账本有效费用US$0.03722460，R0累计 **US$1.86500064**。共享US$20护栏剩余 **US$18.17222396**；unknown=0、held=0、lease=0。

余额不授予失败后补丁或新批次。当前授权因K4出口失败停止推进；业务阶段仍受前置门禁约束。下一步先审阅专项分析并确定受限整改契约，获得相应继续指令后才实现；完成免费定向验证及候选审核后，再固定新的真实复验范围和授权。不得把这次13条通过拼入下一批。

## 给Roadmap维护者的同步建议

K1–K3原受限闭合事实和97d39ed取消独立复核保持；增加“C11通过，首次同候选正式UI13/15，K4未通过、K5未准入”的现状。将F1健康循环稳定性和F2只读probe错误分类列为R0剩余阻塞，保留旧D/C失败、当前未知能力范围及业务C缺证。产品仍只覆盖匿名、有界同源、非业务写入和现有DOM/规则调查；本轮holdout-inset-9已见，不能宣称未见网站泛化。由维护者核对后更新Roadmap；本Agent未代改、未发消息、未转入R1。
