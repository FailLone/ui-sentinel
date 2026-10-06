# 下一轮开发任务书：主动视觉发现与输入区域聚焦验证

状态：P0–P2 ready；P3 已由主 Agent 复查修复并完成 G0–G3 免费验收，证据见 [P3 交接](visual-focus-p3-handoff.md)，分支 `review/visual-focus-p3`。P4 真实模型联合验收尚未执行。历史结果见 [P1 交接](visual-focus-handoff.md)、[P2 交接](visual-focus-p2-handoff.md)。P3 的规范仍为 [任务书](visual-focus-p3-plan.md)和[逐项验收](visual-focus-p3-acceptance.md)；沿用 [开发约定](../docs/development.md)。

上一轮业务契约已完成，结果见 [归档交接](archive/business-contracts/handoff.md)。652测试及45/45是上一轮基线，不能算作本轮验收。先核对实际HEAD、干净工作区和模型配置，再开发。

## 1. 本轮要证明什么

在没有“输入框太窄”“点击边缘”提示、没有目标selector、没有对应规则的情况下，Agent能从真实页面截图提出一个输入区域交互疑点，选择目标，通过普通鼠标点击验证，并报告可复核的发现。

具体例子：视觉上连续的浅色输入区域很宽，真正可聚焦的input只占中间一小块。用户点击看起来属于输入区域的留白，输入框却不聚焦。截图负责提出视觉假设，DOM和实际交互负责验证事实，两者不能互相冒充。

本轮采用同一个购物业务：在产品列表页增加一个可选的本地商品搜索区域，视觉检查结束后继续原购买路径。问题仅影响点击聚焦，用户仍可点击真实input使用搜索，购买必须保持可完成。不引入第三种业务、纯页面任务完成语义或新的业务结果枚举。

最终产物：有界视觉候选、原子聚焦调查工具、真实点击证据与标注、报告展示、私有正反例靶场及可重复验收。**不要求把新发现立即编译成规则**；复用现有假设/发现存储，后续规则批准流程保持不变。

## 2. 范围与不做的事情

- 保持Mastra、Playwright、Midscene/Qwen、DeepSeek、Hono/libSQL、React、Biome。Qwen视觉理解是现有模型的新用法，不换框架或筛选模型。
- 只支持主frame中可见、启用、可编辑的原生 `input[type=text|search]` 与同一视口内的矩形候选。iframe、shadow DOM、contenteditable、canvas、旋转/复杂变换、跨视口区域均明确unknown/unsupported。
- 不实现后台视觉worker、并发页面写入、全站抓取、登录、远程部署、PRD/Figma导入、任意URL接入、自动规则批准。
- 不改已有规则对遮挡、等待时限及未知结果的边界。聚焦回执不能证明视觉遮挡、点击处理器的全部业务语义或整个页面无缺陷。
- 不继续做性能优化实验；仅记录此次耗时/费用。保持原模型、提供方、调用及时间上限。

## 3. 开工必读与模块归属

| 位置 | 本轮需要理解/修改的责任 |
| --- | --- |
| src/execution/vision.ts | 当前仅Midscene定位，不能据此声称已有自主视觉发现 |
| src/execution/browser.ts | 截图、证据ID、持久化与标注；不得把本机路径作为模型可自由读取的参数 |
| src/execution/observation-version.ts | 含text input页面被普通缓存视为不可复用；本轮不得为方便扫描放开该缓存 |
| src/execution/executor.ts | 初次观察、模型预算/事件、单写队列、工具注册、动作计数、取消及结束 |
| src/execution/temporal-investigation.ts | 原子调查、绑定身份、保存回执的模式；聚焦不是时间窗规则，不硬塞现有condition |
| src/execution/task-state.ts / finish-contract.ts | 假设生命周期、未验证范围和完成保护 |
| src/execution/side-effect-policy.ts / evidence-integrity.ts | 调查期间只读网络边界、干预后不能形成受支持结论 |
| src/agent/policy.ts / model/request-tracker.ts | 视觉候选的指令层级、统一模型计量，不重复观察或无限调查 |
| src/server/reports/run-report.ts / src/web/main.tsx | 报告持久化恢复、展示原图/标注/采样明细 |
| arena/checkout/src/App.tsx 及其产品列表组件 | 本地搜索区域；原购物流程保持原样 |
| evaluation/private/controller.ts / evaluator.ts | 原C0–C5真值和评分保持不变；新视觉评分独立放置 |
| evaluation/support/model-gateway.ts / build-identity.ts | 真实视觉请求、费用/未知预留、版本冻结、停服审计复用 |

