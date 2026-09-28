# 主动视觉发现：开发交接（P0 冻结接口与基线）

状态：P0 进行中。依据 [任务书](next-development-plan.md) 与 [验收计划](visual-focus-acceptance.md)。
分支 `dev/visual-focus-discovery`，base `c41188a`（main @ 2026-09-28）。

任务书写的代码基线是 `c789a20`；它是 `c41188a` 的祖先，而 `c41188a` 只改文档与 README，
不触碰 src/evaluation/arena/scripts，故基线有效。实测 HEAD、干净工作区、测试数见下。

## 1. 基线（实测）

| 项 | 值 |
| --- | --- |
| base / HEAD | `c41188a` |
| 工作区 | 干净 |
| `pnpm test` | 73 文件 / 652 测试通过（与任务书所述旧基线一致） |
| 本能力现存实现 | 无（src/evaluation/arena/scripts 中无 `EXECUTION_VISUAL_DISCOVERY` / `visual-discovery` / `focus-probe` / `focus_probe`） |
| 靶场搜索组件 | 不存在（`arena/checkout/src/pages/ProductList.tsx` 无任何 search/input） |
| 工具契约版本 | `25`（`src/execution/versions.ts:23`）→ 新增工具须升 `26` |

预算默认值与任务书一致：`totalTimeoutMs 300_000`、`maxActions 40`、`toolTimeoutMs 15_000`、
`modelRequestTimeoutMs 60_000`、`modelRequestMaxRetries 1`，全部经 `bounded()` 硬上限约束
（`src/shared/config.ts:48-55`）。

**已记录的既有偏差（不在本轮范围，不得顺带"修好"）**：`config.ts:51`
`maxModelCalls: bounded('RUN_MAX_MODEL_CALLS', 40, 60)` 代码默认 40，而 `.env.example` 与任务书写 30。
该偏差当前不生效（无该环境变量，且正式 runner 显式传预算）。本轮不主动改动它。

## 2. 两个必须先解决的实现缺口

P0 侦察定位到两处"计划要求的东西现在不存在"，它们决定 P1 的形状。

### 2.1 动作计量粒度：现在是"每次工具调用一次"，计划要求"每次点击一次"

- `usage.actions` 全程只在一处自增：`executor.ts:1525`，位于 `performAction()` 内。
  粒度是**每次 `performAction` 调用一次**，与底层发生几次真实浏览器交互无关。
- 预算是"先比较后抛错"，不是预留：`executor.ts:1448`
  `if (usage.actions >= budget.maxActions) throw new Error('budget-exhausted')`。**没有预留 API。**
- 任务书 §4.4 要求：最多 8 次普通点击（4 采样 + 最多 4 次中性重置）**每次都单独计入原 40 次额度**，
  并明确"不是整个工具算一次"；且要求**先预留、预算不足则不启动半套检查**。
- 结论：`focus_probe` 不能依赖现有"最后自增一次"的模式。P1 必须提供一个显式、可测的计量原语
  （`ActionBudget.reserve(n)` / `consume()`），使 `focus_probe` 每次真实点击都经过它；剩余额度不足 8
  时**一次点击都不发**，直接 inconclusive。
- **风险控制**：`executor.ts` 129KB / 652 测试，改动 `:1525` 属高风险。倾向在新模块内实现带计量的
  点击助手，由它持有预算回调；P1 用测试证明 N 次点击恰好消耗 N 次额度、额度不足时零点击。

### 2.2 不存在"按类别"的 typed receipt 门禁

- 当前提升门禁只有 `assertUnmodifiedEvidence`（`run-manager.ts:246-284`），由 `submitFinding`
  (`:288-289`) 与 `updateHypothesis` (`:367-370`) 在 supported/refuted 时调用；**唯一检查**是证据完整性
  干净（`cleanEvidenceIntegrity`，`:277-283`）。
- `findings_submit`（`executor.ts:2402-2491`）额外要求属主、非空测量、规则一致性，以及 supported 需
  "至少一张 screenshot + 一个 snapshot|measurement"。**这些都能被"通用截图 + 任意 snapshot"满足**，
  正是任务书 §4.6 明令禁止的绕过路径。
- 结论：P1 必须新增**按类别**的门禁。设计见 §4.4。仅靠"`focus_probe` 自己保存 finding"不够，因为
  §4.6 明确要求"换标题、改措辞或调用旧 `findings_submit` 也不能绕过"，故 `findings_submit` 侧必须
  主动拒绝缺 receipt 的该类假设。
