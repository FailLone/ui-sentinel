# R0 默认检查契约 v2 与未来验收方案

**提议／待审阅，未实施。** 2026-10-09。产品基线 `5f41285b69c83387af76e5b85d3657d19fb0761d`；交接 `d636d7e`，诊断工具 `a3aa1bc`。本轮只编写本文件及配套 JSON，不授权开发或付费执行。持久化故障仍未关闭，R0 未通过，R1 不扩展。

推荐决策：普通用户仍只提供网址和可选目标。默认选样承诺改为**有完整证据的通用交互检查，加上所有已登记、有独立依据的必需效果验证**。没有效果规格时，不再强迫模型编造具体后置条件；通用检查可完成，功能语义必须单列未知。已有明确要求不得改成“无规格”。这改变未来默认完成的含义，必须新版本、新 manifest，不能称旧标准未变。

## 1 定稿建议与承诺变化

| 产品决定 | 推荐答案与理由 |
| --- | --- |
| 无规格是否永远阻止默认完成 | 否。有效通用检查完成、来源审查闭合且无其他必需缺口时允许默认完成；报告必须显示功能语义未验证。否则普通网址入口仍有已证实的契约循环。 |
| 点击成功是否足够 | 否。要求动作身份、前后状态、有限反馈采样、适用规则结算、证据可读和无执行干预组成的完整回执；截图或一个 success 字段不够。 |
| “未观察到变化”是否缺陷或失败 | 无独立要求时仅是有限观察，允许通用检查完成；有要求时按原冻结谓词测量，证据不足为未完成，确证违反为缺陷。 |
| 明确要求如何处理 | 默认、用户、高级检查、规则、页面声明的义务取并集；不存在低优先来源覆盖高优先来源的降级。冲突或不能表达的必需要求保留未完成。 |
| 可选目标是否承诺任意语言编译 | 否。首版只接受下述有界、可核对关系；已知明确要求不能编译时阻止完整契约完成。不会要求所有用户填写脚本，也不会把不能理解的目标静默当作关注点。 |
| 晚到规格是否核销旧动作 | 首版不核销。追加到原 item、标记 late/unverified，报告保留；不重点击、不从实际结果推预期。 |
| 总体状态是否改变 | 复用原 completed/blocked/cancelled/execution-error 和 covered/partial。completed 只表示本版本必需检查完成，允许有已证缺陷；从不表示功能全对或网站无缺陷。 |
| 是否现在恢复验收 | 否。方案批准、开发完成、定向免费证据和持久问题关闭后，另行冻结并取得真实模型执行授权。 |

### 推荐向普通用户显示的范围说明

> 在限定页面内观察界面、执行适用规则，从首批候选中固定检查最多三个本地控件，并实际检查一条可用同源链接。通用检查会记录操作、反馈和异常；只有具备明确依据的功能要求才作效果验证。功能语义未知、未检查的范围和未完成的要求会分别列出。检查完成不代表全部功能正确或整站无缺陷。

保留首批候选上限8、每路由 min(3,N)、全程一次可用导航、最多3页/深度1及现有预算。≤3全部登记，>3先固定三项再执行；失败不换样、重访不重置、已选不得删除。高级 requiredChecks 只追加，受原权限和预算约束。缺少目标、预算或安全权限都不能缩小必需分母。

## 2 默认检查究竟完成什么

| 对象 | 完成所需的可核对事实 | 不能冒充完成的情况 |
| --- | --- | --- |
| 入口和实际访问页面 | 实际导航及页面身份；可读取的公开 DOM/无障碍观察和截图；候选与范围来源登记。没有候选须有完整、干净观察支持。 | 观察失败、被截断却宣称没有候选、空队列、自报已观察。 |
| 适用规则 | 规则版本、适用事件/目标、真实测量及 pass/fail；unknown 或待执行仍是必需缺口。证明不适用须保存判定依据。 | 没有规则等于没有缺陷；将适用 unknown 改成“不适用”。 |
| 已选本地控件的通用检查 | 下述 G1–G5 全满足，或有原机制认可的真实物理拦截失败证据。 | 一次 click 返回成功、一次截图、仅阳性 probe、读取控件属性、出现任意 DOM 变化。 |
| 有依据的必需效果 | 操作前冻结且适用的来源和谓词；原动作关联、正确结果绑定、有效测量，结果 verified 或 failed。failed 必须保留对应有效发现。 | 通用检查完成抵扣效果；无关/原本已满足断言；把未测量写成 failed。 |
| 选中同源链接 | 实际点击所选节点，派发和落地关联、权限边界、落地页面可读观察及规则。沿用原导航证明；目标页若有默认候选仍登记其义务。 | 直接 navigate 到同一 URL、猜目标文字、点击但落地未核实。无链接只由真实观察证明。 |

