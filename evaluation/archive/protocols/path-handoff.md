# R3：D 定向真实复验（待新授权）

历史冻结协议：对应一次许可已消费，标题中的待授权是冻结时状态，不能据本文重跑。原始标准及结果不改写；当前限定接收与剩余边界见[R3最终交付](r3-delivery.md)。

本轮只实现和免费准备。原四运行在2171c7d留档：A/B/C成功、D失败；原claim已消费，不得复用。这是修复后的单项回归，保留原A/B/C证据，不称原四项同批通过。

## 唯一运行与来源

仅1次真实D：使用上批真实A保存的 `path-e4372d907490158d284d7fc85ab6fc235f6cb27566b3ed6ca0302f1a12c84133`，新会话执行首步，在第二步两个同名控件处交回。真实Agent只读核验具体缺口，已有事实足够时可直接原run_finish，以blocked/partial结束。首步保留verified，第二步保持unverified、无动作ID；不重绑、重放、替换计划或凭歧义制造功能缺陷。机械检查后另作实现者语义审阅；没有最终解释或无法判断的理解点写未知，不称独立验收。

不调用新作者、不用固定回复代替真实来源。冻结原A报告、事件、请求/响应、候选、数据库及全部来源附件摘要；每次向新输出目录复制原已关闭数据库，原件不改。启动后通过当前API恢复原A报告、读取候选并再次调用原保存门，要求报告和候选逐对象一致。沿用精确来源和入口 `http://127.0.0.1:59228/`，重绑原本机端口并提供同一Git页族的D变体。端口占用、证据丢失/变化或保存校验不符均在模型派发前停止，不换端口、改ID或重造作者。

## 额度与停止

- deepseek/deepseek-v4.1-flash / Wafer；原能力、输出4096 token上限不变，不提高上限、降级reasoning、fallback或换模型。
- **1次运行、最多12次请求、每请求预留US$0.08、总新增预留US$0.96**。沿用已保存公开报价上限：输入US$0.065/百万、输出US$0.99/百万。获新授权后仅一次官方公开端点GET核对，涨价/未知价格项/能力改变即停，不付费探测。
- 每运行180秒、主请求60秒、工具15秒、批次15分钟、最多4动作（通过标准仅1次）。重试0。原网关、账本、全响应校验及未知隔离保留。失败、输出截断、超时、新unknown、费用/安全异常或验收不符即停，不补跑、不改实现、不自动下一批；历史unknown保留、暂缓追账。
- 新清单单独claim一次消费；旧approval/claim无效。新用户明确批准后才创建对应授权，24小时有效。凭据沿用已澄清的单字段本地解析、仅内存传入R3_ACCEPTANCE_API_KEY，不source、不加载其他配置、不输出或保存密钥。Node24.21.0，全部命令 `DOTENV_CONFIG_PATH=/dev/null`。

```sh
pnpm exec tsx scripts/r3-handoff-recheck/cli.ts --dry-run
# 免费固定回复：D直接结束、D非法批量调用、健康/缺陷必要冒烟、来源失配。
pnpm exec tsx scripts/r3-handoff-recheck/cli.ts --free data/r3-handoff-recheck/FRESH_FREE_DIR
# 仅在新授权后，通过进程环境显式传入密钥。
pnpm exec tsx scripts/r3-handoff-recheck/cli.ts --run data/r3-handoff-recheck/FRESH_REAL_DIR \
  evaluation/r3-path-reuse/handoff-manifest.json /absolute/path/to/NEW_D_APPROVAL.json
```

新授权字段为approvedBy、approvalReference、manifestHash、maxRuns=1、maxRequests=12、maxCostUsd=0.96、expiresAt。清单绑定当前源码/构建、协议、脚本、历史来源及页面摘要。保存新模型轨迹、动作、报告、附件、逐请求账目和耗时；重启恢复本批报告，核对前后身份及历史原件未变。

固定回复只证明接线，不证明真实理解改善。若新D通过，结论必须标为“原A/B/C证据复用 + 修复后D定向真实复验”，并列出共享改动的免费回归，不改写原批失败。

建议授权句：“批准冻结的R3 D定向复验一次，复用上批真实A候选及A/B/C证据，仅用DeepSeek v4.1 Flash/Wafer，最多12次请求、新增预留US$0.96，原60秒主请求/15秒工具/4096输出上限不变；失败、超时、新unknown或安全/费用异常即停，不重试、不补跑、不换样、不改实现、不自动下一批。”
