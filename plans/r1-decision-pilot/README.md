# 最小决策实验：免费准备与停止点

2026-10-08。基线 `979b08fce16797295629a4580efe6d18bfb51b59`，分支 `codex/r1-jev-closeout`。复用已接受 `f565eec` 及既有适配器、状态绑定、预算、评分修复和证据；本批不重做完整免费验收。R0 执行器、S4 和默认流程均不接入。

本轮唯一问题：**同一程序过滤后，增加 Jev 评分是否有机会减少历史 Agent 的无效读取、无理由重复检查？** 静态选择不能证明真实动作效果、完成率、整轮覆盖或费用下降。

## 本批实现与材料状态

- `scripts/r1-decision-pilot/pilot.ts`：规范化字段校验、程序过滤/排序、请求编译、独立评价侧契约与四项指标；不含网络/浏览器/数据库入口。
- `scripts/r1-decision-pilot/cli.ts`：仅生成材料；没有 `--run`。缺样本时输出明确缺项，不拿合成样例替代真实状态。
- 原 campaign 增加 `decision-pilot` 配置范围，接收 1–8 状态、单次重复；旧 smoke=6、development=24、holdout=64 不变。仍复用原有协议、授权、冻结、账本与取消入口。
- `example-public.json`、`example-labels.json` 是三个**合成接线样例**：多候选、单候选、缺信息。原 Agent 选择均标为 unmapped；标签是开发评价，不提供真实判断质量证据。
- 截至本批准备，未收到可识别的 R0 **8 状态正式导出**、历史选择映射和独立人工参照。因此真实程序基线、逐请求清单/摘要、最终请求数量仍待输入；目前不能判断 Jev 是否值得用。

## 程序与模型分工

先校验候选身份、观察版本、权限、前置条件、任务义务、动作/时间/费用预算。缺失事实不得从按钮文字推断。程序排序沿用已有确定性规则：当前相关状态未尝试优先、尝试次数、估计成本、ID；实际需要的必需事项在两组中都优先，暂缓的非必需候选有记录。静态单步没有等待时长数据，不伪造公平轮转状态。

已完成事项只有明确复查理由或新的相关状态才重开；仅 observationVersion 变化不算。当前状态出现过 outcome=unknown 的动作也算尝试，不能默默重试。公开事实不足、没有合格候选或预算不足明确交回；交回结果附每个排除原因。

一个合格候选直接程序选取；多个才编译 Jev 请求，模型输入中的候选池与程序排序完全相同。Jev 仅评分既有 relevance / informationGain（0.6/0.4 权重），程序继续确定性排序；现有 readiness 仅允许表示不确定/交回，不授予权限，不提供后置条件或任务完成结论。请求超界保留 request-blocked，不静默裁剪候选。所有合格候选数量为 N 时，实际请求问题数为 **2N+1**。

## 导出字段映射（原始导出到达后核对，不能猜字段）

| 规范化字段 | 必需来源与缺失处理 |
| --- | --- |
| provenance.sourceSha / artifactSha256 / stateRef / decisionCutoff | R0 导出提交、原文件摘要、相对定位、当时选择前的截断点；保留原材料及映射记录 |
| input.task | 当时正常目标、局部检查事项和版本；不带评价结论 |
| input.state | pageId、documentVersion、observationVersion、relatedStateVersion、公开 URL；版本不能用当前页面重建 |
| input.candidates | 当前候选 ID、稳定 targetKey、文本/角色/公开状态/上下文/几何；只允许已记录的 click/inspect；其他动作明确 unmapped/范围外 |
| input.history | 截断点**之前**真实执行及观察；本状态原选择、之后结果必须移至评价侧 |
| input.scope / budget / limits | 当时调用方权限与预算；未知费用不能填零，不能把候选可见等同允许操作 |
| facts（与候选一一对应） | obligationId、pending/completed/unknown、required、permission/preconditions 的 yes/no/unknown、具体动作、动作耗时/美元估计及 evidenceRef；零费用须有事实依据 |
| facts.lastCheckedState / recheckReason | 前次相关状态的 JSON 三元组 `[pageId, documentVersion, relatedStateVersion]` 或 null；复查理由须源自当时事实 |
| criticalInformationMissing | 影响下一选择的关键缺项；required 事项权限/前提未知也强制交回 |
| 评价侧 labels | 历史选择（无法映射则 unmapped）、多项合理选择、推进义务/无理由重复的候选+动作对、缺前提/应交回、依据和复核状态 |

