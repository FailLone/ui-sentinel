# UI 质量规则与规则库技术设计

日期：2026-09-20  
状态：目标设计，包含已实现部分与后续规划；当前实现及冻结验收以[进度记录](../plans/minimum-validation-progress.md)为准

范围：规则模型、规则库组织、扩展 API、关键路径、检索与调度、反馈演进。

总体设计入口：[应用总体架构](./architecture.md)。

配套文档：[执行层、并发调度与 Mastra 技术设计](./execution-engine.md)。

规则在长期知识体系中的位置，以及版本检索与上下文管理，见[产品知识库与 Agent 上下文技术设计](./knowledge-and-context.md)。

Agent 的整体职责与工作模式见[Agent 职责与整体工作模式](./agent-responsibilities.md)。

本文将讨论中的方案整理为实现依据。文中的 TypeScript、YAML、事件名及 API 均为拟定接口，不代表已有代码或第三方框架的原生能力。浏览器执行采用 Playwright，AI 视觉能力采用 Midscene.js，规则引擎由项目实现。

## 1. 目标与原则

本应用由 Agent 主导页面理解、探索规划、问题假设和验证。不同页面及状态无法由人工预先穷举，规则库也不是问题发现的完整边界。规则系统将已明确的产品要求转化为可重复执行、可解释、可取证的检查，用于提速、保持一致性和节约模型 token。

Agent 不仅在脚本失败后接管，也主动探索没有预定义路径或适用规则的区域。没有对应规则不阻止提出和验证问题；通过验证的发现也不要求先编写规则才能报告。

探索策略负责引导“去哪里找、尝试什么”，规则负责对已有事实作出可重复判断。规则缺失和探索缺失是不同问题；新增规则不一定能修复未产生假设的漏报。详见[探索策略与未知问题发现](./exploration-strategies.md)。

核心原则：

- 通用规则面向一类对象，不写死页面中的元素 ID、文案、坐标或 selector。
- 引擎负责发现对象、采集事实和遍历；规则负责声明条件与判断。
- 确定性判断使用代码；AI 用于语义识别、动态定位和难以结构化的视觉判断。
- 同一快照、定位结果和事实尽量共享，避免每条规则重复访问浏览器或调用模型。
- 定位可以缓存，当前检查结果必须重新计算。
- 恢复前先检查和保存现场，恢复成功不能消除已发现的问题。
- 未知、不适用、执行异常和产品违规必须分开记录。
- AI 补充规则选择，不作为覆盖范围的唯一决策者。
- Agent 主导探索范围和新问题验证；确定性路由保障已知规则的基础覆盖，两者职责不同。
- 规则是可复用能力，不是发现问题的唯一入口。建议、假设和经验证发现分别保存。
- 不承诺 Agent 穷举应用；报告已知范围、未探索分支和停止原因。

### 1.1 探索与复用的双循环

```text
探索循环：理解页面 → 选择入口和状态 → 提出假设
          → 操作验证 → 保存证据 → 更新探索计划

复用循环：到达已知状态 → 运行已有规则 → 保存结果
          → 将异常、缺失事实和新状态交给 Agent 调查
```

两个循环共享事实、证据和发现记录。Agent 发现的新模式经确认后，可以沉淀为规则或场景；并非每次新发现都适合规则化。

## 2. 核心概念

| 概念 | 职责 |
| --- | --- |
| Rule | 可执行的质量约束，包含适用范围、事实依赖、判断逻辑和报告定义 |
| Rule manifest | 规则的轻量元数据，供索引、筛选、检索和调度使用 |
| UI snapshot | 一个特定页面状态下的标准化事实集合 |
| Fact | 一个带来源、时间和确定程度的事实，如按钮用途、计算样式、遮挡关系 |
| Scenario | 准备角色、数据、环境和动作，将应用带到待检查状态 |
| Journey | 关键业务路径，定义步骤、分支、终态和结果要求 |
| Journey case | 路径的具体测试条件及预期业务结果 |
| Finding | 有证据支持的问题记录 |
| Exception | 人工认可、具有适用范围和有效期的规则例外 |
| Exploration graph | 逐步建立的页面状态图，记录观察到的状态、动作及未探索分支 |
| Hypothesis | 可被验证或反驳的问题假设，关联验证计划和事实依据 |
| Rule proposal | 从探索中提出的规则候选，尚未成为有效质量要求 |