- **附带观察（既有行为，本轮不静默修改）**：`assertUnmodifiedEvidence` 会对不属于本 run 的 ref
  静默跳过（`run-manager.ts:274` `if (!refs.has(...)) continue`）。`findings_submit` 用自身属主检查补偿，
  但 `updateHypothesis` 路径没有。新 receipt 设计不得单独依赖该路径。

## 3. 可复用的既有接缝

| 需求 | 既有机制 | 位置 |
| --- | --- | --- |
| 视口截图、DPR=1 | 上下文 viewport 1280x768、无 deviceScaleFactor；`screenshot({fullPage:false})` | `browser.ts:25-28`, `:137` |
| 证据持久化（新类型可加） | `saveEvidence(runId, type, data, metadata)`，artifacts 表无需改 schema | `browser.ts:91-108` |
| 标注派生图 | `annotateEvidence(...)` 隔离上下文 + SVG overlay，按 run_id 限定源图 | `browser.ts:237-276` |
| 证据完整性 | `intervene()/snapshot()/epoch()/gaps()`；每个 artifact 已自动盖戳 | `evidence-integrity.ts`, `executor.ts:250-261` |
| 原子工具模板 | `createTemporalInvestigator(...).run()` + `InvestigationResult` | `temporal-investigation.ts:57`, 结果 `:35-48` |
| `trigger='always'` | 已存在且**预置**：`new Set(['always'])` | `task-state.ts:1-10, :26` |
| 未验证范围 | `completionGaps()` + `integrity.gaps()`；`recordBlockedScope()` | `task-state.ts:78-99`, `executor.ts:251` |
| 干预后禁止 supported/refuted | `finishInspection` 在 `integrity.epoch()` 为真时把 scope-covered 覆盖为 unverified-scope | `executor.ts:1772-1775` |
| hit-test 结构 | `PageElement.hitSamples`（relation: self/descendant/ancestor/unrelated/none + blockerBounds） | `src/rules/types.ts:51-57` |
| 只读开关 | `sideEffectPolicy.setReadOnly(true/false)` | `executor.ts:1897/1930/2111` |
| 串行化 | `serial()`/`toolTail`（工具）；`appendEvent`/`eventTail`（事件，seq=MAX+1） | `executor.ts:333-394`, `run-manager.ts:464-469` |
| 取消 | `guard()` = `signal.throwIfAborted()` + 模型尝试守卫 + 总时限 | `executor.ts:322-326` |
| 模型计量 | `countModel()`：检查→自增→抛错；**DeepSeek/Qwen 共用同一 `usage.modelCalls`** | `executor.ts:327-331` |

## 4. 冻结的接口

### 4.1 能力开关

`config.features.visualDiscovery = process.env.EXECUTION_VISUAL_DISCOVERY === '1'`——**opt-in**
（产品默认关闭）。注意现有 features 有两种写法：已采纳能力用 `!== '0'`，`blockerReview` 用 `=== '1'`。
本能力属实验性、默认关闭，故用 `=== '1'`。旧记录无该字段仍按旧行为解释。
启用与否及算法版本写入 run/持久事件，**不在查看旧报告时读当前 env 反推历史**。

### 4.2 视觉候选：区分"模型输出"与"服务端候选"

两个 schema，不可混为一谈（任务书 §4.2："服务端严格schema校验，上限不依赖提示词"）。

模型侧（Qwen 返回，服务端严格校验，越界/非法**整体拒绝**，不裁剪成"看似合理"）：

```ts
const perceivedRegion = z.object({
  x: z.number().finite(), y: z.number().finite(),
  width: z.number().finite().positive(), height: z.number().finite().positive(),
})
const visualCandidateOutput = z.object({
  perceivedRegion,
  targetDescription: z.string().min(1).max(300),
  visualBasis: z.string().min(1).max(800),
  excludedRegions: z.array(perceivedRegion).max(4),
  confidence: z.enum(['low', 'medium', 'high']),
})
const visualScanOutput = z.object({ candidates: z.array(visualCandidateOutput).max(2) })
```

服务端候选（模型**不得**提供 id/路径/页面操作/最终 verdict）：

