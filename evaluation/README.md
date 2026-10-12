# 评估资产

这里与产品运行代码分离；私有期望不能进入被测 Agent 的输入。运行入口见[scripts](../scripts/README.md)，业务与证据口径见[评估指南](../docs/arena-and-evaluation.md)。

| 目录 | 责任 |
| --- | --- |
| `fixtures/` | 可重置页面、开发性公开输入与已批准的可移交夹具；不是未见盲测集 |
| `private/` | 私有真值、评分、失败样本和场景控制；不作为公共静态资源 |
| `support/` | 网关、费用账本、取消、完整响应验证与共享测试辅助 |
| `configs/` | 专用测试配置与可执行 Jev 配置示例 |
| `preflight/` | 本地固定模型响应，用于免费集成接线 |
| `archive/` | 原始结果、旧协议与仍被工具消费的冻结输入；字节不随目录整理改写 |

`fixtures/decision/manifest.json` 是当前开发夹具目录清单，内容哈希保持不变，仅更新文件定位；原清单另存 `archive/catalogs/decision-manifest.json`。`configs/jev-*-config.json` 是可执行的新配置示例，原配置留在 archive。默认示例仍有计费/协议未核实阻断，不可据 dry-run 成功宣称允许付费。

归档内部路径、命令、绝对位置和阶段编号属于历史身份，按原执行提交复现。当前脚本会显式读取需要的冻结输入，不能从目录改名推导历史已重跑。历史报告、JSON清单和已签名/冻结来源不批量替换字符串。证据取得限制见[历史索引](../docs/archive/README.md)。

开发输入说明：[决策种子](fixtures/decision/README.md)、[评分样本](fixtures/decision-quality/README.md)。探索实现的近源码说明见[模块说明](../src/agent/exploration/README.md)，其中历史修订名保持不变。