Rule 是产品知识中能够执行检查的部分。PRD、Figma 等资料保留为规则来源，不要求日常检查每次重新阅读全部资料。

## 3. 检查对象与规则类型

| 类型 | 输入 | 示例 |
| --- | --- | --- |
| element | 单个节点及其上下文 | 提交按钮使用 primary；字号符合规范 |
| page | 当前快照、节点集合和关系 | 同类卡片间距一致；活动浮层不阻挡主要操作 |
| transition | 动作前后快照及动作结果 | 提交失败保留输入；关闭浮层后恢复操作 |
| journey | 路径轨迹、终态和耗时 | 下单结果符合预期；结果反馈不超过时间预算 |

通用规则可复用于不同页面；项目级业务规则可限定功能或路径，但仍应通过业务语义匹配目标。稳定的 journey ID、step ID 用于标识测试定义，不等同于写死 DOM 元素 ID。

规则覆盖的是已经到达和采集的状态。规则遍历本身不会发现登录后页面、尚未打开的弹窗或未触发的错误状态；Agent 规划探索这些状态，场景和路径执行器负责可靠地到达、观察和验证它们。

## 4. 事实模型与目标定位

### 4.1 节点与事实

```ts
type Fact<T> =
  | {
      status: "known";
      value: T;
      source: "dom" | "computed-style" | "annotation" | "model" | "baseline";
      confidence?: number;
      evidenceRefs: string[];
    }
  | { status: "unknown"; reason: string };

interface UINode {
  ref: string; // 仅在关联快照内标识元素，供取证与报告使用
  kind: Fact<"button" | "input" | "overlay" | "container" | "text" | "other">;
  intent: Fact<string>;
  component: Fact<string>;
  variant: Fact<string>;
}

interface UISnapshot {
  id: string;
  pageUrl: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  scenarioId: string;
  nodes: UINode[];
  evidenceRefs: string[];
}
```

节点属性不是全部来自 DOM。组件身份、variant 可以来自可选组件标注或源码关联；业务语义可以来自已确认映射或模型推断。无法可靠获得时保留 unknown，不能把颜色近似当成 primary 的确定证据。

模型置信度不自动等于经过校准的准确率。引擎需记录来源，并根据规则要求决定是否需要复核。

### 4.2 定位策略

1. 尝试已确认的语义映射和定位信息。
2. 验证目标上下文是否仍匹配，不能仅检查 selector 是否还能命中。
3. 失效或有歧义时，使用当前 DOM、截图和 Midscene 补充定位。
4. 需要操作时，通过后置条件验证是否操作了正确对象。
5. 无法确定时记录 unresolved，不猜测目标以获得通过结果。

定位到像素区域不代表已经获得唯一 DOM 节点。映射失败时，可继续提供视觉证据，但依赖 DOM 样式的规则仍应返回 unknown。

完全被覆盖的目标可能无法从截图识别，应结合 DOM、遮挡前状态或基线。模型不能凭空恢复不可见信息。

## 5. 规则包与元数据

建议目录：

```text
rules/
  element/
    submit-button-primary/
      manifest.yaml
      rule.ts
      cases/
      README.md
  page/
    campaign-overlay-obstruction/
  transition/
    preserve-input-on-error/
  journey/
    expected-outcome/
    response-time-budget/

journeys/
  purchase/
    journey.ts
    cases.ts

config/
  rule-profiles/
  exceptions/
```

声明式规则可将断言存入单独配置文件，不强制提供 rule.ts。README 解释依据、适用条件和限制；cases 保存应违规、应通过、未知及边界案例。

规则清单示例：

```yaml
id: overlay.blocks-primary-action
version: 1.0.0
apiVersion: 1
description: 检查活动浮层是否阻挡主要操作
scope: page
severity: warning
tags: [overlay, campaign, obstruction, primary-action]

requires:
  facts: [overlay-purpose, primary-action, pointer-hit-test]

triggers: [page-ready, overlay-appeared, before-primary-action]

cost:
  model: optional
  interaction: none

implementation: ./rule.ts
sources:
  - kind: product-policy
    ref: campaign-interaction-policy
    revision: 3
```

