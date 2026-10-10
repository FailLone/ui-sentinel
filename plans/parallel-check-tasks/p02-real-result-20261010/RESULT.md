# P02 单行真实验证：已执行，完整子目标未通过

2026-10-10 **13:11:13–13:12:48（Asia/Shanghai）**，按本次明确授权完成唯一一次 P02 实际执行与收尾。进程退出 **3**：没有安全停止或传输错误，但两个视口的弹窗子目标未完成。没有重试、补样、改代码续跑、P01/P03 或其他批次。

**新增 9 次主请求 + 5 次 Jev = 14 次真实请求，全部 HTTP 200、全部 settled，实际费用 USD 0.020295582。** unknown=0、held=0、活动 lease=0、停止事件=0。两个子浏览器均关闭；父子原持久化 verified。这些收尾检查不等于目标成功。

## 真实父委派与两条路径

父 `run-f45ee327-bdff-435d-b9b2-7e36773c7adf` 实际调用委派工具，建立两个独立匿名子浏览器。原子资源区间重叠 **4053ms**，只证明本次并行，不作速度优越性结论。每子原配额仍为 actions=3、modelCalls=3、reads=2。

| 视口 / 原子 run | 第一 ENTRY | 第二 ENTRY 原始选择 / 程序采纳 | TARGET 原始选择 / 程序采纳 | 实际动作 / 测量 / 结论 |
| --- | --- | --- | --- | --- |
| 320×480，`check-6095bff6-2242-40d0-b056-3f57a6ac3e30` | More options，0.65；原点击完成 | Details，0.64 → handoff | 未调用 | 1 点击；0 测量；unknown / popup-entry-abstained |
| 640×480，`check-1e2f962b-1aad-4a78-9ec2-e204a035115a` | More options，0.75；原点击完成 | Details，0.66 → Details；第二次原点击完成 | panel-1（div Details overview），0.13 → handoff | 2 点击；0 测量；unknown / popup-target-ambiguous |

这两次第二 ENTRY 的原模型选择都是 **Details**，并非模型直接选择 handoff。320 的第二 ENTRY 和 640 的 TARGET 都由保持不变的 **0.65** 门槛转为 handoff；没有为了通过测试降低门槛。

640 的原 TARGET 分布为 panel-1=0.42、read=0.21、handoff=0.37，返回的独立 confidence=0.13。程序按 confidence 处理，不把最大概率 0.42 当成 0.65 以上的授权。该响应只是一条真实选择记录，不能据此确定低置信度的内部原因。

[逐笔 Jev 原始/采纳记录](jev-decisions.json)包含五个 request ID、generation ID、原 packet、候选、confidence、程序采纳及原请求/响应附件 ID。`evidence/artifact-index.json` 可定位原 wire/response/transport 与 SHA-256。

## 第二 ENTRY 确实收到的新事实

两子第一次动作后，新的问题阶段均为 **ENTRY**，且原 wire 内都包含：

- 唯一新候选 Details，`visible=true / enabled=true / newlyObserved=true`。
- 上一个 More options 的原 item/action ID、description、result=completed。
- 页面文本含新 Details；visiblePanels=0、新入口 ID、changedSinceAction=true。
- 剩余 actions=2、calls=2、reads=2、时间约 120 秒；本次第二入口问题不是因当时缺少动作/调用/读取预算而直接退出。
- read.allowed=false、reason=`popup-reuse-new-entry-facts`；用已有事实继续，没有仪式性补读。两子实际 reads 均为 **0**，本次没有验证低置信度 read 的真实执行效果。

原 wire 的 delegated context 本次是检查相应视口、匿名会话、仅本地 UI 动作，没有旧 P02 的 “via one local UI action” 限制措辞。父模型输出自然发生变化，不能将两次试验的区别全部归因于单一代码变更。

640 第二动作 `e12340f4-7027-4c49-b227-fbb34ac1980e` 绑定 Details 条目 `item-5bced27b-5ad1-4fa5-8fa7-587d00c5107a`；随后 TARGET packet 记录了这个 completed 原动作，visiblePanels=1、公共文本 Details overview、候选 panel-1。调用前剩余 actions=1/calls=1/reads=2。程序没有擅自采用低置信度目标。

**本次几何测量收据总数为 0。** 640 观察到 panel 并不等于已进行两次几何采样，不能宣称宽视口 pass；320 也不能凭私有场景预期补报 fail。免费替代响应中得到的 fail/pass 不移植到本次真实结果。

## 父任务未完成范围

