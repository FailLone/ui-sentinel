# R0 v2 离线依赖接收与免费基线

2026-10-09。本批窄结论：**R0已提供本轮离线建议所需依赖，R1消费核验通过；程序已能筛出可调查的剩余义务。未证明Jev的排序收益、执行推进或R1完成。** 不要求无关R0持久问题、取消报告尾差异及全部业务验收先关闭。

本批模式 `r1-offline-advice-v2-intake-1` 只消费新6时点。旧8状态、原零分母、`offline-advice-v1`及其参照/成绩原样保留，不混合分母。新状态来自固定provider驱动真实API/Chromium的已有运行，不是真实模型的新轨迹。本轮未运行浏览器、执行器、数据库或模型服务；只读取公开文档。

## 提交与接收材料

- 本轮起点 `cd38877dd39e3ceddd7dc59284a337098387303b`，分支 `codex/r1-jev-closeout`。
- R0产品 `27614b7a60293a80f3be7b321d164d3599dd0964`，阶段交付 `5070fb227684cbad821c51a8310280b12505787f`，本次依赖冻结 `556f2419c5f062cdfb2cfd0a4867a4a95b9864b7`。
- R1输入及开发参照冻结 `d25ce9e`，消费代码 `a0a15375fdae0aa27e72dfaffd1fec6340541a2b`；证据绑定该代码提交。
- `RECEIPT.json`列明22份按Git固定提交逐文件复制的材料及SHA256；未合并R0树、未引入其运行代码或evaluation目录。`source/index.json`列明18份状态/输入/公开文件身份。全部所需离线材料随R1提交。
- 原R0阶段机器索引 `plans/evidence/r0-default-check-v2-delivery.json`及交接已只读检查；复用其28场景证据，不重跑或重判R0。小包生产方的`source/validation.json`仅作来源说明，消费者检查另有本批证据。

消费核验涵盖：文件大小/hash；输入与state一致；候选/事项/ref/snapshot身份；selected范围；原观察规范化hash、prefix版本、request前一seq截断；公开操作均不越截断；generic/effects和context摘要一致；原动作与checkRef/actionId/receiptRef关系。只证明包内绑定和版本一致，不宣称重新证明R0原始证据真实性。

`source.actualInputSha256`是**原完整请求**的摘要，`public.actualInput`是allowlist公开投影；不能用投影重算这个摘要。原prefix、观察文件、截图和数据库的原字节也未复制：本轮将其hash视为生产方来源声明，复用冻结提取证明。恢复全部原始轨迹仍需按index取得这些材料，当前离线比较只需要已提交公开包。UUID证据ref是历史引用，不伪装成本包中可打开的图片。

## 逐状态结论

人工开发参照先于基线冻结，只依据公开义务审阅，非独立人员盲审。程序和Jev dry-run使用完全相同的完整公开事实、候选、未知值及SHA，不读历史选择、评价标签或未来结果。

| 状态 | 观察候选/调查候选 | 程序建议与公开依据 | Jev准备 | 完整执行路径 |
| --- | --- | --- | --- | --- |
| V01 | 1/1 | Reveal的generic待办 | 单候选，0请求 | 未知 |
| V02 | 5/0 | 有控件但未冻结local选样，交回选样；不称页面无控件 | 0请求 | 未知 |
| V03 | 5/3 | Reveal、Second、Third均已选且generic待办；三者并列，稳定ID输出Third仅为可重复顺序 | 1份dry-run，7问题 | 未知 |
| V04 | 3/1 | Reveal的generic已收集，不重开；调查尚待检查的原生select AlphaBeta | 单候选，0请求 | 未知；fill未映射成已执行inspect |
| V05 | 1/1 | Reveal的generic已收集，明确要求的effect在截止时仍pending | 单候选，0请求 | 未知；不重复click |
| V06 | 1/1 | Reveal的generic已收集，但来源未封闭、晚到effect未验证；建议调查，也允许交回 | 单候选，0请求 | 未知；晚到要求不能追溯验证或授予重放 |