建议新增 `src/execution/visual-discovery.ts`、`src/execution/focus-probe.ts` 及就近测试；语义类型与schema集中到一个模块。复用现有证据、预算、报告组件与验收公共模块，不在executor中继续堆数百行算法，不复制网关/评分/审计实现。

## 4. 冻结的行为契约

### 4.1 能力开关和调度

新增 `EXECUTION_VISUAL_DISCOVERY=1` 显式启用本能力，产品默认关闭。旧记录无该字段仍按旧行为解释。把本次是否启用及算法版本保存至run或持久事件/报告，不在查看旧报告时读取当前env推断历史。

启用时，在首次稳定页面观察后、首次常规Agent决策前安排一次视觉扫描。扫描是执行循环中的有界只读阶段，不开后台线程，不允许Qwen操作页面。候选作为结构化上下文交给DeepSeek；DeepSeek负责是否调查、语义绑定和后续路径。

每run最多2次视觉扫描，第二次仅用于第一次采集在请求期间失效后的重新采集。每次是真实模型调用，计入与DeepSeek/Jev共用的30次验收调用额度和300秒任务时限；Qwen不另设隐形自动重试。请求超时不超过现有60秒及剩余任务时间。扫描不放进一个悄悄突破15秒工具时限的同步工具中。

没有稳定图像、模型失败或两次均失效：记录明确未验证范围，不假称完成视觉检查。`candidates=[]` 是有效模型结果，但仅表示这次有限扫描未提出疑点，不表示页面无缺陷。

### 4.2 截图与视觉候选

使用真实viewport截图。固定截图scale为CSS像素，或持久化经过验证的image pixel到CSS viewport变换；不得混用DPR、fullPage坐标、滚动偏移。图像尺寸、viewport、scroll、document epoch、截图SHA与采集时间由服务端记录。页内文本是数据，不能更改任务或让模型访问别的地址。

P2 真实 smoke 发现 Qwen 返回 0–1000 坐标，现明确分离模型传输与持久候选：模型必须声明 `coordinateSpace: normalized-1000`，服务端按已验证的 CSS viewport 宽高分别乘以 `width/1000`、`height/1000`，先验证原始范围，再验证转换结果；保留原始响应和转换元数据。Agent、探针、持久候选仍只使用 CSS 像素。不得从 DOM/预期答案推断单位或裁剪错误框。该变更版本为 `visual-focus-3`。

Qwen只收到这张原始截图、当前公开目标和简短结构化输出要求。不得把DOM实际input宽度、私有case/答案、隐藏样式、建议点击点喂给视觉模型来假装看出了区域。DOM绑定在候选产生之后发生。

建议输出契约（服务端严格schema校验，上限不依赖提示词）：

```ts
interface VisualCandidate {
  id: string                  // 服务端生成
  kind: 'input-focus-region'
  observationId: string       // 服务端绑定到本run和截图
  screenshotRef: string       // 当前run拥有的证据ID
  perceivedRegion: { x: number; y: number; width: number; height: number }
  targetDescription: string   // 可见语义，最多300字符
  visualBasis: string         // 哪些视觉线索让该区域看起来像输入区，最多800字符
  excludedRegions: { x: number; y: number; width: number; height: number }[]
  confidence: 'low' | 'medium' | 'high'
}
```

单次最多2个候选，最多4个排除区域，所有数字有限、尺寸为正、框在截图内。模型不得指定ID/路径/页面操作/最终verdict。去重后持久化，原始图和响应引用必须可追溯。越界/非法输出整体拒绝，不通过裁剪成“看似合理”区域掩盖错误。low候选可以供Agent解释，但不直接产生supported finding。

本轮候选类型预先限定为输入区聚焦，不宣称能发现任意未知类型的体验问题。Qwen应识别“看起来可点击并聚焦的输入区域”作为待验证候选，无需从像素先证明真实input太窄；视觉完全相同的缺陷页和修复页理应产生相近的候选，实际交互才能区分。不能要求模型在点击前猜中最终答案。

候选只是一种视觉推断，不是已验证缺陷。报告始终区分“模型认为的视觉输入区”和“实际点击/焦点事实”。

### 4.3 绑定与原子调查工具

新增Agent工具 `focus_probe`，输入只允许：

```ts
{ candidateId: string; elementRef: string; bindingReason: string }
```

候选必须属于当前run、当前有效观察；`elementRef`必须绑定到唯一原生输入节点，绑定说明解释其与截图候选的关系。不得接受任意坐标、selector、URL或模型自行提供的expected结果。执行器从保存的候选和绑定节点派生点击点。