引擎加载时校验清单、实现入口和 API 版本。规则 ID 稳定；行为改变要产生新版本。一次检查记录锁定所使用的规则版本、配置、资料版本和例外版本。

## 6. 两种规则扩展方式

### 6.1 声明式规则

简单属性约束使用模板，不需要自己编写遍历和报告逻辑：

```ts
export default defineRule({
  id: "submit-button-primary",
  match: { kind: "button", intent: "submit" },
  assert: { field: "variant", equals: "primary" },
  message: "提交按钮必须使用 primary variant",
});
```

引擎负责匹配所有候选节点、获取字段、执行断言和附上证据。匹配结果采用三态：matched、not-matched、unknown。用途尚未识别的按钮不能因匹配失败而静默消失，应进入覆盖记录。

该规则是项目约定，不能作为所有产品的绝对规范。项目可调整为“表单主要提交操作”，并配置明确例外。

### 6.2 访问器规则

涉及关系或复杂判断时，使用访问器：

```ts
export default defineRule({
  id: "campaign-overlay-obstruction",

  create(ctx) {
    return {
      async Overlay(node) {
        const purpose = await ctx.semantic(node, "purpose");

        if (purpose.status === "unknown") {
          ctx.unresolved(node, purpose.reason);
          return;
        }
        if (purpose.value !== "campaign") return;

        const result = await ctx.layout.blockedTargets(node);
        if (result.status === "unknown") {
          ctx.unresolved(node, result.reason);
          return;
        }

        for (const target of result.value) {
          ctx.report({
            node,
            related: [target.node],
            message: "活动浮层遮挡了交互元素",
            evidenceRefs: target.evidenceRefs,
          });
        }
      },
    };
  },
});
```

几何重叠不直接等于阻挡。共享检测能力需要结合命中测试、层级、事件穿透、父子关系和状态；视觉覆盖与指针阻挡分别记录。

## 7. Hook 和共享 API

### 7.1 生命周期

| Hook | 时机 | 典型用途 |
| --- | --- | --- |
| Button / Input / Overlay 等 | 遍历相应节点 | 元素与局部关系检查 |
| Page | 当前快照准备完成 | 页面整体与同类一致性 |
| Transition | 动作结束，前后状态可用 | 反馈和错误恢复 |
| journey:start | 路径开始 | 前置条件和轨迹初始化 |
| journey:before-action | 动作前，尚未执行自动滚动等准备动作 | 入口可见性、遮挡和原始状态 |
| journey:after-action | 动作已发出，开始采集反馈 | 状态变化和错误 |
| journey:step-end | 后置条件成立或等待终止 | 步骤结果、时间预算 |
| journey:end | 业务终态或执行终止 | 最终结果和整体指标 |

事件使用统一 ID、时间戳、快照引用、动作 ID 和路径步骤 ID，保证问题能够关联到具体现场。after-action 不等于业务已经完成；完成由后置条件决定。

### 7.2 API 职责

| API | 职责 |
| --- | --- |
| ctx.query() | 查询节点、分组和关系 |
| ctx.style() | 读取标准化计算样式 |
| ctx.layout | 尺寸、视口关系、裁剪、间距和遮挡事实 |
| ctx.semantic() | 获取语义及其来源；由引擎集中安排模型调用 |
| ctx.transition | 读取动作前后状态 |
| ctx.journey | 读取路径轨迹、结果和指标 |
| ctx.report() | 创建问题并关联节点、实际值、预期值及证据 |
| ctx.unresolved() | 记录缺失事实或不确定判断 |

规则默认只读。点击、滚动、关闭弹窗和重试由执行器负责，避免规则之间相互改变页面。规则可声明需要的观察或验证条件，由调度器安排；不得绕过执行器偷偷恢复界面。

## 8. 关键路径定义

关键路径是状态转换图。简单路径可用顺序步骤表达，支付拒绝、库存不足等必须定义分支和终态，不能把所有步骤当作必经列表。