有效分母分开报告：结构接收6/6；义务相关性6/6符合开发参照（5建议+1交回）；多候选结构1/6；能区分排序优劣的参照0；完整执行路径已证明0、未知6；实际执行推进未测，不计成功率。合法性仅指离线建议范围，绝非派发许可。三个V03候选合理并列不算实验失败，但也不能比较谁能更少读取。

程序规则：已选、在inspect范围、无已知禁止且仍有generic/source/effect待办，或明确复查理由，才入池；required优先，同级并列，ID仅稳定打破平局。效果无规格不会自动重开已完成generic；source未封闭时无effects不当作“已确认无规格”；已测failed不是健康通过，也不自动重放。未知实时权限、前置条件、美元上界保留，不阻断离线调查；公开文字不会成为指令。输出包含支持事实和执行前缺项，始终`directlyExecutable=false`、`verifiedProgress=false`。

## 最小后续请求及停止点

具体冻结请求见`BATCH.proposal.json`：0..1请求，仅V03，3候选×2评分+1 readiness=7问题，28,525 UTF-8字节，60秒、0重试。`evidence/baseline/V03.request.json`为完整请求；wire SHA `7c9a62a1fa5207edc90c3bf11a03f4dad8e781c575ed861f68a4db3f92fbb428`。本轮0 HTTP；当前代码只有dry-run，不是已获授权的付费入口。

允许未来用唯一请求兼作协议兼容与义务相关性验证，合理候选可并列；无最佳顺序标签不妨碍检查结构、身份和交回语义，但不据此做排序收益实验。不自动追加原6次兼容调用，也不沿用旧USD0.25授权。到这里停止，未追加样本、轨迹、付费或S4。

2026-10-09核对[模型页](https://openrouter.ai/typesafe/jev-1.13)：输入USD0.042/百万token、输出USD0、context 64,000 token；与旧材料32K观察分开记录，不改旧档。[Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)确认model/state/questions及choice/score结构，并给usage.cost示例；没有由已读资料确认7问题上限、共享state/每问题如何计费和失败/取消的可预留美元上界。字节数不是token数，context窗口不是计费上界。因此报价、总预算和授权继续null，verified保持false。不能仅改标记放行。

将来的付费路径是R1独立campaign，**不经过R0停止入口**。复用已有请求级unknown停止证据：`evidence/reused/unknown-stop.log`及provenance；原测试24请求队列仅派发1次、费用未知后23次未尝试，runner和该测试自证据提交未变。本轮未重跑。该证据不等于新v2 wire已完成付费接线：授权前仍须把本模式接入同一持久费用账本，验证原始回执候选/观察绑定、readiness重算和未知费用停止，不能走裸fetch。身份/回执失配、超时/取消、费用unknown即停，预留金额不释为0。

未来效率只能通过预登记的同初态/任务/预算/执行器受控比较，观察真实证据与义务增量、无效工具、时间/成本；本轮不执行。恢复实际执行所需最小接口是当前节点/权限/预算/取消核验、原动作及只读恢复身份与次数、证据可读回、迟到隔离和可恢复初态；应只检查所选路径，不扩大成R0全面重验。

## 复验与证据

无新依赖。使用仓库Node要求、pnpm10.17.1和锁文件；本次Node v24.21.0。只新增两文件15项定向测试，全部通过；typecheck通过。没有重跑旧免费套件。原始命令、退出码、版本、提交及日志在`evidence/`，索引为`EVIDENCE.json`；日志内本机绝对目录映射到repository-root。

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run scripts/r1-decision-pilot/v2-intake/adapter.test.ts scripts/r1-decision-pilot/v2-intake/facets.test.ts
pnpm typecheck
# 新输出目录，不能覆盖本批冻结证据
pnpm exec tsx scripts/r1-decision-pilot/v2-intake/cli.ts --output /your/new/output-directory
```

`PROTOCOL.md`为评价边界，`REFERENCE.json`为评价侧开发参照，`evidence/baseline/report.json`为机器结果。接线测试只证明离线处理，页面注入反例不等于真实Jev抗注入能力。新模式不默认启用；真实协议、评分质量、探索闭环与R1阶段验收均未完成。Roadmap维护者可采用上述窄状态，本任务未修改Roadmap或发送跨Agent消息。
