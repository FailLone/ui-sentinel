# R0 整改候选交付与独立验收入口

2026-10-07。**这是整改开发者的 A/B 自测交付，不是独立验收结论。R0 尚未完成，C 未重新执行。** 没有向远端 dev Agent 派发整改，也没有修改 Roadmap。

## 候选身份和证据

基线 `8b73e3ffa2bf94ce67760c17762ab9dab70c6488`，分支 `codex/r0-closeout`。准确候选提交、逐文件构建摘要和 ZIP 校验值记录在 `data/r0-remediation-delivery/delivery-pointer.json` 指向的交付包 `delivery.json` / `SHA256SUMS.json` 中；该包包含候选 Git bundle，可在独立目录核对源码。本文与候选代码同次提交，避免把后续文档提交误当另一套产品实现。

最后九场景正式 API 自测目录：`data/r0-remediation/2026-10-07T09-13-36-137Z/`。其中 `build-identity.json` 保留测试开始时的基线 HEAD 和未提交源文件实际哈希；交付索引将这些哈希与候选提交、当前 dist 再核对，不能只凭旧 HEAD 判断构建。

命令和全部阶段日志：`data/r0-remediation/2026-10-07/`。交付包包含本轮各次失败、中间成功及最终九场景的报告、原始工具输入/结果、数据库、证据原文件、截图和索引。旧付费批次保留在上一份 `r0-diagnostic-8b73e3f.zip`，本次附该包的定位和 hash，不将旧 C 结果转成新候选通过。

## 改动对应

| 计划 | 实际实现与边界 |
| --- | --- |
| D1 | investigation schema/runner 新增 `binding=post-action` 和 `bind_results`；默认 `node` 保持同节点身份。缺失的结果不能在之后的 measure 隐式绑定；必须显式再绑定。交互后置测量绑定当前结果，在截图前后核对文档、节点和值。 |
| D2 | `interaction-recovery.ts` 维护活动运行内不可换预期的 checkRef；`interaction_verify` 只读恢复。持久 `verification-opened → 新 page:observed → recovered → 原 item 更新`，旧 unverified 保留。完成提交和历史报告分别核对链及产物内容。无第二浏览器循环，不重放原动作。 |
| D3 | 复用实际 DOM 事实去重；UI 连续三个无进展轮次至多一次观察/原事项恢复，没有新事实及时 partial，新事实可继续。预算保留区确定性结束。补修结构化 SDK 参数错误的摘要崩溃，非法目标可被拒绝并诚实收尾。 |
| D4 | 费用 ledger 增量追加核对表；按请求/generation 唯一、原 unknown 行不变、投影计费一次。独立 CLI 仅 GET 已有账单元数据，成功/失败均审计，无批次恢复或新授权。 |
| D5 | 编译服务、POST /api/runs、真实 Chromium、本地固定模型九场景及健康/异常独立页面回放。原 URL、业务、调查和 campaign 免费接线回归。 |

第一轮已有的失效原因回执、历史摘要、数字排序最少两个节点和独立 CSS 归属判定继续复用。没有接入 R1 Jev 探索策略，没有换真实模型/中性目标、提高 300 秒时限或降低健康完整完成条件。

重要实现边界：可恢复的是动作前已有 `page_act.verify` 的同文档事项。旧的同节点调查 unknown 不可被重新解释，新建的成功调查不能清除旧 gap。购物/导出不开放恢复工具，仍沿用业务结果/写入合同。活动 checkRef 不跨重启恢复；重启按原约定 interrupted。恢复上限两次，后续新动作使旧引用失效。

## 已执行检查

使用 Node `v24.21.0`、pnpm `10.17.1`。以下命令均没有付费生成请求；使用本地固定模型的测试不是模型能力证明。

| 命令 | 自测结果 | 日志 |
| --- | --- | --- |
| `pnpm test` | 146 文件、1456 项通过，1 项默认跳过 | `tests-final-3.log` |
| `pnpm exec vitest run evaluation/support/cost-reconciliation.test.ts` | 费用兼容调整后 3 项通过；与全量重叠，不相加充数 | `cost-tests-final.log` |
| `pnpm build` | 类型检查、Server、工作台及两业务靶场构建成功 | `candidate-build.log` |
| `pnpm exec tsx scripts/validation/r0-remediation.ts` | 9/9 场景满足各自正/负预期；原动作各一次，数据库事件一致 | `candidate-api.log` |
| `pnpm validate:url-scan -- --preflight` | 42 项通过 | `candidate-url.log` |
| `pnpm validate:business -- --preflight` | 32 项通过 | `candidate-business.log` |
| `pnpm validate:programs -- --preflight` | `menu-broken` 通过；只证明这一程序接线 | `candidate-programs.log` |
| `URL_SCAN_FREE_CAMPAIGN_TEST=1 pnpm exec vitest run scripts/validation/url-scan-campaign.test.ts` | 4 项通过；显式开启默认跳过的免费 campaign | `candidate-campaign.log` |

以上原始日志均保留，不能把其他未运行样本写成通过。格式和 diff 校验见交付索引。

| 正式 API 场景 | 结果和独立可查事实 |
| --- | --- |
| 动态健康 | 3 轮；首次 unverified 保留，恢复后原 item verified，completed/covered，证明有效 |
| 动态异常 | 4 轮；原 item failed，现有调查保存 supported finding，仍 completed/covered；独立回放显示 Wrong，公开页面承诺 Ready |
| 错 checkRef | 3 轮；明确 reference-unavailable，原 gap 留存，blocked/partial |
| 偷换 selector/expected | 3 轮；schema 拒绝且恢复事件为零，原 gap 留存，blocked/partial，结束证明有效 |
| 中间动作使引用过期 | 4 轮；state-stale 拒绝，原 gap 留存，blocked/partial |
| 无法恢复 | 4 轮；两次恢复仍 unverified，blocked/partial；不生成成功替代事项 |
| 重复读取 | 5 轮；一次有界恢复，无新事实，blocked/partial；未等 300 秒超时 |
| 循环期间出现新信息 | 6 轮；只读恢复取得新结果、继续原检查、completed/covered |
| 原证据篡改 | 引用拒绝，报告 proof 无效、reconciliation-required 隔离；不是健康通过，也不是原站点缺陷 |