预定义 Journey 是可复用业务知识，不是启动检查的必要条件。Agent 可以从用户目标和入口开始发现路径、记录临时状态图，并提出 Journey 候选。观察到的当前行为不能直接成为正确预期；需要依据 PRD、项目约定或人工确认区分现状与要求。

以下为简化示意：

```ts
defineJourney({
  id: "purchase",
  start: "select-product",
  steps: {
    "select-product": {
      action: "选择符合测试条件的商品",
      expect: "product-selected",
      next: "add-to-cart",
    },
    "add-to-cart": {
      action: "将商品加入购物车",
      expect: "cart-contains-product",
      next: "submit-order",
    },
    "submit-order": {
      action: "提交订单",
      branches: {
        "payment-required": "pay",
        "order-rejected": "rejected",
      },
    },
    pay: {
      action: "使用测试支付方式付款",
      branches: {
        "payment-confirmed": "success",
        "payment-declined": "rejected",
      },
    },
  },
  terminalStates: ["success", "rejected"],
});
```

action 表达业务意图。expect 和分支条件必须关联有证据的谓词，例如页面状态与订单测试接口的结果，不能只依赖模型自述。PRD 可用于生成定义；存在歧义的要求需显式保留为待确认项。

### 8.1 场景预期与结果

| Case | 数据条件 | 预期终态 | 附加要求 |
| --- | --- | --- | --- |
| normal-purchase | 库存充足、测试支付批准 | success | 订单已支付，用户看到成功反馈 |
| out-of-stock | 库存不足 | rejected | 原因对应库存不足 |
| payment-declined | 测试支付拒绝 | rejected | 原因明确，后续操作可用 |

业务 rejected 可能是测试通过。执行器找不到元素、浏览器断连等属于执行错误；业务结果与检查结论分开存储。涉及支付、通知等有外部影响的动作，场景必须明确测试环境和测试方式。

### 8.2 流畅度

在动作前记录目标是否位于当前视口、是否被遮挡，以及后续新增了多少滚动、返回、重试和关闭浮层动作。

浏览器自动滚动之前必须采集原始状态。否则“最终点击成功”会掩盖入口难以发现的问题。

主要操作位于视口外可以触发项目配置的 warning，但不能无条件认定所有滚动都不合理。阅读完整内容后才能提交等场景可作为明确例外。sticky 是候选建议，需要结合页面布局判断，不是规则的必然修复。

### 8.3 时间预算

时间预算必须明确业务区间：

```yaml
id: order-result-latency
from: submit-order.action-dispatched
to: order-result.visible
warningMs: 10000
```

若中间包含用户支付操作，应拆分区间或显式扣除对应阶段。至少分别记录：

- 系统等待：动作实际发出到业务反馈出现。
- 额外交互：滚动、关闭浮层、返回和重试的次数与耗时。
- 自动化开销：模型推理、定位和工具调度。

使用单调时钟测量持续时间。不能以模型完成观察的时间直接代替 UI 实际出现时间；应尽可能使用浏览器侧状态观察或轮询，并记录采样误差。单次超预算报告本次异常，多次运行才用于判断持续退化。

## 9. 规则索引、检索与选择

### 9.1 索引内容

索引清单而非全部实现代码。结构化字段包括 ID、版本、scope、tags、事实依赖、触发事件、项目范围、来源和成本等级。语义检索文本包含描述、适用例子和排除条件。

小规模使用结构化查询和全文检索即可；规模扩大后可加入向量检索辅助语义召回。向量相似度不作为适用性的最终依据。

### 9.2 三层选择

1. 基础规则：项目配置固定启用，AI 不能静默取消。
2. 条件路由：依据表单、浮层、页面状态、路径事件等自动匹配。
3. AI 补充：理解当前页面用途和业务目标，从候选清单中补充选择并记录理由。

上述三层只描述已有规则的选择机制，不限制 Agent 的整体探索规划。检索无结果时，应允许 Agent 提出独立假设、调用事实采集及验证能力，而不是结束检查或报告通过。

```text
当前事实 + 当前任务 + 项目配置
  → 结构化过滤
  → 关键词或语义召回
  → AI 补充选择
  → 合并与去重
  → 依赖采集计划
  → 执行
```