```ts
interface VisualCandidate {
  readonly id: string          // 服务端生成
  readonly runId: string
  readonly kind: 'input-focus-region'
  readonly observationId: string
  readonly screenshotRef: string   // 本 run 拥有的证据 ID
  readonly perceivedRegion: Rect
  readonly targetDescription: string
  readonly visualBasis: string
  readonly excludedRegions: readonly Rect[]
  readonly confidence: 'low' | 'medium' | 'high'
  readonly algorithmVersion: string
  readonly createdAt: string
}
```

持久化为新证据类型 `visual-candidate`（JSON），metadata 含 `screenshotRef`、`algorithmVersion`、
`evidenceIntegrity`。`candidates=[]` 是**有效**模型结果，仅表示本次有限扫描未提出疑点，
**不表示页面无缺陷**。low 候选可供 Agent 解释，但**不直接产生 supported finding**。

### 4.3 坐标约定（§4.2）

- 截图单位固定为 **CSS 像素**。当前 DPR=1 时图像像素与 CSS 像素 1:1，但本轮**必须持久化并验证**该变换，
  不能靠"现在恰好是 1:1"。G1 要求在真实页面分别以 DPR=1 与 DPR=2 验证，**不能只测换算公式**。
- 服务端记录：`imageSize`、`viewport`、`scrollX/Y`、`documentEpoch`、`screenshotSha`、`capturedAt`。
- **禁止混用** DPR / fullPage 坐标 / 滚动偏移。候选矩形一律解释为"采集时刻视口内的 CSS 像素矩形"，
  必须落在 `[0,0,viewport.width,viewport.height]` 内；越界即整体拒绝。
- 现状缺口：**当前没有任何截图 SHA 记录**，也没有 image→CSS 变换。两者都是 P1 必须新增的。

### 4.4 探针回执与提升门禁（§4.3 / §4.6）——P1 的核心

**工具输入**（仅此三项，不接受任意坐标/selector/URL/模型自述的期望结果）：

```ts
const focusProbeInput = z.object({
  candidateId: z.string(),
  elementRef: z.string(),
  bindingReason: z.string().min(1),
})
```

**一次原子完成**（沿用 `investigation_check` 模式）：注册有依据假设（`trigger='always'`）→ 验证
身份/状态 → 真实点击 → 保存测量 → 保存/解决假设与发现 → 返回简洁结果与下一步。
`focus_probe` 内部**不做模型调用**（符合 `temporal-investigation.ts:56` 的原子工具契约）；
视觉扫描是**独立的有界阶段**，不是本工具的一部分。

**回执（typed receipt）**——新证据类型 `focus-measurement`，结构校验通过才可用于提升：

```ts
interface FocusProbeReceipt {
  readonly version: 1
  readonly candidateId: string
  readonly screenshotRef: string
  readonly documentEpoch: string      // 探针时的 document/URL/scroll/viewport 一致性
  readonly url: string
  readonly scroll: { x: number; y: number }
  readonly viewport: { width: number; height: number }
  readonly binding: { elementRef: string; nodeIdentity: string; reason: string }
  readonly positiveControl: FocusSample & { ok: boolean }   // 原生 input 内部点，500ms 内应聚焦同一节点
  readonly samples: readonly FocusSample[]                  // 候选内左/右内部点，距框边 >= 4 CSS px
  readonly resets: readonly NeutralReset[]                  // 每次中性重置及其"无副作用"证据
  readonly actionCost: number                               // 实际消耗的点击次数
  readonly windowMs: 500                                    // 本轮"及时聚焦"测量窗口
  readonly evidenceIntegrity: EvidenceIntegrity
  readonly algorithmVersion: string
  readonly scope: string                                    // 显式范围限制文案
}
```

每个 `FocusSample` 记录：CSS 坐标、实际 hit 元素摘要、点击前后 `activeElement` 身份、
焦点事件与是否在 500ms 内、input 值是否改变、document/node 身份、完整性状态。

**提升门禁（新增，两处都要）**：

1. 假设带类别标记 `kind: 'visual-focus'`（持久化，由候选调查产生时写入）。门禁依据**假设来源**，
   不依据 Agent 措辞——这正是"换标题不能绕过"的实现方式。
2. `findings_submit`：当目标假设 `kind === 'visual-focus'` 且请求 supported/refuted 时，
   **必须**存在结构有效、属于本 run、指向该 candidate 的 `focus-measurement` 回执；否则拒绝。
   仅"有截图 + 有 snapshot"不再足够。
