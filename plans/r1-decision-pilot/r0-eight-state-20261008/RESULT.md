# 8 状态免费程序基线与范围结论

本轮结论：**尚不能判断程序是否已经足够，也没有可进入 Jev 比较的合格多候选状态。** 现有完整准入基线输出8次信息不足交回、0次候选建议；这暴露了上一轮 pilot 对准入事实的要求与离线导出之间的接口缺口，不能写成8/8任务成功，也不能判定 Jev 没有收益。

开始于 `codex/r1-jev-closeout@0b4755798c557777b3c85b1ef959792156baa7b5`。接收和开发参照冻结提交 `9effaf94d851277263e946a0adb929233e258973`。没有修改 `src/`、`scripts/` 中既有产品/实验实现，没有重跑已有测试，没有页面、付费或 S4 调用。本批只保存指定公开包、映射材料、离线计算和评价侧比较，不合并 R0 分支或整个脱敏树。

## 来源与时序

- 公开包 SHA-256：`e132b79f829bf6eea862f44d602e61945ff8002f42e1ded946f2ad3f14f1e682`。
- 原始运行候选：`08acc95d7f67a1ac3cbcf3d9decc9add2f2907eb`；公开导出和历史选择文件冻结于 R0 提交 `b266089d8a46b0394e39220f66ac85260b4b19ef`。本轮没有把 R0 当前 HEAD 当成原运行基线。
- 包内19文件、8份 input、8份 public、selection 与 index 摘要核对通过。8份 input 均通过既有 `parseExplorationInput`。契约文件 SHA 与 index 一致。
- 对原3条归档只读核对：数据库摘要、截止前事件前缀摘要、最后事件ID/时间、snapshot摘要及观察时间、操作截止范围、按截止点恢复的费用账本；8/8一致。**未重跑导出器或执行器**。调用原导出器的只读 `money(at)` 复核账本，不执行 `export()`。
- S08 的截止为 05:54:43.019 UTC，金额仍为 held（USD 0.0208038），unknownCount=0；没有把后一毫秒的 unknown 或后来核清金额回填。预算时间使用导出的下界，未使用过时缓存提示冒充当时余量。
- 07:13:34.343 UTC 冻结开发参照；07:14:11.644 UTC 固定实际基线摘要；**随后**才读取评价侧原选择。`freeze.json`、`baseline-freeze.json` 保留时序和摘要，参照未因历史选择而修改。

人工参照尚未随包提供，未获得人工/独立复核。本轮冻结的是 Codex 根据公开事实写出的 **development-only 准入参照**；不能将其冒称人工真值，正式质量分母仍为0。原选择不是参考答案。

## 字段映射和 click/inspect 边界

公开 input 本身保持原字节，完整 public 补充亦保留。`mapped-public.json` 只是给现有 pilot 增补 facts：selected→required，pending/verified→pending/completed，候选与事项使用同一 ID。没有从后续选择或后续结果补输入。

导出的 `scope.executableCandidateIds` / allowedActions 是**离线建议范围**，不是实时执行许可。`bindingAuthorization` 明确 unknown，且没有每个动作的时间/美元上界。现有 pilot 却要求这些字段齐全，因此 permission/preconditions=unknown、estimatedMs/estimatedActionCostUsd=null，criticalInformationMissing=true。这个保守映射使全部状态交回；其含义是当前完整准入策略无法据这些材料选出可执行动作，**不是证明这些页面在当时无事可做**。不能靠填 yes/0 消掉缺项。

`estimatedCost=1` 仍是一次原子工具调用的相对工作量；归档余额不等于新的付费授权。页面 observedVersion 和 prefix 只用于绑定；尤其 prefix 随读取事件变化，不证明相关页面变化。verified 项保持 completed，lastCheckedState=null，不利用前缀变化自动重开，也不根据 selector 相似合并新旧候选。

- **click**：本次只映射原 `page_act(type=click)` 且 ref 精确对应截止时当前候选的记录。保留目标与动作，不能据计划点击推断测量结果、缺陷或任务完成。
- **inspect**：是一个当前候选的有限检查建议，不等于任意 page_inspect/page_observe，也不能替代原生 fill。需要明确检查对象与新增信息目标；本包没有足以将上述宽泛读取归为单候选 inspect 的对应关系。
- **fill / 多对象读取**：保留原动作和 unknown。S03 的 fill 不改成 inspect；S04/S07 页面选择器读取、S06 全页观察、S08四对象 details 均不择一强行映射。
- 所有状态共30个当前候选，其中18个是“选中、pending、原生 click”的事项出现次数，分布在8个时点；**它们尚未通过准入，不能当作18个合格动作**。还有4次 pending fill 事项出现于S01/S03/S07/S08。
- S07/S08各有3个已选但不在候选池中的未验证/失败事项（调查、自动检查），仍保留为剩余范围；没有把候选池当作全部检查。Filters 的5个 unrelated 命中样点只是待查事实，不直接宣布缺陷或可点。

## 逐状态对照

所有程序结果都是 `handoff / insufficient-information`，合格候选0，Jev请求0。表中 click 义务数仅为过滤前的范围描述。

