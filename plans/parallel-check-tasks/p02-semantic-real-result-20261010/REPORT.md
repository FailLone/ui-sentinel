# 语义职责拆分后 P02 真实复验：两子目标仍为 unknown，本批已封存

2026-10-10 **17:09:14–17:11:52（北京时间）**，按维护者会话用户明确“授权”执行一次新批次。退出码 **3**：没有安全停止，但未满足原 P02 目标评分。未重试、补样、探针或启动下一批。真实结果不能由此前免费替代测试覆盖。

授权与实现绑定：源码 `182e65eca2c316755b736303264f7dcbeca163cf`；执行前交付 `34a37053b1c0ac7096dca3fa7b9e31a91b06a22b`；manifest `bce6785d7cfb8b9fb877d4003d159110d3e3c603a33fd50a7605cfbc0dae08d6`；bundle `ee946d5b158584f193dfe401ffb7860ed78b75795be3f41afdf3c7c1913d741c`。725 份源码、Node v24.21.0、依赖、公共输入/评分及最新报价通过原冻结检查，没有改源码或重建。新批准于 17:08:58 记录、有效期 24 小时，本次已消费对应唯一 claim；有效期内也不能再使用。见 [批准](approval.json)、[claim](approval-claim.json)、[核对记录](preflight.json)、[启动报价](evidence/quotes-at-launch.json)。

## 两层 ENTRY、原分布与政策采纳

下表为真实 TypeSafe Jev 回答；confidence 原样保留，不解释为正确率。采纳政策均为 `popup-purpose-policy-2`，问题版本 `popup-semantic-2`。ENTRY 依据唯一胜出及概率过半进入原动作检查；TARGET 另要求 confidence ≥ 0.65。

| 视口 | 阶段 | 原 choice | 完整 probabilities（按可读标签） | n | confidence | 程序采纳 |
| --- | --- | --- | --- | --- | --- | --- |
| 320 | ENTRY 1 | "More options" | "Sort alphabetically"=0；"Change density"=0.02；"More options"=0.81；none=0.17 | 4 | 0.75 | 采纳探索；实际原点击 completed |
| 320 | ENTRY 2 | "Details" | "Details"=0.89；none=0.11 | 2 | 0.78 | 采纳探索；实际原点击 completed |
| 320 | TARGET | div  Details overview | div  Details overview=0.61；none=0.39 | 2 | 0.22 | 拒绝关联；handoff / association-below-provisional-floor |
| 640 | ENTRY 1 | "More options" | "Sort alphabetically"=0；"Change density"=0.01；"More options"=0.84；none=0.15 | 4 | 0.79 | 采纳探索；实际原点击 completed |
| 640 | ENTRY 2 | "Details" | "Details"=0.9；none=0.1 | 2 | 0.8 | 采纳探索；实际原点击 completed |
| 640 | TARGET | div  Details overview | div  Details overview=0.63；none=0.37 | 2 | 0.26 | 拒绝关联；handoff / association-below-provisional-floor |

两个视口都实际完成 More options → Details。第二层 ENTRY 不再停在入口阶段。本次两份第二 ENTRY confidence 都高于 0.65，因此这一个样本不能证明改用多数政策是继续执行的原因，也不能单独区分问题措辞与模型响应波动的影响。

**TARGET 不是模型选择 none，而是程序拒绝采纳低置信度关联。** 两题只有 panel-1 与 none；原选择 panel-1 的概率分别为 0.61、0.63，confidence 为 0.22、0.26。没有 read/handoff 混合选项，也没有在运行中降低门槛。新选项集合与旧实验不同，不能把两次 confidence 差值当成准确率改善。原问题、回复与采纳信息见 [summary.json](summary.json) 及各子报告 `decisionInputs`、`popup:decision`、`popup-jev-request/response/suggestion` 原件。

## TARGET 之前的候选几何与原动作收据

| 视口 | 候选事实 | 顺序与预算 | 归因结果 |
| --- | --- | --- | --- |
| 320×480 | panel-1，外框 x=20、y=120、width=400、height=150；右边界 420，超出视口右边界 100 CSS px；候选 geometryVerdict=fail | 候选事件 seq=249，早于 TARGET seq=251；reads=1/2 | association=unconfirmed，actionId/itemId=null；弹窗子目标 unknown |
| 640×480 | 相同尺寸外框落在视口内；候选 geometryVerdict=pass | 候选事件 seq=249，早于 TARGET seq=251；reads=1/2 | 同样未确认关联；弹窗子目标 unknown |

每份候选均含原节点身份、两次稳定受支持样本、截图、观察绑定及 owned evidence SHA-256。两次真实 TARGET 拒绝后，**popup:measurement / popup-measurement 归因收据均为 0**；没有原事项的 popup 完成，也没有 `popup-viewport` finding。候选“fail/pass”只描述采样的几何，不能写成已确认的目标弹窗缺陷或通过。

原点击仍有独立 action/item 回执：

| 视口 | 控件 | 原 itemId | 原 actionId | 状态 |
| --- | --- | --- | --- | --- |
| 320 | More options | `item-390b4f0e-ee86-4ba4-9094-4e4b7699b528` | `d83d2041-a9dd-4da9-a144-ec282b3c91ce` | completed |
| 320 | Details | `item-a30596d1-5e92-419c-85fc-1d324830faaf` | `33698ace-f0a0-482f-85e6-2e8c554b2737` | completed |
| 640 | More options | `item-cc289110-aa7a-48ac-9898-211d75e817a4` | `7473dd29-e7dd-4df9-8704-4ced4c77cbac` | completed |
| 640 | Details | `item-a10a56eb-4a7c-47f1-b0b9-c67c487bc063` | `9c4722ad-8e9b-4ff0-bd59-29aa7aa5888c` | completed |