3. `focus_probe` 自身经 `submitFinding`（内部路径）保存该类别 finding，与 `investigation_check`
   一致，**不**走 `findings_submit`。两条路径都以回执为唯一凭据。

**结论语义（§4.6）**：

- `supported`：非 low 的可信候选、明确唯一绑定、稳定干净证据、正向控制成功，且至少一个候选内部点
  在**两次独立未聚焦基线**下均未于 500ms 内聚焦。默认 `warning`。
- `refuted`：正向控制与两个有效边缘点均成功且证据完整，**仅反驳已测范围**。
- `inconclusive`：基线无法建立、正向控制失败、坐标/身份失效、证据受干预、采样不足、unsupported
  或预算耗尽。**保留未验证范围**。

### 4.5 采样与预算（§4.4）

固定、版本化的有界策略，P1 冻结为常量并测试：

1. 原生 input 内部点作正向控制（1 次点击），普通 click 后应 500ms 内聚焦同一节点。
2. 候选内派生左右各一内部点（距框边 >= 4 CSS px，优先横向 12% 与 88%），跳过明确排除区与危险区。
   **不得只测 DOM 输入框内。**
3. 若存在非聚焦点，最多再复测第一个失败点一次。不足两个有效边缘点则 unknown，
   **不临时移动到更容易通过/失败的位置**。

**关键反例（§4.4）**：input 已聚焦时，点无效留白也可能继续聚焦，**不得计作点击成功**。
每个采样点都从"目标未聚焦"的**已验证基线**开始，仅通过已观察且验证适合的中性页面区域做普通点击
清除焦点；**禁止** `.focus()`/`.blur()`/`dispatchEvent`/改 CSS。找不到安全中性区域则 unknown。
中性点击本身也记录、也计入 action 预算，并需验证未引入导航/写入/表单值变化/区域状态变化。

上限与计量：采样点击 <= 4（1 控制 + 2 边缘 + <= 1 复测），重置 <= 4，**合计 <= 8 次普通点击**；
**每次点击各自计入原 40 次额度**（见 §2.1）。预留足够 action 与 15 秒工具时间后才开始；
**预算不足则零点击、明确 inconclusive**。500ms 是本轮测量窗口，报告须写明不宣称普适阈值。

每候选取证前校验：同 document/URL/scroll/viewport；目标仍是原 DOM 节点、可见可编辑；候选与目标有
明确空间/语义联系且非"含多个不相关控件的大容器"；候选区域不得包含未排除的 button/link/submit 等
危险控件。身份不明/禁用/只读/有遮挡/区域混杂 → unknown，**不得**换近似节点或 force 点击绕过。

每 run 最多 2 个候选调查；同 candidate/node/有效状态重复调用**返回原回执**，不重新点击、不重复发现；
状态改变后不得复用旧回执。

### 4.6 视觉扫描阶段（§4.1）——独立于工具

- 在**首次稳定页面观察之后**（`executor.ts:1040` 的首次 `await observe()` 之后）、
  **首次常规 Agent 决策之前**（`while (!finished)` 于 `:2532` 之前）安排**一次**有界只读阶段。
  实现位置取工具定义之前的接缝（约 `:1719` 之后 / `:1858` 之前），使所需助手均已在作用域内。
- 有界只读：**不开后台线程**，不允许 Qwen 操作页面。候选作为结构化上下文交给 DeepSeek，
  由 DeepSeek 决定是否调查、语义绑定与后续路径。**扫描必须调用 `countModel()`**
  （与 DeepSeek 共用 30 次额度与 300 秒总时限）。Qwen **不另设隐形自动重试**；
  请求超时沿用 60 秒且不超过剩余任务时间。**不放进会悄悄突破 15 秒工具时限的同步工具中。**
- 每 run 最多 **2 次**扫描，第二次仅用于首次采集在请求期间失效后的重采集。
  无稳定图像、模型失败或两次均失效 → 记录明确未验证范围，**不假称完成视觉检查**。
- Qwen 只收到**这张原始截图**、当前公开目标与简短结构化输出要求。**不得**把 DOM 实际 input 宽度、
  私有 case/答案、隐藏样式、建议点击点喂给视觉模型。DOM 绑定发生在候选产生**之后**。

### 4.7 一致性检查（§4.5）