工具按原子调查模式一次完成：注册有依据的假设（trigger=always）→验证身份/状态→实际点击→保存测量→保存/解决假设和发现→返回简洁结果与下一步指引。不要要求Agent拼接多个低层工具才形成一次调查。每run最多2个候选调查；同candidate/node/有效状态重复调用返回原回执，不重新点击、不重复发现。状态改变后不得复用旧回执。

进入调查前验证：同document/URL/scroll/viewport；目标仍是原DOM节点、可见可编辑；候选与目标具有明确空间/语义联系，且不是含多个不相关控件的大容器。候选区域不得包含未排除的button/link/submit等危险控件。控件身份不明、禁用/只读、有遮挡、区域混杂等均unknown，不能通过换近似节点、force点击绕过。

### 4.4 真实点击与焦点重置

**关键反例：input已经聚焦时，点无效留白也可能继续聚焦。不得将这个结果计作点击成功。**

每个采样点都从“目标未聚焦”的已验证基线开始。仅通过已观察且验证适合的中性页面区域做普通点击清除焦点；不能调用DOM `.focus()` / `.blur()`、dispatchEvent或改CSS来构造通过结果。找不到安全中性区域则unknown。中性点击本身也记录、计入action预算，并验证没有引入导航、写入、表单值变化或影响区域的状态变化。

固定、版本化的有界采样策略：

1. 原生input内部点作为正向控制，普通click后应在500ms内聚焦到该同一节点。
2. 在视觉候选内派生左右各一个内部点（距框边至少4 CSS px，优先横向12%与88%），跳过明确排除区及危险区域；不得只测DOM输入框内。
3. 如果存在非聚焦点，最多再复测第一个失败点一次；若没有两个有效边缘点，本轮unknown，不临时移动到更容易通过/失败的位置。

最多4次采样点击，每次最多1次中性重置，总计最多8次普通点击。每次实际鼠标点击都计入原40次action额度，**不是整个工具算一次**。预留足够action和15秒工具时间后才开始；没有预算则不启动半套检查，明确unknown。500ms是本轮“及时聚焦”的测量窗口，不宣称所有应用都应永久服从该阈值，报告中必须写明。

每点记录：CSS坐标、实际hit元素摘要、点击前后activeElement身份、焦点事件/时间、input值是否改变、document/node身份、完整性状态。label或容器事件代理把焦点正确转交input是健康行为，即使hit元素不是input也必须通过。

### 4.5 状态一致性与安全

表单页面的普通观察缓存目前明确不可复用。为本探针做专门的短时一致性检查：记录document/node身份、目标与候选布局、viewport/scroll、相关值及候选区域结构，在截图返回后、绑定前和各次点击前后复核。正常focus样式/activeElement变化是测量对象，不可用简单全页hash差异让所有正常点击都失效。非预期布局/节点/值变化、中途导航、动画或无法追踪的表面一律unknown；不得因此放宽通用观察缓存。

调查期间沿用现有单写队列和只读网络限制，页面点击仍可能触发事件，不能宣称“聚焦探针天然无副作用”。任何被拦截的写入/弹窗/跨域请求必须记入EvidenceIntegrity；有干预的测量不得supported/refuted。未知写入结果继续原有隔离和停止规则。finally恢复策略；不能通过重新观察清除干预记录。

取消、deadline和run关闭时取消在途模型/探针；迟到响应不得新增候选、发现或执行鼠标操作。保留已发生操作和失败用量。

### 4.6 结论和报告

- `supported`：非low的可信视觉候选、明确唯一绑定、稳定且干净证据、正向控制成功，至少一个候选内部点在两次独立未聚焦基线下均未于500ms内聚焦。结论限于“这些测点与该视觉假设存在可复现的不一致”，默认warning。
- `refuted`：正向控制及两个有效边缘点均成功，且证据完整；仅反驳该候选的已测范围，不能说整个区域所有像素都正常。
- `inconclusive`：基线无法建立、正向控制失败、坐标/身份失效、证据受干预、采样不足、unsupported或耗尽预算。保留未验证范围，不冒充健康。

所有supported/refuted必须引用当前run拥有的原图、候选、聚焦测量及标注。新增typed receipt校验：旧的“截图+任意snapshot”不能用于提升本类假设；Agent换标题、改措辞或调用旧findings_submit也不能绕过测量门槛。对其他类型发现保持原行为。

标注从原图生成派生证据：视觉候选用虚线框，实际input用另一种边框，点击点区分成功/失败/未知并带图例。**不能把整个候选框涂红并声称其全部遮挡或不可点击。** 保留原图hash，派生图与点坐标可核对。通过现有浏览器/SVG覆盖层实现，不引入新的图像生成模型。

