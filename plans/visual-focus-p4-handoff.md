# 主动视觉发现：P4 验收交接

状态：**P4 accepted，G0–G6 已完成。** 2026-10-06，主 Agent 在同一冻结版本执行真实视觉诊断、视觉 18 轮、业务诊断和业务 45 轮，全部通过；完成证据复核。没有为了通过调整产品代码、提示、模型、预算或评分，没有重跑替换样本。P1–P4 的完整提交历史已于 2026-10-06 快进合入 main。

## 冻结身份

- 执行提交：`a4c0698d932aa34d858ec395c27392e31a126b65`，分支 `review/visual-focus-p4`。
- 完整 build hash：`a93ee49e9787a690c9fdd1a0127069aa9054bb3e6f7b6afe0796cbc1e7d124f0`。
- Fixture：`visual-holdout-2`；hash `891e71577338eeeadf620d8a12fbcbaa225e937dfd6b7d39220629f22be0580d`。D0/H0/H1 为诊断回归，D1/D2/H2 为算法冻结后新增页面；旧六例仍保留。
- Scorer：`visual-scorer-2`；algorithm：`visual-focus-3`。
- Agent `deepseek/deepseek-v4.1-flash`、vision `qwen/qwen3.7-plus` 均固定 Alibaba；有限 review 配置 `typesafe/jev-1.13` 保持原端点。视觉 profile=1/1/1，业务=0/1/1。
- 每 run：300 秒、40 动作、30 模型调用。共享 campaign `ae92fb0a-7250-42a5-9b0a-3aa6ff9fa236`，目录 `data/campaigns/visual-focus-p4-01`，整个 campaign 上限 $2。
- 原批准 proposal：`proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607`；rule config SHA `f3ac227c94ea3c16471bbf00ee4e2f811d3b005600049520271979bf1792161e`，导入至 `data/fixtures/p4-approved-retry`。没有进行新批准。

本交接及状态更新在执行结束后提交，仅修改文档。不能把后续文档提交说成真实模型执行时的 HEAD；运行证据中的 a4c0698 保持原样。若要再次使用严格 runner 来源门槛，需在该执行提交的干净工作树复验，或在新的提交上重新诊断，不能手改 manifest。

## 验收结果

| 阶段 | 结果 | 证据目录（仓库相对路径） |
| --- | --- | --- |
| G0–G3 免费检查 | 109 文件 / 1093 项测试通过；格式、类型、build、批准 fixture verify、新旧页面真实点击、SDK/API preflight 通过 | `data/reviews/p4-preparation/`；`data/visual-focus-preflight/2026-10-06T08-32-48-261Z/` |
| G4 真实视觉 smoke + D0/H0/H1 | 4/4；停服审计通过 | `data/visual-focus-validation/2026-10-06T08-34-14-310Z-4353220a/` |
| G5 真实视觉正式 | 18/18；停服审计通过 | `data/visual-focus-validation/2026-10-06T08-42-08-626Z-b2caecb9/` |
| 旧业务真实诊断 | smoke + E0–E4，6/6；停服审计通过 | `data/business-validation/2026-10-06T09-01-58-928Z/` |
| 旧业务正式回归 | 45/45；A/B/C/D 四组停服审计通过 | `data/business-formal/2026-10-06T09-11-36-976Z/` |
| G6 主 Agent 复核 | 四阶段封存字节/hash、全部计划行、同 commit/build/campaign、结束状态与费用验证通过 | `data/reviews/p4-final/acceptance-review.json` |

P3 其余未修改模块的免费验收证据见 [P3 交接](visual-focus-p3-handoff.md)。本轮四个真实命令均退出 0。免费 preflight 内预期注入的价格失败/取消不能算成真实失败批次，也不能算成真实模型成功。

视觉缺陷 D0/D1/D2 共 9/9 检出，健康 H0/H1/H2 共 9/9 无误报。H0 三次均实际验证并 refuted；全部 18 次完成正常购买并显式 finish。18 次均使用真实 Qwen 截图候选和 DeepSeek 工具决策；原图、候选、绑定、焦点测量和标注均保留。D1、D2、H2 首轮标注已目视复核，失败点/健康点、实际输入框、图标与相邻按钮关系一致。

业务分组：A=15/15（导出，无批准规则）、B=6/6（导出，原批准规则）、C=18/18（原购物 C0–C5）、D=6/6（支付异常/健康，原批准规则）。45 个计划 run 的终态分布为：21 个 completed/success、6 个 completed/rejected、18 个 blocked/unknown，全部符合相应私有真值。B/D 数据库各有一条批准来源占位 run，明确为 provenance-only，并非额外测试或失败样本；它们不计入 45 的分母。