这些原点击回执只证明实际操作，不能替代缺失的目标归因收据。每个子报告另有 1 项原自动规则 `overlay-blocking` finding；它们来自独立遮挡检查，**不是候选几何转换出的 popup-viewport 缺陷**。父报告 findings=0，父检查计数也未被候选几何升格。

## 父任务与默认缺口

父 `run-7341abdd-bef8-49e7-b62f-64072ccbae1a` 保留 **blocked / partial**：scope 共 38 项，verified=12、failed=0、unverified=26；默认三项 local-interaction 仍有 `v2-mandatory-checks-incomplete`。原目标 `goal-unresolved`、两个 `delegated-check-unverified` 及 `model-budget-reserve` 缺口保留。父累计 actions=5（含两个子各 2 次）、modelCalls=14；没有用子任务或候选几何结论清除默认义务。

320 子 `check-fe22e236-4124-4760-8c86-002173a8243a`、640 子 `check-743133c9-7246-4001-a8cc-5ab5c61b5994` 均 blocked/partial，popup 状态 handoff、原因 `popup-target-ambiguous`、缺口 `which-actual-new-panel-is-the-action-result`；每子 actions=2、Jev=3、reads=1，均在原配额内。

## 逐笔费用、停止与关闭

真实 **8 主 + 6 Jev = 14 请求**，全部 HTTP 200、settled；主 USD 0.02634665，Jev USD 0.000249144，合计 **USD 0.026595794**，低于授权 USD 0.62。账本浮点表示为 0.026595794000000002；表中按返回十进制金额精确相加。新账户 `28bfd62d-329e-49d2-879a-9dbcee6332a0`；unknownCount=0、unknownReserved=0、heldReserved=0、活动 lease=0、stop events=0，无未知/迟到未结费用。逐笔原账本与传输身份见 [fee-audit.json](fee-audit.json)、[费用归属证明](evidence/P02-fee-proof.json)。

| # | 请求 ID | 归属 | 供应商 | USD | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `be879634b46a8bd34d0620ed` | 父 | Wafer | 0.00175965 | settled / HTTP 200 |
| 2 | `034c3c3148739049c915e1ec` | 父 | Wafer | 0.001028 | settled / HTTP 200 |
| 3 | `822d174e-b537-4e57-a38c-ad9590b0ac16` | 320 子 | TypeSafe | 0.00004263 | settled / HTTP 200 |
| 4 | `a526e4fc-5db9-4779-9080-c8dd4be57344` | 640 子 | TypeSafe | 0.000042714 | settled / HTTP 200 |
| 5 | `c8cf1de1-e557-49fa-9fbe-5930787227f7` | 320 子 | TypeSafe | 0.000041748 | settled / HTTP 200 |
| 6 | `87f5944e-efa5-4d42-b6e6-fef1fae3d177` | 640 子 | TypeSafe | 0.00004116 | settled / HTTP 200 |
| 7 | `a6cf2cdc683e734b7717e709` | 父 | Wafer | 0.00097515 | settled / HTTP 200 |
| 8 | `4f48d551-c174-4287-8baf-777f856d6223` | 320 子 | TypeSafe | 0.000040572 | settled / HTTP 200 |
| 9 | `35e20c96-e008-43ce-993b-bfde4f8a8928` | 640 子 | TypeSafe | 0.00004032 | settled / HTTP 200 |
| 10 | `a6f71670d26c5004b6a2578e` | 父 | Wafer | 0.0042219 | settled / HTTP 200 |
| 11 | `a38c3c1cd8570bc87936dbe1` | 父 | Wafer | 0.00280285 | settled / HTTP 200 |
| 12 | `dfeb6dd4fdaff0c7e2d322d0` | 父 | Wafer | 0.0064412 | settled / HTTP 200 |
| 13 | `0afa5ecbcd0af75ca530b63a` | 父 | Wafer | 0.0026148 | settled / HTTP 200 |
| 14 | `75793926cacafb47d6c5d29b` | 父 | Wafer | 0.0065031 | settled / HTTP 200 |

最长主请求约 54.377 秒，未超过 60 秒；整批约 158.36 秒，未超过 180 秒。两个子资源分别于 17:09:28.381、17:09:28.394 记录 `run:delegated-resource-closed / closed=true`。父按原预算预留规则完成收尾；进程已退出，共享租约已释放。没有安全停止不等于目标通过；本批退出 3 如实表达目标未通过。

## 封存与持久核对

205 份原附件及 205 份文件、三个原报告、全部请求/响应/传输、截图、DOM、候选收据、费用账本及两个数据库已保存到 `evidence/`。[artifact-index.json](artifact-index.json)保留所有权、路径、metadata 和 SHA-256；[offline-integrity.json](offline-integrity.json)使用数据库临时副本、同一份数据库配置的嵌套读取器，复核 completion、child original receipts 和 popup artifacts，三份记录 issues=[]，离线 popup 报告与在线封存报告完全一致。三份在线 persistence 均 verified。原件与归档附件字节均逐一比对。

执行前记录的 1,442 份旧归档文件 SHA-256 在执行后全部保持一致，源文件和冻结包未改；旧批准、旧失败、旧 unknown 不被此结果覆盖。本轮只新增结果归档与复验脚本，本地分支交付，不合并或推送 main。新的唯一批准已经消费，剩余额度不用于追加批次。

这次真实样本证明了两层入口探索和独立候选几何路径可执行，也证明当前 TARGET 政策仍拒绝归因。它没有证明目标关联能力达标，不能宣称 P02 已修复完成或阈值已校准。
