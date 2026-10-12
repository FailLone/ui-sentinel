# R3 一次性真实模型验收（待授权，尚未运行）

2026-10-12。本轮只准备与免费接线。固定产品边界，不重开 R2，不自动补跑、不换样、不运行中修补。实现与审查统一见 [R3 说明](r3-path-reuse.md)。冻结机器清单及准备结果在 `evaluation/r3-path-reuse/`。

## 四个依赖运行

共 4 次产品运行，使用同一个匿名浏览器入口 origin、相同公开产品资料、同一本机数据库和原报告 API。每次浏览器会话从初始状态重建；页面变体由测试操作者在运行开始前切换，无页面可见私有故障标签。沿用 R2 的中性默认 goal；公开资料本身明确从预览到详情，R3 原交回契约要求只读核验、避免重复和如实结束。不新增无法解析的自定义 goal。

| 次序 | 输入与目的 | 模型请求上限 | 动作及通过标准 |
| --- | --- | --- | --- |
| A author | 真实主 Agent 首次阅读随 Git 的产品资料，选择并验证健康两步路径 | 20 | 原报告 covered/verified、两次原动作与两步新测量；服务端保存成功、重复保存一致。必须是本批真实生成，禁止用固定作者候选替代 |
| B reuse | 在相同入口、相同来源的新运行填写 A 保存的 ID | 0 | 两次程序动作、新 actionId/证据、原完成证明；不得调用主模型 |
| C defect | 同一来源、同一入口，详情输出为真实错误；使用 A 的 ID | 0 | 两次程序动作，本次详情 failed、supported finding；不是缓存失效或通过 |
| D handoff | 第一动作创建两个同名后续控件；使用 A 的 ID | 12 | 第一动作 verified，第二动作不执行；交回含已做事实和剩余事项。真实 Agent 使用当前公开证据只读核验并以 partial/unverified 诚实结束，不能重复动作、替换计划或核销缺口 |

A 失败或不可保存，后面全部不派发。B/C 任一检查失败，同样停止余下运行。D 为本批最后一项，不安排修正轮或替补。来源不匹配不另加第五个真实任务：其零复用动作和普通资料流程已由免费验证覆盖，本批真实语义缺口优先聚焦 A 作者及 D 交回。

程序检查保存来源、完整原证据、动作数量/归属、新测量、已知预期状态、执行异常、持久恢复和费用；D 的实际语义理解另逐轨迹审阅：是否看到两个当前目标、是否引用本次第一步事实、是否保留详情未完成、是否只读核验而未重放。机械通过不自动称独立/人工验收通过。不能从四运行推断公网泛化或普遍提效。

## 固定模型、费用与停止条件

- 主模型 `deepseek/deepseek-v4.1-flash`，只用 OpenRouter 的 Wafer，固定能力快照 `deepseek-v4.1-flash-20260910`。不允许 fallback、Jev、视觉、替换供应商或额外模型。每次最多 4096 输出 token，正文最多 131072 字节；使用原共享网关、账本、未知隔离与全响应验证。
- 官方公开 [模型端点报价](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints) 的本次快照：输入 US$0.065/百万、输出 US$0.99/百万，cache read 不高于输入价，无其他附加收费。原响应保存为 `evaluation/r3-path-reuse/price-source.json`。启动时只做一次相同公开 GET 重新核对，任何涨价、能力变化或未知价格项都在推理前停止；不轮询或付费探测。
- 用完整 1,048,576 context token 按输入上限、另加 4096 输出 token 计算，单请求保守费用 US$0.07221248，向上预留 **US$0.08**。最多 32 次真实请求，总新增预留 **US$2.56**。B/C 请求上限为 0，不按四运行乘成 80 请求。实际有完整 usage 才结算；缺失/中断记 unknown，立即停批。历史 unknown 原样保留，不用本批额度抵扣、不在本轮追账。
- 每运行 180 秒、最多 4 动作；主模型请求 60 秒（受任务剩余时间约束），工具 15 秒，批次 15 分钟。工具时限不会替代主请求时限。重试 0、无补跑、无更换页族、无校准请求、无中途构建或改实现。
- 任一模型/传输错误、未知 usage、费用超额、越权/网络干预、取消、存储或报告恢复异常、错误通过、未满足本行标准均停止剩余派发。已有动作和失败原件保留。零模型行意外请求模型由网关在付费派发前拒绝；该行失败并停止，不临时追加预算。

逐运行保存原请求、模型 wire/响应、程序动作、报告、附件副本、持续时间、usage/逐请求账目和累计账目。后处理只读恢复全部已运行报告，核对冻结源码/构建输入前后相同；不恢复动作或已停止模型批次。

## 可执行入口

Node 24.21.0。所有命令在独立 R3 工作区运行，`DOTENV_CONFIG_PATH=/dev/null`；不读取默认项目目录的环境文件。

```sh
# 离线：仅输出冻结身份；不联网、不读取密钥、不调用模型。
pnpm exec tsx scripts/r3-path-acceptance/cli.ts --dry-run
# 免费：本地固定回复验证新执行与费用接线，仍不算真实验收。
pnpm exec tsx scripts/r3-path-acceptance/cli.ts --free data/r3-path-acceptance/FRESH_FREE_DIR
# 免费失败门：首次作者不合格，后续三项不得启动；预期非零退出。
pnpm exec tsx scripts/r3-path-acceptance/cli.ts --free-author-failure data/r3-path-acceptance/FRESH_STOP_DIR
# 仅在干净候选及新用户授权之后。不能复用 R2 的 approval 或 key 变量。
R3_ACCEPTANCE_API_KEY=... pnpm exec tsx scripts/r3-path-acceptance/cli.ts --run \
  data/r3-path-acceptance/FRESH_REAL_DIR evaluation/r3-path-reuse/real-manifest.json \
  /absolute/path/to/NEW_R3_APPROVAL.json
```

授权文件必须含用户授权事实（`approvedBy`、`approvalReference`）、本清单摘要 `manifestHash`、`maxRuns: 4`、`maxRequests: 32`、`maxCostUsd: 2.56` 和有效 `expiresAt`。模板不构成授权，当前不创建可消费 approval。派发前核对干净 Git、全部冻结输入、公开报价，然后读取显式 R3 key；在 Git 共用目录以 `wx` 消费一次清单 claim。该清单一旦消费即不允许再次运行；后续重新授权也须新审阅范围和新冻结身份，不能通过删除 claim 重跑。

**建议用户授权句：**“批准对冻结的 R3 候选执行一次上述 4 运行验收，仅 A/D 使用指定 Wafer 主模型，最多 32 次请求、新增预留 US$2.56；B/C 零模型请求；保留历史 unknown，遇到任一失败、超时、未知费用或安全边界立即停止余下任务，不重试、不补跑、不换样、不修改实现、不自动开启下一批。”