**通用检查 G1–G5：**

1. G1：已选原 item、当前同文档节点绑定、权限及完整操作前观察；登记该 item 的来源审查版本和必需要求集合。控件启用/可见不等于具有动作授权；副作用安全性仍未知时不得试点。
2. G2：经唯一 performAction 正常派发一次获准动作，保存 actionId、itemId、动作类型/参数、开始/结束事件。未知效果 click 复用 `investigation_run.exploration:{}`；不强制、不重放。fill/select 使用已有工具，只检查有类型的本机控件状态，例如所选标签/输入值；这不证明应用筛选或保存效果。
3. G3：在同原动作时间片内，保存操作前及操作后的公开观察、DOM/无障碍摘要、证据哈希及完整性。首版固定动作返回后立即及约1000ms两次反馈采样，记录真实时间；全部占原工具15秒/任务预算，不添加模型请求。只声明这个窗口，不把1秒变成网站性能阈值。样本缺失、必要范围超采集上限、证据字节不匹配不能按“无变化”完成。
4. G4：保存结构化反馈：`change-observed`、`no-change-observed` 或 `indeterminate`，包含比较范围和采样引用。前两者只是观察；无关联的动画/时钟单列 incidental，不能作为控件功能证据。若无法可靠比较则 indeterminate，通用检查未完成。操作导致控件正常消失可作为变化记录；操作前绑定失效、跨文档或事后测量被另一动作打断不能混为同一情况。
5. G5：结算上述观察触发的适用规则、已知异常和新增规格来源；无未处理真实故障/干预/取消、无悬而未决的适用假设，回执全部持久关联。再由执行器结算通用维度。每个 item 的普通观察不是新规则或功能正确性结论。

**物理失败例外：** 原 corroborated interception/probe 证据可以把通用维度判 failed，无须强行点击被挡控件；必须保留有效缺陷、测量与原 item 关系。正常 probe 永远不能完成通用检查。有另行规定的功能效果却没有执行机会时，该效果仍未验证；阻断整轮时用原 observed-blocker，不能洗成 covered。真正工具/浏览器执行异常沿用 execution-error；无证据超时不是站点缺陷。

## 3 来源绑定和义务登记

先冻结用户/API/政策/规则来源，再在每页首个干净观察、选样完成后，对选中控件登记公开来源；**该控件派发前，必需集合必须有明确的冻结版本**。这是原 scope 登记步骤，不增加规划模型或第二套账本。不能通过不提交来源提案绕过服务端可识别的明确要求。

| 来源 | 必需身份和适用关系 | 首版行为 |
| --- | --- | --- |
| 原目标 | 原始字节及 goalHash、goalSource、确切文本区间；唯一控件名/角色与动作、预期的明确句法关系 | 缺省中性目标和受支持的“检查/关注某控件”只指导选样。明确效果句纳入必需；不能解析或目标不唯一时登记 unresolved requirement，不能以 expected 字符串恰好在 goal 中就接纳。 |
| requiredChecks | 冻结 contractHash、check.id、完整 check hash；目标、action/value、谓词和结果关系 | 排队前全部登记；未绑定仍必需。与默认 item 绑定后把各要求附在原 item；不靠两个 item 相同顶层 status 推断要求都已满足。原高级要求不得移除。 |
| 默认政策 | 契约中的 policy revision/hash 与实际首批候选证据 | 贡献观察、规则、通用采样、真实导航义务。不给无规格按钮制造业务效果。native select/fill 的局部状态核对由公开有类型动作政策提供机械依据。 |
| 已批准规则 | ruleId/revision、规则内容 hash、批准记录/规则来源、真实 trigger/eventRef、语义目标绑定 | 复用原适用性与测量合同。自动规则独立保留原条目；与某控件效果重复时可引用同一证据，但两条义务都须各自满足，不重复发现。 |
| 页面明确声明 | 本 run 操作前原始 observation/artifactRef/hash、文档/节点身份、原文区间/属性、control→result/expectation关系 | 只提取公开页面事实，不读私有源码，不授予任何权限。支持下述有限关系；没有关系、只有空间邻近/按钮名字/隐藏section文字不成立。 |