缺少 required fact 不能直接当作不适用，应进入待采集或 unresolved 队列。

不把“每页必须调用 AI 挑规则”作为要求。共享数据上的大量简单断言可能比一次模型调用更便宜。优化目标是重复采集、交互和推理成本，而不只是规则数量。

### 9.3 增量调度

- 页面就绪：运行基础规则和页面匹配规则。
- 浮层出现：执行相关新增节点及遮挡规则。
- 表单提交：执行动作前检查和操作反馈规则。
- 结果页出现：执行终态与路径时间规则。

引擎根据事实依赖使受影响结果失效。合并频繁变更，避免动画每帧触发整页扫描；加载和中间状态使用专门触发条件，不能一律等待稳定后忽略。具体去抖窗口、稳定条件和执行预算需在实现中验证。

## 10. 执行结果、证据与覆盖率

| 状态 | 含义 |
| --- | --- |
| pass | 已取得必要事实，满足要求 |
| fail | 有证据证明违反规则 |
| skip | 有依据表明不适用 |
| unknown | 事实不足或判断不确定 |
| error | 规则或执行基础设施异常 |

预算导致的 deferred 属于调度状态，不伪装成 pass 或 skip。同一规则在一个页面上可以产生多个对象结果，不能用单个总状态隐藏 unknown。

问题至少记录来源、运行和快照 ID、场景/步骤、节点引用、实际值、预期依据、证据、置信信息及严重程度。规则发现关联规则 ID/版本；探索发现关联假设 ID/版本和验证记录，不伪造 ruleId。置信程度与影响程度分开表达。

发现来源与验证状态分别建模：source 为 rule 或 agent；验证状态区分 candidate（待验证）、supported（有证据支持）、inconclusive（无法判断）、refuted（已反驳）。审美或流程改进建议另标为 suggestion，不能自动升级为确定违规。人工确认状态独立记录，不把模型验证等同于人工接受。

覆盖报告记录已执行、不适用、事实不足、执行错误、预算延期的对象与规则，以及选择或排除依据。覆盖率的分母限于计划和已知状态，不声称覆盖整个未知应用。

另行记录探索覆盖：已观察入口、已到达状态、已执行状态转换、未探索分支和停止原因。规则覆盖与探索覆盖不合成虚假的全站百分比。预算耗尽、权限不足、环境阻断、去重和暂缓均需分别表达；“未发现问题”只适用于此次已检查范围。

原始异常和恢复结果分别保存。相同根因的多个现象可聚合展示，但保留每个现场。

## 11. 反馈与规则演进

| 人工反馈 | 系统处理 |
| --- | --- |
| 确认问题 | 保存案例，必要时推广到同类对象 |
| 有意设计 | 创建范围明确的例外 |
| 需求改变 | 更新来源版本，修订或废弃受影响规则 |
| 暂不修复 | 保留问题，调整通知策略 |
| 无法复现 | 补查触发条件，不直接认定规则错误 |
| 重复问题 | 合并记录，保留各次证据 |

例外包含规则、项目/功能/状态范围、原因、确认人和有效期或复核条件。避免一次局部反馈变成全局豁免。

AI 可提出规则与例外修改，但影响范围扩大的变更需审阅。规则更新前运行固定案例集，验证真实问题、合理例外和未知输入；不能只用用户确认率判断质量，因为漏报不会进入报告。

演进产物不仅包括规则，还包括页面语义映射、探索策略、可复用路径和回归场景。Agent 可先报告有证据的新问题，再独立提议沉淀规则。规则候选需有明确适用范围、可稳定获取的事实和正反案例，经过既定审阅后才加入有效规则库。

## 12. 扩展开发约定与待验证事项

新增规则流程：

1. 编写 manifest，说明来源、范围、触发事件及依赖。
2. 简单规则填写声明式模板，复杂规则实现访问器。
3. 添加应通过、应违规、未知与边界案例。
4. 验证规则只读、证据完整、预算受控且不会静默漏检。
5. 发布版本并加入项目规则配置。

