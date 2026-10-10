# Jev 官方联网核查：数值解析正确，0.65 是未见本任务校准依据的项目政策

访问日期：**2026-10-10**。已实际访问 TypeSafe 官方文档、OpenRouter Decisions API 参考及双方官方 SDK 源码。仅调研和读取原件；未改产品/阈值/私有评分，未跑测试、浏览器扫描或模型请求。基线 `e99a7f11a124885271e222917616679c71b4c8fb`。

## 1. 官方定义 → 三份原响应 → 结论

[TypeSafe Confidence，How confidence is calculated / Choice](https://docs.typesafe.ai/confidence#choice)明确给出：

`confidence = (p_max − 1/n) / (1 − 1/n)`

其中 n 是选项数，p_max 是所选最高概率。原文短引：“Only the top probability counts”。这是相对均匀分布的归一化统计量，不是正确率、最高概率本身、最高与第二名的概率差或安全授权。该页面也明确要求阈值依领域和风险确定，而非统一数值。

| 原 P02 响应 | 完整 probabilities（实体 ID 简写） | n | 按官方公式计算 | 原 confidence / 程序结果 |
| --- | --- | --- | --- | --- |
| 320 第二 ENTRY | Details 0.82，handoff 0.18 | 2 | (0.82−0.5)/0.5 = 0.64 | 0.64 → handoff |
| 640 第二 ENTRY | Details 0.83，handoff 0.17 | 2 | (0.83−0.5)/0.5 = 0.66 | 0.66 → Details |
| 640 TARGET | panel-1 0.42，read 0.21，handoff 0.37 | 3 | (0.42−1/3)/(2/3) = 0.13 | 0.13 → handoff |

数字逐一吻合；[response-audit.json](response-audit.json)保留 request/generation ID、原响应路径和哈希。计算只读取既有响应，未执行产品或测试。上一报告“独立 confidence”只能理解为**独立字段**，不能理解为与 probabilities 独立的估计；现在有官方公式解释其来源。

**比较范围：**官方将它放在各问题共同的 0–1 统计尺度上，但没有承诺跨阶段相同数值对应相同错误率。根据上式，本项目 0.65 在二选一等价于 p_max≥0.825，三选一等价于 p_max≥0.7667（本报告代数推导）。改变候选集合既改变问题含义，也改变 n，不能把第二 ENTRY 与 TARGET 的 confidence 当同一正确率比较。

**校准范围：**[TypeSafe AI primer，RLCD and calibrated decisions](https://docs.typesafe.ai/introduction/machine-learning-primer#rlcd-and-calibrated-decisions)讲的是概率在一组预测中的出现频率，明确不是单次保证。未找到本 popup 领域、ENTRY/TARGET 各阶段的官方校准误差、样本覆盖或保证；也未找到数值舍入的精确协议。本次三个数值无需借助舍入假设即可解释。

## 2. 官方协议/schema → 当前消费链 → 结论

[OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)的请求为 model/state/questions，Choice 为 type/instructions/criteria，响应位于 `answers.<question-id>`。[TypeSafe API，Choice answer](https://docs.typesafe.ai/api#choice-answer)定义 choice 为最高概率选项、probabilities 覆盖所有选项且和为 1、confidence 由分布导出。

官方源码提供更窄的类型证据：

- [OpenRouter decisionschoiceanswer.ts，L11–26](https://github.com/OpenRouterTeam/typescript-sdk/blob/bfe7530552e058a69f4f614a492a365819fd6b7e/src/models/decisionschoiceanswer.ts#L11)：choice 为 string；confidence 为可选 number；probabilities 为可选数值 map。此 schema **没有**表达公式、概率和或正确率。
- [TypeSafe SDK v0.6.0 types.ts，L79–89](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts#L79)：ChoiceResponse 的 confidence/probabilities 是必需字段。双方 SDK 的可选性不同，不应混同。我们对缺失字段拒绝而不补默认值，是自身严格消费策略；当前三份响应字段均存在。

实际链条（以下位置均为当前基线）：

1. [transport.ts:182](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/agent/popup/transport.ts:182)：拼接 HTTP 字节并作 UTF-8 解码，返回原正文；这里解析 JSON 仅提取 generation ID，不改决策数值。
2. [provider.ts:175](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/agent/popup/provider.ts:175)：先保存原响应，再 strict JSON 解码。[strict-json.ts:89](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/agent/decisions/jev-provider/strict-json.ts:89)最终直接 JSON.parse，无数值重算；前段只检查语法、重复键和深度。
3. [provider.ts:39](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/agent/popup/provider.ts:39)：读取 `raw.answers.popup`；检查身份、type、概率键集合、0–1、和的容差及 choice 为最大值；将 `a.choice/a.confidence` 原样传给 validateSuggestion。**没有读取错字段、层级、默认值、归一化或从概率重算 confidence。**
4. [contract.ts:59](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/agent/popup/contract.ts:59)：先校验范围/候选绑定，再用自身 0.65 政策改写低值 choice 为 handoff，confidence 保留原值。read 单独豁免的是这一门槛，仍受运行时准入。
5. [runtime.ts:161](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/execution/popup/runtime.ts:161)再次验证已采纳对象，未重新计算 confidence；ENTRY 的 handoff 走 [313 行](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/execution/popup/runtime.ts:313)，TARGET 的 handoff 走 [286 行](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/execution/popup/runtime.ts:286)。只有有效目标才进入测量。

结论：**本次未发现字段解析错误；观测到的是原模型分布经过项目政策后被拒绝。**现有 raw/adopted 区分是必要的，不能把采纳 handoff 写成模型原始 handoff。

## 3. 官方输入指导 → 当前 wire → 可确认与不可确认

| 官方依据 | 当前实现 | 结论 |
| --- | --- | --- |
| [Choice，Request/Response structure](https://docs.typesafe.ai/primitives/choice)：instructions 是问题；criteria 是选项→说明；选项名和说明都进入模型；问题 ID 不进入模型 | [contract.ts:68](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/agent/popup/contract.ts:68)发送合法字段，使用对象 state；ENTRY/TARGET 是 state 内自定义阶段 | 当前形状符合协议。早期 criteria:string/choices:map 已由 `87a2816` 修复；它不是本次错误。官方没有内置 ENTRY/TARGET 阶段语义 |
| 同页建议区分选项含义、需要时加入 other/none，并支持分层 Choice | 当前有 handoff；第二 ENTRY 内联新入口、上一动作和预算 | 有弃权出口与分阶段事实。handoff 是我们定义的标签，不是供应商内建拒绝码 |
| [State](https://docs.typesafe.ai/concepts/state)允许命名对象、强调支持事实与问题分开；仅文本，非图像理解 | wire 带页面文本/关系字段，也带 UUID 证据引用；中英文混合 | 对象合法；引用字符串不等于发送图片或 DOM 内容。官方同时提醒 CJK 准确率较低，但不能据此认定本次失败由中文造成 |
| [Jev 1.13 jaggedness，Indirection / Large state / Contradictory instructions](https://docs.typesafe.ai/model-jaggedness/jev-1.13)要求问题直接、去无关信息、指令与选项一致，避免一个问题隐藏多种判断 | TARGET 问“哪个 panel 是动作结果”，criteria 却混合 panel 实体、read 操作和 handoff 控制流；panel 说明只有 `div Details overview` | **协议类型合法，但与单一、清楚判断的指导存在设计张力。**没找到官方专门禁止/认可“实体+read”混合的规则，也无证据证明它造成 0.13；不能把改写必然有效当结论 |

官方允许级联/分层提问，但没有找到“popup 的具体阶段设计”、自动点击新入口或几何测量准入的规定。选项数量上限/结构合法也不证明问题语义设计优良。

## 4. 0.65 的来源

`git log -S '0.65'` 与初始源码定位到 **`b25748e7d20faeb8ce934b2d63d9f692ca35f55a`，2026-10-10 02:00:11 +0800**：首次引入 popup contract 时直接写入比较常量；同提交 [USAGE.md:50](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/plans/goal-directed-jev/USAGE.md:50)记载规则，没有供应商引用或校准推导。`de5fc94` 只增加 read 豁免，点击/目标仍沿用 0.65。

已查该提交、popup 相关 Git 历史、goal-directed-jev/parallel-check-tasks 文档及 R1 校准量表：**未找到支持 popup 0.65 的实测校准依据**。R1 的 [rubric.md](/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/plans/r1-jev-real/rubric.md)是不同评分任务，其列举阈值也不含 0.65，不能移作本任务证明。

[OpenRouter 官方教程，Set confidence thresholds from a labeled sample](https://openrouter.ai/blog/tutorials/how-to-use-jev/#set-confidence-thresholds-from-a-labeled-sample)要求根据自己的标注数据和错误成本选择阈值；它是使用指导，不是协议规定。未找到 TypeSafe 或 OpenRouter 推荐所有 Choice 固定使用 **0.65** 的依据。故它应称为**项目自定、未见本任务校准依据的保守政策**，不能称为供应商要求或经证实的最优值。

## 5. 最小建议（工程建议，本轮不实施）

1. 不需要改解析字段；首先把报告语义说明清楚，同时保留 raw choice、probabilities、n、confidence 与 policy result。不要把 confidence 当正确率，也不要为了这三条通过而降低阈值。
2. 优先审阅 TARGET 的问题定义：将“哪个实体与动作关联”和“下一步 read/handoff”区分，明确各自的选项说明与可用事实。此项是由通用文档指导推导出的**工程候选方案**，不是官方 popup 配方，也尚未验证能改善结果。
3. 可以设计“只读候选几何采集”与“语义关联/可归因结论”分离：即使采集到 rect，也先标为候选观察；关联不足时仍 unknown，不生成归属该动作的通过收据。这是**工程建议**，不是官方推荐，也不意味着跳过原权限、绑定、证据或稳定性检查。
4. 若今后评估政策，应先明确每阶段的错误成本与独立标注集，再离线比较已保存分布上的政策表现；三条选定案例不能证明新的阈值校准或成功率。本轮不做该评估，不申请新付费试验补猜测。

资料范围及失败访问见 [sources.json](sources.json)：TypeSafe `.md` 在浏览工具部分失败，但公开 GET 成功；OpenRouter 部分 `.md` 为 403，已通过正确的 canonical API 页及官方 GitHub SDK 核对。搜索结果中的相似域名和第三方镜像均未作为依据。没有找到的内容是领域校准保证、精确舍入规则、混合 read/实体的专门指导和 popup 专属策略；**Choice confidence 公式本身已找到官方定义。**