健康/异常各有 `independent.json`、`independent.png`；已查看截图，回放直接读取实际 DOM，不复述生产 finding。它仍属于本开发者自测的独立测量手段，不是独立验收者结论。

## 原取消请求费用核对

命令：`pnpm exec tsx scripts/validation/reconcile-cost.ts data/r0-acceptance/2026-10-07/paid-ledger data/r0-url-campaign/r0-ui-diagnostic-8adc93a-01 2f5ddd1a810e0bd5fc54a2be`。

首次真实元数据核对揭示实现边界：原流返回模型别名，账单返回同家族日期版本且 finish_reason 为空。核对器现仅接受精确模型或同别名加八位日期版本，且空终止原因需有正生成时长、有效完成 token 计数、正费用；不完整/零费用继续 unknown。此窄映射只核对已记录 generation 的费用，不改变模型配置。元数据接口参见 [OpenRouter 官方文档](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation)。

实际重新读取原 generation 并幂等复查：追加一条 US$0.0037296，费用投影总计 **US$0.0372246**。SQLite 独立比较确认原 `ledger_requests` 全部行逐字段相同，unknown 和预留数字保留；核对表仅一行。`stages.json` 与旧 campaign-summary 与上一份交付包字节相同。证据为 `cost-ledger-before.db`、`cost-ledger-after.db`、`cost-independent-comparison.json`、`cost-reconciliation*.log/jsonl`、`cost-idempotency.log`。失败查询也保留，没有新付费请求或批次恢复。

## 失败、偏差和未验证范围

- 首次针对性回归发现小模型预算结束语义和截图证据引用遗漏，已修复并复跑；原日志保留。
- 编译曾发现测试事件少 stepId；API 脚本曾缺视觉配置、重复发送 fixture 响应、新信息分支被前分支遮挡；均为显式修复后重跑，旧失败不删。
- 非法工具输入原本触发摘要 `value is not iterable`；新增原始 SDK 结构回归，最终场景要求具体拒绝原因及有效 partial proof，未用一般 execution-error 代替正确收尾。
- 全量首轮未知写入隔离断言出现一次 execution-error；单项和随后两轮全量未复现。没有改预期或放宽门槛，只添加失败诊断信息。确切首次原因尚未确定，是交给独立验收的稳定性风险；原失败 `tests-final.log` 与复测记录均保留。
- 费用首个真实 GET 因日期版本/空终止原因被保守拒绝；修订方案和正反例后成功，仅核对原调用。
- 新 C 能力验收未执行。固定模型知道测试操作，故只能证明接线；它不证明真实 Agent 会选择正确控件、期望或恢复工具，也不证明任意动态站点均能完成。
- 费用服务异常、缺失、冲突由替身测试；本轮真实 API 只核对原取消 generation，不覆盖各提供方全部账单形态。仍未知的元数据会阻止付费继续。

## 独立验收下一步（待执行）

1. 在独立 checkout/bundle 验证候选 SHA 与逐文件 hash，复查 D1–D4 代码，特别是同节点约束、原 item 链、拒绝时 gap 和未知写入不重放。按需要复用对应构建的 A/B 原始证据；自行复跑九场景及不确定写入用例，查看保留的首次失败。
2. C 前由验收者准备未用于本轮修复的新保留布局。已见 `holdout-grid-1` 只能是回归集。本轮健康/异常反馈 fixture 同样只能作为已见接线样本；不得把其操作脚本送给真实被测 Agent。
3. 首批诊断建议保持原六行结构：普通健康、视觉健康/异常对照、DOM 动态健康/异常对照、边界诊断各一轮，另一次 smoke。真实配置保持主 DeepSeek V4.1 Flash、视觉 Qwen3.7 Plus、Alibaba、原 token/工具/300 秒预算和中性用户目标。最终样本、版本、次数、评分器和通过条件必须先冻结；此处不是冻结清单或授权。
4. 健康必须完整 covered 且独立确认结果与导航义务；异常必须有可独立归属和复现的 supported finding；边界必须诚实保留未查范围。模型仅获正常用户目标和公开页面信息；私有真值、答案、独立评分不可进入生产提示或工具输入。
5. 预算建议：与历史诊断合计仍不超过 US$2，即本次可用上限建议 US$1.9627754（扣除已核对 US$0.0372246），按 ledger 预留和实际成本约束。需要对应新批次的明确授权；没有授权不启动。任一 unknown/失败按冻结停止规则保留全部后续 not-run，不能临时重跑补齐或混批宣称通过。
6. 诊断通过也不自动等于 R0 完成；正式 UI 15 轮及购物/导出诊断/正式出口仍按原 plan 的门槛，另行固定配置和预算、授权。独立验收者出具逐项通过/部分通过/未通过结论，再向 Roadmap 维护者提交 SHA、配置、证据、边界、未完成项及下一步建议。

给 Roadmap 的同步建议：R0 保持进行中；新增“动态结果恢复、防循环、追加费用核对已形成开发候选及 A/B 证据；新 C 与独立验收尚缺”。不更新 R1 状态，不自动进入下一阶段。
