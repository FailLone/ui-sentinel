# 主动视觉发现：P2 交接

状态：**P2 代码完成，真实模型路径已逐例跑通一次；未验收，未合并 main，未声称 P3/P4 或整轮通过。**

真实模型的六例各跑了一次是**诊断**，用来证明路径能走通并暴露缺陷；它不是验收计划 §2 的
18 轮正式评分，也不是 holdout 盲测（见下"holdout 污染"）。本文件不写 accepted。

代码来源：从 `review/visual-focus-p1` 的 `1df75dd` 新建 `dev/visual-focus-p2`。
本分支三个提交：`5365cf2`、`f8a10e6`、`c0a4c95`。
bundle：`ui-sentinel-visual-focus-p2.bundle`（`git bundle verify` 通过，需要 `1df75dd` 作为前置）。
未合并 main。

## 可以复验什么

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm validate:visual-focus -- --preflight
```

只实现了 `--preflight`；`--diagnostic` / `--formal` 仍由 CLI 明确拒绝，P3 才补齐。
真实模型诊断**不是**仓库内的产品命令，而是本机 scratch 脚本 `data/p2-probe/real-e2e.ts`
（gitignored），它启动编译后的 server + arena，走正式 `POST /api/runs`，用真实凭据。

截至 2026-10-01 的本分支验证：

| 检查 | 结果 |
| --- | --- |
| TypeScript | 退出码 0 |
| Biome format | 253 文件，干净 |
| 完整单元/浏览器回归 | **89 文件，836 测试全部通过**（P1 为 816） |
| 免费预检 `--preflight` | 退出码 0，`data/visual-focus-preflight/2026-09-30T18-26-13-178Z/` |
| 真实 Qwen + 真实 DeepSeek 六例 | 各 1 轮，全部 `goal-reached`，判定与真值一致（见下表） |
| 新 18 轮正式评分 | **未运行**，不计为通过 |
| 旧 45 轮业务回归 | **未运行**，不计为通过 |

## P2 做了什么

1. **修好了 P1 遗留的致命 fixture 缺陷。** D0 的浅底 `rgb(244,246,248)` 在 `rgb(245,245,245)`
   页面上只有 3/255 的差，且无边框无阴影——真实 Qwen 因此正确地报告了内部 input，所有派生探针点
   都落在 input 里，缺陷根本测不到。P1 的固定模型响应却照样报了区域，所以预检全绿也没发现。
   现改为有 1px 边框的白色字段 + 透明内层 input；`evaluation/support/png.ts` 读渲染后的像素
   来检验这个断言（不是检验 CSS）。因果验证见 `data/p2-probe/visibility-experiment.ts`。
2. **六个演示（presentation）及四个新 case。** 加入 H1/D1/D2/H2 的 fixture、真值和页面绘制；
   健康孪生（H0/H1/H2）与缺陷（D0/D1/D2）共享同一个字段样式对象，只有代理行为不同。
3. **公开词表去泄漏。** 原先公开的 `search-proxied-wide-region` 这类名字直接说出了答案，改为
   不透明的 `vN`；测试禁止在渲染标记中出现 `data-proxy` 等行为名。
4. **两个由真实运行暴露的缺陷，测试先行修复。** 见下"真实运行发现并修复的缺陷"。

## 真实模型六例（每例 1 轮，诊断）

| case | 应有 | 真实 Qwen 候选 | 真实 Playwright 点击点 | 假设 |
| --- | --- | --- | --- | --- |
| D0 | supported | `{432,135,420,40}` high | 左@482.4 `div` 不聚焦；右@801.6 `div` 不聚焦；复测不聚焦 | **supported** |
| H0 | refuted | `{432,135,420,40}` high | 左@482.4 `div` **2ms**；右@801.6 `div` **2ms** | **refuted** |
| H1 | refuted | `{501,167,250,30}` high | 左@531 `input` **2ms**；右@721 `input` **2ms** | **refuted** |
| D1 | supported | `{536,137,294,35}` high | 左@571.28 `div` 不聚焦；右@794.72 `div` 不聚焦；复测不聚焦 | **supported** |
| D2 | supported | `{269,167,415,40}` high | 左@318.8 `div` 不聚焦；右@634.2 `div` 不聚焦；复测不聚焦 | **supported** |
| H2 | refuted | `{269,167,415,40}` high | 左@318.8 `div` **2ms**；右@634.2 `div` **2ms** | **refuted** |

证据目录（`data/p2-probe/`，gitignored）：

- D0 `e2e-D0-2026-09-30T18-30-08-127Z`
- H0 `e2e-H0-2026-09-30T18-30-37-225Z`（以及**保留的失败** `e2e-H0-2026-09-30T17-35-51-589Z`）
- H1 `e2e-H1-2026-09-30T18-29-08-713Z`
- D1 `e2e-D1-2026-09-30T18-31-03-603Z`
- D2 `e2e-D2-2026-09-30T18-27-42-768Z`
- H2 `e2e-H2-2026-09-30T18-31-38-463Z`

每轮均为 `status: completed`、`stopReason: goal-reached`、购买成功；回执
`algorithmVersion=visual-focus-2`，2 次中性复位均 `introducedChange:false`，integrity `clean`。

**这证明了什么：** 截图能提出、交互能裁决，且两者分开。D0≡H0 与 D2≡H2 两对孪生从视觉模型
拿到的候选区域**完全相同**（各两次 `{432,135,420,40}` / `{269,167,415,40}`），即图片不含
"哪个是坏的"的信息；只有真实点击能分开。H0/H2 是假阳性护栏：命中元素是 `div` 而非 input，
朴素的"点到 input 了吗"会判健康页为缺陷，是 2ms 的聚焦令其被 refute。

**这没有证明什么：** 可靠性、跨轮方差、18 轮正式评分、旧业务回归、P3/P4。一例一轮就是一例一轮。

## holdout 污染（重要，别把它读成盲测）

验收计划要求 D1/D2/H2 在**提示词/schema/算法冻结之后**才做付费验证。实际情况相反：
D2 的首次真实运行失败（`focus_probe` 一次未调），我据此外改了 Agent 提示词，然后才跑的
D1/D2/H2。所以 **D2 的绿色结果是循环证据**——它证明新指引生效，不能证明能力能泛化到未见过的
case。D1/H2 用的是同一个改过的提示词，同属诊断。

要让它们成为有效 holdout 证据，需在 P4 冻结提示词后重跑，且届时提示词不得再因它们的结果而改动。
Ruling 与代价已记入 `.superpowers/sdd/next-development-plan/p2-progress.md`。

## 真实运行发现并修复的缺陷

**H1 绑定拒绝了一个正确区域。** 真实 Qwen 给出 `{501,167,250,30}`，input 为
`{490,161,260,34}`：覆盖率 84.8% < 90% 阈值，`focus-binding-refused:no-target`。模型是沿着
控件的**可见边缘**描的，而 H1 的可见边缘就是 1px 边框，所以它偏保守，规则因此在惩罚模型的正确。
修复：`src/execution/focus-binding.ts` 增加 `MIN_CONTAINMENT = 0.9`，按 **region** 而非 element
计算，使"落在 input 内的小框"被接受，而"仅仅擦过 input 的大框"仍被拒绝。回执改为陈述实际成立的
那条规则，不再打印低于阈值的覆盖率数字。

**D2 的 Agent 从未调查一个正确的候选。** `e2e-D2-2026-09-30T18-09-29-550Z`：候选
`d46cd632…` 已被提出且正确，但 `focus_probe` **一次未调**；工具使用是 `page_act`×4、
`rules_search`×4、`history_read`×8、`tool_result_read`×5、`page_observe`×1，9 次观察后
`stopReason: no-progress`、`status: blocked`、0 findings。候选就在 `agentInput.visualCandidates`
里，而 `src/agent/policy.ts` 从未提及它们——能力存在且正确，只是没人告诉 Agent 它是干什么的。
修复：`inspectionPolicy` 接收 `visualDiscovery`，启用时说明该能力（`visualCandidates` 是什么、
`focus_probe` 要的三个字段、候选只是待测量的假设）。泄漏由测试守住：只审查含 `focus_probe`
的句子，禁止 case id、坐标、行为词和判定词。

两次修复后重跑：D2 → `completed`/`goal-reached`/supported，`focus_probe` 调用一次；H1 →
refuted，两个点都命中 `input` 并在 2ms 聚焦。指引确实进了被执行的 `dist/server/index.js`
（该字面量出现且仅出现一次），报告本身不持久化提示词文本。

## 已知限制（带出本轮，未在此修复）

- **提供方 429。** 本机 Parasail 上游在约 1/3 的运行上返回 429
  （`data/p2-probe/provider-reliability.json`）。H0 的首次尝试就是这样失败的，已**保留**为证据
  而非删除。正式 campaign 需要重试/配额策略，并把提供方故障记成它自己的结局，而不是 case 失败。
- **全部候选都是 `high` 置信度。** `low` 路径（计划 4.2：low 候选可解释但不能产生 supported
  finding）已实现，但本轮没有任何真实模型触发过它。
- **`--diagnostic` / `--formal`、独立评分器、campaign 成本台账未实现**（P3）。
- **未运行**：18 轮正式评分、旧 45 轮业务回归、以及重负载下的取消/超时矩阵。

## 未完成项

- P3 验收工具与报告（含"两阶段运行"式成本台账与独立评分器反例）。
- P4 冻结与真实验收。
- P1 reviewer 遗留的次要点：探针 `complete` 跳过 pre-insert gate；硬编码 `dangerous: []`。
- 本文件写就时，整分支 fresh-context review 正在进行；其结论将在 review 返回后追加到本文件。
  在追加之前，本分支**未经整分支 review**。