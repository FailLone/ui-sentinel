# UI Sentinel

UI Sentinel 是面向公司内部开发、测试和设计协作的 Web UI 检查工具。它用 Agent 理解目标和公开资料，由浏览器执行器操作页面、运行规则并保存截图、测量和报告，帮助团队复查交互问题。

适用于本机开发验证、可重置靶场，以及匿名、有界的网址检查。当前是受信单机服务，仅绑定 loopback；没有多用户认证或分布式 Worker，不适合作为直接公开的共享服务。

## 能做什么

- 在 React 工作台创建任务、查看实时日志与证据、恢复历史报告、确认发现。
- 运行购物和导出业务契约，区分业务结果、检查覆盖与 UI 缺陷。
- 显式启用网址模式后，检查有限页面及局部交互；可附一份文本/Markdown 验证一条 1–3 步路径。
- 保存健康资料路径，在同入口重新执行和测量；选择历史基线查看本次公开事实变化与未检查步骤。
- 将已验证发现整理为声明式规则候选，经人工审阅、批准后启用。

`completed` 表示限定检查义务已有结论，可以包含缺陷；没有发现也不等于整站通过。未验证、证据不足和不支持的范围会保留在报告中。完整范围见[限制与已知问题](docs/known-issues.md)。

## 最短启动

需要 Node.js 24.x（[.node-version](.node-version)），也支持 22.18–22.x；使用 pnpm **10.17.1**（[package.json](package.json)）。以下命令在克隆后的仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env
```

编辑 `.env`，填写主模型及对应提供方密钥、视觉模型配置，并为两个靶场各设置一个随机的私有控制 token。字段说明见[配置指南](docs/configuration.md)。正常检查会调用配置的模型；缺少配置时明确拒绝运行。

```sh
pnpm dev
```

打开 [工作台](http://localhost:4111)。该命令同时启动工作台、服务端及[购物靶场](http://localhost:4173)和[导出靶场](http://localhost:4183)。关闭工作台页面不会取消服务端任务；停止开发进程使用 `Ctrl-C`。

网址检查默认关闭。需要时在 `.env` 增加 `EXECUTION_URL_SCAN=1`；使用产品资料再增加 `EXECUTION_PRODUCT_SOURCES=1`，随后重启服务。启用并不表示任意网站都能完成检查，详见[网址使用指南](docs/url-scan.md)。

不配置真实模型也可以运行[免费本地预检](docs/arena-and-evaluation.md#免费本地预检)，检查服务、浏览器与固定测试模型的接线。

## 文档与贡献

[文档首页](docs/README.md)按读者整理全部指南：

- 使用：[配置](docs/configuration.md)、[网址检查](docs/url-scan.md)、[产品资料](docs/product-sources.md)、[路径复用](docs/r3-path-reuse.md)、[历史基线](docs/r4-incremental-regression.md)。
- 开发：[贡献说明](CONTRIBUTING.md)、[架构](docs/architecture.md)、[开发约定](docs/development.md)、[HTTP 接口](docs/api.md)。
- 扩展：[规则开发](docs/rules-and-rule-library.md)、[规则知识目录](docs/rule-library/README.md)、[靶场与评估](docs/arena-and-evaluation.md)。
- 项目：[Roadmap](docs/product-roadmap.md)、[已知问题](docs/known-issues.md)、[历史与证据](docs/archive/README.md)。

当前技术栈为 TypeScript、Mastra Core、Playwright、Midscene、Hono、libSQL 和 React。源码、配置及可重复回归决定能力边界；阶段实验不能替代公网可靠性证明。密钥、数据库与本地生成证据不提交 Git。
