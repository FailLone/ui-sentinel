# 精简观察循环退化：根因调查报告

日期：2026-09-22
状态：根因已定位，修复待实施

## 版本与运行引用

| 项目 | A（完整观察） | B（精简观察） |
|------|-------------|-------------|
| Run ID | run-d7216a54-be4b-4187-bc12-e84951754598 | run-a22c4fcd-52bf-4a44-9056-d4bb80feae8a |
| Commit | b302799 (executor 无 Phase 2 修改) | b302799 + 未提交的 Phase 1/2 补丁 |
| 模型 | deepseek/deepseek-v4.1-flash (OpenRouter) | 同左 |
| 靶场变体 | C0 (payment always succeeds) | C0 |
| 预算 | 300s / 40 actions / 30 model calls | 同左 |
| 规则 | overlay-blocking + business-outcome + response-time | 同左 |

代码差异：B 在 executor.ts 中新增了 elementStore、latestSlim、requestTracker、
inputAnalyzer、progressClassifier。agent 输入的 observation 字段从完整快照改为
SlimSnapshot。工具返回值（page_observe、page_act）未修改，仍返回完整 observePage() 结果。

## 结果摘要

| 指标 | A | B |
|------|---|---|
| 结果 | completed (goal-reached) | timed-out (budget-exhausted) |
| 模型调用 | 11 | 26 |
| 动作数 | 4 | 9 |
| 总输入 token | 166K | 349K |
| 每次调用均值 | 15,156 | 13,430 |
| 有效动作率 | 45.5% (5/11 含 finish) | 34.6% (9/26) |
| 观察次数 | 15 | 36 |
| 业务结果 | success | unknown (timed out) |

## 关键序列分析

### 阶段一：成功购买（seq 1-9）

B 的前 9 步行为与 A 类似：浏览商品 → 加入购物车 → 结账 → 支付成功 → 确认页。
业务响应在 seq 8 的 page_act 后触发（order confirmed, paid）。

### 分歧点：seq 10（探索更新）

Agent 调用 exploration_update 记录已完成购买，标注未探索分支 `["payment-failure/retry"]`，
然后 page_act 导航回首页。

**问题**：C0 变体没有支付失败路径，agent 尝试测试不存在的分支。
A 也有类似的 observe-only 序列（seq 4-5, 7-8），但最终找到了正确的结束条件。

### 循环段：seq 13-20（8 次连续 observe-only）

| Seq | 分类 | 文本 | 输入观察 | 输入历史 | 新事实 |
|-----|------|------|---------|---------|--------|
| 13 | observe-only | (空) | 5029B | 26604B | 无 |
| 14 | observe-only | (空) | 5029B | 26450B | 无 |
| 15 | observe-only | (空) | 5029B | 26376B | 无 |
| 16 | observe-only | (空) + checks_run | 5029B | 26360B | 无（checks 全 pass） |
| 17 | observe-only | (空) + checks_run | 5029B | 26265B | 无 |
| 18 | observe-only | (空) | 5029B | 26265B | 无 |
| 19 | observe-only | "I'll start by observing the current page state." | 5029B | 26265B | 无 |
| 20 | observe-only | (空) | 5029B | 26312B | 无 |

**每次观察完全相同**：相同 URL、相同 11 个元素、相同 5029B 观察体积。
历史在 26-27KB 间微幅波动（截断边界差异），但内容本质相同。

Seq 19 的文本 "I'll start by observing" 表明 **上下文丢失** — agent 认为自己刚开始，
而实际上已完成一次购买并尝试了 9 次操作。

## 根因分析

### 根因 1：历史中的截断破损 JSON（PRIMARY）

**机制**：executor.ts 第 317 行

```
history=[...history,{text:result.text,toolResults:JSON.stringify(result.toolResults).slice(0,6000)}].slice(-4)
```

工具返回值是完整 observePage() 结果（约 21KB JSON），`.slice(0,6000)` 在 JSON
结构中间截断，产生**语法破损的 JSON 字符串**。

每个历史条目的 toolResults 值是一个被截断到 28% 的字符串，末尾停留在
hitSamples 数组的某个属性值中间：

```
...{"x": 640, "y": 113.5859375, "hitSelector": "h   <- 截断点
```

4 个历史条目 = 4 段破损 JSON，占输入的 ~80%。模型无法从历史中解析：
- 之前访问了哪些页面
- 执行了哪些动作
- 获得了什么业务结果
- 已经探索了哪些路径

**A 为什么不受影响**：A 的历史同样有截断问题，但 A 的观察字段包含完整快照
（10-19KB，含所有 hitSamples 和页面文本）。模型可以仅凭当前观察做决策，
不依赖历史中的工具结果。

**B 为什么受影响**：B 的观察缩减为 3-5KB 的精简格式，模型需要历史来回忆
之前的状态和动作。但历史是破损的，模型既没有完整的当前视图，
也没有可用的历史记录。

### 根因 2：工具返回值与观察格式不一致（SECONDARY）

观察字段使用 SlimSnapshot 格式：
- 元素有 `ref`（如 `e1`）和 `hit`（摘要：`{sampled, self, blocked}`）
- 页面文本在 `pageText` 字段

工具返回值使用完整格式：
- 元素有 `hitSamples`（完整 5 点采样数组）
- 页面文本在 `snapshot.text` 字段
- 没有 `ref` 引用

模型在同一个输入中看到两种不同的元素表示方式。即使历史没有截断，
这种不一致也可能导致混淆。

### 贡献因素 3：不存在的测试路径（CONTEXTUAL）

Agent 在 C0 变体上尝试测试支付失败路径。C0 始终成功，没有失败分支。
即使历史完好，agent 也无法完成这个目标。但历史破损使 agent 连"已经尝试过"
都记不住，导致重复观察而非转向结束。

### 观察：inputAnalyzer 文本测量偏差（MINOR）

`breakdownObservation` 检查 `snapshot.text`（完整格式字段名），
不检查 `pageText`（精简格式字段名）。所有 B 的响应显示 `text=0B`。
这是**测量问题**，不是数据缺失 — 模型确实收到了 pageText。

## 替代解释

1. **模型能力不足**：DeepSeek V4.1 Flash 可能在精简格式下表现不同。
   但 seq 1-9 的行为正常，仅在历史累积后才退化，指向历史问题而非模型能力。

2. **精简观察缺少关键字段**：SlimSnapshot 保留了 selector、tag、text、
   visible、enabled、bounds、attributes、hit summary。hit 摘要比完整
   hitSamples 信息少，但 seq 1-9 证明精简格式足以驱动正确动作。
   element_details 工具可按需恢复完整 hitSamples。

3. **预算或时间限制**：B 使用了 26/30 调用和 300s 中的 277s。如果
   没有循环，以 A 的效率（11 调用）可以在预算内完成。问题不是预算不够，
   而是无效调用浪费了预算。

## 修复建议（对应计划阶段二 B1）

1. **工具返回值使用精简格式**：page_observe 和 page_act 的返回值应使用
   SlimSnapshot 或结构化摘要，而非完整 observePage() 结果。这同时解决
   历史截断和格式不一致问题。

2. **历史条目使用结构化摘要**：不再对 toolResults 做暴力 `.slice(0,6000)`，
   而是提取结构化摘要（URL、动作类型、业务结果、关键状态变化），
   确保每个历史条目是完整可解析的 JSON。

3. **修复 inputAnalyzer 文本测量**：`breakdownObservation` 增加对 `pageText`
   字段的检查。