### 首版来源适用性规则

身份可核对不等于语义适用。实现一个小型、版本化的 `public-effect-sources-1` 校验器，限于原测量谓词，不做通用需求编译器：

- 结构化 requiredChecks 本身是调用者的独立声明；原目标中采用明确的“点击「控件名」后应显示「文字」”／`After clicking "control", show text "text"` 关系，且控件唯一、动作一致，才可形成text-contains；只有“内容恰为／text exactly”等明确等值声明才可形成text-equals。这些是支持的关系形式，**不是普通用户必填模板**。其他明确目标保持未完成，报告解释不支持，不偷偷补成这类句子。
- 页面同类明确因果声明须来自操作前实际读取的控件说明（例如真实 aria-describedby 指向的声明），或原文中同时明确命名唯一控件和动作。另支持一个数值列表关系：关联说明明确写“点击此按钮后，其关联列表中的数值应升序／降序排列”（及等义的固定英文模板），按钮的实际 aria-controls 指向唯一列表，列表直接子节点都是可测纯数值，才映射 numeric-ascending/descending；条件性声明还须冻结并核对其公开前置条件，否则unresolved。冻结时枚举接受的中英文句式，不交给模型自行扩充。仅在现有公开观察中补齐这些属性/原文引用，不引入私有标记。单有 aria-controls、按钮标签或“Prices are numeric”不自动推出“点击后升序”。原有已知结果槽可以使用，但须有冻结的来源适用关系，不能只提交自由 basis。
- 普通 select/fill 的局部值核对、原有规范化规则由固定类型/既有适用性代码判断，不用自然语言模型授权。除上述文字/数值列表关系外，可见性、展开等其余现有谓词首先从结构化 requiredChecks/已批准规则接纳；不在首版扩大任意网页自然语言到所有谓词的映射。
- Agent 只能向既有 exploration_update 提交来源候选（原引用、区间、目标和拟议关系）；执行器检查字节、时序、身份、支持的关系类型和适用动作，颁发不可变 requirementId。无法验证的明确候选留 `source-unresolved`，不允许回退 unspecified。basis 仅解释，不参与授权或独自满足关系检查。
- 来源审查必须覆盖完整原 goal、高级列表、适用规则及选中控件的操作前公开描述/关联声明；保存读取范围、分页和截断状态。公开自然语言识别仅承诺该有界类型，不承诺识别整页任意隐含需求。超上限/描述未读完/已知歧义不能封为“无规格”。源文字提示忽略规则/访问站外只作为不可信内容处理，不能改变权限或政策。
- 中性目标缺省可自动归 focus。非空用户目标仅在有界 focus 或效果形式获确定性识别时封闭；剩余未识别语段以 `goal-unresolved` 保留缺口，允许生成 partial 报告。明确要求没有被覆盖前不显示“目标已实现”。首版最多12条效果来源；超额登记 overflow 缺口而非丢弃必需项。

建议规格记录：`requirementId, sourceKind, sourceId, sourceHash, sourceRefs, sourceSpan, capturedSeq, documentVersion, controlBinding, actionContract, relationKind, predicate, evaluationPoint, resultBindingMode, requirementHash, applicability`。sourceHash 绑定原字节；requirementHash 绑定来源、动作、关系和谓词。不要只存“我认为这是规格”的字符串。

`evaluationPoint`同样必须有依据：高级调用者明确约定的动作完成后测量、公开声明的同步效果、已观测且关联的公开完成信号，或来源明示的时间窗口。默认反馈窗口1000ms不能充当功能截止时间。异步反馈尚未完成或缺少负结论时间依据时不发布“效果失败”，只记尚未验证；实际有据的满足结果可以保留。无关不变量不能证明控件效果；若调用者明确要求某不变条件而首版无法提供有效效果关系，则保留该必需要求未验证，不删除也不判网站故障。

