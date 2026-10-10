# 修复后三场景真实验证：全部执行，完整目标未全通过

2026-10-10 12:36:36–12:41:15（Asia/Shanghai）。P01/P02/P03 均按新授权连续执行并收尾，**没有硬停止、未运行行、重试或追加批次**。冻结评分：P01 通过、P02 未通过、P03 的诚实 unknown 符合该行预期。进程退出 **3**，表示完整目标未全部通过，不是传输异常。

本批 30 次主模型 + 10 次 Jev = **40 次真实请求**，全部 HTTP 200、全部已结算，实际费用 **USD 0.075323624**。unknown=0、held=0、活动 lease=0。6 个子浏览器均关闭，9 个父子运行的原持久化与证据核对通过；这些资源/记录检查不代表目标全部成功。

## 真实父委派、选择、动作与测量

三个父 Agent 均实际调用委派工具，分别创建 320×480 和 640×480 的两个原执行器子任务，独立浏览器上下文确实重叠执行。每行父报告都有两个独立原 run ID 和结果。重叠区间 P01=3471ms、P02=4120ms、P03=4099ms，仅证明本次并行执行，不作相对串行的速度结论。

| 场景 | Jev 原始选择与原执行结果 | 两子结论 | 冻结判定 |
| --- | --- | --- | --- |
| P01：直接入口 | 两子 ENTRY 均选 Details（0.99）；各实际点击一次。观察到唯一新弹窗，由原执行器确定目标并作两次几何采样 | 320px：fail，右边界被裁切；640px：pass，弹窗容纳于视口 | 通过该弹窗子目标 |
| P02：嵌套入口 | 两子 ENTRY 选 More options（320:0.92；640:0.87）并各点击一次，出现 Details 候选；RECOVERY 原始均选 read（0.60/0.54），低于原 0.65 门槛，被规范化为 handoff | 两子 unknown；未点新 Details，未实际补读，未取得弹窗测量 | 未通过，不能把放弃算作嵌套检查成功 |
| P03：没有弹窗 | 两子 ENTRY 选 Details（0.79/0.82）并各点击一次；没有新弹窗。RECOVERY 原始均选 read（0.52/0.63），低于门槛转 handoff | 两子诚实 unknown；未捏造弹窗或几何通过 | 符合本行允许“动作后诚实未知”的预期，不是弹窗 pass |

Jev 在本次 6 个 ENTRY 均围绕可疑弹窗入口选择，子任务没有点击 Sort alphabetically/Change density。补证阶段的原始意图是 read，但程序没有采纳低置信度选择：4 次均转 handoff、实际补读总计 0。**TARGET 阶段 Jev 请求总计 0**；P01 唯一新 panel 由原执行器直接定位，不能声称已验证真实 Jev 的多目标语义选择。入口 6 次、补证 4 次，总计 10 次。

P01 两份原测量收据保留 rect={x:20,y:120,width:400,height:150}、两次一致几何采样和截图。窄视口右界 320，小于弹窗右界 420，原结果 `fixed-panel-border-clipped`；宽视口右界 640，原结果 `panel-fits-visible-viewport`。P02/P03 无弹窗测量收据，不补造测量。

各子恰好 1 次实际点击，共 6 次；每父另有 3 次默认检查采样点击，共 9 次。父子合计每行 5 动作、全批 15 动作，均在原界限内。父默认采样包含 Sort alphabetically、Change density 及第三入口按钮；“未点无关按钮”的结论只适用于 Jev 子检查，不扩展为父任务全部行为。

[逐笔 Jev 原始/采纳选择](jev-decisions.json)映射请求身份、generation ID、置信度、missing、公开候选和原请求/响应附件。原始 read 与最终 handoff 已明确区分，没有将程序门槛行为当成模型直接选择 handoff。

## 父未完成范围

三个父运行均为 **blocked / coverage partial / persistence verified**，没有父 covered。原子 run 也均保留 blocked：其 popup 子目标可测得 pass/fail，仍不替代原默认必查义务。父投影中 P01 的两个子任务分别 defect/completed，P02/P03 均 unverified；原层与汇总层均原样保存。

