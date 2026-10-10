# 嵌套入口续行：已修复并完成免费验证，真实模型效果尚未验证

实现提交：`de5fc94334665353ab9477969ad477b691570db4`。仅在 `codex/parallel-check-tasks` 隔离工作树修改；未合并、推送或新增付费请求。旧三场景结论仍为 P02 未通过，不能用本次替代响应验证改写旧结果。

## 原件诊断

审计基础是 `real-result-02-20261010` 的原 HTTP wire、原响应、采纳结果及请求发出前已引用的 DOM 附件。逐笔请求、原文件路径与 SHA-256 在 [original-packet-audit.json](original-packet-audit.json)，不是用后来 DOM 推测模型当时看到的内容。

| 原场景 / 视口 | 原入口选择 | 原 RECOVERY 响应 | 程序采纳 / 实际读取 |
| --- | --- | --- | --- |
| P02 / 320 | More options，0.92 | read，0.60 | handoff / 0 |
| P02 / 640 | More options，0.87 | read，0.54 | handoff / 0 |
| P03 / 320 | Details，0.79 | read，0.52 | handoff / 0 |
| P03 / 640 | Details，0.82 | read，0.63 | handoff / 0 |

**P02 的 Details 已在原 RECOVERY 候选和 criteria 中**；RECOVERY 指令也允许选择新入口。因此“未提供 Details 选项”不是原因。确证的缺口是：

- packet 只有 `revision/stage/binding/goal/candidates/evidenceRefs/missing/attempts`。候选只有 ID、文字描述；没有 visible/enabled、newlyObserved 或动作前后关系。已完成动作只有 item/action ID 和 completed，没有 More options 的描述。
- 原程序已有充分的新入口证据：320 的 `c45435be…` → `6280ccac…`、640 的 `ee440431…` → `d8abef87…` 两组原快照中，Details 均从 visible=false 变为 true，enabled 始终 true。这些快照在原请求 evidenceRefs 中，但远端模型收到的是附件 ID 字符串，不能读取其 DOM 内容。
- `missing` 是泛化的 `no-new-popup-observed-need-nested-entry-or-public-read`；没有内联页面动作结果文本、剩余 actions/calls/reads/time。P03 原快照已出现 “Details unavailable”，也未内联给模型。
- `validateSuggestion` 对所有 choice 共用 0.65 门槛，四份原 read 建议均在运行时读取准入检查之前转为 handoff。它是确定的控制流原因；不是模型原始选择 handoff。

另外，两份 P02 goal 中父模型生成的 delegated context 含 “when opened via one local UI action”。这是确实发送过的措辞，可能影响第二次动作意愿；现有材料不能确定其影响，也不能确定 Jev 选择 read 的内部原因。修复不伪造或改写原委派目的，不将上述因素宣称为已证实的模型因果。

## 最小行为修复

1. 原观察帧增加候选 visible/enabled 与有界页面文本；问题增加上一动作描述/结果、新可用入口 ID、变化事实、剩余预算及读取准入原因。没有向生产 prompt 写入 Details、More options 或私有答案。
2. 动作后若已有新可用入口，直接基于现有事实发起下一次 ENTRY 问题，仅列新入口；不再以模糊 RECOVERY 要求模型重复补读。新入口只是观察事实，不是弹窗承诺；必须经模型有效选择和原动作权限门才能点击。
3. 低置信度 read 保留为语义建议；点击和目标选择仍要求 **0.65**。read 另受确定性检查：可复用观察、已完成原动作及 action ID、有未决缺口、相对动作前的公共事实已改变、无可直接继续的新入口、该动作未读过、剩余 reads/calls/time 足够。模型返回后再次检查预算及取消。每个动作最多一次语义 read；读取无新事实立即 handoff，单纯 binding/时间戳变化不触发相同语义问题重放。
4. 原动作执行器、陈旧候选绑定、权限、几何测量、动作/条目收据关联保持原路径。原默认配额不提高。显式主 Agent refresh 仍是原有的独立有界能力；本次不把它改成无限恢复或自动重试。

## 免费验证与边界

[检查记录](free-checks.json)：6 个测试文件 **41 项通过**，包括嵌套 ENTRY、原动作/测量关联、低置信度读取与去重、预算在响应后耗尽、取消、隐藏/禁用候选、低置信度点击/目标拒绝、注入/陈旧建议、原权限拒绝、unsupported 布局保持 unknown，以及 P03 无弹窗不得生成 pass。类型检查和生产构建通过。

只执行一次 **P02 / 1 父 + 2 子**免费浏览器集成；没有重跑三场景矩阵、R0/R1 或真实探针。使用真实 Chromium、原产品执行器/账本/协议路径，但主模型和 Jev 均为替代响应，因此只能证明执行链，不能证明真实模型能力改善。

- 父 `run-856183f4-33c4-4995-9139-c17d89ad4f53`。
- 320 子 `check-ae1c17fd-601c-43dd-82b4-0e80af10feec`：两次原点击，ENTRY → ENTRY → TARGET，reads=0，原测量 fail / fixed-panel-border-clipped。
- 640 子 `check-647ce989-a1e9-498c-9828-032cb434719a`：两次原点击，同样三阶段，reads=0，原测量 pass / panel-fits-visible-viewport。
- 两份收据均绑定第二次 Details 的原 item/action ID。父子持久化均 verified；父仍 blocked / partial，两个子原运行也保留 blocked，不升级为父 covered。
- 7 主 + 6 Jev = 13 次**替代**请求；realCalls=0、真实费用=0。合成账本已知值 0.000076 USD 只是测试计费数据；unknown/held=0、活动 lease=0、stopEvents=0、两个子资源关闭。

[免费摘要](free-summary.json)、[168 份原附件索引](free-artifact-index.json)、`free-evidence/` 保留原报告、wire/response/transport、截图、DOM、测量收据、账本和数据库。旧授权对新 manifest 的验证返回 `new-batch-explicit-human-approval-required`，在创建账户/输出目录前拒绝；测试未携带凭据。[冻结核对](freeze-integrity.json)证明旧两份 bundle 哈希未变、旧归档未改，P02 页面、公共输入和私有评分与旧冻结内容完全一致。

## 后续只需 P02 真实验证；本次未执行

新方案已冻结在 [real-preparation/PLAN.md](real-preparation/PLAN.md)：仅 P02、1 父 + 320/640 两子，最多 10 主请求 + 6 Jev，共享新原账户上限 **USD 0.62**；不复用任何旧授权或 claim。真实模型第二次入口/目标选择、父委派措辞及有限预算仍可能导致 unknown，这是下一次试验要观察的结果，不能在免费测试后预判成功。

此轮授权范围是免费诊断与验证；新的付费执行需要用户对这份具体冻结方案另行授权。示例授权仍为空，未创建新真实 claim，未启动真实批次。