表单页面的普通观察缓存**当前明确不可复用**（`observation-version.ts:43-51`），**本轮不得为方便扫描放开**。
为本探针做**专门的短时一致性检查**（复用 blocker review 的既有先例，
`execution-engine.md:57`）：记录 document/node 身份、目标与候选布局、viewport/scroll、相关值及候选区域
结构，在截图返回后、绑定前、各次点击前后复核。正常 focus 样式/`activeElement` 变化是**测量对象**，
不可用简单全页 hash 差异让所有正常点击都失效。非预期布局/节点/值变化、中途导航、动画或无法追踪的
表面一律 unknown。

调查期间沿用单写队列与只读网络限制；页面点击仍可能触发事件，**不能宣称"聚焦探针天然无副作用"**。
任何被拦截的写入/弹窗/跨域请求必须记入 EvidenceIntegrity；**有干预的测量不得 supported/refuted**
（`executor.ts:1772-1775` 已实现该强制）。finally 恢复策略；**不能通过重新观察清除干预记录**。

取消、deadline、run 关闭时取消在途模型/探针；**迟到响应不得新增候选、发现或执行鼠标操作**；
保留已发生操作与失败用量。

## 5. P0 结论与 P1 范围

### 必须新增（现状不存在）

1. 动作计量原语：可预留、可每次点击消费（§2.1）。
2. 按类别的 typed receipt 门禁 + 假设类别标记（§2.2 / §4.4）。
3. 截图 SHA 记录与持久化的 image→CSS 变换（§4.3）。
4. rect→唯一原生 input 的**空间匹配器**（`element-store.ts` 无空间查询）。
5. 视觉扫描阶段（独立、有界、计量）、候选存储、`focus_probe` 工具、回执、最小报告。

### P1 最小闭环（完成后即交主 Agent review）

- 缺陷页 **D0** 与其修复页 **H0**。
- 候选存储/绑定、`focus_probe`、typed receipt、最小报告。
- 用**明确标注的本地固定视觉响应**做免费预检（真实浏览器/SDK/API），验证：
  8 次点击计量、**已聚焦假阳性**、容器代理健康对照、取消。
- 逐项标注验收计划的 G0–G3 子集，**不把部分 G 项当全部通过**。

## 5b. P1 进度（接口冻结已完成，工具接线待做）

计划 §6 的 P1 明确要求"先确定候选schema、探针回执、坐标约定、预算和假设提升校验，
不能先写一大套界面"。下列五块已按 TDD 冻结（每个循环都先看到 RED 再看到 GREEN）：

| 提交 | 模块 | 测试 | 冻结了什么 |
| --- | --- | --- | --- |
| `e576d8e` | `src/execution/action-budget.ts` | 6 | 可预留/可每次点击消费的计量原语（补 P0 §2.1 缺口） |
| `f428edf` | `src/execution/focus-geometry.ts` | 11 | 矩形严格校验（越界拒绝不裁剪）+ 4px 内缩 / 12%·88% 采样点派生 |
| `3492ba4` | `src/execution/focus-receipt.ts` | 8 | typed receipt + `focusReceiptSupports(candidate,screenshot)` 提升判定 |
| `c7ea86f` | `src/execution/visual-candidate.ts` | 10 | 模型侧/服务端候选分离；strict schema；上限由 schema 强制 |
| `e107dc9` | `src/execution/focus-binding.ts` | 11 | rect→唯一原生 input 绑定，不确定即拒绝并给出原因 |

TDD 过程中由 RED 捕获的真实缺陷（记录在案）：
`PositiveControl` 是 `Omit<FocusSample,'side'>`，最初用采样点校验器校验它，会错误地要求 `side` 字段。
已拆分为 `validMeasurement`（共有字段）+ `validSamplePoint`（附加 side 约束）。

**尚未 P1 完成**：D0/H0 fixture 与私有 reset、`focus_probe` 工具接入 executor、
动作预算接线、按类别提升门禁（假设类别标记 + `findings_submit` 拒绝）、最小报告、
固定本地视觉响应的免费预检，以及"8 次点击计量 / 已聚焦假阳性 / 容器代理健康 / 取消"四项证明。
完成后**停下交主 Agent review**（计划 §6 的硬节点）。

### P1 之后

P2 接入真实 Qwen 截图理解 + 完整六例（D0/H0/H1 诊断；D1/D2/H2 holdout 在冻结提示/schema/算法后才付费）。
P3 验收工具、独立评分器、报告。P4 冻结与真实验收。
**P1 与最终提交都应能独立构建、复验；不交付只在本机隐藏文件里的必要输入。**

