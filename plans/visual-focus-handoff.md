# 主动视觉发现：P1 交接

状态：**P0 完成，P1 ready（主 Agent 修复并完成免费验收）**。P2–P4 未完成，不代表真实模型发现能力已验收。

代码来源：main 基线 `c41188a`；dev bundle head `6846463`。修复保存在 `review/visual-focus-p1`，准确修复 HEAD 以本交接所在提交为准。未合并 main。原 dev 提交中“P0 进行中”“接线待做”的过程记录由本交接替代，历史可从 Git 查看。

## 可以复验什么

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm validate:visual-focus -- --preflight
```

最后一条自行构建 Server、Web 和靶场，然后启动独立端口、独立 SQLite、真实 Chromium、真实 Mastra/OpenAI-compatible SDK，使用**明确标注的本地固定模型 HTTP 服务**。真实凭据在子进程中清空，不需要模型 key，不发付费请求。靶场几何测试会构建所需页面，不再依赖未提交的 dist。

仅 `--preflight` 已实现；未知参数和 `--diagnostic` / `--formal` 明确拒绝，不应把它们当现有命令使用。后续 P3 才补齐完整验收 CLI。

截至 2026-09-29 的本次验收：

| 检查 | 结果 |
| --- | --- |
| TypeScript、Biome、build | 退出码 0 |
| 完整单元/浏览器回归 | 89 文件，816 测试全部通过，133.28s |
| 正式 SDK/API 免费预检 | 退出码 0，5 个确定性场景通过 |
| Web 报告 | 原图、标注、逐点结果可见，刷新及服务重启后保持一致 |
| 重启审计 | 重新经 API 读取报告，逐个比对所有已保存 artifact SHA-256 |
| 真实模型 / 新18轮 / 旧45轮 | 本轮 P1 未运行；不计为通过 |

最终免费预检原始目录：`data/visual-focus-preflight/2026-09-29T14-15-12-177Z/`。包含 D0/H0/budget/cancel/wrong-binding 的报告、requests、service.log、summary 和报告截图；原始 artifact 在该运行数据库引用的 `data/artifacts/<runId>/`。这些是本地证据，不进 Git；开发者通过上述命令生成自己的完整证据，不依赖复制本机隐藏文件。

固定模型为 `fixed-agent`、`fixed-vision`，运行开关 `EXECUTION_VISUAL_DISCOVERY=1`、blocker review=0；1280×768，60 秒/20 动作/15 模型调用的本地预检预算（预算反例为 7 动作）。不是付费验收配置，也没有修改产品的原预算。费用为 0，无付费未知预留。该预检不提供 P4 构建冻结或 campaign 认证。

## 五个正式 API 场景

- **D0**：候选进入真实工具；正向控制成功，两个内部边缘点失败，其中一个独立重置后复测失败。6 次真实点击，保存一条 warning；继续正常购买，`completed/success`。
- **H0**：容器代理把焦点转交 input；5 次真实点击，假设 `refuted`，无此类缺陷；继续正常购买，`completed/success`。
- **预算不足**：剩余 7 动作不能覆盖完整探针，零探针点击；视觉范围保留 inconclusive；购买仍成功，检查状态诚实为 blocked。
- **错误绑定**：将候选绑定到 button 的 ref，拒绝且零探针点击；不偷偷换成另一个 input。
- **执行中取消**：实际控制点击已派发后调用正式 cancel API；最终 cancelled，仅一次探针点击，无后续测量、finding 或迟到事件。

D0/H0 都再次调用同一候选，验证原回执复用、没有重复点击/发现。对账 `usage.actions = 探针真实点击 + 4 次购买路径动作`；模型计数与本地 HTTP 请求数相同。额外单测覆盖初始聚焦+单侧失效时恰好 8 次点击、6/7 动作不足、重置期间取消、节点替换和值变化。

## Review 问题如何处理

| 原问题 | 当前实现 |
| --- | --- |
| R1：scanner 返回 undefined，预检绕开产品 | `visual-request.ts` 使用真实 SDK，`visual-focus-runtime.ts` 串联候选/工具/存储；正式 API 预检走完整产品路径。固定响应只在评估 HTTP 服务里 |
| R2：少预留复测、单次失败直接 supported | 预留 8 次点击；失败点必须独立中性重置后复测；判定器独立拒绝缺复测或缺任一边缘点 |
| R3：节点替换仍判成功 | 截图阶段保留实际 input handles；绑定检查准确 ref 和真实可编辑性；点击前后检查原节点、document、布局/scroll/value；普通 focus 样式不算结构变化 |
| R4：typed receipt 只看形状 | 从实测回执重算结论；持久化入口要求候选、原图/hash、测量、标注完整匹配，且目标 status 一致；普通 finding 提交也经过同一门禁；unknown 可如实保存 |
| R5：取消后还点击 | 异步重置/验证后再次 guard，鼠标派发前 guard，证据及结论持久化前 guard；真实 API 取消和浏览器回归证明 |
| R6：伪坐标和遮挡红框 | 记录真实控制点、activeElement、显式 retest；候选虚线、input 蓝框、绿/红/黄测点和图例，保留原图及逐点表格 |

同时处理：重复调用复用；无结果候选进入未验证范围；历史配置写入事件；公开靶场移除带答案含义的呈现名称和 data 属性；删除未使用的旧 scanner 草稿及其镜像测试。执行器移除约 400 行嵌入实现，浏览器状态、测量、判定、证据标注和编排分开。没有增加新业务 profile 或更换模型/框架。

## 验收边界与下一步

P1 对应 G0–G3 的最小子集已经验证：构建/兼容测试、D0/H0、真实指针/基线/计量/取消、证据提升、报告及重启读取。**不能标记整个 G1–G3 已完成**；完整 DPR/变换/各类安全反例矩阵、独立私有评分器、丢失中段/seq 审计、真实模型失败/usage 矩阵仍按原验收计划推进。

P2 从本修复 HEAD 开始。复用现有 SDK 视觉请求和 runtime，不重建后台分析或第二套工具。需要用真实 Qwen/DeepSeek 检验截图候选与语义绑定，补齐 H1/D1/D2/H2；P3 补齐 CLI、私有评分、campaign 费用和构建冻结；P4 再执行真实诊断、新18轮及受影响旧45轮。没有这些结果时，不得写全轮 accepted。

之前失败与中间批次全部保留在 `data/visual-focus-preflight/`：14:00、14:02、14:04 是固定模型导航/候选接线调试；14:06、14:07、14:11、14:14 的场景断言通过但随后发现 runner 在重复清理已受 SIGTERM 的子进程时挂起，不能视为命令验收成功。已修复 `signalCode` 清理判断，最终 14:15 批次真实退出 0。不得拼接这些中间批次代替最终结果。