工具校验结构和绑定，不能证明导出内容本身真实，也不能自动识别任意自然语言夹带的答案。接收时人工核对截断点、脱敏及上下文：原选择、人工标签、未来结果不得混进 goal/context/history。严禁私有验收答案、保留集、密钥、Cookie、profile。只导入指定材料，不合并整个脱敏导出树。

## 固定评价协议与判定

在看到任何 Jev 输出前冻结 public input、评价文件、标签 SHA-256、作者、时间、复核状态。规范化输入摘要按 `preparePilot` 的 JSON 输出计算；工具会绑定标签与输入以及候选集合。标签默认 `development-only`；独立复核需记录复核者和实际依据，不能仅改枚举。

逐状态报告三列：历史实际选择、纯程序、程序过滤加 Jev。当前工具输出前两列；第三列保持 not-run，未来须由原 campaign 的原始响应和既有 receipt/score-audit 校验后提取选择，再调用同一个 `evaluateChoice`。禁止直接采信开发者填写的 Jev 选择。交回须从原始 readiness 回执重算；账本与派发请求仍逐条对应。单候选/零候选的第三列继承程序结果并注明 0 次模型调用，不补调用。

固定四项：是否推进可执行未完成义务、是否无理由重复、是否识别前置信息不足、是否正确交回。多个合理候选都算合理；不要求等于历史选择或某个特定按钮。比较候选与动作对，不能把 inspect 的标签套给 click。历史不能映射时指标为 null；没有缺前提的状态该项为不适用，不把它计作成功。报告分母、未知数、每状态原因，不用单一综合分掩盖退步。

**预定停止规则**：

1. 若8个状态均有有效参照，程序在全部状态已合理推进或交回、无无理由重复、正确识别缺项，则本样本未显示增加 Jev 的必要性；停止，不为用 Jev 而申请质量调用。
2. 否则，兼容性通过且取得质量批授权后，只在已冻结多候选状态评估一次。候选收益信号要求：至少修正 1 个程序不合理选择，并且四项指标无新增退步、无越权或过期建议。样本太少只能称进一步研究信号。
3. 没有额外收益、有退步、有效标签不足、协议不兼容、unknown 费用：分别如实结束/报告未定，不调整样本、标签或提示重试至通过。新的实验必须另行明确范围和授权。

## 待授权小批（尚不能执行）

- 使用本批正式到达的 8 状态；仅多候选且可编译者入清单，0–8 次。最多8并非必须8；没有多候选则0次。
- 固定导出顺序的第一个多候选用于兼容性；其响应在预先冻结标签的前提下也可用于静态评价。兼容性通过后，余下0–7状态进入质量批，**分批冻结并分别授权**，不重放首个状态。
- 复用既有六状态 smoke 的字段、校验器和证据，不默认额外追加六次。已接受记录是免费试跑材料，不能作为六次真实兼容性成功的依据。必要时才单独提出有理由的替代兼容性请求，不自动扩批。
- 请求模型 `typesafe/jev-1.13`，响应严格绑定 `typesafe/jev-1.13-20260917` / TypeSafe；并发1、自动重试0、冷缓存，每请求上限15秒（当时预算更低则收紧）。
- 两批各上限 USD 0.125 / 150秒，总提案 USD 0.25 / 300秒；真实请求总数最多8。**这只是支出意愿上限，非已验证的提供方硬报价。** `quoteUsd:null`，两个 verified 均为 false。首批 unknown/失败即终止整个提案，不开启第二批绕过账本。
- 兼容性通过条件：HTTP 与结构/模型身份/问题集合正确，原始 usage 可核对，候选/版本绑定有效；不以评分符合期待作为兼容性条件。当前为诊断阈值，不宣称 readiness 校准已完成。
- 配置生成 `compatibility-first-config.json` 和（有余项时）`quality-remainder-config.json`。未获完整8状态时，只是待补输入的草案，不能申请按缺项清单执行。
- 授权前需要实际请求清单、每个候选池、2N+1 数量、wire 摘要、冻结提交/锁文件/配置/标签、协议证据和预留金额。未来运行沿用 `r1:jev:real --dry-run` 及原冻结授权方式；本轮 CLI 不提供执行模式。

