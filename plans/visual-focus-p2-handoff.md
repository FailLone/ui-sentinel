# 主动视觉发现：P2 交接

状态：**P2 ready（主 Agent 完成修复与真实模型开发 smoke）**。P0/P1 ready；P3/P4 未完成，不代表正式整轮验收通过。

代码来源：P1 修复 `1df75dd` → dev bundle `865835c` → `review/visual-focus-p2`。不合并 main。

## Review 修复

- 场景选择、样式及代理差异由靶场服务端渲染为当前组件 HTML。浏览器没有固定 v1–v6 token，也不再下载全场景行为对照表；原生 label 负责健康场景的焦点转交。当前 DOM 的正常结构和行为仍可观察，这不是私有答案表。
- H2 添加真实、可用的 Clear search 相邻按钮；D1 改用 Find accessories。浏览器测试确认六例几何/实际焦点、按钮位置、探针未点击按钮、搜索和清空功能。检查实际编译 JS 不含私有场景表。
- 真实模型复验暴露坐标单位不一致：模型接口明确声明 0–1000 归一化坐标，服务端按已验证截图尺寸转换并保存转换信息；Agent 和探针仍使用 CSS 像素。缺少单位声明、未知字段及越界整体拒绝，不根据 DOM 猜单位。算法版本 `visual-focus-3`。
- 修复 binding reason 的百分比/小数单位比较；目标选择本身保持原规则。
- 提供 Git 内的真实模型开发 smoke 入口，复用现有计费 gateway、build identity、证据下载和停服审计。没有临时文件作为运行依赖。

## 复验

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm validate:visual-focus -- --preflight
# 显式付费入口，缺 OPENROUTER_API_KEY 明确失败；默认 D0/H0/H1
pnpm validate:visual-focus -- --p2-smoke
# 六个已知开发案例各一次，不是 holdout 或正式 18 轮
pnpm validate:visual-focus -- --p2-smoke --cases D0,H0,H1,D1,D2,H2
```

使用项目 .env，或通过 DOTENV_CONFIG_PATH 指向自己的凭据文件；绝不把凭据发给 Agent 上下文或提交 Git。付费入口要求干净提交，自行构建，固定 DeepSeek/Qwen 及 Alibaba 提供方，不静默切换模型、不自动重跑案例。300 秒/40 动作/30 共享模型调用；P2 smoke 明确关闭 blocker review，原子调查及视觉扫描开启。

默认费用保护为 $2。继续失败批次时传 `--spending-source <前一批目录>`，已知费用及未知预留累计扣除，不自动获得新的 $2。同机制两次失败、提供方错误或隔离问题停止，其余计划行保留 not-run。P3 仍需实现跨新旧正式批次的统一 campaign 协议。

输出 `data/visual-focus-p2/<timestamp>/`：manifest、构建 hash、模型价格、完整请求/响应与费用记录、每例报告/私有真值/原图与标注/回执、图像发送 hash、停服审计、包含失败和 not-run 的 summary。原始资料不进 Git，入口和断言进入 Git；他人可以重新生成证据。当前开发 smoke 复用产品回执校验并额外对照独立 fixture 几何；不能替代 P3 的独立对抗评分器。

`--diagnostic` / `--formal` 仍明确拒绝，待 P3。此次没有运行正式新18轮及旧45轮。

## 证据与结果

本机复验（2026-10-01，Asia/Shanghai）：

- 冻结的源码提交：`233278a`（后续提交只更新交接）；完整构建 hash：`e9f6b478894dff12dec09d56f926fc5cc9de6d88e87f3c45b6a5e50723e4957d`。
- 模型：`deepseek/deepseek-v4.1-flash` + `qwen/qwen3.7-plus`，实际 provider 均 Alibaba。未更换技术栈或增加运行预算。
- Biome、typecheck、build、正式 SDK/API 免费预检：退出码 0。免费批次 `data/visual-focus-preflight/2026-09-30T19-36-38-537Z/`，覆盖 D0/H0/预算不足/错误绑定/执行中取消、Web 刷新及重启读取。
- 最终全量回归：90 个测试文件、844 个测试全部通过，132.03s，退出码 0。
- 真实批次：`data/visual-focus-p2/2026-09-30T19-37-30-249Z/`，命令退出码 0；同一构建六例全部 completed/success、goal-reached、显式 finish，停服审计 6/6 通过。D0/H0/H1 实际标注截图已人工查看。

| case | 实测结论 | 探针点击 / 全部动作 | 模型调用 | 单例墙钟 |
| --- | --- | --- | --- | --- |
| D0 | supported | 6 / 10 | 7 | 31.473s |
| H0 | refuted | 5 / 9 | 6 | 36.589s |
| H1 | refuted | 5 / 9 | 6 | 27.559s |
| D1 | supported | 6 / 10 | 6 | 31.388s |
| D2 | supported | 6 / 10 | 5 | 30.131s |
| H2 | refuted | 5 / 9 | 6 | 29.056s |

六例墙钟合计 186.196s；这不含构建和基础设施启动时间，也不是跨轮性能统计。D2 模型返回的 excludedRegions 为空，但所有证据点均通过独立图标真值区域检查，没有把图标上的失败作为证据；不能从本轮推导模型能稳定标出所有图标排除区。P3 的独立评分和完整安全矩阵仍需补齐。

通过批次已知费用 **$0.024599878**，无未知费用。包括失败批次在内已知费用 **$0.046313738**，未知用量保守预留 **$0.002423619**，累计预算占用 **$0.048737357 / $2**。

### 保留的失败

首批 `data/visual-focus-p2/2026-09-30T19-31-31-384Z/`，提交 `506038a`：D0/H0 的真实 Qwen 返回了与原始 CSS 像素不一致的坐标，绑定拒绝 no-target，检查 blocked；坐标值与归一化网格相符。确认重复机制后通过正式 cancel API 取消已开始的 H1；D1/D2/H2 not-run。取消产生的一次未知 usage 已保守计费，完整原始资料及 reviewer-stop.json 保留。

修复没有放宽 DOM 绑定阈值，而是版本化并声明模型坐标契约，保存原始响应和确定性转换。随后重新冻结，并完整运行六例。通过结果没有从两版拼接。

dev 文档原先六例结果的脚本和原始资料没有随 bundle 交付，仍只视作开发者自述；此次结论完全基于主 Agent 可复现入口与上述新证据。旧文档及失败目录描述可从 Git 查看。


## holdout 边界

D2 已被用于修改提示词，D1/D2/H2 均已用于开发观察。它们现在是已知诊断/回归案例。冻结后重跑不能恢复其 holdout 身份，也不能声称未见案例泛化。

P3/P4 必须在提示、schema、算法冻结后，由主 Agent 维护未参与调试的 D1/D2/H2 新 fixture revision，并冻结独立真值；原六例保留回归用途。新修订一旦用于修改算法，也必须记为开发案例。没有这样的新修订证据，就只能报告固定案例回归，不能宣布原 holdout 验收完成。

## 下一阶段

P3：完整独立评分器、安全/坐标/usage 反例矩阵、正式 CLI、campaign 费用协议及审计；P4：冻结后的诊断、新18轮和同构建旧业务45轮。P2 ready 不代表这些已完成。
