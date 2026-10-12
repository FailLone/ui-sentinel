# 配置与运行

配置模板为[.env.example](../.env.example)，读取和默认值以[共享配置](../src/shared/config.ts)为准。环境变量在进程启动时读取，修改后重启。不要提交 `.env`。

## 环境与模型

使用 Node.js 24.x 或 22.18–22.x、pnpm 10.17.1。首次安装与 Chromium 准备见[README](../README.md#最短启动)。

| 字段 | 配置方法 |
| --- | --- |
| `AGENT_MODEL` | `openai/<model>`、`anthropic/<model>` 或 `google/<model>`，填写所用模型的实际 ID |
| 提供方密钥 | 对应 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 或 `GOOGLE_API_KEY` |
| 视觉模型 | 填写 `VISION_MODEL`、`VISION_API_KEY`、`VISION_BASE_URL`、`VISION_MODEL_FAMILY`；模型名与 family 必须匹配实际服务 |
| `ARENA_CONTROL_TOKEN` / `EXPORT_CONTROL_TOKEN` | 各自设置随机本地值，仅供操作者/评估器，不交给被测 Agent |
| `DATABASE_URL` | 默认 `file:./data/ui-sentinel.db`；运行产物写入本地 `data/` |

主模型和视觉模型分别配置，不会因缺少凭据而静默使用模拟响应。`OPENROUTER_API_KEY` 用于隔离验收和可选 Jev；它不能代替所有主模型/视觉模型配置。可选阻断审查优先使用 `COMPLETION_REVIEW_API_KEY`，省略才回退到 `OPENROUTER_API_KEY`，显式空字符串不回退。

## 服务与构建

`pnpm dev` 构建并监听工作台，启动服务端及两个业务靶场。默认端口：工作台/API 4111，购物 UI/API/控制 4173/4174/4175，导出 UI/API/控制 4183/4184/4185。对应变量为 `PORT`、`ARENA_PORT`、`ARENA_API_PORT`、`ARENA_CONTROL_PORT`、`EXPORT_ARENA_PORT`、`EXPORT_API_PORT`、`EXPORT_CONTROL_PORT`。

运行构建产物：

```sh
pnpm build
pnpm start
# 在另外两个终端按需启动业务靶场
pnpm arena:start
pnpm arena:export:start
```

服务仅绑定 loopback。关闭工作台页面不取消任务；用工作台取消入口结束运行。服务重启会把未完成运行标为 interrupted，未知副作用不会自动重放。需要核对副作用时见[执行层](execution-engine.md)。

## 功能开关

以下为未配置环境变量时的默认行为；运行级选项仍须满足各能力的契约。

| 配置 | 默认 | 用途 |
| --- | --- | --- |
| `EXECUTION_URL_SCAN` | 关闭 | [匿名网址检查](url-scan.md)，`1` 开启 |
| `EXECUTION_PRODUCT_SOURCES` | 关闭 | [产品资料路径](product-sources.md)，同时需要网址模式 |
| `EXECUTION_VISUAL_DISCOVERY` | 关闭 | [视觉候选与聚焦验证](visual-focus.md) |
| `EXECUTION_BLOCKER_REVIEW` | 关闭 | 有限阻断收尾审查，增加模型依赖 |
| `EXECUTION_POPUP_JEV` | 关闭 | [目标驱动弹窗检查](popup-checks.md) |
| `EXECUTION_PARALLEL_CHECK_TASKS` | 关闭 | [并行子检查](parallel-checks.md)，还需对应运行选项 |
| `EXECUTION_ATOMIC_INVESTIGATION` | 开启 | 有界时序调查，`0` 回退 |
| `EXECUTION_OBSERVATION_REUSE` / `EXECUTION_RULE_ROUTING` / `EXECUTION_JOURNEYS` | 开启 | 观察、规则依赖与有证据路径复用，`0` 关闭对应优化 |
| `EXECUTION_MODEL_STREAMING` / `EXECUTION_SHORT_FINISH` | 开启 | 模型流式处理与有限收尾，`0` 关闭 |

有界程序探索通过运行请求 `exploration` 显式选择，不因网址开关自动开启。图片保形 D004 仍默认关闭；规则子集的独立入口和准入条件见[规则知识库](rule-library/README.md)。

## 预算与网络

| 变量 | 代码默认 | 允许上限 |
| --- | ---: | ---: |
| `RUN_TOTAL_TIMEOUT_MS` | 300000 | 300000 |
| `RUN_MAX_ACTIONS` | 40 | 40 |
| `RUN_MAX_MODEL_CALLS` | 40 | 60 |
| `TOOL_TIMEOUT_MS` | 15000 | 60000 |
| `MODEL_REQUEST_TIMEOUT_MS` | 60000 | 120000 |
| `MODEL_REQUEST_MAX_RETRIES` | 1 | 0 或 1 |

复制 `.env.example` 后模型请求上限是 **30**。请求契约还可收窄预算；失败、取消、重试和收尾计入原预算。`AGENT_LENGTH_RECOVERY_WITHOUT_REASONING` 默认关闭，仅适用于支持该选项的 OpenAI-compatible 模型。

网址模式默认拒绝私网和 loopback。开发 fixture 由部署端用 `URL_SCAN_TRUSTED_ORIGINS` 明确列出精确 origin，例如 `http://127.0.0.1:4190`；任务请求无权添加例外，控制面仍不可访问。DNS 默认 `system`，可选 DoH 的配置、地址限制和诊断见[DNS 指南](network-dns-compat.md)。