## 协议和独立停止入口

2026-10-08 重新核对 [OpenRouter 模型页](https://openrouter.ai/typesafe/jev-1.13)：输入 USD 0.042/百万 token、输出免费、32,000 context；[Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request) 和 [Jev 指南](https://openrouter.ai/docs/guides/community/jev) 未给本次检索可确认的请求问题数量硬上限。单价/上下文不证明失败、取消、超界路径的总收费上限，也不能把字节直接当 token。保留已有 `protocol.md` 的缺项，不凭示例题数放行。

条件算术最多8次满上下文为 `8 × 32000 × 0.042 / 1e6 = USD 0.010752`，**不是预算预留依据或成本测量**。尚需问题数量支持范围、实际计量/预留映射和异常计费依据；可取得正式文档或提供方支持记录，不能用用户授权替代协议事实。

付费路径是 R1 `scripts/r1-jev-real/runner.ts` → provider session/http → 独立持久账本，**不经过 R0 停止入口**。复用并定向运行 `unknown fees stop the complete campaign after one dispatch`：注入假传输，第一回执缺 usage.cost，24项队列实际派发1次，记录 unknown 并停止剩余23项。这仅证明本路径停止接线，不能借此证明真实服务兼容性或收费规则。

## 免费复现与交接

要求 Node 24.x（或包声明支持的22.18–22.x），pnpm10.17.1；复用锁文件，干净环境执行 `pnpm install --frozen-lockfile`。不依赖浏览器服务、.env 或密钥。以下命令均从此隔离工作区根目录运行，输出必须为尚不存在的目录：

```sh
mkdir -p artifacts/r1-decision-pilot
pnpm exec tsx scripts/r1-decision-pilot/cli.ts --output artifacts/r1-decision-pilot/waiting
pnpm exec tsx scripts/r1-decision-pilot/cli.ts --input plans/r1-decision-pilot/example-public.json --labels plans/r1-decision-pilot/example-labels.json --output artifacts/r1-decision-pilot/synthetic
pnpm exec vitest run --config plans/r1-decision-pilot/vitest.config.ts
pnpm exec vitest run --config plans/r1-jev-real/vitest.config.ts scripts/r1-jev-real/tooling.test.ts -t 'unknown fees stop the complete campaign after one dispatch'
```

真实导出到达后：核对 SHA 和截断点 → 映射为 public 文件（保留映射/来源摘要）→ 单独冻结评价侧 labels → 同一 CLI 生成真实 baseline 和请求草案 → 检查程序是否已足够 → 补齐协议/费用 → 生成 campaign dry-run 并提出具体授权。相对路径材料须留在工作区内便于原 runner 校验；只用导出内容，不重放浏览器。

当前停止点：免费工具准备可交付；真实8状态、真实基线结果/请求清单、人工参照、问题上限与异常收费依据仍待补。真实协议验证、评分实验、探索闭环、R1阶段验收均未完成。默认启用建议仍为关闭；S4继续等待 R0 基线稳定，本实验准备不要求 R0 正式通过。
