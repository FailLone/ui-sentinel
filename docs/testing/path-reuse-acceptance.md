# 路径复用验收协议

此文件是当前 `scripts/acceptance/path-reuse/policy.ts` 的冻结输入。原四运行协议原字节在[历史档案](../../evaluation/archive/protocols/path-reuse.md)，原失败保持不变。

## 四个依赖运行

| 运行 | 目的 | 请求上限 / 必要结果 |
| --- | --- | --- |
| author | 真实模型依据公开资料生成健康两步路径 | 20；两次原动作、新测量、完整健康报告并成功保存 |
| reuse | 相同入口/来源复用作者候选 | 0；两次新动作及测量，不能复制旧成功 |
| defect | 同一来源但详情结果错误 | 0；测得本次真实缺陷，不把错误称为缓存失效 |
| handoff | 首动作后第二步出现同名歧义 | 12；首步事实保留，第二步不执行，Agent只读核验并诚实 partial 结束 |

任何依赖行失败停止后续派发；不换作者、换样本、替补或重放。D的模型语义解释需另审实际轨迹，机械通过不自动等于完整理解。程序权限、预算、取消、来源及原完成证明保持原契约。

## 运行与证据

先安装依赖并构建，然后离线查看当前冻结输入：

```sh
DOTENV_CONFIG_PATH=/dev/null pnpm exec tsx scripts/acceptance/path-reuse/cli.ts --dry-run
```

[policy.ts](../../scripts/acceptance/path-reuse/policy.ts)固定模型/提供方、报价上限、每请求US$0.08预留、最多32请求/US$2.56、原时限和停止门。零模型行意外请求模型必须在派发前拒绝。未知费用、输出截断、越权、取消、持久异常或行判定失败即停，保留原结果。

`--free data/path-reuse-acceptance/<新目录>` 为固定回复接线；`--free-author-failure <新目录>` 是预期非零的停止门验证。真实 `--run <新目录> <清单> <授权文件>` 只能在新冻结身份及明确授权后执行，沿用原 `R3_ACCEPTANCE_API_KEY` 和原一次性 claim 位置，不通过更名重置历史许可。

保存原请求/响应、动作、报告、附件、usage与账目，重启恢复并检查冻结身份。历史定向交回工具位于 `scripts/research/path-handoff/`，依赖封存真实作者数据库及固定入口；普通 clone 不具备该来源，不能把它当作便携免费预检。通用回归使用 `pnpm validate:path-reuse`。