Web报告可查看原图/标注和逐点结果，刷新或服务重启后仍一致。最终业务结果继续由真实购买事实决定：非阻断视觉warning可与completed/success并存；不能因为发现一个输入问题就伪造购买失败。未验证视觉分支按既有覆盖机制报告。

## 5. 靶场边界

在现有购物产品列表增加本地搜索组件，通过独立私有控制接口切换新视觉fixture。正常C0–C5完全不启用新组件；原public variant协议和评分答案不改变。新case名称、ground truth、bbox、点击有效区不得出现在浏览器可读API、HTML属性、日志、目标文本或Agent上下文中。

页面提供正常商品搜索能力；可清空搜索，不发业务写入，所有fixture继续完成同一个C0正常购买流程。私有reset须同时恢复购物状态、视觉配置、搜索值和采样日志，防止跨轮残留。浏览器不能访问私有端口/token。答案由私有fixture定义，评分不能信任被测Agent自己的bbox/verdict。

六例及正反例要求以配套验收计划为准。主Agent维护未参与提示调试的holdout；运行Agent始终只通过正式API与页面访问。

## 6. 交付顺序与review节点

### P0：冻结接口与基线

读上述模块，记录HEAD、现有测试数量、已有耦合与风险，建立 `plans/visual-focus-handoff.md`。先确定候选schema、探针回执、坐标约定、预算和假设提升校验，不能先写一大套界面。检查git状态；禁止提交.env、模型原始数据、DB或本地维护归档。

### P1：一条最小端到端路径，提前review

实现一个缺陷页面D0及其修复H0、候选存储/绑定、focus_probe、typed receipt和最小报告。先用明确标注的本地固定视觉响应做免费预检（真实浏览器/SDK/API），验证8次点击计量、已聚焦假阳性、容器代理健康对照及取消。

P1完成后提交这一小段，交主Agent review。**这是刻意设置的实现审查节点，不要求用户批准常规代码或付费请求。** 主Agent审查接口和证据语义后再扩展P2/P3；等待期间可整理测试清单，不能自行声称已审查或复制扩展错误模式。若单个dev任务不能获得审查反馈，清楚交付P1记录和待review状态，不假称全轮完成。

### P2：真实视觉发现与完整正反例

接入同一Qwen的真实截图理解；可使用已有OpenAI兼容SDK，复用请求计量/取消/凭据约定，不把Midscene定位调用当作发现。加入有界调度与DeepSeek候选上下文、完整六例和安全反例。原有规则仍按原时机使用，不能以视觉扫描替代已知检查。

### P3：验收工具与报告

按 [P3 任务书](visual-focus-p3-plan.md)实现命令、独立评分器、共享持久费用台账、全部样本及停服审计，补齐报告与免费 G0–G3。报告含范围限制、证据完整性、每次点击和视觉费用；摘要上下文只放候选和结论，原图/模型原文由证据ID按需读取。P3 仅执行免费验证，正式运行器用本地固定模型测试；真实 G4/G5 留到 P4，不以历史 P2 smoke 替代。

### P4：冻结并真实验收

本轮按 [P4 执行清单](visual-focus-p4-plan.md)推进，新 holdout 与旧回归分开保存，先真实诊断再启动正式矩阵。

免费门槛 → 三例真实诊断 → 修复后重新冻结 → 六例各三次完整18轮 → 同构建旧业务45轮回归。所有变更按配套计划决定重跑范围，不能拼分。提交准确结果与未决项，交主Agent最终review、更正。没有完成真实验收时不得写accepted。

不在日常每次改动后跑63轮；局部修改用针对性测试。最终候选只运行一次完整所需矩阵；失败后分析再决定必要修复，保留全部批次。禁止盲目重跑到碰巧通过、放宽私有评分或悄悄扩大模型预算。

## 7. dev交付要求

P0–P2 原开发分支为 `dev/visual-focus-discovery`；P3 原开发分支为 `dev/visual-focus-p3`，主 Agent 的修复交付分支为 `review/visual-focus-p3`。后续从已验收的交付提交继续，不从旧 P2 基线重做。阶段性commit并push开发分支，不自行合并main。主Agent最终负责review和合并。新代码必须有对应的有意义边界测试；避免实现镜像测试和大规模无关重构。

交接至少写：base/head、P0–P4状态、命令与退出码、完整/局部验收区别、构建hash、模型/提供方/flags、成本及未知预留、全部失败目录、发现与漏检、证据路径、未完成项、review反馈和处理结果。P1提交和最终提交都应能独立构建、复验；不能交付只在本机隐藏文件里存在的必要输入。
