# 文档导航

首次使用从[项目 README](../README.md)开始。指南描述当前主干能力；历史阶段名称只用于定位旧代码、脚本和证据。

## 使用与配置

| 需要做什么 | 入口 |
| --- | --- |
| 配置模型、端口、预算和功能开关 | [配置指南](configuration.md) |
| 输入网址并理解报告 | [网址检查](url-scan.md) |
| 依据文本资料检查关键路径 | [产品资料](product-sources.md) |
| 保存并再次执行健康路径 | [路径复用](r3-path-reuse.md) |
| 选择历史基线、理解变化 | [重复检查与增量报告](r4-incremental-regression.md) |
| 排查公网 DNS 和网络拒绝 | [DNS 配置与诊断](network-dns-compat.md) |
| 使用专项实验能力 | [弹窗](popup-checks.md)、[并行检查](parallel-checks.md)、[视觉聚焦](visual-focus.md) |

## 开发与规则扩展

- [贡献说明](../CONTRIBUTING.md)与[开发约定](development.md)：目录、验证、证据与文档维护。
- [架构](architecture.md)、[执行层](execution-engine.md)、[HTTP 接口](api.md)：生命周期、工具、存储与对外边界。
- [知识与上下文](knowledge-and-context.md)、[可组合调查](composable-investigations.md)：如何管理公开事实和未覆盖问题。
- [规则开发](rules-and-rule-library.md)与[规则知识库](rule-library/README.md)：实现规则和知识候选分别维护。
- [探索评分模块](r1-jev-decision.md)与[独立 Jev 实验工具](r1-jev-real-adapter.md)：可选研究接口，不代表默认探索策略收益。

## 测试与项目演进

- [靶场与评估](arena-and-evaluation.md)：免费/真实模型入口、业务场景与结果解释。
- [长期反例靶场](counterexample-arena.md)：可重复页面、复位和检查器验证。
- [靶场维护](maintenance/arena-library-followup.md)：新增反例、持续回溯与责任。
- [Roadmap](product-roadmap.md)与[限制及已知问题](known-issues.md)。
- [历史与证据索引](archive/README.md)：冻结协议、历史失败及不随 Git 分发的证据。