父及两个原子 run 都保留 **blocked / partial**；父汇总中的两个子检查均为 unverified，没有父 covered。

父 scope 共 44 项：verified=14、unverified=30、pending=0、failed=0。未完成原因包括 goal-unresolved=1、v2-mandatory-checks-incomplete=3、control-text-supported-scope-limit=7、control-layout-supported-scope-limit=14、requirement-not-declared=2、model-budget-reserve=1、delegated-check-unverified=2。

原父另外执行了 Sort alphabetically、Change density 两次默认采样点击；子任务合计 3 点击，父子合计 5 动作、14 模型调用，均在冻结的 6 动作/16 调用内。不能把“子 popup 未点无关控件”扩大成父任务没有默认采样动作。完整父报告、任务目的、配额及所有缺口在 [原父报告](evidence/P02-parent.json) 和 [摘要](summary.json) 中原样保存。

## 费用与资源证据

新原账户 **`b693a8ba-503f-47d8-b9a8-fc0a5d27fab4`**，一次性共享 USD 0.62 上限；没有复制额度或使用旧账户。费用归属证明 matched=true，原 dispatch 表 14 行、原账本 14 笔 settled。

| 渠道 | 请求数 | 实际 USD |
| --- | --- | --- |
| 主模型 / Wafer | 9 | 0.020025900 |
| Jev / TypeSafe | 5 | 0.000269682 |
| 合计 | 14 | **0.020295582** |

[逐笔费用与 generation ID](request-summary.json)、[原账本只读导出](evidence/original-ledger-readonly.json)、[原费用归属证明](evidence/P02-fee-proof.json)可相互核对。unknownReservedUsd=0、heldReservedUsd=0、unknownCount=0、exceeded=false、campaign_lease 空、ledger_stop_events 空。

320 子资源于 13:11:44.861 关闭，640 子于 13:11:47.146 关闭。三个原报告 persistence 均 verified。[离线核对](evidence/offline-integrity.json)在数据库副本运行原 completion、子附件和 popup 附件验证，三个 run 的所有问题列表均为空。首次离线脚本只给顶层读取器传入副本，嵌套读取器误用了未配置数据库，报 no such table；该审计配置错误已修正并保留 [首次输出](evidence/offline-integrity-initial.json)，没有修改运行原件或发出任何模型重试。

历史账户和结论不改：原失败批次已知 USD 0.0028128、unknown 保守计提 USD 0.066；单请求诊断 USD 0.000040614；上一三场景批次 USD 0.075323624。本批单独计 USD 0.020295582，旧 unknown 未被释放或改账。

## 授权、冻结与封存

用户在维护者会话 `01a1116d-7621-7962-b4fe-5f904b5fbf13` 明确回复“是的，授权”，由维护者转达；[原批准](evidence/approval.json)于 2026-10-10 13:07:26.796 记录，24 小时有效，仅绑定此 manifest 的 [一次 claim](evidence/single-use-claim.json)。最初缺少凭据注入时未消费 claim；维护者随后明确允许只提取先前已用来源的特定密钥字段并在内存中注入。没有 source 旧 .env 或继承其模型、预算、开关配置；密钥未写入命令、日志或归档，归档已做精确值扫描。

- 实现/source：`de5fc94334665353ab9477969ad477b691570db4`；运行前交付：`3e5e7b304feb17d6234417fc9783511eed01e014`。
- Manifest SHA-256：`21fb549f06b389d55912313645d2e8c50a724fcebca9caa488677bd9e8e166b2`。
- Bundle SHA-256：`95795ee7a3ec18512a0b106b9ca17cdc346f00a27baee888ef3879d7c9814025`。
- 启动前源码、bundle、Node、依赖和公开报价核对通过，启动再次经过原冻结门；原界限、权限、时限和 10 主/6 Jev 上限未变。没有重建、再跑免费矩阵或修改产品代码。

原输出 `data/parallel-popup-real/approved-p02-continuation-01/` 保留；此归档保存 185 份原附件、三份原报告、模型请求/响应、测量缺失事实、运行数据库与新费用数据库、授权/claim、冻结包、报价和进程退出记录。旧冻结包、旧结果、旧账本未改。单次 claim 已消费，批次已结束，剩余预算不是新许可。

本次确认的进展是：**新入口事实真实进入第二 ENTRY，两个模型响应均选 Details，其中宽视口完成第二次原点击并到达真实 TARGET。完整嵌套弹窗检查仍未完成，不能宣称修复已使 P02 通过。** 本地分支交付，不合并、不推送，不自动补样或发起下一批。