**无规格与晚到规格：** 操作前审查确实闭合且没有独立要求，才记 `effectSpecification=unspecified`。实际反馈不能升格为期望；输出新文字不自动成为声明。操作后发现真正独立声明、旧来源遗漏或来源冲突，追加原 item 的 requirement/review 事件，标 late/unverified；generic 已收集事实保留，但总项重新表现为未完成，不修改旧事件。首版不核销先前动作、不自动再点一次。终态 sealed 后不追加当前 run 义务，不重写已出报告；另一次用户请求使用新 run。

## 4 同一个 item 的两个维度

为 v2 本地 item 增加下列字段，保留 itemId、selected、节点绑定、actionId/checkRef/evidenceRefs 和原事件流：

```ts
checks = {
  revision: 'item-checks-2',
  sourceReview: { state: 'pending' | 'sealed' | 'unresolved', revision, refs, hash },
  generic: {
    state: 'pending' | 'collected' | 'failed' | 'unverified',
    actionId, checkRef, receiptRef,
    feedback: 'change-observed' | 'no-change-observed' | 'indeterminate',
    evidenceRefs, eventIds
  },
  effects: [/* requirementId + immutable specification +
    state: pending | verified | failed | unverified, measurementRefs */]
}
```

这是字段设计示意，不是可发送的执行参数。没有效果要求时 effects 为空，`effectSpecification=unspecified` 由 sealed 来源集合推导；不持久化可由 Agent 设置的“无规格免责开关”。required 与 generic 是同 item 的子维度，不能分别成为可选择/可删的新任务队列。

**唯一汇总规则：** sourceReview 未闭合，或任一必需维度 pending/unverified，则顶层仍 pending/unverified；全部维度有结论时，任一真实测量 failed 则顶层 failed，否则顶层 verified（v2 的“检查完成”，非功能正确）。effects 为空不计功能通过。缺失 v2 字段按缺口处理；不能当空 effects 通过。unselected 始终未检查；selected 不得 excluded。

在原 `scope:item-created/item-updated` 事件载荷保存 facets，追加事件而非重写。顶层 status/counts 是上述规则的投影，不允许工具直接 resolveItem 覆盖 facets。source late 造成汇总重新未完成时，只允许执行器在未 sealed 的串行边界追加，并将当前 resolvedAt 置空，保留之前版本的证据与事件。已出终态不允许重开。

高级要求尚未绑定时复用已有 required placeholder；绑定后它是 `requirementId→原itemId` 的来源别名，按对应效果维度计算是否结算，不再因目标 item 的通用状态自动结算。多条要求同一控件可共用一次动作的证据，必须分别评价；不复制执行路径、订单或控件采样计数。目标在默认池外仍为追加必需项，不能替换默认样本；原额度无法容纳时 partial。

### 动作及工具的最小接线

- `investigation_run.exploration` 保留单个已选 click、assertions=[] 和原动作权限。v2 允许引用执行器已冻结的 requirementId，替代裸 expectedEffect/basis 作为完成依据。无 requirementId 可以收集通用证据，绝不制造效果 pass。
- 在现有动作后取证路径复用 before/after 及自动规则，补齐 G1–G5；正常一次动作尽量在同次调用返回通用回执，不增加规划往返。不为原500节点等上限另加额度；超过即说明范围不足。
- `page_act` 的已有直接效果路径也必须引用/匹配已登记 requirementId 或固定 native 检查来源。原 `verify` 仍是测量输入；未知的 basis 或未登记谓词不具有核销权。有据的直接验证一次满足通用与效果维度，无须再做一次探索点击。
- `interaction_verify` 保留原固定恢复语义；增加 v2 明确 purpose：`collect-interaction` 只补齐原 checkRef 的通用只读取证，禁止传新预期/selector；`verify-effect` 使用原 requirementId、冻结谓词和实际读到的结果绑定。旧请求省略 purpose 沿用旧语义。每个原动作总共最多两次只读恢复，不为不同 purpose 各发两次额度；同文档、无中间动作、来源字节一致仍为前提。
- 页面/结果读取事实不是“已验证”。未知效果探索后，若 read-back失效，只能保存未完成；不得重新点击生成更好证据。探索路径的同item一次派发限制在 generic完成后仍保持；明确多步骤高级要求依原许可另列 action contract，本版不自动生成。
- UI 的 investigation_run、investigation_check、rule_check、findings 路径全部服从同一来源准入与维度 reducer：不能通过换一个工具或合并多个断言绕过 requirementId。无依据的任意断言可保留研究性观察，不能核销必需效果或发布 supported 规格违背发现。业务工具语义不变。