| 父任务 | 报告中的主要未完成原因 | 原 scope 计数 |
| --- | --- | --- |
| P01 | goal-unresolved、3 个 v2-mandatory-checks-incomplete、source-review-unresolved | total 52；verified 16、unverified 26、excluded 10 |
| P02 | goal-unresolved、3 个默认必查未完成、popup-not-observable、2 个 delegated-check-unverified | total 59；verified 18、unverified 40、pending 1 |
| P03 | goal-unresolved、3 个默认必查未完成、model-budget-reserve、2 个 delegated-check-unverified | total 50；verified 16、unverified 34 |

原报告另保留文字/布局检查支持范围限制、未声明的响应时间要求等条目，不以弹窗子结果消除这些缺口。三行每行主请求恰好 10 次；父按有界预算保留 partial 结果，没有在本批继续补齐。父子总模型请求分别 12/14/14，elapsed 分别约 96.9/117.8/61.3 秒。

## 独立费用与请求证据

新原账户 `847332ad-be0a-4988-8195-870ddb3ec41a`，统一共享 USD 1.86 上限，无复制额度。三行费用归属证明均 matched=true，原 dispatch 表恰好 40 行，账本恰好 40 笔 settled，未发生未知、超额或安全停止。

| 行 | 主请求 / Jev | 主费用 USD | Jev 费用 USD | 合计 USD |
| --- | --- | --- | --- | --- |
| P01 | 10 / 2 | 0.024678700 | 0.000083664 | 0.024762364 |
| P02 | 10 / 4 | 0.029779350 | 0.000190302 | 0.029969652 |
| P03 | 10 / 4 | 0.020411050 | 0.000180558 | 0.020591608 |
| 本批合计 | 30 / 10 | 0.074869100 | 0.000454524 | **0.075323624** |

历史分账保持不变，不读取或修改旧费用账户：

| 执行 | 已知费用 USD | unknown 保守计提 USD |
| --- | --- | --- |
| 原失败三场景批次 | 0.002812800 | 0.066，实际总费用仍未知 |
| 单次成功诊断 | 0.000040614 | 0 |
| 本次新三场景批次 | 0.075323624 | 0 |

没有把未花完的 USD 1.86 当成后续许可。新 claim 已消费、输出目录已存在，批次已结束，无自动下一批。

## 冻结、授权及原件

本次基础源码 `7dc39a7d15872892b66871cf2b67391d0c09733f`，包含已交付修复 `87a2816deb8885e42c3785731846a0a6f9791372`。新 manifest SHA-256 `bf261f6cbe41d28c65ad9f3c8dc4272ec3db698d2d641985b04c2cb77a365fda`；新 bundle SHA-256 `0d9a8c710e0843a2df07c9f1576dec2f42dcf3051974834093d1b61e674e2b72`。

[准备及授权范围](../real-preparation-02/PLAN.md)、[新旧清单差异](../real-preparation-02/manifest-diff.json)证明政策/公开场景/私有评分、价格上界与依赖不变，源码差异恰好是已交付的 16 份修复文件。授权来源为维护者会话用户 2026-10-10 明确“好的，开始”，由维护者转达并明确本批新增 USD 1.86；[新授权](evidence/approval.json)24 小时有效，只绑定本次[单次 claim](evidence/single-use-claim.json)。启动前公开报价及原产品门均通过。没有凭据进入输出。

原输出目录 `data/parallel-popup-real/approved-batch-02/` 保持不变；随此目录封存全部父/子报告、逐行评分与费用证明、主请求/响应/ledger、Jev 请求/响应/transport 附件、原 runs DB、新 campaign DB、报价、冻结包及授权记录。[537 份附件索引](evidence/artifact-index.json)含原路径、归档路径和 SHA-256，截图与 DOM/动作/测量原件均可定位。

[离线完整性核对](evidence/offline-integrity.json)只在原 DB 副本运行原 completionIssues 与 childArtifactIssues，9 run 均无问题；原数据字节未改。六个资源关闭事件及无活动 lease 在[机器摘要](summary.json)和[原账本导出](evidence/original-ledger-readonly.json)中可核对。未重新跑免费矩阵、单次真实探针或任何补样，也没有为了改进 P02 改代码后续跑。

本次明确留下的能力边界是：**真实委派、直接入口动作与原几何测量已成立；嵌套入口后的补证/继续动作未完成；全部父任务仍有默认检查缺口。** 无主分支合并或推送。