## 6. 靶场、报告与验收接缝

### 6.1 靶场（arena/checkout）

- `ProductList.tsx` 结构：`div > h2 > div.product-grid > [div.product-card > (image,h3,price,p,button.btn.btn-primary "Add to Cart")]`，
  外加居中的 "View Cart"。商品在 mount 时取一次。**确认整个 checkout 无任何 input/搜索**。
- 私有控制器与公开 API **端口分离**：公开 `ARENA_API_PORT`(4174)，私有 `ARENA_CONTROL_PORT`(4175)，
  两个 `serve()`（`arena/checkout/src/server/index.ts:102,108-112`）；Bearer `ARENA_CONTROL_TOKEN`
  中间件，否则 401（`:25-30`）。端点 `POST /__control/reset`、`GET /__control/state`。
- **加搜索组件对 C0–C5 的风险（必须先满足）**：评测控制器用
  `getByRole('button',{name:'Add to Cart',exact:true}).first()`（`controller.ts:36`）下单。
  故搜索组件**默认不得过滤/隐藏商品**（空查询必须渲染全部商品）、不得改变 `.product-card` 与
  精确的 "Add to Cart" 按钮、必须置于网格**上方**，且**不发业务写入**（任务书 §5）。
- variant 模型：`state.ts:1` `VariantId = 'C0'..'C5'`；`createFreshState/resetState`；
  公开 `variant-config` 路由在 `server/index.ts:68`。
- 泄漏防护先例：`evaluator.ts:181-182` 的 `noAnswerLeak` 拒绝事件负载匹配
  `/\bC[0-5]\b|__control|variant-/`。§5 要求新 case 名/真值/bbox 不得出现在浏览器可读
  API/HTML/日志/目标文本——本轮应仿此建立**独立**检查。

### 6.2 报告（已可扩展，无需改报告形状）

- `buildReport`（`run-report.ts:53`）是单读事务快照上的**只读派生视图**（`run-manager.ts:108`
  `db.batch(...,'read')`）。artifacts 通用渲染：
  `{id,type,kind,metadata,available(实时 stat),url:/api/runs/:id/artifacts/:id}`（`:63-81`）。
  → 新证据类型**不需要**改报告结构。`metadata.sourceRef`/`annotation` 已被 Web 的 `Evidence`
  组件消费（`src/web/main.tsx:134-158`）：id 后缀为图片扩展名或 kind 匹配
  `/screenshot|image|annotated/i` 时渲染 `<img>`，`metadata.annotation===true` 时标注"红框标注副本"。
- 证据下载 `GET /api/runs/:id/artifacts/:artifactId`（`routes/runs.ts:223-254`）已有路径穿越防护
  （`realpath` + 限定在 `data/artifacts/{runId}`），按扩展名给 MIME。
- 刷新/重启后仍在：SQLite + 磁盘 artifact + `localStorage('sentinel:lastRun')` / `?run=`。
- `unknownCount`（`:211-214`）= unknown 规则判定 + inconclusive findings + 未验证干预范围。
  §4.6 的新 inconclusive/未知原因需在此增设或并列跟踪。
- 注意：`annotateEvidence` 目前**硬编码红色**且 `coordinateSource:'DOM hit-test'`（`browser.ts:266`），
  而 §4.6 要求候选虚线框 / 实际 input 另一种边框 / 点击点区分成功失败未知 + 图例，且**禁止把整个
  候选框涂红**。故需**泛化**该函数，而非直接调用。

### 6.3 验收 CLI 约定（P3 必须照做）

- 每个脚本手工解析 `process.argv.slice(2)` 并**拒绝未知参数**：`acceptance.ts:17`、
  `business.ts:70-71`、`business-diagnostic.ts:47`（不接受任何参数）、
  `business-formal.ts:93-94`（遍历参数，未知 `--` 即抛错）。
- **免费预检清空真实凭据**：`business.ts:248` 在子进程 env 中设 `OPENROUTER_API_KEY:''`，
  使免费检查**不可能**变成付费。付费路径另起**子进程**（`business.ts:45-69`）做隔离。