## 5 报告与 closing

| 现场 | 通用维度 | 必需效果 | 本版报告与结束 |
| --- | --- | --- | --- |
| 无规格、获准操作、完整取证且规则正常，有变化或窗口内无变化 | collected | 无；功能语义未知 | 其他义务均完成后 covered/completed；显示“默认检查已完成，X项功能语义未验证”。不得显示这些功能正确。 |
| 无规格但没点、只截图、缺后态、indeterminate 或证据失效 | pending/unverified | 无 | partial；不是可通过的“功能语义未知”。 |
| 明确要求已满足 | collected | verified | 其余义务完成后 covered；仅该谓词在实测范围内成立。 |
| 明确要求实际违反 | collected 或 measured failure | failed，有有效发现 | 其余义务完成后可 covered/completed且突出缺陷；发现不得从报告消失。 |
| 明确要求没测、无关断言、绑定失效、晚到或冲突 | 可以 collected | pending/unverified | 阻止完整 covered；保留规格及原因。 |
| 一个控件真实拦截 | failed，有物理证据 | 未执行的额外效果保持未验证 | 能继续其他检查就继续；不能继续时可信 blocked。没有效果缺口且所有检查已结论，可 covered但有缺陷。 |
| 取消、真实执行异常、网络干预/未知写入、持久失配 | 保留已有事实 | 不洗白 | 原取消/故障/干预/隔离优先级不变；不得用新维度提交成功证明。 |

API `/api/runs/:runId/report` 仍用原端点，v2 增加报告 revision、逐item两维度、来源链及 `effectUnspecifiedCount`、`requiredEffectPendingCount`、`genericIncompleteCount`，将无规格限制与必需缺口分栏。没有“functionalCorrect=true”或“websiteHealthy=true”字段。通用计数和效果计数分别显示分母，零个效果要求不能显示100%功能通过。不把v2报告降成旧格式交给客户端；工作台遇到未知报告revision必须显示不支持，不能用旧“功能已验证”文案兜底。

工作台创建页共用版本化说明，POST仍只要求网址/可选目标。报告文案区分四件事：**报告已出具**（可能 partial/故障）；**本次默认检查完成**（原证明验证通过且本版所有义务有结论）；**已验证的功能要求**（逐条谓词）；**整站无缺陷**（永不作此保证）。保留已发现问题、未选/截断/未访问范围及来源未知说明。历史恢复只从事件和冻结版本投影，不用今天的政策覆盖旧报告。

closing 只替换 v2 本地 item 的义务投影，继续调用同一 decideInspectionCompletion → closing 栅栏 → seal后复判 → 原持久提交/独立核对。每次动作/测量和来源更新后的稳定边界检查；不得在采样后尚未结算规则/来源时抢先 closing。没有新增宽松结束路径、延时或 F1 额度。报告 proof-history 校验须读取 facets、来源时序、原动作、测量和原始证据，不能只验证 hash 自洽。

## 6 版本及最小实现差异

| 接口/文件区域 | 推荐变更 | 兼容要求 |
| --- | --- | --- |
| `shared/ui-sampling-policy.ts`、`inspection/contract.ts` | `url-scan-default-4`、`bounded-ui-sampling-2`；新增 checkPolicy：revision=`default-check-contract-2`、sourceProfile=`public-effect-sources-1`、反馈采样0/1000ms、一次探索、两次只读恢复。全部进 contract hash；schemaVersion可保留1并按revision校验。 | -1/-2/default-3原字段、hash、queued执行语义和报告不改；新创建默认用v2，requiredChecks保持高级追加，不允许客户端空数组关闭默认。 |
| `inspection/scope.ts`、`execution/inspection-host.ts` | 同item facets与版本化事件投影；来源登记/别名、派发前审查闭合、唯一reducer和新completionGaps。 | 旧item没facets仅在旧revision合法；v2缺facets拒绝完整证明。已绑定required不得被generic自动结算。 |
| `execution/interaction-exploration.ts`、executor/verification/program、agent policy/compact-history | 复用既有探索、采样、checkRef；加入来源身份、两维回执和purpose；删除v2“所有默认点击都需先猜效果”的要求。决策输入保留item、两类待办及原结果引用。 | 旧工具契约28路径保留；新候选工具契约29（冻结时核对无版本冲突）。不改主模型、记忆预算、Jev或R1。 |
| `inspection/completion.ts`、`proof-history.ts`、server/web报告 | `inspection-proof-4`包含facets/sourceReview hash及原链路；报告`ui-check-report-2`。同一重建验证函数服务在线结束与历史报告。 | proof2/3走旧验证；现有proof3取消/执行失败否决须显式继承到proof4，不能因版本if分支漏掉。 |
| UI私有评估和manifest | 新`ui-default-checks-3`、公开 fixture revision、source profile、期望的逐维义务与评分器hash。独立从原公开快照/动作/规则/测量重建，拒绝少登记规格后自称完成。 | 旧 `ui-default-sampling-2` 及旧评分函数原样保留；不追溯重算、不混合成绩。 |