四阶段共 73 个计划行，包含两个 smoke；不把它们都称为完整浏览器业务案例。所有正式计划行均运行，无 not-run、跳组、删失败或跨版本拼分。

## 耗时与费用

视觉正式批墙钟 1160.865 秒（约 19 分 21 秒）；18 次单轮中位数 65.155 秒，最短 36.162 秒，最长 99.380 秒，nearest-rank P95=99.380 秒。以下为三次逐轮墙钟，单位秒：

| 案例 | 第一次 | 第二次 | 第三次 |
| --- | --- | --- | --- |
| D0 | 59.6 | 64.4 | 75.1 |
| H0 | 99.4 | 65.9 | 75.8 |
| H1 | 36.2 | 49.5 | 49.7 |
| D1 | 89.6 | 67.9 | 72.7 |
| D2 | 60.0 | 72.8 | 40.4 |
| H2 | 58.7 | 67.5 | 53.5 |

视觉正式批累计 model 1089.325 秒、tool 57.308 秒；这两个来自持久事件的分项，与批墙钟不同。共 18 次视觉请求、93 次 Agent 请求，失败/未知 usage 均为 0。视觉诊断另为约 6 分 36 秒。

业务正式批约 78 分 52 秒（目录创建至最终封存）；45 个计划 run 的持久 usage 耗时合计 4655.334 秒，中位数 93.567 秒、最短 24.643 秒、最长 232 秒，单 run 最大 modelCalls=10。总 campaign 从首阶段目录时间至末批封存约 116 分 15 秒，包含阶段间复核与切换，不是纯模型运行时间。

共享台账最终：

- 已知费用：$0.729161672。
- 未知费用保守预留：$0.007334349（1 次请求）。
- 合计计入预算：**$0.736496021 / $2**；held reservation=0、超限=false、runner lease=0。

不能把未知费用当 0，也没有为得到“全部已知”而清理/reconcile 台账。

## 恢复过的错误与限制

45/45 表示计划样本达到验收门槛，不表示所有中间调用均无错误。逐事件复查补充了进度监控中未全部显示的异常：

- 7 次 `model-stream-incomplete:length`：A/E2 三轮各两次，B/E2 第三轮一次。均在原预算内恢复，最终通过。
- 4 次工具错误：A/E1 前两轮各一次 `investigation_check` 无效证据引用；A/E2 第一、三轮各一次 `rule_check` 错误。无效证据被拒绝，后续有效证据才计入通过。
- 网关另记录 A/E3 第一次一个 `downstream-disconnected`（约 60 秒，HTTP 200 但无完整 usage），保留未知费用预留。该计划 run 随后正常结束。

这些是后续可靠性改进的具体线索，本轮没有通过改参数或重跑来隐藏它们。当前结论只覆盖本次 fixture、固定模型/provider、规定视口与输入范围，不证明任意网站召回率，也不代表模型延迟已最优。

## 证据封存与复验

本机原始验收工作树为 `/Users/xietian/Documents/ChatGPT/ui-sentinel-p3-review`，上述 `data/` 路径相对该目录。完整模型响应、图像、DB、逐点测量、逐行评分和 ledger 位于这些目录，不入 Git；不含明文 API key。Git 保存代码、夹具、规则批准输入和本交接。换机器可按 [P4 清单](visual-focus-p4-plan.md)重新执行，但历史运行原件需要保留上述数据目录，不能从 Git 还原。

| 阶段 | evidence-seal.json SHA-256 |
| --- | --- |
| 视觉诊断 | `45a41c8fc5b934b0899c75317e236028baa0740aeb8f0c81d99884eb8b1fd540` |
| 视觉正式 | `64e0aa14b94cd5e8254fc62f2b102686f22882c9d857174f575ea2c5e4006652` |
| 业务诊断 | `0260aba52dd394a1e171ae5e33e616798e4a21b7a03f1eabe8c7d351c906110c` |
| 业务正式 | `ed332551ed2b3e1dcb9b93334af5f5f6dbfa6216d4b6f410a89de80b7e0b8eee` |

`data/reviews/p4-final/acceptance-review.json` 是主 Agent 完成四阶段封存/门槛复核后的明确 accepted 记录；`recovered-errors.json` 保存恢复过的事件索引。底层 campaign-summary 的 `passed:false` 是运行器“单阶段不推断整个 P4”的固定语义；没有为了让它显示绿灯修改原台账或已封存结果，以本交接及明确的 acceptance review 判定 P4。

复验须保留同一 campaign 的累计费用和诊断来源。后续如果根据本轮结果修改提示/算法，新的泛化主张需要新的保留样本，不把已见过的 D1/D2/H2 再称作未参与调试。