实现时需提供规则模板、清单校验、测试辅助工具和调试报告。共享能力由引擎维护，规则不各自实现浏览器遍历和模型客户端。

规则级正反案例与端到端靶场配合：前者验证判断逻辑，后者验证 Agent 是否到达状态、选择检查并保留证据。规则候选通过测试不等于整条检查路径可靠；靶场维护及独立评估见[靶场库设计](./arena-and-evaluation.md)。

待实测的工程问题包括：视觉定位到 DOM 的映射可靠性、浮层关系识别、状态变化的增量失效、不同页面下缓存有效性，以及冷启动和重复执行的实际模型成本。上述问题不改变规则、场景与事实层的职责划分，但会影响底层实现和参数。

## 13. 示例：跨业务的重试入口可用性

支付、上传、列表加载、同步或连接失败，都可以复用同一个重试规则模板。规则匹配行为语义，不绑定业务名、按钮文案、DOM ID 或位置。支付 C5 是该规则的来源案例，不是适用范围的上限；也不能因为来源案例通过，就声称其他业务已经验证。

规范表达：**当业务证据确认某项失败操作当前允许重试时，该操作对应的重试入口应在配置的等待窗口内变得可操作。**

- Agent 根据页面反馈、业务响应与需求，识别失败操作及其对应重试入口，再解析当前元素；同一页面有多个重试入口时，应逐一绑定到对应操作，不能拿其他入口的成功抵消当前入口的问题。
- 事实层记录通用 `retryable-failure` 事件、语义目标 `Retry button` 和连续 actionability 样本。这个目标名是语义键，不是要求页面上出现该英文文本。
- 规则只消费事实，检查窗口内是否出现可操作样本；完整窗口持续不可操作才 fail，事实不足为 unknown。可操作性采样不实际点击，不能证明重试业务最终执行成功。
- 倒计时尚未结束、次数耗尽、原操作仍在执行或必要输入尚未满足时，不能仅因入口不可点击就标记为“当前允许重试”。恢复资格不明时保留 unknown。合法冷却结束后才开始检查其恢复窗口。
- 等待预算和严重程度是规则配置。当前 M5 候选沿用已确认场景的 `timeoutMs=5000`、`severity=error`，不将其提升为所有业务的固定标准。更改配置需生成新修订并重新验证。

当前 transition 模板可复用已有的 `eventType`、可选状态条件、语义 target、condition 与 timeoutMs，无须为支付、上传、加载分别实现脚本。跨业务重试规则通常不限制来源业务状态；如确需状态限制，必须来自业务适用条件而非 disabled 等缺陷表象。

**实现边界：** 已知规则通过 `rule_check` 绑定当前元素和公开业务事件，执行器从声明读取语义目标、条件与等待预算；原始 `transition_observe` 仍支持未知问题探索。当前重试资格适配器只支持购物业务响应协议，需要当前失败响应、`canRetry=true` 以及对应订单出现在页面中；已知冷却、次数耗尽、处理中、前置条件不满足均不提供资格。没有实现通用业务资格识别；上传、同步等业务需接入自己的事实适配器，不能仅凭按钮文字自动判定。已建立单次检查的操作/元素绑定及逐检查结果，多个已测目标中任一个 unknown 不会被另一个 pass 覆盖，但没有完整的全页目标覆盖枚举。三态 evaluator 对不匹配事件返回 unknown，设计层面的 skip 尚未在此模板实现。跨业务、多目标端到端能力仍需独立验收。

人工可提出“推广适用范围”的审阅反馈。生成接口通过 `previousProposalId` 和 `reviewerFeedback` 将原候选、验证结果及反馈交给模型，创建新的未批准候选，并在事件中保存关联；不覆写旧候选、不把反馈视为启用授权。跨业务的可复用模板与在项目内实际启用，是两件独立的事。

## 14. 技术参考

- [Playwright 动作可执行性检查](https://playwright.dev/docs/actionability)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Midscene 与 Playwright 集成](https://www.midscenejs.com/integrate-with-playwright)
- [Midscene 缓存机制与限制](https://www.midscenejs.com/caching)

参考链接用于底层技术能力；本文的规则 schema、Hook、检索策略和事实 API 属于本项目设计。