| 状态 / 截止序号 | 时间余量下界 ms | 未完成选中 click 义务 | 原 Agent 紧接选择 | 映射与程序对照 |
| --- | ---: | ---: | --- | --- |
| S01 / 53 | 252130 | 2：Apply、About | click Apply，e4 | 精确映射；程序交回，未提出推进动作 |
| S02 / 124 | 187021 | 1：About | click About，e25 | 精确映射；即便后续补齐准入，这个必需 click 范围也无排序竞争 |
| S03 / 61 | 238553 | 3：Apply、Filters、About | fill Sort=Name，e3 | 契约外，unknown；不当作程序错误或正确的比较样本 |
| S04 / 98 | 206315 | 3：Apply、Filters、About | page_inspect 多组 selector | 非单候选 inspect，unknown；已测量的 Sort 不重开 |
| S05 / 142 | 114735 | 3：Apply、Filters、About | click Apply，e28 | 精确映射；此前两次 fill 未改写为 click 历史 |
| S06 / 179 | 88252 | 2：Filters、About | page_observe | 非单候选 inspect，unknown；Apply 已测量但程序没有推进剩余事项 |
| S07 / 78 | 186808 | 2：Apply、Filters | 两次 page_inspect | 两个读取均保留，不拼成一个选择；unknown |
| S08 / 87 | 88593 | 2：Apply、Filters | element_details，e9/e10/e11/e12 | 批量读取，unknown；与先前读取有重叠，也增加 e12，不能直接断言全是无理由重复 |

## 固定评价项与有效分母

| 项目 | 当前可报告结果 | 不能推导的结论 |
| --- | --- | --- |
| 来源与契约接收 | 8/8状态核对、解析通过 | 不等于R0通过或页面动作通过 |
| 原选择精确映射 | 3/8状态；工具条目3/9，均为click | 不能把其余5状态算错，也不能换分母后声称总体准确率 |
| 候选所指义务 | 3个已映射历史click均指向当时选中的pending事项 | 实时可执行性和实际检查结果未在本比较中判定；不是完成率3/3 |
| 程序推进未完成义务 | 候选建议0/8；实际操作0次 | 全部交回不等于程序足够 |
| 无理由重复 | 程序不提出动作重复；历史行为合理性未知 | 缺少读取目的/信息增量，次数或目标重叠不能单独证明无效 |
| 识别前提缺失 / 交回 | 8/8符合冻结的开发准入参照 | 同一作者参照的一致性，不是独立质量8/8 |
| 候选排序比较 | **有效成对分母0**；多合格候选状态0 | 不计算程序相对Agent或Jev的优胜率 |
| 人工独立质量参照 | **0/8**已复核 | 不能使用 development-only 标签宣布正式质量通过 |

机器结果在 `comparison.json`。`baseline/evaluation/program-vs-history.json` 中历史保留冻结时的 unmapped，占位文件没有被重写；真正历史映射在独立的 `evaluation-only/` 与 `comparison.json`，从不进入模型输入。

## 决策和最小未决事项

**本轮停止准备 Jev 请求，次数0，不再追加费用搜索或小批配置。** 当前没有通过同一程序过滤的多候选集合；模型不能补出缺失的权限、前置条件或预算事实。不能把此结果称为“Jev没有收益”，同样不能称为“程序已经足够”。

下一步需要明确的是离线建议范围与实时执行准入的接口区别，并补齐或正式说明这个实验所用的动作前提、耗时/费用边界及复查依据；缺项应由事实或契约说明解决，不能把现场授权凭空写进归档。本轮不修改既有工具来追求非零分母，不要求重跑浏览器，也不要求 R0 正式通过。若另有人工参照，则先保留本轮冻结版本并独立复核；不能用历史选择反推“正确答案”。

只在这些条件明确后仍有值得比较的多个合格候选，才准备具体 Jev 请求与对应费用依据。S4仍暂停，默认流程不启用。R1没有新增完成声明。

## 文件与免费复现

本目录保存原公开材料、字段映射、冻结参照、基线和评价侧历史；没有凭据或原运行整库。`source-receipt.json` 是本地原始归档核对记录：原 SQLite/快照未复制，因此跨机器仅凭本目录可以复核公开材料摘要、字段映射和基线，若要重新核对数据库前缀则还需原R0证据归档，不能猜测缺失原文件。

从仓库根目录使用既有 Node24 / pnpm10.17.1，输出换成新的目录：

```sh
mkdir -p artifacts/r1-decision-pilot
pnpm exec tsx scripts/r1-decision-pilot/cli.ts --input plans/r1-decision-pilot/r0-eight-state-20261008/mapped-public.json --labels plans/r1-decision-pilot/r0-eight-state-20261008/reference.frozen.json --output artifacts/r1-decision-pilot/eight-state-reproduction
```

`receive.py` / `freeze-reference.ts` / `compare-history.py` 是本批一次性材料处理记录，不是新增产品功能。执行顺序与退出码见 `commands.json`；最初来源核对因本机Python3.9不支持zip(strict=True)而退出1，删除该运行时不兼容参数并保留等长断言后核对通过，未更改数据或预期。没有测试套件重跑。