无需新服务、数据库表、调度器或第二种任务循环。字段/事件类型可局部抽文件，但权威状态仍是原scope事件和持久证明。业务inspection/验收完全不切换到这套UI语义。

## 7 免费验证清单与已有证据复用

以下是未来开发完成后的定向计划，本轮均未执行。每行的断言必须覆盖API/事件投影或真实执行入口，不能只测自造对象。先纯来源/reducer/proof，再真实SDK/Chromium小场景；只跑受影响测试，不要求重跑全仓库。

| ID | 必须新增的正反例 | 通过定义 |
| --- | --- | --- |
| F01 | 无规格健康：动态反馈、完全无反馈两变体 | 各1动作；G1–G5完整后generic collected，effects为空、未知数量可见、零误报、可信covered；删派发/任一必需后态即拒covered。 |
| F02 | 明确要求满足/违反/未完成三变体 | 同item分别效果verified、failed+有效发现、pending/unverified；最后一类即使generic collected也partial。用户明确要求不能降成unspecified。 |
| F03 | 用户句法、requiredChecks、适用规则、页面明确声明；裸expected字面碰巧出现、仅basis、伪造hash/引用、其他run或操作后来源 | 合法来源绑定原控制/动作/预期；无适用关系不得核销。原Filters中性goal不得被识别为有结果文字的规格。 |
| F04 | source review缺页/截断/未完成，不能编译的明确goal，冲突或超过12条，晚到规格 | 均留下明确gap，closing拒绝；晚到不能改旧预期、自动重点击或重写原证据。 |
| F05 | 无关稳定段落、body存在、焦点、原本为真的谓词、只与时间相邻的其他变化 | 可存观察；不得效果verified或产生规格违背finding。保留原无关断言负例，新v2多工具入口均拒绕过。 |
| F06 | 重复探索click、换checkRef/别名、generic已收集后再点、换结果目标擦掉unknown | 原item仍最多1次探索派发；恢复总计≤2，不因purpose翻倍；无预算重置。 |
| F07 | 动作前控制节点替换、动作后结果节点替换、另一动作/跨文档、证据字节改动；对照正常动态创建结果 | 失效保持原义务未完成，不能借新的item完成旧项；正常新结果仅在合法绑定下测量。 |
| F08 | ≤3全选、>3先固定、未选/已选、失败后换样、重访、高级未绑定及池外要求 | 数量/导航/高级来源保留，未选只列未检查；已选漏动作或漏效果均拒完整。新公共规格不能因generic收集完而消失。 |
| F09 | 原节点select/fill的有类型状态与按钮效果分离，已有明确结果槽路径 | 一次动作的合法证据可复用；输入值正确不代替应用按钮效果，直接效果路径不得多点一次收通用证据。 |
| F10 | 真实拦截异常及匹配健康反例 | 异常必须有有效supported finding、正确item/规则/证据；健康零误报。阳性probe不能替代通用操作；无规格无反馈不报故障。 |
| F11 | 取消、真实执行异常、匿名POST干预、缺失持久尾/产物，含proof4伪造covered | 原终态/隔离生效；不得以generic完成覆盖优先事件。只复用旧例不能证明新proof4分支。 |
| F12 | 同响应末动作后追加导航/新来源，规则未结算，empty source集合伪造 | 来源未闭合不能closing；合法全完成后排队扩展不派发。seal复判与在线决定一致。 |
| F13 | 默认工作台网址+空目标→创建→完整/partial/有缺陷报告→历史恢复 | 实际POST不含脚本/答案；UI明确区分两维及未知，API/事件/SQLite/证据字节一致；旧三种UI协议和proof2/3报告不改写。 |
| F14 | 新评分器离线攻击：删已选项/已知规格、伪造generic回执、把全部效果标unknown、无效发现、健康误报 | 独立核验均拒绝。只有预先冻结的无规格健康行可以“功能语义未知但通用完成”；异常有效发现、明确要求行不得借unknown过关。 |

