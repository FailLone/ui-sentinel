# 弹窗语义职责拆分与候选几何：实现及免费验证完成

实现提交：`182e65eca2c316755b736303264f7dcbeca163cf`，基于官方审计 `179f81bfdef7f645f7b1aaf34ffb2455958ab9cb`。仅修改隔离工作树 `codex/parallel-check-tasks`；未合并、推送、执行付费请求或读取模型凭据。功能仍由默认 false 的 `EXECUTION_POPUP_JEV` 控制。

## 改前与改后

| 情形 | 旧路径 | 本次实现 |
| --- | --- | --- |
| 新出现的嵌套入口 | 第二 ENTRY 已能看到新控件，但与目标归因共用 0.65 门槛 | ENTRY 只判断有界探索价值，不要求承诺开出弹窗；唯一胜出且概率超过其余选项之和才可进入原动作权限检查 |
| 多种 TARGET 选项 | 将实际浮层、read、handoff 放在一个问题中 | TARGET 只列程序观察到的新浮层及 `none`（无匹配或证据不足）；不让模型决定读取或交接 |
| 模型不采纳某个浮层 | 可能没有任何几何收据 | 在目标语义问题前，按原预算最多采样 2 个受支持候选；保存独立观察收据，即使归因不足也能报告候选几何 |
| 目标关联不足 | unknown | 继续 unknown。候选收据 action/item 为 null、association=unconfirmed，不完成原事项、不提交已归因 finding、不计入已确认缺陷 |
| 无新面板、无新入口 | 依赖 RECOVERY/read 建议 | 程序按已完成动作、新公共事实、未决缺口、每动作一次、重复记录及原 reads/calls/time 配额准入；读后无变化即停止 |
| 唯一实际 native/dialog | 原确定性测量 | 保留原路径，并在测量、封存及完成前复查观察绑定、取消和时间 |

当前问题版本为 `popup-semantic-2`，采纳政策为 `popup-purpose-policy-2`。真实 wire 只传目标、候选、既有动作与公开观察关系，省去读取许可、剩余额度和附件 ID 等无关决策信息。完整内部问题仍保留预算快照供审计。原始 choice、完整 probabilities、n、confidence 与采纳原因、政策版本一起保存；原始回答与程序采纳结果分开。旧 `popup-viewport-1` 兼容路径与历史报告不改写。

## 政策依据与适用边界

以下协议事实来自已完成的[官方资料审计](../jev-official-audit-20261010/REPORT.md)，访问日期 2026-10-10。数值政策由本项目承担，不宣称官方已证明其准确率。