- 提供方固定：`business-diagnostic.ts:58-64` `resolveProviders` 必须匹配 `REQUIRED_PROVIDERS`。
- 预算：`model-gateway.ts` 每请求**先预留**（`accounted+reserved+reservation > limit` 时返回 429
  `validation-spending-limit`），`finally` 释放；usage 无 cost 时把预留转为已计。
  `gateway.begin(id,limit,durationMs)` 开一个 run 窗口，**同时最多一个**。
  `VALIDATION_MAX_COST_USD` 默认 $2；正式批次**与诊断共享**：
  `budgetRemainingUsd = maxCostUsd - spentIn(diagnosticSource)`（`business-formal.ts:218`）。
  → 验收计划 §5 要求新 campaign（新 smoke/诊断/18 + 旧诊断/45）**共用一本台账**，
  照抄 `business-formal.ts:218` 的模式。
- 构建身份：`build-identity.ts` 对 `dist/` + `arena/*/dist` + `evaluation/` + `scripts/` +
  `pnpm-lock.yaml` 取 sha256；正式批次校验 `diagnostic.buildHash === build.hash`
  （`business-formal.ts:183-184`）。
- 停服审计：`campaign-evidence.ts:59-176` `auditStoppedGroup(databaseUrl, records, expectedApproval)`
  在服务退出后**新开** SQLite 连接，`wal_checkpoint(TRUNCATE)` + `query_only=ON`，逐项比对
  API 与 DB 的 status/事件尾 seq/artifact id/批准，并对每个 artifact 文件哈希；断言在
  `auditDurability`（`export/scorer.ts:674-711`）。
- 评分器都是 `evaluation/private/*` 下的纯函数，返回 `{assertions, passed, ...}`。
  → 新视觉评分器**自成模块** `evaluation/private/visual-scorer.ts`，**不**作为
  `evaluateRun`/`scoreExportRun` 的分支。

## 7. 命名冲突裁定（P0）

**冲突**：任务书与验收计划 §2 用 `D0/H0/H1/D1/D2/H2` 命名视觉六例；但
`evaluation/fixtures/recovery.ts:7` 已定义 `HoldoutProfile = 'H0'|'H1'|'H2'` 属于**恢复业务**，
由 `evaluation/private/holdout.ts:82` `evaluateHoldout` 评分，**真值不同**
（H0 = 订单 paid / businessResult success / completed；H1/H2 = failed / unknown / blocked）。
同一仓库、同一词汇、不同含义。（该 `holdout.ts` 目前只被测试引用，`scripts/validation` 未触达。）

**裁定**：保留计划文档的 `D*/H*` 作为**对外词汇**（任务书、验收计划、本交接都以此书写，主 Agent
按这些文档 review），但在代码与证据中消歧：

1. fixture 模块 `evaluation/fixtures/visual.ts`，类型
   `VisualCaseId = 'D0'|'H0'|'H1'|'D1'|'D2'|'H2'`；
2. 评分器 `evaluation/private/visual-scorer.ts`（**从不**写进 `evaluator.ts`/`holdout.ts`）；
3. 每行 manifest / `runs.jsonl` / 台账记录带家族前缀（`visual:H0`），**不存在歧义行**；
4. 视觉私有 reset 使用与恢复 `HoldoutProfile` **不同的** control profile/端点，
   使视觉 reset 绝不可能触碰恢复状态，反之亦然。

**理由**：保持 review 文档一致性，同时消除唯一真实危害（日志歧义 + 跨家族 reset 串扰）。
**若判错代价**：仅在新文件内做机械改名，无需改动任何既有文件，可低成本回退。
**非 P1 阻塞项**（P1 只需 D0/H0）。

## 8. 建议新增模块（保持文件小而聚焦）

| 新文件 | 职责 |
| --- | --- |
| `src/execution/visual-discovery.ts` | 有界视觉扫描阶段、候选 schema 与持久化、坐标变换与截图 SHA |
| `src/execution/focus-probe.ts` | `focus_probe` 原子工具：绑定、采样、重置、**带计量的点击助手**、typed receipt |
| `src/execution/binding.ts`（或并入上者） | rect → 唯一原生 input 的空间匹配与身份复核 |
| `evaluation/fixtures/visual.ts` | 视觉六例私有 fixture 与真值 |
| `evaluation/private/visual-scorer.ts` | 独立视觉评分器 |
| `scripts/validation/visual-focus.ts` + `visual-focus-formal.ts` | 验收 CLI（照 6.3 约定） |

禁止：在 `executor.ts` 继续堆数百行算法；复制网关/评分/审计实现；复制另一套费用/完成/批准逻辑。