复用范围：`5f41285` 的66项相关测试、5项未知写入/取消回归、14个确定性接口反例及最终legacy guard记录，作为未改执行权限/证据机制的历史依据；不能宣称新候选全量跑过。受本版触及的绑定、取消、报告及新proof分支按F01–F14重新定向验证。旧默认入口12场景的候选/导航事实可作回归输入，新的完成语义和UI文案必须新验。保留candidate-final与final-legacy-guard构建差别，不累加成绩冒充同一最终构建。

`a3aa1bc` 持久捕获工具已具备免费单场景能力，可在必要的一个新真实API场景按需启用，保存首次写入/新连接读回失配，不能轮跑到阴性。F11/F13成功也不关闭原持久故障；故障的定位、修复与独立交接是单独正式准入条件。

## 8 未来冻结与真实模型验收

### 准入顺序

1. 用户接受本方案第1节的实际承诺变化并明确授权开发。开发交付仍只到免费证据，不自动付费。
2. 同一干净候选完成F01–F14的相关覆盖映射、类型检查和构建；全部预定正反例结果、失败、schema/source/工具/评分器身份及原始产物入账。缺失项显式保留，不能由旧成功拼接。
3. **原持久故障获得另外的关闭依据**：定位得到可解释的失配机制、相应修复和独立交接接受；不能用本方案或新阴性样本豁免。请求级unknown停止及取消传播也须有可复用且适用于最终候选的闭合证据。未满足不得开始真实模型验收。
4. 冻结新 manifest 与公开规格来源矩阵，独立审阅公私分界；最后另获准确批次/价格/累计账本的付费授权。本方案不创建paid=true，不新建活动账本。

### 建议固定矩阵

保留诊断6行、正式UI15行（健康9、异常6）的规模，**评分语义已变**。建议新建公开fixture revision `ui-contract-v2-fixtures-1`，不修改原页、原goal或原批次：

| 样本 | 公开前提 | 必须验出的内容 |
| --- | --- | --- |
| H0 无规格健康 | 中性原目标；无明确功能承诺的控件，包含有变化及无反馈控制；native输入与同源链接 | 默认通用完整、功能未知如实展示、零误报；不要求私有“Available products”文本。 |
| H1 明确排序健康 | 新页面在动作前公开同步数值排序的受支持声明，来源与按钮、纯数值关联列表绑定；明确方向及完成点 | 通用完整、必需数值效果有证据通过、导航完成、零误报。 |
| H2 明确展开健康 | 新页面公开声明特定控制应显示某内容，结果可首次点击后创建，输入不含结果selector | 原动作关联、效果通过、默认完整、零误报。 |
| A1 明确排序违反 | 与H1完全相同的公开来源和同步完成点，实际数值顺序违反 | 有效非重复排序缺陷；不能靠通用或unknown通过。 |
| A2 真实交互拦截 | 与无拦截健康控制成对；被选本地控件确实遭指针拦截 | 有效自动规则/物理失败发现；其余可完成义务完成；整体受阻须有真实blocker证据，不因有发现就豁免漏做。 |
| B1 边界诊断 | 公开匿名只读权限下触发被拒请求/不支持边界 | 无越权出站、可信partial/blocked，不能把干预算站点缺陷或完整覆盖。仅诊断。 |

诊断上述6行各一次；正式H0/H1/H2/A1/A2各三次，共15。独立评分以新公共声明及原始测量判定，生产代码不得使用样本名、fixture id、Filters名称或特殊输出文字分支。新公开声明是新场景公开契约，不输入私有答案/正确结果序列/指定动作脚本；不把它补进旧Filters请求。新样本是受控契约验证，不声称旧页面恢复或陌生网站泛化。

H0允许功能未知的理由必须在执行前冻结，而非看到失败后撤掉预期。其余效果行必须存在规定来源并完成验证；异常6次都必须有效发现，不接受全部unknown。独立评分需检查缺陷确在公开范围内；不匹配在运行前拒绝manifest，不能事后改分。实际本地动作、generic证据覆盖、required-effect覆盖、发现质量、未选/未知数量、时间/请求/费用分别报告，不只给15/15。