| 用途 | 本次政策 | 官方依据 | 本地判断及风险 |
| --- | --- | --- | --- |
| 协议与未知表达 | 继续官方 Choice：instructions + criteria；实际候选及 none；校验最高概率选择、分布、provider/model 身份 | [Choice](https://docs.typesafe.ai/primitives/choice)、[OpenRouter Decisions](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request) | 不新增猜测的 Noul 请求结构；`none` 是语义无匹配，不是读取权限 |
| 问题职责 | ENTRY 问探索价值，TARGET 问已完成动作与新浮层的关联 | [Jev 1.13 问题设计](https://docs.typesafe.ai/model-jaggedness/jev-1.13) | 去掉同题中不同性质的控制流选项；这只是设计修复，尚无真实模型效果证据 |
| confidence 的含义 | 保留原统计量及 n，不标成准确率 | [Choice confidence](https://docs.typesafe.ai/confidence#choice)：`(p_max - 1/n)/(1 - 1/n)` | confidence 不是 top1−top2，也不是跨问题可直接比较的真实正确概率；选项集合改变后不能把旧响应重算成一次新成功 |
| ENTRY 采纳 | 唯一胜出，且 `p_selected > sum(p_others)`；不再使用通用 confidence 0.65 | 官方支持概率分布；[阈值应以标注样本确定](https://openrouter.ai/blog/tutorials/how-to-use-jev/#set-confidence-thresholds-from-a-labeled-sample) | **未校准的暂定工程政策**：要求有界探索选择获得分布多数支持。不是将旧 0.65 改成 0.60，也不是对旧 P02 成败拟合阈值；动作仍受原安全、权限、时限和最多 3 次配额约束 |
| TARGET 采纳 | 唯一胜出、概率过半，并保留 confidence ≥ 0.65 | 同上，官方没有为本场景背书 0.65 | **未校准的暂定工程政策**，保留原保守数值门槛以限制归因。模型回答只是语义候选，结论还需原动作/item、新面板事实、无介入的封存证据与程序几何；不能单凭模型宣布通过或缺陷 |
| 候选几何 | 每个子任务最多 2 个受支持候选；受 maxCandidates=8、原 reads 与时间预算约束，每个采样消费 1 read | 几何不是模型任务 | cap=2 也是有界工程选择，不是准确率数字；同节点两次稳定采样、截图、绑定复查及 owned refs 字节封存。关联不足时只报告观察，状态保持 unknown |

目标政策仍可能误关联。现阶段属于默认关闭、显式启用的有限能力；下一步真实试验也只能观察行为，不能用一行 P02 校准阈值或推导泛化准确率。若要降低归因风险或扩展网站支持，需要独立标注集和风险评估，不能以此次免费替代响应证明。

## 免费验证及证据

- [聚焦测试日志](focused-tests.log)：5 文件 **44 项通过**，涵盖窄问题官方 wire、原始分布保留、入口多数探索、低/并列目标关联、none、多候选上限、已有面板不得归因、隐藏/禁用与原权限拒绝、预算与取消、节点替换、不支持绘制、候选不完成事项、损坏证据及旧报告兼容。现有 provider 测试继续覆盖共享账本、未知费用、取消、并发关闭和无重试。类型检查与生产构建通过，见 `typecheck.log` / `build.log`。
- 仅两个小型 Chromium 测试：原 native/dialog、滚动/裁切/变换/替换场景；新增双自定义浮层真实 DOM 场景，程序先测得一份 fail 和一份 pass，随后官方 Choice 格式的 none 回答使原目标维持 unknown，settle=0。首轮新增模拟回答漏了协议要求的 id，被 normalizer 正确拒绝；修正测试数据后通过，未放松生产校验。
- 仅一次 **P02、1 父 + 2 子**完整免费流程，使用真实 Chromium 和原产品执行器/账户/协议路径，模型响应全部为固定替代。没有 R0/R1、P01/P03 或更大浏览器矩阵，没有真实探针。[免费摘要](free-summary.json)、[完整原报告](free-evidence/P02-parent.json)。

| 免费 P02 | 原动作 | 决策 | 候选读取 | 几何及归因结果 |
| --- | --- | --- | --- | --- |
| 320×480：`check-d9cf12b5-a004-40b8-beee-a51b3bc32d30` | More options → Details，两次原点击 | ENTRY → ENTRY → TARGET | 1/2 | 先候选 fail；关联被替代回答采纳后，原第二次 action/item 的归因收据 fail |
| 640×480：`check-69926501-a170-477d-9f1a-90726865d845` | 同上 | 同上 | 1/2 | 先候选 pass；关联被替代回答采纳后，原第二次 action/item 的归因收据 pass |

两份候选事件均早于 TARGET，归因测量复用同一有效绑定下的原几何样本，避免重复消耗额外读取。父 `run-204bd9e1-b302-4ce5-aeca-b0c6ef6b2126` 仍 blocked/partial；原默认事项继续保留未完成状态。两个子原运行也是 blocked/partial，不能以弹窗子目标的几何结果代替整任务 covered。

7 主 + 6 Jev = 13 次**模拟**请求；真实调用 0、真实费用 0。合成账本值 USD 0.000076 仅用于账本测试；所有请求 settled，unknown/held/活动 lease/stop events 均为 0，两个子浏览器关闭，费用归属核对一致。170 份原附件、报告、wire/response/transport、截图、DOM、候选与归因收据、两个数据库已归档；[附件索引](free-artifact-index.json)记录原所有权、路径和 SHA-256。[离线复验](offline-archive-checks.json)重新读取数据库原契约及所有附件，校验候选和归因收据，3 份报告对应结果完全一致、issues=[]。离线脚本初版误取展示层契约（缺 popupCheck）；改为读取归档数据库原 spec 后完成验证，未更改证据或产品。

## 历史与剩余限制

旧付费 P02 仍是失败：320 的第二 ENTRY confidence 0.64 被旧门槛拒绝；640 的混合 TARGET 选择 confidence 0.13 被拒绝，两子 unknown、无几何。这里未把旧回答当作新问题的回答，也未将新模拟结果回写历史。三个旧冻结包 SHA-256、原 P02 HTML/publicGoal/publicInput/私有评分及所有请求/费用政策均保持一致，见[冻结核对](freeze-integrity.json)。

支持范围仍是稳定、同身份、可复用公开观察的有限固定浮层外框与矩形 paint containment；变换、动画、复杂绘制、跨 frame、shadow DOM 等保持原 unknown 限制。最多预采样两个候选，可能遗漏后来才被选中的目标；关联成立后仍走原目标测量路径。候选记录只代表采样时的观察；JSON 中保留其原始 unconfirmed 身份，即使后续另有有效归因收据。界面仅在归因结论 unknown 时展示候选提示。高置信度误选、预算不足或目标出现太晚仍可能 unknown/partial；没有放宽权限、默认检查、总动作/调用/读取配额或结算与停止链。

## 新的付费提案（未执行）

[可审阅执行方案](real-preparation/PLAN.md)冻结到全新 manifest/bundle：只允许 P02、1 父及原 320/640 两子，最多 10 主 + 6 Jev、共享原账户上限 USD 0.62、重试 0。审批模板仍为空，无新真实 claim。此轮只授权实现、免费验证与提案；旧授权已经消费，后续付费执行须对这份新 hash 另行明确授权。本轮没有运行它。