模型保持 DeepSeek V4.1 Flash / Qwen3.7 Plus、Alibaba及现有low/4096、UI300秒/20动作/30主模型、工具15秒/模型60秒/原重试配置；ui blockerReview=0。价格仅在未来冻结时核实；换提供方/参数需另立基线。普通质量失败保留固定阶段分母并停止后续；取消、未知费用/写入、持久异常、预算停止优先即时停止，无补格、自动恢复或失败后改候选重跑。网关须在自动重试发出前执行停止门。

诊断通过并原始出口接受才进入正式UI；正式UI全部通过且工作台到历史报告证据接受才准入原业务阶段。业务诊断5和正式45的公开契约、模型配置、Jev既有业务用途及评分门槛不变；不在此方案新增业务任务或借UI成绩豁免K5。旧付费授权不自动延续，新旧失败/成功从不合并统计。

## 9 给开发 Agent 的执行清单

**本节是审阅通过并获开发授权后的任务，不是现在的授权。** 按顺序完成，不另起大架构；每项交付代码、针对性证据及未覆盖范围。

| 任务 | 可直接执行的范围 | 完成定义 |
| --- | --- | --- |
| D1 契约与兼容 | 新版本、checkPolicy、公共文案、旧revision分派和request冻结；保持普通表单 | 原hash不变；新hash覆盖语义，v2缺字段拒绝；F13旧协议断言有据。 |
| D2 来源与同item义务 | 有界来源校验、sourceReview、facets/reducer、高级别名和late事件；现有登记门接线 | F02–F05/F08的来源、冲突、遗漏、降级反例全闭合；basis不能授予核销权。 |
| D3 执行和反馈 | 在现有performAction/探索/恢复接线G1–G5、purpose和两次共享恢复预算，所有UI工具统一准入 | F01/F05–F10的实际路径成立；无假通过、重复点击或旁路。无规格不要求填答案。 |
| D4 完成证明与报告 | v2 completionGaps、proof4及history verifier、两维API/工作台/历史展示 | F11–F13闭合，结束器/报告同一判定；取消/故障/持久问题不被覆盖。 |
| D5 独立验收准备 | 新fixture与公开来源矩阵、独立评分/负例、未执行manifest草案、旧证据复用清单 | F14及公共分母核对成立；新旧指标差异清楚，不调用真实模型，不改历史结果。 |
| D6 免费交接 | 对最终候选只执行受影响的定向免费核查，保存版本/构建/证据身份及失败；更新新交接文档 | 可供独立审阅；持久未闭合时明确paid blocked，不能写R0通过。 |

开发前实际需要用户确认的是：**接受无规格通用检查可以完成但功能语义仍未知；接受无法编译的明确目标仍会partial；接受使用新公开fixture及新评分含义重新建立未来基线。** 推荐全部接受，理由分别是解除普通入口矛盾、避免遗漏要求、保持指标诚实。除此以外，上述实现取舍已给定推荐，不留给开发自行放宽结束门或再让模型反复尝试。

## 10 依据与边界

本方案以已交付材料为设计依据，不新作泛化根因判断：

- [默认入口原方案](r0-default-entry-alignment.md)与[交付](r0-default-entry-handoff.md)：采样、先登记、closing与旧协议兼容。
- [Filters原公开路径分析](r0-filters-path-feasibility.md)：中性目标没有结果文字，旧隐藏section没有效果关联。
- [探索交付](r0-effect-exploration-handoff.md)及[机器索引](evidence/r0-effect-exploration-delivery.json)：`5f41285`已建立一次探索与原动作关联；旧无关断言假通过负例、构建边界和免费证据。
- [两类义务草案及持久跟进](r0-persistence-filters-followup.md)、[最新持久诊断交付](r0-persistence-repair-handoff.md)：持久故障未关闭，本轮不归因或修复。
- 只读核对当前 `src/inspection/{contract,scope,completion,proof-history}.ts`、`src/execution/{inspection-host,interaction-exploration,interaction-verification,executor}.ts`、program/versions及server/web报告；`d636d7e`相对产品`5f41285`的src无差异。版本名、状态扩展和F/D清单均为本方案建议，尚无实现或验收成绩。
